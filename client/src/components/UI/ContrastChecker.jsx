import React, { useEffect, useRef, useState, useCallback } from 'react'
import { normHex, contrast, floor2, nudgeToPass, TESTS } from '../../utils/contrast'

// ─────────────────────────────────────────────────────────────────────────────
// In-editor, draggable WCAG contrast checker.
//
// Math + badge thresholds + nudge logic are kept consistent with the standalone
// tool at cardona-ct-lab/static/contrast-audit/index.html (the proven version):
//   - sRGB relative luminance, ratio (L1+0.05)/(L2+0.05)
//   - ratio floored to 2 decimals so a borderline value never reads as a pass
//   - badges: AA 4.5, AA-large 3, AAA 7, AAA-large 4.5, non-text/UI 1.4.11 = 3
//   - nudge: walk fg lightness away from the bg until AA 4.5 clears
//
// Authors open it from the editor toolbar (ColorFilter icon) to check colors —
// e.g. a low-contrast image — without leaving the frame, then Copy/Print a
// result to send back to an artist.
// ─────────────────────────────────────────────────────────────────────────────

// Color math + thresholds + nudge now live in ../../utils/contrast (imported
// above) so the standalone checker and the in-preview audit badge share one
// implementation and can never drift.

const HAS_EYE = typeof window !== 'undefined' && ('EyeDropper' in window)

// theme-aware colors (CourseForge dark UI; fall back to literal values)
const C = {
  panel:   'var(--cf-block-bg, #0d1017)',
  head:    'var(--cf-input-bg, #060810)',
  border:  'var(--cf-border-secondary, #3a3a5a)',
  borderT: 'var(--cf-border-tertiary, rgba(255,255,255,0.10))',
  text:    'var(--cf-text-primary, #E0E8F0)',
  text2:   'var(--cf-text-secondary, #7A90A8)',
  text3:   'var(--cf-text-tertiary, #3A5A7A)',
  input:   'var(--cf-input-bg, #060810)',
  accent:  'var(--forge-amber, #FAC775)',
  font:    'var(--forge-font, "IBM Plex Mono", monospace)',
  ok:      '#5FD08A',
  okBg:    'rgba(95,208,138,0.12)',
  fail:    '#FF8A9B',
  failBg:  'rgba(255,138,155,0.12)',
}

export default function ContrastChecker({ open, onClose }) {
  const [fg, setFg] = useState('#2A2A2A')
  const [bg, setBg] = useState('#E8E8E8')
  const [hexFgText, setHexFgText] = useState('#2A2A2A')
  const [hexBgText, setHexBgText] = useState('#E8E8E8')
  const [nudge, setNudge] = useState(null)
  const [toast, setToast] = useState('')

  // default position: top-right under the header
  const [pos, setPos] = useState(() => {
    if (typeof window === 'undefined') return { x: 40, y: 60 }
    return { x: Math.max(12, window.innerWidth - 380), y: 60 }
  })
  const panelRef = useRef(null)
  const restoreFocusRef = useRef(null)
  const dragRef = useRef(null)
  const toastTimer = useRef(null)

  const showToast = useCallback(msg => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1800)
  }, [])

  // focus the panel on open, restore on close; Escape closes
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement
    const t = setTimeout(() => panelRef.current?.focus(), 0)
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey, true)
      const el = restoreFocusRef.current
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [open, onClose])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ---------- dragging (pointer events, clamped to viewport) ----------
  const onHandleDown = e => {
    // don't start a drag from the close button
    if (e.target.closest('[data-no-drag]')) return
    const rect = panelRef.current.getBoundingClientRect()
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, h: rect.height }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const onHandleMove = e => {
    const d = dragRef.current
    if (!d) return
    const x = Math.min(Math.max(0, e.clientX - d.dx), window.innerWidth - d.w)
    const y = Math.min(Math.max(0, e.clientY - d.dy), window.innerHeight - d.h)
    setPos({ x, y })
  }
  const onHandleUp = e => {
    if (dragRef.current) { try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {} }
    dragRef.current = null
  }

  // ---------- setters keep the three inputs synced ----------
  const applyHex = (slot, value, { fromText = false } = {}) => {
    const n = normHex(value)
    if (!n) return false
    if (slot === 'fg') { setFg(n); if (!fromText) setHexFgText(n) }
    else { setBg(n); if (!fromText) setHexBgText(n) }
    setNudge(null)
    return true
  }
  const onHexInput = (slot, value) => {
    if (slot === 'fg') setHexFgText(value); else setHexBgText(value)
    applyHex(slot, value, { fromText: true })
  }
  const onHexBlur = slot => {
    const cur = slot === 'fg' ? fg : bg
    if (slot === 'fg') setHexFgText(cur); else setHexBgText(cur)
  }

  const pickEye = async slot => {
    if (!HAS_EYE) return
    try {
      const res = await new window.EyeDropper().open()
      if (res?.sRGBHex) { applyHex(slot, res.sRGBHex); showToast('Picked ' + normHex(res.sRGBHex)) }
    } catch { /* user pressed Escape — no-op */ }
  }

  const copyHexOf = slot => {
    const hex = slot === 'fg' ? fg : bg
    copyText(hex, () => showToast('Copied ' + hex))
  }

  const swap = () => {
    const f = fg, b = bg
    setFg(b); setBg(f); setHexFgText(b); setHexBgText(f); setNudge(null)
    showToast('Swapped colors')
  }

  const doNudge = () => {
    const r = nudgeToPass(fg, bg)
    if (r.already) setNudge({ msg: 'Already passes AA normal text at 4.5 : 1.' })
    else if (r.best) setNudge({ apply: r.best })
    else setNudge({ msg: `Could not reach 4.5 : 1 by lightness alone (best ${r.bestRatio.toFixed(2)} : 1). Try a different hue or background.` })
  }

  const raw = contrast(fg, bg)
  const shown = floor2(raw)
  const ratioStr = shown.toFixed(2)

  const report = () => {
    const aa = shown >= 4.5
    return `Contrast check: ${fg} on ${bg} = ${ratioStr}:1 — ${aa ? 'PASSES' : 'FAILS'} WCAG AA (needs 4.5:1 normal / 3:1 large).`
  }
  const copyReport = () => copyText(report(), () => showToast('Report copied'))

  const printResult = () => {
    const rows = TESTS.map(t => {
      const pass = shown >= t.min
      return `<tr><td>${t.label}</td><td>${t.req}</td><td class="${pass ? 'p' : 'f'}">${pass ? 'Pass' : 'Fail'}</td></tr>`
    }).join('')
    const w = window.open('', '_blank', 'noopener,width=640,height=720')
    if (!w) { showToast('Pop-up blocked — allow pop-ups to print'); return }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Contrast check result</title>
<style>
  body{font:14px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;color:#17151D;margin:32px;max-width:560px}
  h1{font-size:20px;margin:0 0 4px} .sub{color:#5E5A6B;margin:0 0 20px;font-size:13px}
  .sw{display:flex;gap:16px;margin:0 0 18px}
  .sw>div{flex:1;border:1px solid #E6E4EC;border-radius:10px;overflow:hidden}
  .chip{height:70px} .cap{padding:8px 10px;font:600 12px/1.4 ui-monospace,monospace}
  .ratio{font:600 40px/1 ui-monospace,monospace;margin:0 0 4px}
  .pv{border:1px solid #E6E4EC;border-radius:10px;padding:18px;margin:8px 0 20px}
  .pv .lg{font-size:22px;font-weight:700;margin:0 0 8px} .pv .md{font-size:15px;margin:0}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #E6E4EC}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#5E5A6B}
  td.p{color:#15703D;font-weight:700} td.f{color:#B3102A;font-weight:700}
  .foot{margin-top:22px;font-size:11px;color:#9A96A6}
  @media print{body{margin:0}}
</style></head><body>
  <h1>WCAG contrast check</h1>
  <p class="sub">${fg} on ${bg} · generated ${new Date().toLocaleString()}</p>
  <div class="sw">
    <div><div class="chip" style="background:${fg}"></div><div class="cap">Foreground ${fg}</div></div>
    <div><div class="chip" style="background:${bg}"></div><div class="cap">Background ${bg}</div></div>
  </div>
  <p class="ratio">${ratioStr} : 1</p>
  <div class="pv" style="background:${bg};color:${fg}">
    <p class="lg">Large heading text</p>
    <p class="md">Normal body text reads at this size.</p>
  </div>
  <table>
    <thead><tr><th>Conformance</th><th>Requirement</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="foot">Ratio floored to two decimals so a borderline value never reads as a false pass. Large text = 18pt (24px) regular or 14pt bold. Generated by CourseForge.</p>
  <script>window.onload=function(){setTimeout(function(){window.print()},120)}<\/script>
</body></html>`)
    w.document.close()
  }

  if (!open) return null

  const slotData = [
    { slot: 'fg', title: 'Foreground (text)', val: fg, hexText: hexFgText },
    { slot: 'bg', title: 'Background',        val: bg, hexText: hexBgText },
  ]

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Contrast checker (WCAG / 508)"
      tabIndex={-1}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, width: 360, zIndex: 4000,
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)', color: C.text, fontFamily: C.font,
        outline: 'none', maxHeight: 'calc(100vh - 24px)', display: 'flex', flexDirection: 'column',
      }}
    >
      {/* ── drag handle / header ── */}
      <div
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        style={{
          padding: '10px 12px', borderBottom: `1px solid ${C.borderT}`, background: C.head,
          borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'grab', touchAction: 'none', userSelect: 'none',
        }}
      >
        <span aria-hidden="true" style={{ color: C.accent, fontSize: 13 }}>◐</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: C.text }}>
          Contrast checker · WCAG / 508
        </span>
        <button
          data-no-drag
          onClick={onClose}
          aria-label="Close contrast checker"
          style={{ background: 'none', border: 'none', color: C.text3, fontSize: 16, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
        >✕</button>
      </div>

      <div style={{ padding: '12px 12px 14px', overflowY: 'auto' }}>
        {/* ── color slots ── */}
        {slotData.map(({ slot, title, val, hexText }) => (
          <div key={slot} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${C.borderT}`, background: val, flexShrink: 0 }} />
              <label htmlFor={`cc-hex-${slot}`} style={{ fontSize: 11, fontWeight: 600, color: C.text2, letterSpacing: '0.04em' }}>{title}</label>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                id={`cc-hex-${slot}`}
                type="text"
                value={hexText}
                maxLength={7}
                autoComplete="off"
                spellCheck={false}
                aria-label={`${title} hex value`}
                onChange={e => onHexInput(slot, e.target.value)}
                onBlur={() => onHexBlur(slot)}
                style={{
                  flex: 1, minWidth: 0, fontFamily: C.font, fontSize: 13, padding: '7px 9px',
                  border: `1px solid ${C.border}`, borderRadius: 6, background: C.input, color: C.text,
                }}
              />
              <input
                type="color"
                value={val}
                aria-label={`${title} color picker`}
                onChange={e => applyHex(slot, e.target.value)}
                style={{ width: 36, height: 32, padding: 2, border: `1px solid ${C.border}`, borderRadius: 6, background: C.input, cursor: 'pointer', flexShrink: 0 }}
              />
              <button
                onClick={() => HAS_EYE ? pickEye(slot) : undefined}
                disabled={!HAS_EYE}
                aria-label={`Pick ${title} from screen (eyedropper)`}
                title={HAS_EYE ? 'Pick from screen' : 'Eyedropper is only available in Chromium browsers (Chrome, Edge, Opera). Use hex or the color picker.'}
                style={{
                  width: 34, height: 32, border: `1px solid ${C.border}`, borderRadius: 6,
                  background: C.input, color: HAS_EYE ? C.text : C.text3, cursor: HAS_EYE ? 'pointer' : 'not-allowed',
                  opacity: HAS_EYE ? 1 : 0.55, fontSize: 13, flexShrink: 0,
                }}
              >◉</button>
              <button
                data-no-drag
                onClick={() => copyHexOf(slot)}
                aria-label={`Copy ${title} hex`}
                title="Copy hex"
                style={{ width: 34, height: 32, border: `1px solid ${C.border}`, borderRadius: 6, background: C.input, color: C.text2, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
              >⎘</button>
            </div>
          </div>
        ))}

        {/* ── swap ── */}
        <button
          onClick={swap}
          aria-label="Swap foreground and background colors"
          style={{ width: '100%', padding: '6px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.input, color: C.text2, cursor: 'pointer', fontSize: 12, marginBottom: 12 }}
        >⇅ Swap colors</button>

        {/* ── ratio (announced) ── */}
        <div
          role="status"
          aria-live="polite"
          aria-label={`Contrast ratio ${ratioStr} to 1. AA normal text ${shown >= 4.5 ? 'passes' : 'fails'}.`}
          style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 0 12px' }}
        >
          <span style={{ fontFamily: C.font, fontSize: 34, fontWeight: 600, color: C.text, lineHeight: 1 }}>{ratioStr}</span>
          <span style={{ fontSize: 11, color: C.text2, letterSpacing: '0.08em' }}>: 1 RATIO</span>
        </div>

        {/* ── badges ── */}
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {TESTS.map(t => {
            const pass = shown >= t.min
            return (
              <div key={t.key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                border: `1px solid ${pass ? C.ok : C.fail}`, background: pass ? C.okBg : C.failBg, borderRadius: 7,
              }}>
                <span aria-hidden="true" style={{ color: pass ? C.ok : C.fail, fontWeight: 700, width: '1em', textAlign: 'center' }}>{pass ? '✓' : '✗'}</span>
                <span style={{ flex: 1, fontSize: 12, color: C.text }}>{t.label}</span>
                <span style={{ fontSize: 10, color: C.text3, fontFamily: C.font }}>{t.req}</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: pass ? C.ok : C.fail }}>{pass ? 'Pass' : 'Fail'}</span>
              </div>
            )
          })}
        </div>

        {/* ── live preview ── */}
        <div style={{ border: `1px solid ${C.borderT}`, borderRadius: 7, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ background: C.head, padding: '6px 10px', fontSize: 9, color: C.text3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Live preview</div>
          <div style={{ background: bg, padding: '14px 12px' }}>
            <p style={{ color: fg, fontSize: 19, fontWeight: 700, margin: '0 0 6px' }}>Large heading</p>
            <p style={{ color: fg, fontSize: 13, margin: 0 }}>Normal body text reads at this size for legibility.</p>
          </div>
        </div>

        {/* ── nudge ── */}
        <button
          onClick={doNudge}
          style={{ width: '100%', padding: '7px', border: 'none', borderRadius: 6, background: C.accent, color: '#1a1a1a', fontWeight: 700, fontFamily: C.font, fontSize: 12, cursor: 'pointer', marginBottom: nudge ? 8 : 12 }}
        >▲ Nudge foreground to pass AA</button>
        {nudge && (
          <div role="status" aria-live="polite" style={{ fontSize: 12, color: C.text, marginBottom: 12, lineHeight: 1.5 }}>
            {nudge.apply ? (
              <>
                Adjusted foreground to <code style={{ background: C.input, padding: '1px 6px', borderRadius: 4, border: `1px solid ${C.border}`, color: C.accent }}>{nudge.apply.hex}</code> ({nudge.apply.ratio.toFixed(2)} : 1).{' '}
                <button
                  onClick={() => { applyHex('fg', nudge.apply.hex); showToast('Applied ' + nudge.apply.hex) }}
                  style={{ marginLeft: 4, padding: '3px 8px', border: `1px solid ${C.border}`, borderRadius: 5, background: C.input, color: C.text, cursor: 'pointer', fontSize: 11 }}
                >Apply</button>
              </>
            ) : nudge.msg}
          </div>
        )}

        {/* ── export ── */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={copyReport}
            style={{ flex: 1, padding: '8px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.input, color: C.text, cursor: 'pointer', fontSize: 12, fontFamily: C.font }}
          >⎘ Copy report</button>
          <button
            onClick={printResult}
            style={{ flex: 1, padding: '8px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.input, color: C.text, cursor: 'pointer', fontSize: 12, fontFamily: C.font }}
          >⎙ Print</button>
        </div>
      </div>

      {toast && (
        <div role="status" aria-live="polite" style={{
          position: 'absolute', bottom: -34, left: '50%', transform: 'translateX(-50%)',
          background: C.text, color: C.panel, padding: '6px 14px', borderRadius: 8,
          fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        }}>{toast}</div>
      )}
    </div>
  )
}

// clipboard with legacy fallback
function copyText(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone, () => { legacyCopy(text); onDone() })
  } else { legacyCopy(text); onDone() }
}
function legacyCopy(text) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(ta)
}
