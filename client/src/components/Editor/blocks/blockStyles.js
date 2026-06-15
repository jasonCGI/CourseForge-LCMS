export const blockWrap = {
  background: 'var(--color-background-primary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 8,
  overflow: 'hidden',
  marginBottom: 12,
}

export const fieldLabel = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 6,
}

export const inputStyle = {
  width: '100%',
  background: 'var(--color-background-secondary)',
  border: '1px solid var(--color-border-tertiary)',
  borderRadius: 4,
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
}

export const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
}

export const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
}

export const helpText = {
  fontSize: 11,
  color: 'var(--color-text-secondary)',
  margin: '4px 0 0',
}

export const btnDanger = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  color: '#E24B4A',
  padding: '2px 6px',
  borderRadius: 3,
  fontFamily: 'var(--font-sans)',
}
