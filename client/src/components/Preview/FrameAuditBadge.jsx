import React, { useState, useEffect, useRef, useCallback } from 'react'
import { auditRoot, nudgeToPass } from '../../utils/contrast'
import useEditorStore from '../../store/editorStore'

// ─────────────────────────────────────────────────────────────────────────────
// In-preview WCAG / 508 contrast audit — a glanceable traffic-light pill by the
// preview header that auto-audits the CURRENT frame's rendered DOM (published
// iframe, GUI-on shell iframe, or the GUI-off React preview). Click to expand a
// findings panel (each failure with swatches, ratio, a Locate control, and a
// read-only "nudge to pass" suggestion). Shares one math source with the
// standalone ContrastChecker via utils/contrast.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  ok: '#2Fae66', okText: '#0a6b38',
  fail: '#E24B4A', manual: '#D9920A',
  panel: 'var(--cf-block-bg, #0d1017)', head: 'var(--cf-input-bg, #060810)',
  border: 'var(--cf-border-secondary, #3a3a5a)', borderT: 'var(--cf-border-tertiary, rgba(255,255,255,0.10))',
  text: 'var(--cf-text-primary, #E0E8F0)', text2: 'var(--cf-text-secondary, #7A90A8)',
  text3: 'var(--cf-text-tertiary, #3A5A7A)', font: 'var(--forge-font, "IBM Plex Mono", monospace)',
}

// Find the rendered preview root for the current mode. Iframe modes (published /
// GUI-on shell) audit the iframe document once its content has injected; the
// GUI-off React preview audits its own DOM. Returns null when not yet ready.
function findAuditRoot(pane) {
  if (!pane) return null
  const iframe = pane.querySelector('iframe')
  if (iframe) {
    try {
      const doc = iframe.contentDocument
      if (doc && doc.body && doc.body.childElementCount > 0) {
        const host = doc.getElementById('fgui-content')
        // GUI shell: wait until the frame HTML has actually injected into #fgui-content.
        if (host) return host.childElementCount > 0 ? host : null
        return doc.body
      }
    } catch { /* same-origin expected; treat as not-ready */ }
    return null
  }
  // GUI-off React preview: bound to the white content surface (not the dark app
  // chrome) so text-over-white audits correctly and the bg walk stops there.
  return pane.querySelector('.cf-preview-surface') || pane.querySelector('.cf-preview-main') || pane
}

export default function FrameAuditBadge({ paneRef, frameId, signature, fallbackBg = null }) {
  const [result, setResult] = useState(null)   // {fails, manual, passCount} | null
  const [open, setOpen] = useState(false)
  const [aaa, setAaa] = useState(false)
  const setFrameA11y = useEditorStore(s => s.setFrameA11y)
  const debounce = useRef(null)
  const retry = useRef(null)

  const run = useCallback(() => {
    let tries = 0
    const attempt = () => {
      const root = findAuditRoot(paneRef.current)
      if (!root) {
        if (tries++ < 10) { retry.current = setTimeout(attempt, 250); return }
        setResult({ fails: [], manual: [], passCount: 0, unresolved: true })
        return
      }
      const r = auditRoot(root, { aaa, fallbackBg })
      setResult(r)
      const status = r.fails.length ? 'fail' : (r.manual.length ? 'manual' : 'pass')
      if (frameId) setFrameA11y(frameId, { status, fails: r.fails.length, manual: r.manual.length })
    }
    attempt()
  }, [paneRef, aaa, frameId, setFrameA11y, fallbackBg])

  // Re-audit (debounced) whenever the previewed frame / mode / content changes.
  useEffect(() => {
    clearTimeout(debounce.current); clearTimeout(retry.current)
    debounce.current = setTimeout(run, 350)
    return () => { clearTimeout(debounce.current); clearTimeout(retry.current) }
  }, [signature, run])

  const fails = result?.fails || []
  const manual = result?.manual || []
  const tone = result?.unresolved ? 'idle' : (fails.length ? 'fail' : (manual.length ? 'manual' : 'pass'))
  const dot = { pass: C.ok, fail: C.fail, manual: C.manual, idle: C.text3 }[tone]
  const labelText = tone === 'pass' ? '508 ✓'
    : tone === 'fail' ? `508 ✕ ${fails.length}`
    : tone === 'manual' ? `508 ? ${manual.length}`
    : '508 …'
  const aria = tone === 'pass' ? 'Accessibility: all text passes contrast'
    : tone === 'fail' ? `Accessibility: ${fails.length} contrast failure${fails.length > 1 ? 's' : ''}`
    : tone === 'manual' ? `Accessibility: ${manual.length} pair${manual.length > 1 ? 's' : ''} need manual check`
    : 'Accessibility: audit pending'

  // Scroll a finding's element into view in the preview + flash an outline.
  const locate = (el) => {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const prev = el.style.outline
      el.style.outline = '3px solid #E24B4A'
      el.style.outlineOffset = '2px'
      setTimeout(() => { try { el.style.outline = prev } catch { /* torn down */ } }, 1800)
    } catch { /* element detached */ }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={aria}
        aria-expanded={open}
        title="WCAG / 508 contrast audit of this frame"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px',
          borderRadius: 999, border: `1px solid ${C.borderT}`, background: 'rgba(0,0,0,0.25)',
          color: '#C8D8E8', cursor: 'pointer', fontFamily: C.font, fontSize: 10, letterSpacing: '0.04em',
        }}
      >
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: dot,
          boxShadow: `0 0 6px ${dot}` }} />
        {labelText}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Contrast audit findings"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 340, zIndex: 4000,
            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)', color: C.text, fontFamily: C.font,
            maxHeight: '60vh', display: 'flex', flexDirection: 'column',
          }}
        >
          <div style={{ padding: '9px 12px', borderBottom: `1px solid ${C.borderT}`, background: C.head,
            borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: dot }} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
              {tone === 'pass' ? 'All text passes contrast'
                : tone === 'idle' ? 'Audit pending…'
                : `${fails.length} fail · ${manual.length} manual · ${result?.passCount || 0} pass`}
            </span>
            <label style={{ fontSize: 10, color: C.text2, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
              title="Raise the bar to AAA (7:1 normal / 4.5:1 large)">
              <input type="checkbox" checked={aaa} onChange={e => setAaa(e.target.checked)} style={{ cursor: 'pointer' }} />
              AAA
            </label>
            <button onClick={() => setOpen(false)} aria-label="Close audit panel"
              style={{ background: 'none', border: 'none', color: C.text3, fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>

          <div style={{ padding: '8px 10px', overflowY: 'auto' }}>
            {tone === 'pass' && (
              <p style={{ fontSize: 12, color: C.text2, margin: '6px 4px', lineHeight: 1.5 }}>
                Every text element on this frame meets its WCAG {aaa ? 'AAA' : 'AA'} contrast threshold.
              </p>
            )}
            {tone === 'idle' && (
              <p style={{ fontSize: 12, color: C.text2, margin: '6px 4px', lineHeight: 1.5 }}>
                Couldn’t read the rendered frame yet — edit or re-select the frame to re-run.
              </p>
            )}

            {fails.map((f, i) => {
              const sug = nudgeToPass(f.fg, f.bg)
              return (
                <div key={`f${i}`} style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.fail}`,
                  borderRadius: 7, padding: '8px 10px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.fail, textTransform: 'uppercase' }}>{f.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.fail }}>{f.ratio.toFixed(2)} : 1</span>
                    <span style={{ fontSize: 10, color: C.text3 }}>needs {f.threshold} : 1</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.text2, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    “{f.snippet}”
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Swatch hex={f.fg} label="text" />
                    <Swatch hex={f.bg} label="bg" />
                    <span style={{ flex: 1 }} />
                    <button onClick={() => locate(f.el)} title="Scroll to + outline in the preview"
                      style={{ fontSize: 10, padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 5,
                        background: C.head, color: C.text, cursor: 'pointer', fontFamily: C.font }}>◎ Locate</button>
                  </div>
                  {sug.best && (
                    <div style={{ fontSize: 10, color: C.text2 }}>
                      nudge text → <span style={{ color: '#FAC775' }}>{sug.best.hex}</span> ({sug.best.ratio.toFixed(2)} : 1)
                    </div>
                  )}
                  {sug.failed && (
                    <div style={{ fontSize: 10, color: C.text3 }}>can’t reach AA by lightness alone — change the hue or bg</div>
                  )}
                </div>
              )
            })}

            {manual.map((m, i) => (
              <div key={`m${i}`} style={{ border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.manual}`,
                borderRadius: 7, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.manual, textTransform: 'uppercase' }}>{m.label} · manual</span>
                </div>
                <div style={{ fontSize: 11, color: C.text2, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  “{m.snippet}”
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Swatch hex={m.fg} label="text" />
                  <span style={{ flex: 1, fontSize: 10, color: C.text3 }}>{m.reason}</span>
                  <button onClick={() => locate(m.el)} title="Scroll to + outline in the preview"
                    style={{ fontSize: 10, padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 5,
                      background: C.head, color: C.text, cursor: 'pointer', fontFamily: C.font }}>◎ Locate</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Swatch({ hex, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 3, background: hex,
        border: '1px solid rgba(255,255,255,0.2)' }} />
      <span style={{ fontSize: 10, color: 'var(--cf-text-tertiary, #3A5A7A)' }}>{label} {hex}</span>
    </span>
  )
}
