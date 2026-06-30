import React, { useCallback } from 'react'
import useEditorStore from '../../../store/editorStore'
import useProjectStore from '../../../store/projectStore'
import { BlockHeader } from './BlockHeader'
import { blockWrap, fieldLabel, inputStyle, textareaStyle, selectStyle } from './blockStyles'

export default function BranchBlock({ block }) {
  const updateBlock   = useEditorStore(s => s.updateBlock)
  const removeBlock   = useEditorStore(s => s.removeBlock)
  const moveBlock     = useEditorStore(s => s.moveBlock)
  const activeProject = useProjectStore(s => s.activeProject)

  const update = useCallback((field, value) => {
    updateBlock(block.id, { [field]: value })
  }, [block.id, updateBlock])

  // Flatten all frames from the active project for the frame picker
  const allFrames = []
  if (activeProject) {
    for (const course of activeProject.courses || []) {
      for (const mod of course.modules || []) {
        for (const lesson of mod.lessons || []) {
          for (const frame of lesson.frames || []) {
            allFrames.push({
              id: frame.id,
              label: `${course.name} › ${mod.name} › ${lesson.name} › ${frame.name}`,
            })
          }
        }
      }
    }
  }

  return (
    <div style={blockWrap}>
      <BlockHeader
        label="Branch"
        color="#3C3489"
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />
      <div style={{ padding: 16 }}>

        {/* Condition / prompt */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor={`branch-condition-${block.id}`} style={fieldLabel}>Condition / decision prompt</label>
          <textarea
            id={`branch-condition-${block.id}`}
            value={block.data.condition || ''}
            onChange={e => update('condition', e.target.value)}
            rows={2}
            placeholder="e.g. Does the learner need remediation?"
            style={textareaStyle}
          />
        </div>

        {/* Branch paths */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* True path */}
          <div style={{ ...branchCard, borderColor: '#3B8A4A' }}>
            <label htmlFor={`branch-true-label-${block.id}`} style={{ ...fieldLabel, color: '#3B8A4A' }}>✓ True path</label>
            <input
              id={`branch-true-label-${block.id}`}
              value={block.data.true_label || 'Yes'}
              onChange={e => update('true_label', e.target.value)}
              placeholder="Button label"
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <label htmlFor={`branch-true-frame-${block.id}`} style={fieldLabel}>Go to frame</label>
            <select
              id={`branch-true-frame-${block.id}`}
              value={block.data.true_frame_id || ''}
              onChange={e => update('true_frame_id', e.target.value)}
              style={selectStyle}
            >
              <option value="">— select frame —</option>
              {allFrames.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          {/* False path */}
          <div style={{ ...branchCard, borderColor: '#C0392B' }}>
            <label htmlFor={`branch-false-label-${block.id}`} style={{ ...fieldLabel, color: '#C0392B' }}>✕ False path</label>
            <input
              id={`branch-false-label-${block.id}`}
              value={block.data.false_label || 'No'}
              onChange={e => update('false_label', e.target.value)}
              placeholder="Button label"
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <label htmlFor={`branch-false-frame-${block.id}`} style={fieldLabel}>Go to frame</label>
            <select
              id={`branch-false-frame-${block.id}`}
              value={block.data.false_frame_id || ''}
              onChange={e => update('false_frame_id', e.target.value)}
              style={selectStyle}
            >
              <option value="">— select frame —</option>
              {allFrames.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Preview of branch logic */}
        {block.data.condition && (
          <div style={{
            marginTop: 14,
            padding: '10px 14px',
            background: 'var(--color-background-secondary)',
            border: '1px solid var(--color-border-tertiary)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: '#3C3489' }}>if</span>{' '}
            <span style={{ color: 'var(--color-text-primary)' }}>{block.data.condition}</span>{' '}
            <span style={{ color: '#3B8A4A' }}>→ {block.data.true_label || 'Yes'}</span>
            {' / '}
            <span style={{ color: '#C0392B' }}>→ {block.data.false_label || 'No'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const branchCard = {
  padding: 12,
  border: '1px solid',
  borderRadius: 6,
  background: 'var(--color-background-secondary)',
}
