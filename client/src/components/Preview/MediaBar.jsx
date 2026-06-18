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
 *   volume      0..1      — current volume (when a volume control is wanted)
 *   muted       bool
 *   onVolume    (0..1)    — omit to hide the volume control
 *   onToggleMute()        — speaker-icon click (defaults to onVolume toggle if omitted)
 *   captions    bool      — captions currently showing
 *   onToggleCaptions()    — omit to hide the CC button
 *   onFullscreen()        — omit to hide the fullscreen button
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export default function MediaBar({
  playing = false, t = 0, duration = 0, stops = [],
  onPlayPause, onSeek, onNextStop, disabled = false, seekable,
  volume = 1, muted = false, onVolume, onToggleMute,
  captions = false, onToggleCaptions, onFullscreen,
}) {
  const canSeek = (seekable ?? !!onSeek) && !disabled && duration > 0
  const seekClick = (e) => {
    if (!canSeek || !onSeek) return
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(clamp((e.clientX - r.left) / r.width, 0, 1) * duration)
  }
  const vol = muted ? 0 : clamp(volume, 0, 1)
  const toggleMute = onToggleMute || (() => onVolume?.(vol > 0 ? 0 : 1))
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

      {onVolume && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={toggleMute} disabled={disabled} aria-label={vol === 0 ? 'Unmute' : 'Mute'}
            title={vol === 0 ? 'Unmute' : 'Mute'} style={iconBtn(!disabled)}>{vol === 0 ? '🔇' : vol < 0.5 ? '🔈' : '🔊'}</button>
          <input type="range" min={0} max={1} step={0.05} value={vol} disabled={disabled}
            onChange={(e) => onVolume(Number(e.target.value))} aria-label="Volume"
            style={{ width: 56, accentColor: 'var(--forge-amber, #F59E0B)', cursor: disabled ? 'default' : 'pointer' }} />
        </div>
      )}

      {onToggleCaptions && (
        <button onClick={onToggleCaptions} aria-label="Captions" aria-pressed={captions}
          title={captions ? 'Hide captions' : 'Show captions'}
          style={{ ...iconBtn(true), fontSize: 11, fontWeight: 700, padding: '3px 5px', borderRadius: 3,
                   background: captions ? 'var(--forge-amber, #F59E0B)' : 'transparent',
                   color: captions ? '#042C53' : '#B5D4F4' }}>CC</button>
      )}

      {onFullscreen && (
        <button onClick={onFullscreen} aria-label="Fullscreen" title="Fullscreen"
          style={iconBtn(true)}>⛶</button>
      )}
    </div>
  )
}

const iconBtn = (enabled) => ({
  background: 'transparent', color: enabled ? '#B5D4F4' : '#445',
  border: 'none', borderRadius: 4, padding: '4px 6px', fontSize: 14,
  cursor: enabled ? 'pointer' : 'not-allowed', lineHeight: 1,
})

const barBtn = (enabled) => ({
  background: enabled ? 'var(--forge-amber, #F59E0B)' : '#2a2a35',
  color: enabled ? '#042C53' : '#666', border: 'none', borderRadius: 4,
  padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: enabled ? 'pointer' : 'not-allowed',
  fontFamily: 'var(--forge-font, monospace)', whiteSpace: 'nowrap',
})
