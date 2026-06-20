import React, { useState, useEffect, useRef } from 'react'
import IVideoRuntime from '../Editor/blocks/IVideoRuntime'
import Model3DViewer from './Model3DViewer'
import GUIShellRenderer from './GUIShellRenderer'
import OamMediaBar from './OamMediaBar'

const FRAME_BG = '#ffffff'

export default function FramePreview({ frame, activeBlockId = null, onBlockSelect = null }) {
  if (!frame) return null

  const blocks = frame.content?.blocks || []

  // GUI-shell frame: the shell is the whole canvas; all other blocks are
  // injected into its content area. Render it instead of the normal stack.
  const guiBlock = blocks.find(b => b.type === 'gui')
  if (guiBlock) {
    const contentBlocks = blocks.filter(b => b.type !== 'gui')
    return (
      <div style={{
        background: FRAME_BG, color: '#1a1a1a',
        fontFamily: 'Inter, system-ui, sans-serif',
        minHeight: '100%', padding: '32px 40px', boxSizing: 'border-box',
      }}>
        <h1 style={{
          fontSize: 22, fontWeight: 600, color: '#042C53',
          marginBottom: 24, paddingBottom: 12,
          borderBottom: '2px solid var(--forge-amber)',
        }}>{frame.name}</h1>
        <PreviewGUI guiBlock={guiBlock} contentBlocks={contentBlocks} frameName={frame.name} />
      </div>
    )
  }

  const textBlocks  = blocks.filter(b => b.type === 'text')
  const otherBlocks = blocks.filter(b => b.type !== 'text')
  const renderBlock = (block) => (
    <SelectableBlock key={block.id} block={block}
      active={block.id === activeBlockId} onSelect={onBlockSelect} />
  )

  return (
    <div style={{
      background: FRAME_BG,
      color: '#1a1a1a',
      fontFamily: 'Inter, system-ui, sans-serif',
      minHeight: '100%',
      padding: '28px 0 40px',
      boxSizing: 'border-box',
    }}>
      {/* Frame title */}
      <h1 style={{
        fontSize: 22,
        fontWeight: 600,
        color: '#042C53',
        margin: '0 25px 24px',
        paddingBottom: 12,
        borderBottom: '2px solid var(--forge-amber)',
      }}>
        {frame.name}
      </h1>

      {blocks.length === 0 && (
        <p style={{ color: '#888', fontStyle: 'italic', padding: '0 25px' }}>No content blocks in this frame.</p>
      )}

      {/* Basic two-zone layout: text on the left half, media/image/3D on the right
          half — each 50%, 25px padding. A layout-preset dropdown (text-left/
          image-right, image-left/text-right, …) will replace this default later. */}
      {blocks.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box', padding: 25 }}>
            {textBlocks.map(renderBlock)}
          </div>
          <div style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box', padding: 25 }}>
            {otherBlocks.map(renderBlock)}
          </div>
        </div>
      )}
    </div>
  )
}

// Wraps a preview block so clicking it selects that block in the inspector
// (preview → tab), and so the active block outlines + scrolls into view when
// selected from the inspector (tab → preview). No-ops to a plain block when no
// onSelect handler is provided (e.g. read-only previews).
function SelectableBlock({ block, active, onSelect }) {
  const ref = useRef(null)
  useEffect(() => {
    if (active && ref.current) ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])
  if (!onSelect) return <PreviewBlock block={block} />
  return (
    <div ref={ref} onClick={() => onSelect(block.id)}
      style={{
        position: 'relative', cursor: 'pointer', borderRadius: 6,
        outline: active ? '2px solid var(--forge-amber)' : '2px solid transparent',
        outlineOffset: 3, transition: 'outline-color 0.15s',
      }}>
      <PreviewBlock block={block} />
    </div>
  )
}

function PreviewGUI({ guiBlock, contentBlocks, frameName }) {
  const [action, setAction] = useState(null)

  if (!guiBlock.data.gui_asset_id) {
    return (
      <div style={{
        padding: 32, textAlign: 'center',
        border: '2px dashed #3A5A8A', borderRadius: 8, color: '#3A5A8A',
        background: 'rgba(58,90,138,0.05)', marginBottom: 16,
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>▣</div>
        <div style={{ fontSize: 13 }}>GUI Shell — upload a ForgeGUI ZIP to preview</div>
      </div>
    )
  }

  const frameHtml = (contentBlocks || []).map(renderBlockToHTML).join('')

  return (
    <div style={{ marginBottom: 16 }}>
      <GUIShellRenderer
        shellUrl={guiBlock.data.html_serve_url}
        frameHtml={frameHtml}
        frameData={{
          frameIndex: 1, totalFrames: 1,
          lessonTitle: 'Preview', sectionTitle: 'Preview',
          frameTitle: frameName || 'Frame Preview',
          prompt: frameName || '',
          isFirst: true, isLast: true,
        }}
        onAction={(a) => setAction(a)}
        height={Math.round((guiBlock.data.stage_height || 768) * 0.6)}
      />
      <div style={{
        marginTop: 8, fontSize: 11, color: '#888',
        fontFamily: 'IBM Plex Mono, monospace',
      }}>
        {action
          ? `// shell action: ${action} (navigation handled by CourseForge in published output)`
          : '// preview — click shell buttons to test actions'}
      </div>
    </div>
  )
}

// A clean "interactive in the published course" note for block types that can't
// be represented as static injected HTML in the preview (3D, iVideo, OAM…).
function injectedNote(label) {
  return `<div style="padding:14px;border:1px dashed #9aa4b2;border-radius:6px;`
       + `color:#6a7686;font-family:'IBM Plex Mono',monospace;font-size:11px;`
       + `margin:8px 0;text-align:center">${label} — interactive in the published course</div>`
}

// Block-to-HTML renderer for injecting into the GUI shell preview. Renders the
// real media/quiz/WCN/hotspot so demo content actually appears in the shell
// content area (instead of "[type block]" stubs that read as "covered up").
export function renderBlockToHTML(block) {
  const d = block.data || {}
  switch (block.type) {
    case 'text':
      return `<div class="cf-injected-text">${d.body || ''}</div>`
    case 'media': {
      const k = d.kind
      if (k === 'image' && d.serve_url)
        return `<img src="${d.serve_url}" alt="${d.alt_text || ''}" `
             + `style="max-width:100%;height:auto;display:block;margin:8px 0;border-radius:4px">`
      if (k === 'video' && d.serve_url)
        return `<video src="${d.serve_url}" controls playsinline ${d.poster_url ? `poster="${d.poster_url}"` : ''} `
             + `style="max-width:100%;height:auto;display:block;margin:8px 0;background:#000;border-radius:4px"></video>`
      if (k === 'audio' && d.serve_url)
        return `<audio src="${d.serve_url}" controls style="width:100%;margin:8px 0"></audio>`
      return injectedNote(`${k || 'media'} block`)
    }
    case 'quiz': {
      const choices = (d.choices || []).map(c => `<li style="margin:3px 0">${c}</li>`).join('')
      return `<div style="margin:8px 0">`
           + `<p style="font-weight:600;margin-bottom:6px">${d.question || 'Knowledge check'}</p>`
           + `<ol style="margin:0 0 0 20px;padding:0">${choices}</ol></div>`
    }
    case 'wcn': {
      const c = { warning: '#D23B3B', caution: '#E6A100', note: '#2B6CB0' }[d.wcn_type] || '#2B6CB0'
      return `<div style="margin:8px 0;padding:10px 14px;border-left:4px solid ${c};background:rgba(0,0,0,0.03);border-radius:4px">`
           + `<p style="font-weight:700;color:${c};margin:0 0 4px;font-size:12px;letter-spacing:.04em">`
           + `${(d.wcn_type || 'note').toUpperCase()}${d.title ? ' — ' + d.title : ''}</p>`
           + `<p style="margin:0">${d.text || ''}</p></div>`
    }
    case 'hotspot':
      return d.background_url
        ? `<img src="${d.background_url}" alt="${d.alt_text || 'Hotspot image'}" style="max-width:100%;display:block;margin:8px 0;border-radius:4px">`
        : injectedNote('hotspot block')
    default:
      return injectedNote(`${block.type} block`)
  }
}

function PreviewBlock({ block }) {
  switch (block.type) {
    case 'text':    return <PreviewText    block={block} />
    case 'media':   return <PreviewMedia   block={block} />
    case 'quiz':    return <PreviewQuiz    block={block} />
    case 'hotspot': return <PreviewHotspot block={block} />
    case 'branch':  return <PreviewBranch  block={block} />
    case 'wcn':     return <PreviewWCN     block={block} />
    case 'ivideo':  return <PreviewIVideo  block={block} />
    case 'model3d': return <PreviewModel3D block={block} />
    case 'oam':     return <PreviewOAM     block={block} />
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
  const kind = block.data.kind
  const d = block.data

  // Live video: a real uploaded asset can't render in an <img> — use <video>.
  if (kind === 'video' && d.asset_id) {
    const cf = d.asset_meta?.companion_files
    const poster = d.asset_meta?.has_poster && cf?.poster_asset_id
      ? `/api/media/serve/${cf.poster_asset_id}` : undefined
    return (
      <div style={{ ...previewBlockWrap, textAlign: 'center' }}>
        <video controls src={`/api/media/serve/${d.asset_id}`} poster={poster}
          style={{ maxWidth: '100%', borderRadius: 6 }} aria-label={d.original_name || 'Video'}>
          {d.asset_meta?.has_captions && cf?.vtt_asset_id &&
            <track kind="captions" src={`/api/media/serve/${cf.vtt_asset_id}`} srcLang="en" label="English" default />}
        </video>
        {d.caption && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{d.caption}</div>}
      </div>
    )
  }

  // Live audio: render an <audio> player (was falling through to a placeholder).
  if (kind === 'audio' && d.asset_id) {
    return (
      <div style={previewBlockWrap}>
        <audio controls src={`/api/media/serve/${d.asset_id}`} style={{ width: '100%' }}
          aria-label={d.original_name || 'Audio'} />
        {d.caption && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{d.caption}</div>}
      </div>
    )
  }

  // If a placeholder/asset image is available (demo blocks seed an SVG data-URI
  // in serve_url), render it so the preview shows the intended media slot.
  if (block.data.serve_url && (kind === 'image' || kind === 'video')) {
    return (
      <div style={{ ...previewBlockWrap, textAlign: 'center' }}>
        <img
          src={block.data.serve_url}
          alt={block.data.alt_text || block.data.placeholder_label || `${kind} placeholder`}
          style={{ maxWidth: '100%', borderRadius: 6, border: '1px solid #D6E4F2' }}
        />
        {block.data.caption && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{block.data.caption}</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...previewBlockWrap, textAlign: 'center' }}>
      <div style={{
        padding: '32px 20px',
        border: '2px dashed #B5D4F4',
        borderRadius: 6,
        background: '#F8FBFF',
        color: '#185FA5',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{icons[kind] || '📎'}</div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          [{kind}: {block.data.placeholder_label || 'no label'}]
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
        {block.data.background_url && (
          <img
            src={block.data.background_url}
            alt={block.data.alt_text || 'Hotspot background'}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        {!block.data.image_id && !block.data.background_url && (
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
              border: `2px solid ${active === r.id ? 'var(--forge-amber)' : '#185FA5'}`,
              background: active === r.id ? 'color-mix(in srgb, var(--forge-amber) 20%, transparent)' : 'rgba(24,95,165,0.1)',
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

function PreviewWCN({ block }) {
  const [acknowledged, setAcknowledged] = React.useState(false)
  const [modalOpen,    setModalOpen]    = React.useState(false)
  const triggerRef  = React.useRef(null)
  const modalRef    = React.useRef(null)

  const type = block.data.wcn_type || 'note'
  const cfg  = {
    warning: { tag:'WARNING', tagBg:'#C0392B', border:'#C0392B', bg:'rgba(192,57,43,0.07)', titleColor:'#8B1A0E', textColor:'#6B3030', headerBg:'#1a0800' },
    caution: { tag:'CAUTION', tagBg:'#B87A1A', border:'#B87A1A', bg:'rgba(184,122,26,0.07)', titleColor:'#7A4800', textColor:'#5A3800', headerBg:'#1a1000' },
    note:    { tag:'NOTE',    tagBg:'#185FA5', border:'#185FA5', bg:'rgba(24,95,165,0.07)',  titleColor:'#0E3A6A', textColor:'#1A3C5A', headerBg:'#06080f' },
  }[type]

  const ackLabel = block.data.ack_label || 'I understand — proceed'
  const modalId  = `wcn-modal-title-${block.id}`

  React.useEffect(() => {
    if (!modalOpen) return
    const modal = modalRef.current
    if (!modal) return
    const focusable = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last  = focusable[focusable.length - 1]
    first?.focus()

    const handleKeyDown = (e) => {
      // Capture phase + stopPropagation so the surrounding PreviewModal's own
      // Escape-to-close doesn't also fire (would close the whole preview and
      // lose focus return). Harmless in published SCORM (no outer modal).
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return }
      if (e.key !== 'Tab') return
      if (focusable.length === 0) { e.preventDefault(); return }
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [modalOpen])

  const openModal  = () => setModalOpen(true)
  const closeModal = () => { setModalOpen(false); triggerRef.current?.focus() }
  const acknowledge = () => { setAcknowledged(true); closeModal() }

  // ── Inline mode ──────────────────────────────────────────────
  if (!block.data.modal) {
    return (
      <div role="note"
        aria-label={`${cfg.tag}${block.data.title ? ': ' + block.data.title : ''}`}
        style={{ display:'flex', border:`1px solid ${cfg.border}`, borderLeft:`4px solid ${cfg.border}`,
                 borderRadius:6, padding:'12px 14px', gap:12, alignItems:'flex-start',
                 background:cfg.bg, marginBottom:16 }}>
        <div style={{ fontSize:24, flexShrink:0 }} aria-hidden="true">
          {type === 'warning' ? '⚠' : type === 'caution' ? '◆' : 'ℹ'}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
            <span style={{ background:cfg.tagBg, color:'#fff', fontFamily:'monospace',
                           fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:3,
                           letterSpacing:'0.1em' }}>{cfg.tag}</span>
            {block.data.title && (
              <span style={{ fontSize:13, fontWeight:600, color:cfg.titleColor }}>{block.data.title}</span>
            )}
          </div>
          <div style={{ fontSize:13, color:cfg.textColor, lineHeight:1.65 }}>{block.data.text}</div>
          {!acknowledged ? (
            <button onClick={() => setAcknowledged(true)}
              style={{ marginTop:8, padding:'5px 14px', borderRadius:4,
                       border:`1px solid ${cfg.border}`, background:cfg.bg,
                       color:cfg.titleColor, cursor:'pointer', fontSize:11,
                       fontWeight:600, fontFamily:'inherit' }}>
              ✓ {ackLabel}
            </button>
          ) : (
            <span style={{ fontSize:11, color:'#4CAF50', marginTop:6, display:'block' }}>✓ Acknowledged</span>
          )}
        </div>
      </div>
    )
  }

  // ── Modal mode ───────────────────────────────────────────────
  return (
    <div style={{ marginBottom:16 }}>
      <button ref={triggerRef} onClick={openModal}
        aria-haspopup="dialog" aria-expanded={modalOpen}
        style={{ padding:'8px 16px', borderRadius:4, border:`1px solid ${cfg.border}`,
                 background:cfg.bg, color:cfg.titleColor, cursor:'pointer',
                 fontSize:13, fontWeight:600, fontFamily:'inherit',
                 display:'flex', alignItems:'center', gap:8 }}>
        <span aria-hidden="true">{type === 'warning' ? '⚠' : type === 'caution' ? '◆' : 'ℹ'}</span>
        {cfg.tag}{block.data.title ? ': ' + block.data.title : ''}
      </button>

      {acknowledged && (
        <span style={{ fontSize:11, color:'#4CAF50', marginLeft:10 }}>✓ Acknowledged</span>
      )}

      {modalOpen && (
        <div role="presentation"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
          style={{ position:'fixed', inset:0, background:'rgba(4,44,83,0.75)',
                   zIndex:2000, display:'flex', alignItems:'center',
                   justifyContent:'center', padding:24 }}>
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={modalId}
            style={{ background:'#fff', borderRadius:8, maxWidth:480, width:'100%',
                     overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ background:cfg.headerBg, padding:'14px 18px', display:'flex',
                          alignItems:'center', gap:12, borderBottom:`3px solid ${cfg.border}` }}>
              <span style={{ fontSize:28 }} aria-hidden="true">
                {type === 'warning' ? '⚠' : type === 'caution' ? '◆' : 'ℹ'}
              </span>
              <div>
                <div style={{ fontFamily:'monospace', fontSize:9, fontWeight:700,
                               color:cfg.tagBg, letterSpacing:'0.12em', marginBottom:3 }}>{cfg.tag}</div>
                <div id={modalId} style={{ fontSize:15, fontWeight:700, color:cfg.tagBg }}>
                  {block.data.title || cfg.tag}
                </div>
              </div>
              <button onClick={closeModal} aria-label="Close"
                style={{ marginLeft:'auto', background:'none', border:'none',
                         color:cfg.tagBg, fontSize:20, cursor:'pointer', padding:4, lineHeight:1 }}>✕</button>
            </div>
            <div style={{ padding:'16px 18px', fontSize:13, lineHeight:1.65, color:'#1a1a1a' }}>
              {block.data.text}
            </div>
            <div style={{ padding:'12px 18px', borderTop:'1px solid #eee',
                          display:'flex', justifyContent:'flex-end', background:'#f8f8f8' }}>
              <button onClick={acknowledge} aria-label={`${ackLabel} — closes dialog`}
                style={{ padding:'8px 20px', background:cfg.tagBg, color:'#fff',
                         border:'none', borderRadius:4, fontSize:13, fontWeight:600,
                         cursor:'pointer', fontFamily:'inherit' }}>
                ✓ {ackLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PreviewIVideo({ block }) {
  const [clipData, setClipData] = React.useState(null)
  const videoId = block.data.video_asset_id
  const clipId  = block.data.clip_asset_id

  React.useEffect(() => {
    if (!clipId) { setClipData(null); return }
    fetch(`/api/media/clip/${clipId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setClipData)
      .catch(() => {})
  }, [clipId])

  if (!videoId) {
    return (
      <div style={{
        ...previewBlockWrap, padding: 32, textAlign: 'center',
        border: '2px dashed #7A3A9A', borderRadius: 8, color: '#7A3A9A',
        background: 'rgba(122,58,154,0.05)',
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>▶⊕</div>
        <div style={{ fontSize: 13 }}>Interactive Video — upload video + .clip.json to preview</div>
      </div>
    )
  }

  return (
    <div style={previewBlockWrap}>
      <IVideoRuntime
        videoSrc={block.data.video_serve_url || `/api/media/serve/${videoId}`}
        clipData={clipData}
        onComplete={() => {}}
      />
      {block.data.caption && (
        <p style={{ fontSize: 12, color: '#888', marginTop: 6 }}>{block.data.caption}</p>
      )}
    </div>
  )
}

function PreviewModel3D({ block }) {
  if (!block.data.model_serve_url) {
    return (
      <div style={{
        ...previewBlockWrap, padding: 32, textAlign: 'center',
        border: '2px dashed #2A5A8A', borderRadius: 8, color: '#2A5A8A',
        background: 'rgba(42,90,138,0.05)',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⬡</div>
        <div style={{ fontSize: 13 }}>3D Model — upload a .glb file to preview</div>
      </div>
    )
  }
  return (
    <div style={previewBlockWrap}>
      <Model3DViewer
        modelUrl={block.data.model_serve_url}
        caption={block.data.caption}
        attribution={block.data.attribution}
        height={block.data.viewer_height || 400}
        bgColor={block.data.bg_color || '#0d1017'}
        environment={block.data.environment || 'studio'}
        envIntensity={block.data.env_intensity ?? 1}
        decorative={block.data.decorative}
        annotations={block.data.annotations || []}
        autoRotate={block.data.auto_rotate}
      />
    </div>
  )
}

function PreviewOAM({ block }) {
  const d = block.data
  if (!d.oam_asset_id) {
    return (
      <div style={{
        ...previewBlockWrap, padding: 32, textAlign: 'center',
        border: '2px dashed #533AB7', borderRadius: 8, color: '#533AB7',
        background: 'rgba(83,58,183,0.05)',
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⚙</div>
        <div style={{ fontSize: 13 }}>Adobe Animate (.oam) — upload to preview</div>
      </div>
    )
  }
  const src = `/api/media/oam/${d.oam_asset_id}/files/${d.entry_point || 'index.html'}`
  return (
    <div style={previewBlockWrap}>
      <OamMediaBar src={src} width={d.width || 800} height={d.height || 500} caption={d.caption} />
    </div>
  )
}

// Shared styles
const previewBlockWrap = { marginBottom: 20 }
