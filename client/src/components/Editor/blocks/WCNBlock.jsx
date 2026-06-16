import React, { useCallback } from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './TextBlock'

const WCN_CONFIG = {
  warning: {
    label:      'WARNING',
    tagBg:      '#C0392B',
    tagColor:   '#fff',
    border:     '#C0392B',
    bg:         'rgba(192,57,43,0.07)',
    titleColor: '#FF7070',
    textColor:  '#C4A0A0',
    icon:       (s=32) => (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
        <polygon points={`${s/2},${s*0.06} ${s*0.94},${s*0.92} ${s*0.06},${s*0.92}`} fill="#FF4D00"/>
        <text x={s/2} y={s*0.76} textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="900" fontSize={s*0.44} fill="#1a0800">!</text>
      </svg>
    ),
  },
  caution: {
    label:      'CAUTION',
    tagBg:      '#B87A1A',
    tagColor:   '#fff',
    border:     '#B87A1A',
    bg:         'rgba(184,122,26,0.07)',
    titleColor: 'var(--forge-brand)',
    textColor:  '#C4A870',
    icon:       (s=32) => (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
        <polygon points={`${s/2},${s*0.06} ${s*0.94},${s/2} ${s/2},${s*0.94} ${s*0.06},${s/2}`} fill="var(--forge-brand)"/>
        <text x={s/2} y={s/2+s*0.16} textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="900" fontSize={s*0.42} fill="#1a1000">!</text>
      </svg>
    ),
  },
  note: {
    label:      'NOTE',
    tagBg:      '#185FA5',
    tagColor:   '#fff',
    border:     '#185FA5',
    bg:         'rgba(24,95,165,0.07)',
    titleColor: '#7EB8F0',
    textColor:  '#8AAAC0',
    icon:       (s=32) => (
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
        <circle cx={s/2} cy={s/2} r={s/2-s*0.06} fill="#185FA5"/>
        <text x={s/2} y={s/2+s*0.16} textAnchor="middle" fontFamily="Inter,sans-serif" fontWeight="700" fontSize={s*0.44} fill="#fff">i</text>
      </svg>
    ),
  },
}

export default function WCNBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const type = block.data.wcn_type || 'note'
  const cfg  = WCN_CONFIG[type]

  const update = useCallback((field, val) => {
    updateBlock(block.id, { [field]: val })
  }, [block.id, updateBlock])

  return (
    <div style={{
      border:           `1px solid ${cfg.border}`,
      borderLeft:       `4px solid ${cfg.border}`,
      borderRadius:     8,
      background:       cfg.bg,
      overflow:         'hidden',
      marginBottom:     12,
    }}>
      <BlockHeader
        label={`WCN — ${cfg.label}`}
        color={cfg.tagBg}
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />

      <div style={{ padding: 16 }}>

        {/* Type selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {Object.entries(WCN_CONFIG).map(([key, c]) => (
            <button
              key={key}
              onClick={() => update('wcn_type', key)}
              aria-pressed={type === key}
              style={{
                padding:     '5px 12px',
                borderRadius: 4,
                border:      `1px solid ${type === key ? c.tagBg : 'var(--color-border-tertiary)'}`,
                background:  type === key ? c.tagBg : 'transparent',
                color:       type === key ? c.tagColor : 'var(--color-text-secondary)',
                fontSize:    11,
                fontWeight:  700,
                cursor:      'pointer',
                letterSpacing: '0.08em',
                fontFamily:  'var(--font-mono)',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Preview + edit */}
        <div style={{
          display:   'flex',
          gap:       14,
          alignItems: 'flex-start',
          padding:   '12px 14px',
          background: cfg.bg,
          border:    `1px solid ${cfg.border}33`,
          borderRadius: 6,
          marginBottom: 12,
        }}>
          <div style={{ flexShrink: 0, marginTop: 2 }}>
            {cfg.icon(32)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                fontFamily:    'var(--font-mono)',
                fontSize:      9, fontWeight: 700,
                padding:       '2px 7px', borderRadius: 3,
                background:    cfg.tagBg, color: cfg.tagColor,
                letterSpacing: '0.1em',
              }}>{cfg.label}</span>
              <input
                value={block.data.title || ''}
                onChange={e => update('title', e.target.value)}
                placeholder="Title (optional)"
                aria-label="WCN title"
                style={{
                  flex:       1,
                  background: 'transparent',
                  border:     'none',
                  outline:    'none',
                  fontSize:   13,
                  fontWeight: 600,
                  color:      cfg.titleColor,
                  fontFamily: 'var(--font-sans)',
                }}
              />
            </div>
            <textarea
              value={block.data.text || ''}
              onChange={e => update('text', e.target.value)}
              placeholder="Enter warning, caution, or note text…"
              rows={3}
              aria-label="WCN content"
              style={{
                width:      '100%',
                background: 'transparent',
                border:     'none',
                outline:    'none',
                fontSize:   13,
                color:      cfg.textColor,
                fontFamily: 'var(--font-sans)',
                resize:     'vertical',
                lineHeight: 1.6,
              }}
            />
          </div>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

          {/* Modal toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id={`wcn-modal-${block.id}`}
              checked={block.data.modal || false}
              onChange={e => update('modal', e.target.checked)}
            />
            <label htmlFor={`wcn-modal-${block.id}`} style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Modal interrupt (requires acknowledgment)
            </label>
          </div>

          {/* Acknowledge button label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              Ack button:
            </label>
            <input
              value={block.data.ack_label || 'I understand — proceed'}
              onChange={e => update('ack_label', e.target.value)}
              aria-label="Acknowledge button label"
              style={{
                background:  'var(--color-background-secondary)',
                border:      '1px solid var(--color-border-tertiary)',
                borderRadius: 4,
                padding:     '4px 8px',
                fontSize:    11,
                color:       'var(--color-text-primary)',
                fontFamily:  'var(--font-sans)',
                width:       180,
              }}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
