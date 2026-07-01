import React, { useCallback } from 'react'
import useEditorStore from '../../../store/editorStore'
import { BlockHeader } from './BlockHeader'
import { blockWrap, fieldLabel, inputStyle, textareaStyle, selectStyle, helpText, btnDanger } from './blockStyles'

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2))

const QTYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'drag_drop',       label: 'Drag & Drop (match)' },
  { value: 'sequencing',      label: 'Sequencing (order)' },
  { value: 'fill_blank',      label: 'Fill in the Blank' },
]

export default function QuizBlock({ block }) {
  const updateBlock = useEditorStore(s => s.updateBlock)
  const removeBlock = useEditorStore(s => s.removeBlock)
  const moveBlock   = useEditorStore(s => s.moveBlock)

  const update = useCallback((field, value) => {
    updateBlock(block.id, { [field]: value })
  }, [block.id, updateBlock])

  const qtype = block.data.qtype || 'multiple_choice'

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

        {/* Question type selector */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor={`quiz-qtype-${block.id}`} style={fieldLabel}>Question type</label>
          <select
            id={`quiz-qtype-${block.id}`}
            value={qtype}
            onChange={e => update('qtype', e.target.value)}
            style={selectStyle}
          >
            {QTYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {qtype === 'multiple_choice' && <MultipleChoiceEditor block={block} update={update} updateBlock={updateBlock} />}
        {qtype === 'drag_drop'       && <DragDropEditor       block={block} update={update} updateBlock={updateBlock} />}
        {qtype === 'sequencing'      && <SequencingEditor     block={block} update={update} updateBlock={updateBlock} />}
        {qtype === 'fill_blank'      && <FillBlankEditor      block={block} update={update} updateBlock={updateBlock} />}

        {/* Randomize + attempts (shared) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--color-text-primary)' }}>
            <input
              type="checkbox"
              checked={!!block.data.randomize}
              onChange={e => update('randomize', e.target.checked)}
            />
            Randomize order
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-primary)' }}>
            Attempts
            <input
              type="number" min={1} max={9}
              value={block.data.attempts_allowed ?? 2}
              onChange={e => update('attempts_allowed', Math.max(1, parseInt(e.target.value) || 1))}
              style={{ ...inputStyle, width: 64 }}
            />
          </label>
        </div>

        {/* Feedback (shared) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <div>
            <label htmlFor={`quiz-feedback-correct-${block.id}`} style={fieldLabel}>Correct feedback</label>
            <textarea
              id={`quiz-feedback-correct-${block.id}`}
              value={block.data.feedback_correct || ''}
              onChange={e => update('feedback_correct', e.target.value)}
              rows={2}
              placeholder="Great job! That's correct."
              style={textareaStyle}
            />
          </div>
          <div>
            <label htmlFor={`quiz-feedback-incorrect-${block.id}`} style={fieldLabel}>Incorrect feedback</label>
            <textarea
              id={`quiz-feedback-incorrect-${block.id}`}
              value={block.data.feedback_incorrect || ''}
              onChange={e => update('feedback_incorrect', e.target.value)}
              rows={2}
              placeholder="Not quite — review the material."
              style={textareaStyle}
            />
          </div>
        </div>

        {/* Hint (shared) — shown after a wrong attempt, one tier before the answer is
            revealed on the final attempt. Leave blank to skip the hint tier. */}
        <div style={{ marginTop: 14 }}>
          <label htmlFor={`quiz-hint-${block.id}`} style={fieldLabel}>Hint (shown after a wrong attempt)</label>
          <textarea
            id={`quiz-hint-${block.id}`}
            value={block.data.hint || ''}
            onChange={e => update('hint', e.target.value)}
            rows={2}
            placeholder="Optional nudge shown before the answer is revealed on the last attempt…"
            style={textareaStyle}
          />
          <p style={helpText}>Escalation: 1st wrong → incorrect feedback · one attempt left → this hint · final wrong → reveal the answer + lock.</p>
        </div>
      </div>
    </div>
  )
}

/* ── Multiple Choice ─────────────────────────────────────────────── */
function MultipleChoiceEditor({ block, update, updateBlock }) {
  const choices = block.data.choices || ['', '', '', '']
  const correctIndex = block.data.correct_index ?? 0

  const updateChoice = (idx, value) => {
    const next = [...choices]; next[idx] = value
    updateBlock(block.id, { choices: next })
  }
  const addChoice = () => updateBlock(block.id, { choices: [...choices, ''] })
  const removeChoice = (idx) => {
    if (choices.length <= 2) return
    const next = choices.filter((_, i) => i !== idx)
    const nextCorrect = correctIndex === idx ? 0 : (correctIndex > idx ? correctIndex - 1 : correctIndex)
    updateBlock(block.id, { choices: next, correct_index: nextCorrect })
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor={`quiz-question-${block.id}`} style={fieldLabel}>Question</label>
        <textarea
          id={`quiz-question-${block.id}`}
          value={block.data.question || ''}
          onChange={e => update('question', e.target.value)}
          rows={3}
          placeholder="Type the question here…"
          style={textareaStyle}
        />
      </div>
      <div>
        <span style={fieldLabel}>Answer choices</span>
        {choices.map((choice, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button
              onClick={() => update('correct_index', idx)}
              title="Mark as correct"
              aria-label={`Mark choice ${idx + 1} correct`}
              style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `2px solid ${correctIndex === idx ? '#3B8A4A' : 'var(--color-border-tertiary)'}`,
                background: correctIndex === idx ? '#3B8A4A' : 'transparent',
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {correctIndex === idx && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
            </button>
            <input
              value={choice}
              onChange={e => updateChoice(idx, e.target.value)}
              placeholder={`Choice ${idx + 1}`}
              style={{ ...inputStyle, borderColor: correctIndex === idx ? '#3B8A4A' : 'var(--color-border-tertiary)' }}
            />
            <button onClick={() => removeChoice(idx)} disabled={choices.length <= 2}
              title="Remove choice" aria-label={`Remove choice ${idx + 1}`} style={btnDanger}>✕</button>
          </div>
        ))}
        <button className="cf-btn cf-btn--secondary cf-btn--sm" onClick={addChoice} style={{ marginTop: 2 }}>+ Add choice</button>
        <p style={helpText}>Click the circle to mark the correct answer.</p>
      </div>
    </>
  )
}

/* ── Drag & Drop (match item → target) ───────────────────────────── */
function DragDropEditor({ block, update, updateBlock }) {
  const items   = block.data.items   || []
  const targets = block.data.targets || []
  const correct = block.data.correct || {}

  const setItems   = (next) => updateBlock(block.id, { items: next })
  const setTargets = (next) => updateBlock(block.id, { targets: next })
  const setCorrect = (next) => updateBlock(block.id, { correct: next })

  const addItem = () => setItems([...items, { id: uid(), label: '' }])
  const addTarget = () => setTargets([...targets, { id: uid(), label: '' }])
  const editItem = (id, label) => setItems(items.map(i => i.id === id ? { ...i, label } : i))
  const editTarget = (id, label) => setTargets(targets.map(t => t.id === id ? { ...t, label } : t))
  const removeItem = (id) => {
    setItems(items.filter(i => i.id !== id))
    const c = { ...correct }; delete c[id]; setCorrect(c)
  }
  const removeTarget = (id) => {
    setTargets(targets.filter(t => t.id !== id))
    const c = { ...correct }
    Object.keys(c).forEach(k => { if (c[k] === id) delete c[k] })
    setCorrect(c)
  }
  const setMatch = (itemId, targetId) => setCorrect({ ...correct, [itemId]: targetId })

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor={`quiz-prompt-${block.id}`} style={fieldLabel}>Prompt</label>
        <textarea
          id={`quiz-prompt-${block.id}`}
          value={block.data.prompt || ''}
          onChange={e => update('prompt', e.target.value)}
          rows={2}
          placeholder="Match each item to its target…"
          style={textareaStyle}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={fieldLabel}>Targets (drop zones)</span>
        {targets.map((t, idx) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input value={t.label} onChange={e => editTarget(t.id, e.target.value)}
              placeholder={`Target ${idx + 1}`} style={inputStyle} />
            <button onClick={() => removeTarget(t.id)} title="Remove target" aria-label={`Remove target ${idx + 1}`} style={btnDanger}>✕</button>
          </div>
        ))}
        <button className="cf-btn cf-btn--secondary cf-btn--sm" onClick={addTarget}>+ Add target</button>
      </div>

      <div>
        <span style={fieldLabel}>Items &amp; correct match</span>
        {items.map((it, idx) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input value={it.label} onChange={e => editItem(it.id, e.target.value)}
              placeholder={`Item ${idx + 1}`} style={inputStyle} />
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>→</span>
            <select
              value={correct[it.id] || ''}
              onChange={e => setMatch(it.id, e.target.value)}
              aria-label={`Correct target for item ${idx + 1}`}
              style={{ ...selectStyle, width: 'auto', minWidth: 120 }}
            >
              <option value="">— target —</option>
              {targets.map(t => <option key={t.id} value={t.id}>{t.label || '(unnamed)'}</option>)}
            </select>
            <button onClick={() => removeItem(it.id)} title="Remove item" aria-label={`Remove item ${idx + 1}`} style={btnDanger}>✕</button>
          </div>
        ))}
        <button className="cf-btn cf-btn--secondary cf-btn--sm" onClick={addItem}>+ Add item</button>
        <p style={helpText}>Each item must be matched to its correct target.</p>
      </div>
    </>
  )
}

/* ── Sequencing (order the items) ────────────────────────────────── */
function SequencingEditor({ block, update, updateBlock }) {
  const items = block.data.items || []

  const commit = (next) => updateBlock(block.id, { items: next, correct_order: next.map(i => i.id) })
  const addItem = () => commit([...items, { id: uid(), label: '' }])
  const editItem = (id, label) => commit(items.map(i => i.id === id ? { ...i, label } : i))
  const removeItem = (id) => commit(items.filter(i => i.id !== id))
  const moveItem = (idx, dir) => {
    const j = idx + dir
    if (j < 0 || j >= items.length) return
    const next = [...items];[next[idx], next[j]] = [next[j], next[idx]]; commit(next)
  }

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <label htmlFor={`quiz-prompt-${block.id}`} style={fieldLabel}>Prompt</label>
        <textarea
          id={`quiz-prompt-${block.id}`}
          value={block.data.prompt || ''}
          onChange={e => update('prompt', e.target.value)}
          rows={2}
          placeholder="Put the steps in the correct order…"
          style={textareaStyle}
        />
      </div>
      <div>
        <span style={fieldLabel}>Steps — in their CORRECT order (top = first)</span>
        {items.map((it, idx) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 22, textAlign: 'center', fontWeight: 700, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{idx + 1}</span>
            <input value={it.label} onChange={e => editItem(it.id, e.target.value)}
              placeholder={`Step ${idx + 1}`} style={inputStyle} />
            <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} title="Move up" aria-label={`Move step ${idx + 1} up`}
              className="cf-btn cf-btn--secondary cf-btn--sm cf-btn--icon">▲</button>
            <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} title="Move down" aria-label={`Move step ${idx + 1} down`}
              className="cf-btn cf-btn--secondary cf-btn--sm cf-btn--icon">▼</button>
            <button onClick={() => removeItem(it.id)} title="Remove step" aria-label={`Remove step ${idx + 1}`} style={btnDanger}>✕</button>
          </div>
        ))}
        <button className="cf-btn cf-btn--secondary cf-btn--sm" onClick={addItem}>+ Add step</button>
        <p style={helpText}>Learners see these shuffled and drag them back into this order.</p>
      </div>
    </>
  )
}

/* ── Fill in the Blank (inline dropdowns) ────────────────────────── */
function FillBlankEditor({ block, update, updateBlock }) {
  const segments = block.data.segments || []
  const commit = (next) => updateBlock(block.id, { segments: next })

  const addText  = () => commit([...segments, { type: 'text', text: '' }])
  const addBlank = () => commit([...segments, { type: 'blank', id: uid(), options: ['', ''], correct: '' }])
  const removeSeg = (idx) => commit(segments.filter((_, i) => i !== idx))
  const moveSeg = (idx, dir) => {
    const j = idx + dir
    if (j < 0 || j >= segments.length) return
    const next = [...segments];[next[idx], next[j]] = [next[j], next[idx]]; commit(next)
  }
  const editSeg = (idx, patch) => commit(segments.map((s, i) => i === idx ? { ...s, ...patch } : s))
  const editOption = (idx, oi, value) => {
    const seg = segments[idx]; const options = [...(seg.options || [])]; options[oi] = value
    const correct = seg.correct === seg.options[oi] ? value : seg.correct
    editSeg(idx, { options, correct })
  }
  const addOption = (idx) => editSeg(idx, { options: [...(segments[idx].options || []), ''] })
  const removeOption = (idx, oi) => {
    const seg = segments[idx]; const options = (seg.options || []).filter((_, i) => i !== oi)
    const correct = seg.correct === seg.options[oi] ? '' : seg.correct
    editSeg(idx, { options, correct })
  }

  return (
    <>
      <p style={{ ...helpText, marginTop: 0, marginBottom: 10 }}>
        Build the sentence as a sequence of text runs and blanks. Each blank renders as a dropdown.
      </p>
      {segments.map((seg, idx) => (
        <div key={idx} style={{ border: '1px solid var(--color-border-tertiary)', borderRadius: 6, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: seg.type === 'blank' ? 8 : 0 }}>
            <span style={{ ...fieldLabel, margin: 0 }}>{seg.type === 'blank' ? `Blank` : 'Text'}</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => moveSeg(idx, -1)} disabled={idx === 0} title="Move up" aria-label={`Move segment ${idx + 1} up`}
              className="cf-btn cf-btn--secondary cf-btn--sm cf-btn--icon">▲</button>
            <button onClick={() => moveSeg(idx, 1)} disabled={idx === segments.length - 1} title="Move down" aria-label={`Move segment ${idx + 1} down`}
              className="cf-btn cf-btn--secondary cf-btn--sm cf-btn--icon">▼</button>
            <button onClick={() => removeSeg(idx)} title="Remove segment" aria-label={`Remove segment ${idx + 1}`} style={btnDanger}>✕</button>
          </div>
          {seg.type === 'text' ? (
            <input value={seg.text || ''} onChange={e => editSeg(idx, { text: e.target.value })}
              placeholder="Literal text…" style={inputStyle} />
          ) : (
            <div>
              {(seg.options || []).map((opt, oi) => (
                <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <button
                    onClick={() => editSeg(idx, { correct: opt })}
                    title="Mark as correct" aria-label={`Mark option ${oi + 1} correct`}
                    style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${seg.correct === opt && opt !== '' ? '#3B8A4A' : 'var(--color-border-tertiary)'}`,
                      background: seg.correct === opt && opt !== '' ? '#3B8A4A' : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {seg.correct === opt && opt !== '' && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                  </button>
                  <input value={opt} onChange={e => editOption(idx, oi, e.target.value)}
                    placeholder={`Option ${oi + 1}`} style={inputStyle} />
                  <button onClick={() => removeOption(idx, oi)} disabled={(seg.options || []).length <= 2}
                    title="Remove option" aria-label={`Remove option ${oi + 1}`} style={btnDanger}>✕</button>
                </div>
              ))}
              <button className="cf-btn cf-btn--secondary cf-btn--sm" onClick={() => addOption(idx)}>+ Add option</button>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="cf-btn cf-btn--secondary cf-btn--sm" onClick={addText}>+ Add text</button>
        <button className="cf-btn cf-btn--secondary cf-btn--sm" onClick={addBlank}>+ Add blank</button>
      </div>
      <p style={helpText}>Click the circle to mark each blank&apos;s correct option.</p>
    </>
  )
}
