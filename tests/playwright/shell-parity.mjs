#!/usr/bin/env node
/**
 * Shell render-parity / containment regression test.
 *
 * Guards the bug class that came from the shelled CSS drifting between the two
 * renderers (server scorm12._patch_shell vs client GUIShellRenderer). Rather than
 * pixel-diff (Edit pane and Published iframe render at different scales), it asserts
 * COMPUTED-STYLE + GEOMETRY invariants on the server-rendered Published view (the
 * source of truth the client now fetches via /api/shell-content.css):
 *
 *   1. GET /api/shell-content.css is reachable and carries the key rules.
 *   2. For every media frame's preview-html:
 *      - #fgui-content uses IBM Plex Mono and clips (overflow hidden).
 *      - headings render amber (#F59E0B === rgb(245,158,11)).
 *      - NO media element (.cf-bounds / .cf-zone-media img|video) overflows
 *        #fgui-content (the containment invariant that today's bugs violated).
 *
 * Usage:
 *   npm i -D playwright && npx playwright install chromium   # one-time
 *   node tests/playwright/shell-parity.mjs [baseUrl]
 *     baseUrl defaults to https://courseforge.dev
 *
 * Exit code 0 = all pass, 1 = any failure (CI-friendly).
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'https://courseforge.dev').replace(/\/$/, '')
const TOL = 2 // px tolerance for sub-pixel rounding
const AMBER = 'rgb(245, 158, 11)'
let failures = 0
const fail = (m) => { console.error('  ✗ ' + m); failures++ }
const ok = (m) => console.log('  ✓ ' + m)

async function getJSON(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
  return r.json()
}

function mediaFrames(project) {
  const out = []
  for (const c of project.courses || [])
    for (const m of c.modules || [])
      for (const l of m.lessons || [])
        for (const f of l.frames || []) {
          const kinds = ((f.content || {}).blocks || []).map(b => b.type)
          if (kinds.some(k => k === 'media' || k === 'ivideo'))
            out.push({ id: f.id, name: f.name })
        }
  return out
}

async function main() {
  console.log(`Shell parity vs ${BASE}\n`)

  // 1. Canonical CSS endpoint.
  console.log('GET /api/shell-content.css')
  const cssRes = await fetch(`${BASE}/api/shell-content.css`)
  if (!cssRes.ok) fail(`endpoint HTTP ${cssRes.status}`)
  else {
    const css = await cssRes.text()
    for (const needle of ['#fgui-content', '#F59E0B', 'IBM Plex Mono',
                          '.cf-zone-media>div:not([class]):not([id])']) {
      css.includes(needle) ? ok(`css has "${needle}"`) : fail(`css missing "${needle}"`)
    }
  }

  // 2. Per-frame invariants in a real browser.
  const projects = await getJSON(`${BASE}/api/projects`)
  const proj = await getJSON(`${BASE}/api/projects/${(Array.isArray(projects) ? projects : projects.projects)[0].id}`)
  const frames = mediaFrames(proj)
  console.log(`\n${frames.length} media frames in "${proj.name}"`)

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  for (const f of frames) {
    console.log(`\nFrame: ${f.name}`)
    await page.goto(`${BASE}/api/frames/${f.id}/preview-html?embed=1`, { waitUntil: 'networkidle' })
    const r = await page.evaluate((tol) => {
      const out = { overflows: [], fguiFont: null, fguiOverflow: null, headingColors: [] }
      const fgui = document.getElementById('fgui-content')
      if (!fgui) return { error: 'no #fgui-content' }
      const fr = fgui.getBoundingClientRect()
      const cs = getComputedStyle(fgui)
      out.fguiFont = cs.fontFamily
      out.fguiOverflow = cs.overflow
      document.querySelectorAll('#fgui-content h1,#fgui-content h2,#fgui-content h3')
        .forEach(h => out.headingColors.push(getComputedStyle(h).color))
      document.querySelectorAll('.cf-bounds img,.cf-bounds video,.cf-zone-media img,.cf-zone-media video')
        .forEach(el => {
          const b = el.getBoundingClientRect()
          if (b.right - fr.right > tol || b.bottom - fr.bottom > tol)
            out.overflows.push({ tag: el.tagName, dr: Math.round(b.right - fr.right), db: Math.round(b.bottom - fr.bottom) })
        })
      return out
    }, TOL)

    if (r.error) { fail(r.error); continue }
    r.fguiOverflow === 'hidden' ? ok('#fgui-content clips') : fail(`#fgui-content overflow=${r.fguiOverflow}`)
    /IBM Plex Mono/.test(r.fguiFont) ? ok('IBM Plex Mono') : fail(`font=${r.fguiFont}`)
    if (r.headingColors.length) {
      r.headingColors.every(c => c === AMBER)
        ? ok(`headings amber (${r.headingColors.length})`)
        : fail(`heading color(s) ${[...new Set(r.headingColors)].join(', ')} != ${AMBER}`)
    }
    r.overflows.length === 0
      ? ok('no media overflow')
      : fail(`media overflow: ${JSON.stringify(r.overflows)}`)
  }
  await browser.close()

  console.log(`\n${failures === 0 ? 'PASS — all parity invariants held' : `FAIL — ${failures} issue(s)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
