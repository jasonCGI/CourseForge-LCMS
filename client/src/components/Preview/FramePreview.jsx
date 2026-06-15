import React, { useState } from 'react'

const FRAME_BG = '#ffffff'

export default function FramePreview({ frame }) {
  if (!frame) return null

  const blocks = frame.content?.blocks || []

  return (
    <div style={{
      background: FRAME_BG,
      color: '#1a1a1a',
      fontFamily: 'Inter, system-ui, sans-serif',
      minHeight: '100%',
      padding: '32px 40px',
      boxSizing: 'border-box',
    }}>
      {/* Frame title */}
      <h1 style={{
        fontSize: 22,
        fontWeight: 600,
        color: '#042C53',
        marginBottom: 24,
        paddingBottom: 12,
        borderBottom: '2px solid #EF9F27',
      }}>
        {frame.name}
      </h1>

      {/* Blocks */}
      {blocks.length === 0 && (
        <p style={{ color: '#888', fontStyle: 'italic' }}>No content blocks in this frame.</p>
      )}

      {blocks.map(block => (
        <PreviewBlock key={block.id} block={block} />
      ))}
    </div>
  )
}

function PreviewBlock({ block }) {
  switch (block.type) {
    case 'text':    return <PreviewText    block={block} />
    case 'media':   return <PreviewMedia   block={block} />
    case 'quiz':    return <PreviewQuiz    block={block} />
    case 'hotspot': return <PreviewHotspot block={block} />
    case 'branch':  return <PreviewBranch  block={block} />
    default:        return (
      <div style={previewBlockWrap}>
        <p style={{ color: '#888', fontSize: 13 }}>
          [{block.type} block — preview not yet implemented]
        </p>
      </div>
    )
  }
}

function PreviewText({ block }) {
  return (
    <div style={previewBlockWrap}>
      {block.data.body && (
        <div
          style={{ fontSize: 15, lineHeight: 1.7, color: '#1a1a1a', marginBottom: 12 }}
          dangerouslySetInnerHTML={{ __html: block.data.body }}
        />
      )}
      {block.data.narrator_script && (
        <div style={{
          padding: '10px 14px',
          background: '#F0F6FF',
          borderLeft: '3px solid #185FA5',
          borderRadius: '0 4px 4px 0',
          fontSize: 13,
          color: '#185FA5',
          fontStyle: 'italic',
        }}>
          🎙 {block.data.narrator_script}
        </div>
      )}
    </div>
  )
}

function PreviewMedia({ block }) {
  const icons = { image: '🖼', video: '🎬', audio: '🎙', oam: '⚙' }
  return (
    <div style={{ ...previewBlockWrap, textAlign: 'center' }}>
      <div style={{
        padding: '32px 20px',
        border: '2px dashed #B5D4F4',
        borderRadius: 6,
        background: '#F8FBFF',
        color: '#185FA5',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{icons[block.data.kind] || '📎'}</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          [{block.data.kind}: {block.data.placeholder_label || 'no label'}]
        </div>
        {block.data.caption && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{block.data.caption}</div>
        )}
      </div>
    </div>
  )
}

function PreviewQuiz({ block }) {
  const [selected, setSelected]   = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const choices = block.data.choices || []
  const correct = block.data.correct_index ?? 0
  const isRight = selected === correct

  return (
    <div style={{ ...previewBlockWrap, background: '#FAFAFA', border: '1px solid #E0E0E0', borderRadius: 8, padding: 20 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: '#042C53', marginBottom: 16 }}>
        {block.data.question || 'Question not set'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {choices.map((choice, idx) => {
          let bg = '#fff', border = '#ddd', color = '#1a1a1a'
          if (submitted) {
            if (idx === correct) { bg = '#EAF6EC'; border = '#3B8A4A'; color = '#1E7E34' }
            else if (idx === selected) { bg = '#FDECEA'; border = '#C0392B'; color = '#C0392B' }
          } else if (idx === selected) {
            border = '#185FA5'; bg = '#F0F6FF'
          }
          return (
            <button
              key={idx}
              onClick={() => !submitted && setSelected(idx)}
              style={{
                padding: '10px 14px',
                border: `2px solid ${border}`,
                borderRadius: 6,
                background: bg,
                color,
                fontSize: 14,
                textAlign: 'left',
                cursor: submitted ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {choice}
            </button>
          )
        })}
      </div>

      {!submitted && selected !== null && (
        <button
          onClick={() => setSubmitted(true)}
          style={{
            padding: '8px 20px',
            background: '#185FA5',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Submit
        </button>
      )}

      {submitted && (
        <div style={{
          padding: '10px 14px',
          background: isRight ? '#EAF6EC' : '#FDECEA',
          border: `1px solid ${isRight ? '#3B8A4A' : '#C0392B'}`,
          borderRadius: 6,
          fontSize: 13,
          color: isRight ? '#1E7E34' : '#C0392B',
          fontWeight: 500,
        }}>
          {isRight
            ? block.data.feedback_correct || 'Correct!'
            : block.data.feedback_incorrect || 'Incorrect — please review.'}
        </div>
      )}
    </div>
  )
}

function PreviewHotspot({ block }) {
  const [active, setActive] = useState(null)
  const regions = block.data.regions || []

  return (
    <div style={previewBlockWrap}>
      <div style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '56.25%',
        background: '#E8F0F8',
        border: '1px solid #B5D4F4',
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        {!block.data.image_id && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#888', fontSize: 13,
          }}>
            [Hotspot image — no asset linked]
          </div>
        )}

        {regions.map(r => (
          <div
            key={r.id}
            onClick={() => setActive(active === r.id ? null : r.id)}
            style={{
              position: 'absolute',
              left: `${r.x}%`, top: `${r.y}%`,
              width: `${r.w}%`, height: `${r.h}%`,
              border: `2px solid ${active === r.id ? '#EF9F27' : '#185FA5'}`,
              background: active === r.id ? 'rgba(239,159,39,0.2)' : 'rgba(24,95,165,0.1)',
              borderRadius: 2,
              cursor: 'pointer',
              boxSizing: 'border-box',
              transition: 'all 0.15s',
            }}
          >
            {active === r.id && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0,
                background: '#042C53', color: '#fff',
                fontSize: 11, padding: '4px 8px',
                borderRadius: '4px 4px 0 0', whiteSpace: 'nowrap',
              }}>
                {r.label}
              </div>
            )}
          </div>
        ))}
      </div>
      {regions.length > 0 && (
        <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
          Click hotspot regions to reveal labels.
        </p>
      )}
    </div>
  )
}

function PreviewBranch({ block }) {
  const [chosen, setChosen] = useState(null)
  return (
    <div style={{ ...previewBlockWrap, background: '#F8F8FF', border: '1px solid #CECBF6', borderRadius: 8, padding: 20 }}>
      {block.data.condition && (
        <p style={{ fontSize: 15, fontWeight: 600, color: '#042C53', marginBottom: 16 }}>
          {block.data.condition}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => setChosen('true')}
          style={{
            flex: 1, padding: '12px 16px',
            background: chosen === 'true' ? '#3B8A4A' : '#fff',
            color: chosen === 'true' ? '#fff' : '#3B8A4A',
            border: '2px solid #3B8A4A',
            borderRadius: 6, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          ✓ {block.data.true_label || 'Yes'}
        </button>
        <button
          onClick={() => setChosen('false')}
          style={{
            flex: 1, padding: '12px 16px',
            background: chosen === 'false' ? '#C0392B' : '#fff',
            color: chosen === 'false' ? '#fff' : '#C0392B',
            border: '2px solid #C0392B',
            borderRadius: 6, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          ✕ {block.data.false_label || 'No'}
        </button>
      </div>
      {chosen && (
        <p style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          → Would navigate to:{' '}
          <strong>
            {chosen === 'true'
              ? (block.data.true_frame_id  || 'no frame set')
              : (block.data.false_frame_id || 'no frame set')}
          </strong>
        </p>
      )}
    </div>
  )
}

// Shared styles
const previewBlockWrap = { marginBottom: 20 }
