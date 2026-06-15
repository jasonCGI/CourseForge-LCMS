import React from 'react'

// The editable tokens exposed in the theme editor UI
const TOKEN_GROUPS = [
  {
    label: 'Colors',
    tokens: [
      { key: 'primary_color',    label: 'Primary',    type: 'color', hint: 'Main brand color — buttons, links' },
      { key: 'secondary_color',  label: 'Secondary',  type: 'color', hint: 'Header and nav background' },
      { key: 'accent_color',     label: 'Accent',     type: 'color', hint: 'Amber highlight — active states, progress' },
      { key: 'text_color',       label: 'Body text',  type: 'color', hint: 'Main content text' },
      { key: 'bg_color',         label: 'Background', type: 'color', hint: 'Page/frame background' },
      { key: 'bg_secondary',     label: 'Panel bg',   type: 'color', hint: 'Sidebar and secondary panels' },
      { key: 'nav_bg',           label: 'Nav bg',     type: 'color', hint: 'Navigation bar background' },
      { key: 'nav_text',         label: 'Nav text',   type: 'color', hint: 'Navigation bar text/icons' },
    ]
  },
  {
    label: 'Typography',
    tokens: [
      { key: 'font_family',   label: 'Font family', type: 'text',   hint: 'e.g. Inter, Arial, sans-serif' },
      { key: 'font_size_base',label: 'Base size',   type: 'text',   hint: 'e.g. 16px' },
    ]
  },
  {
    label: 'Layout',
    tokens: [
      { key: 'frame_layout',       label: 'Frame layout',      type: 'select',
        options: ['top-nav','left-nav','minimal','full-width'] },
      { key: 'button_style',       label: 'Button style',      type: 'select',
        options: ['rounded','square','pill'] },
      { key: 'progress_indicator', label: 'Progress indicator', type: 'select',
        options: ['bar','dots','fraction','none'] },
      { key: 'border_radius',      label: 'Border radius',     type: 'text',
        hint: 'e.g. 6px' },
    ]
  },
]

export default function TokenEditor({ tokens, onChange }) {
  const update = (key, val) => onChange({ ...tokens, [key]: val })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {TOKEN_GROUPS.map(group => (
        <div key={group.label}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--cf-text-tertiary)',
            marginBottom: 12, paddingBottom: 6,
            borderBottom: '1px solid var(--cf-border-tertiary)',
          }}>
            {group.label}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.tokens.map(({ key, label, type, hint, options }) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'center' }}>
                <label
                  htmlFor={`token-${key}`}
                  style={{ fontSize: 12, color: 'var(--cf-text-secondary)', fontWeight: 400 }}
                  title={hint}
                >
                  {label}
                </label>

                {type === 'color' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      id={`token-${key}`}
                      type="color"
                      value={tokens[key] || '#000000'}
                      onChange={e => update(key, e.target.value)}
                      aria-label={`${label} color picker`}
                      style={{ width: 36, height: 28, border: '1px solid var(--cf-border-primary)', borderRadius: 4, cursor: 'pointer', padding: 2 }}
                    />
                    <input
                      type="text"
                      value={tokens[key] || ''}
                      onChange={e => update(key, e.target.value)}
                      placeholder="#000000"
                      aria-label={`${label} hex value`}
                      style={inputStyle}
                    />
                  </div>
                )}

                {type === 'text' && (
                  <input
                    id={`token-${key}`}
                    type="text"
                    value={tokens[key] || ''}
                    onChange={e => update(key, e.target.value)}
                    placeholder={hint}
                    style={inputStyle}
                  />
                )}

                {type === 'select' && (
                  <select
                    id={`token-${key}`}
                    value={tokens[key] || options[0]}
                    onChange={e => update(key, e.target.value)}
                    style={inputStyle}
                  >
                    {options.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const inputStyle = {
  width: '100%', background: 'var(--cf-input-bg)',
  border: '1px solid var(--cf-input-border)',
  borderRadius: 4, padding: '6px 10px',
  fontSize: 13, color: 'var(--cf-input-text)',
  fontFamily: 'var(--cf-font)', boxSizing: 'border-box',
}
