import React from 'react'

/**
 * MediaBar — shared transport bar for any timed media (OAM animations, interactive
 * video). Presentational only: it renders play/pause, a clickable scrubber with a
 * progress fill + stop markers, an optional Next-stop button, and a time readout.
 * The owner drives it with uniform state + commands, so the underlying engine
 * (CreateJS via the oam:* protocol, or an HTML5 <video>) is irrelevant here.
 *
 * Props:
 *   playing     bool
 *   t           current time (seconds)
 *   duration    total time (seconds)
 *   stops       number[] — marker positions in seconds
 *   onPlayPause ()
 *   onSeek      (seconds) — omit to make the scrubber non-interactive
 *   onNextStop  ()        — omit to hide the Next-stop button
 *   disabled    bool      — whole bar inert
 *   seekable    bool      — scrubber clickable (default: !!onSeek)
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export default function MediaBar({
  playing = false, t = 0, duration = 0, stops = [],
  onPlayPause, onSeek, onNextStop, disabled = false, seekable,
}) {
  const canSeek = (seekable ?? !!onSeek) && !disabled && duration > 0
  const seekClick = (e) => {
    if (!canSeek || !onSeek) return
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(clamp((e.clientX - r.left) / r.width, 0, 1) * duration)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      background: '#0d1017', border: '1px solid #1c2a3a', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
      <button onClick={onPlayPause} disabled={disabled} aria-label={playing ? 'Pause' : 'Play'}
        style={barBtn(!disabled)}>{playing ? '⏸' : '▶'}</button>

      <div onClick={seekClick} role="slider" aria-label="Seek"
        aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(t)}
        style={{ flex: 1, position: 'relative', height: 8, background: '#1c2a3a', borderRadius: 4,
                 cursor: canSeek ? 'pointer' : 'default', opacity: (canSeek || !onSeek) ? 1 : 0.5 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
          width: (duration ? (t / duration * 100) : 0) + '%', background: 'var(--forge-amber, #F59E0B)', borderRadius: 4 }} />
        {stops.map((s, i) => (
          <div key={i} title={`Stop ${i + 1}`} style={{ position: 'absolute', left: (duration ? s / duration * 100 : 0) + '%',
            top: -4, width: 2, height: 16, background: '#7EB8F0', borderRadius: 1, transform: 'translateX(-50%)', pointerEvents: 'none' }} />
        ))}
      </div>

      {onNextStop && (
        <button onClick={onNextStop} disabled={disabled || !stops.length}
          aria-label="Skip to next stop" title="Next stop" style={barBtn(!disabled && !!stops.length)}>⤓ Next stop</button>
      )}

      <span style={{ fontFamily: 'var(--forge-font, monospace)', fontSize: 10, color: '#7A90A8', minWidth: 60, textAlign: 'right' }}>
        {duration ? `${t.toFixed(1)}/${duration.toFixed(0)}s` : ''}
      </span>
    </div>
  )
}

const barBtn = (enabled) => ({
  background: enabled ? 'var(--forge-amber, #F59E0B)' : '#2a2a35',
  color: enabled ? '#042C53' : '#666', border: 'none', borderRadius: 4,
  padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
  fontFamily: 'var(--forge-font, monospace)', whiteSpace: 'nowrap',
})
