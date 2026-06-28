import React, { useEffect, useRef, useState, useCallback } from 'react'
import MediaBar from '../../Preview/MediaBar'
import { hotspotStyle, shapeRadius, rgba } from '../../../utils/hotspotStyle'
import { nativeRes, pxToPct } from '../../../utils/clipCoords'

// An interaction is a *pause point* when reaching it should hold playback so the
// learner addresses it. Hotspots/quiz/branch/wcn pause by default (opt out with
// pause_on_reach:false); passive annotations only pause if explicitly opted in.
function shouldPause(i) {
  return i.type === 'annotation' ? !!i.pause_on_reach : i.pause_on_reach !== false
}

export default function IVideoRuntime({
  videoSrc, webmSrc, vttSrc, posterSrc,
  clipData,       // parsed .clip.json object (may be null while loading)
  onComplete,
  scorm,
  fill = false,   // full-bleed: media fills the box and the controller overlays its bottom
}) {
  const videoRef = useRef(null)
  const wrapRef  = useRef(null)
  const [activeInts,   setActiveInts]   = useState([])
  const [blocking,     setBlocking]     = useState(null)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [playing,      setPlaying]      = useState(false)
  const [volume,       setVolume]       = useState(1)
  const [muted,        setMuted]        = useState(false)
  const [captionsOn,   setCaptionsOn]   = useState(!!vttSrc)  // <track default> shows them initially
  const [answered,     setAnswered]     = useState({})
  const [quizSelected, setQuizSelected] = useState({})
  const [hasAudio,     setHasAudio]     = useState(true)   // assume audio until detection says otherwise

  const interactions = clipData?.interactions || []

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    setCurrentTime(t)

    const inRange = interactions.filter(i =>
      t >= i.timecode && (!i.end_timecode || t <= i.end_timecode)
    )
    setActiveInts(inRange)

    // Pause at each pause-point marker (within its active window) once reached.
    const blocker = inRange.find(i => shouldPause(i) && !answered[i.id])
    if (blocker && !blocking) {
      v.pause()
      setBlocking(blocker)
    }
  }, [interactions, answered, blocking])

  // Detect whether the video actually carries an audio track, so a soundless clip
  // hides the volume/mute control instead of implying sound that isn't there.
  // mozHasAudio / webkitAudioDecodedByteCount / audioTracks.length cover the major
  // engines; where none is available we leave the control as-is (assume audio).
  const detectAudio = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (typeof v.mozHasAudio === 'boolean') { setHasAudio(v.mozHasAudio); return }
    if (v.audioTracks && typeof v.audioTracks.length === 'number') { setHasAudio(v.audioTracks.length > 0); return }
    if (typeof v.webkitAudioDecodedByteCount === 'number') {
      // Bytes are decoded only once playback flows, so this is conclusive only
      // after the playhead has advanced: bytes>0 => audio; advanced with 0 bytes
      // => no audio. Before then, keep the control (assume audio).
      if (v.webkitAudioDecodedByteCount > 0) setHasAudio(true)
      else if (v.currentTime > 0.1) setHasAudio(false)
      return
    }
    // No detection support -> degrade gracefully (leave hasAudio = true).
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const meta = () => { setDuration(v.duration || 0); detectAudio() }
    // Replay: when the clip ends, clear consumed/answered interactions so a
    // replay re-arms every hotspot/quiz/branch from the top.
    const ended = () => { setPlaying(false); onComplete?.(); setAnswered({}); setQuizSelected({}); setBlocking(null) }
    // Scrub-back: re-arm any interaction at/after the new playhead so seeking
    // backward (or replaying from 0) makes those interactions fire again — and
    // drop their stale quiz selection so a re-blocked quiz starts unanswered.
    const onSeeked = () => {
      const tt = v.currentTime
      const reArmed = new Set(interactions.filter(i => i.timecode >= tt - 0.05).map(i => i.id))
      if (!reArmed.size) return
      const prune = obj => {
        let changed = false; const out = {}
        for (const k in obj) { if (reArmed.has(k)) { changed = true; continue } out[k] = obj[k] }
        return changed ? out : obj
      }
      setAnswered(prune)
      setQuizSelected(prune)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onVol = () => { setVolume(v.volume); setMuted(v.muted) }
    const onProgress = () => detectAudio()
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('loadedmetadata', meta)
    v.addEventListener('loadeddata', meta)
    v.addEventListener('playing', onProgress)
    v.addEventListener('timeupdate', onProgress)
    v.addEventListener('ended', ended)
    v.addEventListener('seeked', onSeeked)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('volumechange', onVol)
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('loadeddata', meta)
      v.removeEventListener('playing', onProgress)
      v.removeEventListener('timeupdate', onProgress)
      v.removeEventListener('loadedmetadata', meta)
      v.removeEventListener('ended', ended)
      v.removeEventListener('seeked', onSeeked)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('volumechange', onVol)
    }
  }, [onTimeUpdate, onComplete, detectAudio])

  const submitQuiz = (i) => {
    const selected = quizSelected[i.id]
    if (selected === undefined) return
    const isCorrect = selected === i.data.correct_index
    setAnswered(prev => ({ ...prev, [i.id]: { correct: isCorrect } }))
    scorm?.setValue?.('cmi.core.score.raw', isCorrect ? '100' : '0')
    setTimeout(() => { setBlocking(null); videoRef.current?.play() }, 1400)
  }

  const selectBranch = (i, targetTimecode) => {
    setAnswered(prev => ({ ...prev, [i.id]: true }))
    setBlocking(null)
    const v = videoRef.current
    if (v) { if (targetTimecode != null) v.currentTime = targetTimecode; v.play() }
  }

  const acknowledge = (i) => {
    setAnswered(prev => ({ ...prev, [i.id]: true }))
    setBlocking(null)
    // Resume whenever this interaction actually held playback (it was a pause point).
    if (shouldPause(i)) videoRef.current?.play()
  }

  // Interaction timecodes become stop markers on the shared media bar, mirroring
  // the OAM player's stop markers.
  const stops = interactions
    .map(i => i.timecode)
    .filter(t => typeof t === 'number' && t >= 0)

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play(); else v.pause()
  }
  const seek = (sec) => { const v = videoRef.current; if (v) v.currentTime = sec }
  const nextStop = () => {
    const next = stops.filter(s => s > currentTime + 0.05).sort((a, b) => a - b)[0]
    if (next != null && videoRef.current) videoRef.current.currentTime = next
  }
  const changeVolume = (val) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    v.muted = val === 0
  }
  const toggleMute = () => { const v = videoRef.current; if (v) v.muted = !v.muted }
  const toggleCaptions = () => {
    const v = videoRef.current
    if (!v || !v.textTracks?.length) return
    const next = !captionsOn
    for (const tt of v.textTracks) {
      if (tt.kind === 'captions' || tt.kind === 'subtitles') tt.mode = next ? 'showing' : 'hidden'
    }
    setCaptionsOn(next)
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) { document.exitFullscreen?.(); return }
    wrapRef.current?.requestFullscreen?.()
  }

  // Non-blocking overlays exclude any consumed hotspot — once selected it is gone,
  // it must NOT reappear as a resting overlay (B.2). Other answered interactions
  // (annotations etc.) may still show in their window.
  const overlayInts = activeInts.filter(i =>
    (i.type === 'hotspot' && answered[i.id]) ? false : (!shouldPause(i) || answered[i.id])
  )

  // Shared transport bar. In fill (full-bleed) mode it OVERLAYS the bottom of the
  // media — absolutely positioned inside the media container — so the content fills
  // the area with the controls on top and the frame never grows a scrollbar. In
  // inline mode it docks below the media in normal flow (unchanged).
  const bar = (
    <MediaBar
      playing={playing}
      t={currentTime}
      duration={duration}
      stops={stops}
      onPlayPause={togglePlay}
      onSeek={seek}
      onNextStop={nextStop}
      disabled={!!blocking}
      volume={volume}
      muted={muted}
      onVolume={hasAudio ? changeVolume : undefined}
      onToggleMute={hasAudio ? toggleMute : undefined}
      captions={captionsOn}
      onToggleCaptions={vttSrc ? toggleCaptions : undefined}
      onFullscreen={toggleFullscreen}
    />
  )

  return (
    <div ref={wrapRef} style={fill
      ? { position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }
      : { width: '100%', background: '#000' }}>
      <div style={fill
        ? { position: 'absolute', inset: 0, background: '#000', overflow: 'hidden' }
        : { position: 'relative', width: '100%', background: '#000', overflow: 'hidden' }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions <track> is rendered conditionally below when a VTT companion exists */}
        <video ref={videoRef} controls={false}
          style={fill
            ? { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }
            : { width: '100%', display: 'block' }}
          poster={posterSrc} aria-label="Interactive video">
          {webmSrc && <source src={webmSrc} type="video/webm" />}
          {videoSrc && <source src={videoSrc} type="video/mp4" />}
          {vttSrc && <track kind="captions" src={vttSrc} srcLang="en" label="English" default />}
          <p>Your browser does not support HTML5 video.</p>
        </video>

        {/* Non-blocking overlays */}
        {overlayInts.map(i => (
          <Overlay key={i.id} i={i} clip={clipData} />
        ))}

        {/* Blocking overlay */}
        {blocking && (
          <Blocking
            i={blocking}
            clip={clipData}
            answered={answered[blocking.id]}
            quizSelected={quizSelected}
            onQuizSelect={(id, idx) => setQuizSelected(prev => ({ ...prev, [id]: idx }))}
            onQuizSubmit={submitQuiz}
            onBranch={selectBranch}
            onAck={acknowledge}
          />
        )}

        {/* Controller overlaying the bottom of the media (full-bleed) */}
        {fill && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40 }}>{bar}</div>
        )}
      </div>

      {/* Controller docked below the media (inline flow) */}
      {!fill && bar}
    </div>
  )
}

// Position an overlay datum on the video. Native-px coords (clip.coords==='px')
// map through pxToPct against the video's native resolution; legacy %-coords
// render verbatim. Mirrors the published sco_shell renderer for byte-for-byte parity.
function overlayPos(d, clip) {
  if (clip && clip.coords === 'px') {
    const { nW, nH } = nativeRes(clip)
    const p = pxToPct(d, nW, nH)
    return { left: p.leftPct + '%', top: p.topPct + '%', width: p.wPct + '%', height: p.hPct + '%' }
  }
  return { left: (d.x ?? 0) + '%', top: (d.y ?? 0) + '%', width: (d.w ?? 22) + '%', height: (d.h ?? 22) + '%' }
}

function Overlay({ i, clip }) {
  const d = i.data || {}
  const pos = overlayPos(d, clip)
  if (i.type === 'hotspot' && d.x != null) {
    const st = hotspotStyle(d.color)
    return (
      <div role="button" tabIndex={0} aria-label={d.label} title={d.label}
        style={{ position: 'absolute', left: pos.left, top: pos.top,
          width: pos.width, height: pos.height, transform: 'translate(-50%,-50%)',
          border: `3px solid ${st.border}`, background: st.fill, borderRadius: shapeRadius(d.shape),
          boxSizing: 'border-box', cursor: 'pointer', zIndex: 10 }} />
    )
  }
  if (i.type === 'annotation' && d.x != null) {
    return (
      <div style={{ position: 'absolute', left: pos.left, top: pos.top, zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ background: 'rgba(4,44,83,0.85)', color: '#B5D4F4', fontSize: 11, padding: '3px 8px',
                      borderRadius: 3, border: '1px solid #185FA5', whiteSpace: 'nowrap' }}>{d.text}</div>
      </div>
    )
  }
  if (i.type === 'wcn' && !i.pause_on_reach) {
    const wc = { warning: '#C0392B', caution: '#B87A1A', note: '#185FA5' }[d.wcn_type] || '#185FA5'
    return (
      <div style={{ position: 'absolute', bottom: 48, left: 16, right: 16, zIndex: 10 }}>
        <div role="note" style={{ background: wc, borderRadius: 6, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 13 }}>
          <span style={{ fontSize: 18 }}>{d.wcn_type === 'warning' ? '⚠' : d.wcn_type === 'caution' ? '◆' : 'ℹ'}</span>
          <div style={{ flex: 1 }}>{d.title && <strong>{d.title}: </strong>}{d.text}</div>
        </div>
      </div>
    )
  }
  return null
}

function Blocking({ i, clip, answered, quizSelected, onQuizSelect, onQuizSubmit, onBranch, onAck }) {
  const d = i.data || {}
  const pos = overlayPos(d, clip)

  // Hotspot HOLD — video is paused; the hotspot shows as a larger yellow square
  // over a dimmed video, and clicking it resumes playback.
  if (i.type === 'hotspot') {
    return (
      <div role="dialog" aria-modal="true" aria-label={(d.label || 'Hotspot') + ' — explore to continue'}
        style={{ position: 'absolute', inset: 0, background: 'rgba(4,44,83,0.45)', zIndex: 50 }}>
        <button onClick={() => onAck(i)} title={d.label}
          aria-label={(d.label || 'Hotspot') + ' — click to continue'}
          style={{ position: 'absolute', left: pos.left, top: pos.top,
                   transform: 'translate(-50%,-50%)', width: pos.width, height: pos.height,
                   borderRadius: shapeRadius(d.shape), boxSizing: 'border-box',
                   background: hotspotStyle(d.color).fill, border: `3px solid ${hotspotStyle(d.color).border}`,
                   cursor: 'pointer', boxShadow: `0 0 0 4px ${rgba(hotspotStyle(d.color).stroke, 0.25)}` }} />
        {d.description && (
          <div style={{ position: 'absolute', left: pos.left, top: `calc(${pos.top} + 52px)`,
            transform: 'translateX(-50%)', background: '#0d1017', color: '#B5D4F4', border: '1px solid #185FA5',
            borderRadius: 6, padding: '6px 10px', fontSize: 12, maxWidth: 240, textAlign: 'center' }}>
            {d.description}
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(13,17,23,0.9)', color: '#F59E0B', border: '1px solid #F59E0B', borderRadius: 20,
          padding: '6px 16px', fontFamily: 'var(--forge-font, monospace)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
          ⏸ {d.label ? d.label + ' — ' : ''}click the highlighted area to continue
        </div>
      </div>
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${i.type} interaction`}
      style={{ position: 'absolute', inset: 0, background: 'rgba(4,44,83,0.80)', zIndex: 50,
               display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 8, maxWidth: 480, width: '100%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>

        {i.type === 'quiz' && (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', background: '#f8fbff' }}>
              <div style={{ fontFamily: 'var(--forge-font, monospace)', fontSize: 9, fontWeight: 600, color: '#185FA5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Knowledge Check</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#042C53' }}>{d.question}</div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              {(d.choices || []).map((choice, idx) => {
                const isSel = quizSelected[i.id] === idx
                const isAns = !!answered
                const isCorrect = isAns && idx === d.correct_index
                const isWrong = isAns && isSel && idx !== d.correct_index
                return (
                  <button key={idx} onClick={() => !isAns && onQuizSelect(i.id, idx)} disabled={isAns} aria-pressed={isSel}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', marginBottom: 8,
                      border: `2px solid ${isCorrect ? '#3B8A4A' : isWrong ? '#C0392B' : isSel ? '#185FA5' : '#ddd'}`,
                      borderRadius: 6, background: isCorrect ? '#EAF6EC' : isWrong ? '#FDECEA' : isSel ? '#F0F6FF' : '#fff',
                      color: isCorrect ? '#1E7E34' : isWrong ? '#C0392B' : '#1a1a1a',
                      fontSize: 14, textAlign: 'left', cursor: isAns ? 'default' : 'pointer', fontFamily: 'inherit' }}>{choice}</button>
                )
              })}
              {answered ? (
                <div style={{ padding: '10px 14px', borderRadius: 6, marginTop: 8,
                  background: answered.correct ? '#EAF6EC' : '#FDECEA',
                  color: answered.correct ? '#1E7E34' : '#C0392B', fontSize: 13, fontWeight: 500 }}>
                  {answered.correct ? (d.feedback_correct || 'Correct!') : (d.feedback_incorrect || 'Not quite — review and try again.')}
                </div>
              ) : (
                <button onClick={() => onQuizSubmit(i)} disabled={quizSelected[i.id] === undefined}
                  style={{ marginTop: 8, padding: '9px 20px', background: quizSelected[i.id] !== undefined ? '#185FA5' : '#ccc',
                    color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    cursor: quizSelected[i.id] !== undefined ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Submit</button>
              )}
            </div>
          </>
        )}

        {i.type === 'branch' && (
          <>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', background: '#f8fbff' }}>
              <div style={{ fontFamily: 'var(--forge-font, monospace)', fontSize: 9, fontWeight: 600, color: '#7A3A9A', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Decision Point</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#042C53' }}>{d.prompt || d.condition}</div>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', gap: 10 }}>
              <button onClick={() => onBranch(i, d.true_timecode)} style={branchBtn('#3B8A4A')}>✓ {d.true_label || 'Yes'}</button>
              <button onClick={() => onBranch(i, d.false_timecode)} style={branchBtn('#C0392B')}>✕ {d.false_label || 'No'}</button>
            </div>
          </>
        )}

        {i.type === 'wcn' && (
          <>
            <div style={{ padding: '14px 18px',
              background: d.wcn_type === 'warning' ? '#1a0800' : d.wcn_type === 'caution' ? '#1a1000' : '#06080f',
              borderBottom: `3px solid ${d.wcn_type === 'warning' ? '#C0392B' : d.wcn_type === 'caution' ? '#B87A1A' : '#185FA5'}`,
              display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>{d.wcn_type === 'warning' ? '⚠' : d.wcn_type === 'caution' ? '◆' : 'ℹ'}</span>
              <div>
                <div style={{ fontFamily: 'var(--forge-font, monospace)', fontSize: 9, fontWeight: 600,
                  color: d.wcn_type === 'caution' ? 'var(--forge-amber)' : '#fff', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>{d.wcn_type}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{d.title}</div>
              </div>
            </div>
            <div style={{ padding: '14px 18px', fontSize: 13, lineHeight: 1.65, color: '#1a1a1a' }}>{d.text}</div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', background: '#f8f8f8' }}>
              <button onClick={() => onAck(i)}
                style={{ padding: '8px 20px', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: d.wcn_type === 'warning' ? '#C0392B' : d.wcn_type === 'caution' ? '#B87A1A' : '#185FA5' }}>
                ✓ {d.ack_label || 'I understand — proceed'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const branchBtn = (color) => ({
  flex: 1, padding: '12px 16px', border: `2px solid ${color}`, borderRadius: 6,
  color, background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
})
