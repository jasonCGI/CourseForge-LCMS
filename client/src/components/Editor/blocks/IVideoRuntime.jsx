import React, { useEffect, useRef, useState, useCallback } from 'react'

export default function IVideoRuntime({
  videoSrc, webmSrc, vttSrc, posterSrc,
  clipData,       // parsed .clip.json object (may be null while loading)
  onComplete,
  scorm,
}) {
  const videoRef = useRef(null)
  const [activeInts,   setActiveInts]   = useState([])
  const [blocking,     setBlocking]     = useState(null)
  const [currentTime,  setCurrentTime]  = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [answered,     setAnswered]     = useState({})
  const [quizSelected, setQuizSelected] = useState({})

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

    const blocker = inRange.find(i => i.pause_on_reach && !answered[i.id])
    if (blocker && !blocking) {
      v.pause()
      setBlocking(blocker)
    }
  }, [interactions, answered, blocking])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const meta = () => setDuration(v.duration || 0)
    const ended = () => onComplete?.()
    v.addEventListener('timeupdate', onTimeUpdate)
    v.addEventListener('loadedmetadata', meta)
    v.addEventListener('ended', ended)
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate)
      v.removeEventListener('loadedmetadata', meta)
      v.removeEventListener('ended', ended)
    }
  }, [onTimeUpdate, onComplete])

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
    if (i.pause_on_reach) videoRef.current?.play()
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div style={{ position: 'relative', width: '100%', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
      <video ref={videoRef} controls={!blocking} style={{ width: '100%', display: 'block' }}
        poster={posterSrc} aria-label="Interactive video">
        {webmSrc && <source src={webmSrc} type="video/webm" />}
        {videoSrc && <source src={videoSrc} type="video/mp4" />}
        {vttSrc && <track kind="captions" src={vttSrc} srcLang="en" label="English" default />}
        <p>Your browser does not support HTML5 video.</p>
      </video>

      {/* Non-blocking overlays */}
      {activeInts.filter(i => !i.pause_on_reach || answered[i.id]).map(i => (
        <Overlay key={i.id} i={i} />
      ))}

      {/* Blocking overlay */}
      {blocking && (
        <Blocking
          i={blocking}
          answered={answered[blocking.id]}
          quizSelected={quizSelected}
          onQuizSelect={(id, idx) => setQuizSelected(prev => ({ ...prev, [id]: idx }))}
          onQuizSubmit={submitQuiz}
          onBranch={selectBranch}
          onAck={acknowledge}
        />
      )}

      {/* Progress */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.1)' }}>
        <div style={{ height: '100%', background: 'var(--forge-amber)', width: pct + '%', transition: 'width 0.1s linear' }} />
      </div>
    </div>
  )
}

function Overlay({ i }) {
  const d = i.data || {}
  if (i.type === 'hotspot' && d.x != null) {
    return (
      <div style={{ position: 'absolute', left: d.x + '%', top: d.y + '%', transform: 'translate(-50%,-50%)', zIndex: 10 }}>
        <div role="button" tabIndex={0} aria-label={d.label} title={d.label}
          style={{ width: 64, height: 64, borderRadius: 4, background: 'rgba(245,158,11,0.12)',
                   border: '3px solid #F59E0B', cursor: 'pointer' }} />
      </div>
    )
  }
  if (i.type === 'annotation' && d.x != null) {
    return (
      <div style={{ position: 'absolute', left: d.x + '%', top: d.y + '%', zIndex: 10, pointerEvents: 'none' }}>
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

function Blocking({ i, answered, quizSelected, onQuizSelect, onQuizSubmit, onBranch, onAck }) {
  const d = i.data || {}

  // Hotspot HOLD — video is paused; the hotspot shows as a larger yellow square
  // over a dimmed video, and clicking it resumes playback.
  if (i.type === 'hotspot') {
    return (
      <div role="dialog" aria-modal="true" aria-label={(d.label || 'Hotspot') + ' — explore to continue'}
        style={{ position: 'absolute', inset: 0, background: 'rgba(4,44,83,0.45)', zIndex: 50 }}>
        <button onClick={() => onAck(i)} title={d.label}
          aria-label={(d.label || 'Hotspot') + ' — click to continue'}
          style={{ position: 'absolute', left: (d.x ?? 50) + '%', top: (d.y ?? 50) + '%',
                   transform: 'translate(-50%,-50%)', width: 72, height: 72, borderRadius: 4,
                   background: 'rgba(245,158,11,0.18)', border: '3px solid #F59E0B', cursor: 'pointer',
                   boxShadow: '0 0 0 4px rgba(245,158,11,0.25)' }} />
        {d.description && (
          <div style={{ position: 'absolute', left: (d.x ?? 50) + '%', top: `calc(${d.y ?? 50}% + 52px)`,
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
