import React, { useCallback } from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './TextBlock'
import { blockWrap, fieldLabel, inputStyle, textareaStyle, helpText } from './blockStyles'

export default function QuizBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const update = useCallback((field, value) => {
    updateBlock(block.id, { [field]: value })
  }, [block.id, updateBlock])

  const updateChoice = useCallback((idx, value) => {
    const choices = [...(block.data.choices || ['', '', '', ''])]
    choices[idx] = value
    updateBlock(block.id, { choices })
  }, [block.id, block.data.choices, updateBlock])

  const choices = block.data.choices || ['', '', '', '']
  const correctIndex = block.data.correct_index ?? 0

  return (
    <div style={blockWrap}>
      <BlockHeader
        label="Knowledge Check"
        color="#854F0B"
        blockId={block.id}
        onRemove={removeBlock}
        onMove={moveBlock}
      />
      <div style={{ padding: 16 }}>

        {/* Question */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Question</label>
          <textarea
            value={block.data.question || ''}
            onChange={e => update('question', e.target.value)}
            rows={3}
            placeholder="Type the question here…"
            style={textareaStyle}
          />
        </div>

        {/* Choices */}
        <div style={{ marginBottom: 14 }}>
          <label style={fieldLabel}>Answer choices</label>
          {choices.map((choice, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {/* Correct radio */}
              <button
                onClick={() => update('correct_index', idx)}
                title="Mark as correct"
                style={{
                  width: 22, height: 22,
                  borderRadius: '50%',
                  border: `2px solid ${correctIndex === idx ? '#3B8A4A' : 'var(--color-border-tertiary)'}`,
                  background: correctIndex === idx ? '#3B8A4A' : 'transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {correctIndex === idx && (
                  <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>
                )}
              </button>
              <input
                value={choice}
                onChange={e => updateChoice(idx, e.target.value)}
                placeholder={`Choice ${idx + 1}`}
                style={{
                  ...inputStyle,
                  borderColor: correctIndex === idx
                    ? '#3B8A4A'
                    : 'var(--color-border-tertiary)',
                }}
              />
            </div>
          ))}
          <p style={helpText}>Click the circle to mark the correct answer.</p>
        </div>

        {/* Feedback */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={fieldLabel}>Correct feedback</label>
            <textarea
              value={block.data.feedback_correct || ''}
              onChange={e => update('feedback_correct', e.target.value)}
              rows={2}
              placeholder="Great job! That's correct."
              style={textareaStyle}
            />
          </div>
          <div>
            <label style={fieldLabel}>Incorrect feedback</label>
            <textarea
              value={block.data.feedback_incorrect || ''}
              onChange={e => update('feedback_incorrect', e.target.value)}
              rows={2}
              placeholder="Not quite — review the material."
              style={textareaStyle}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
