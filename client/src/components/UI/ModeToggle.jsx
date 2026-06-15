import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

// Sun icon
function SunIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="3" fill={color}/>
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const rad = (deg * Math.PI) / 180
        const x1 = 7 + Math.cos(rad) * 4.2
        const y1 = 7 + Math.sin(rad) * 4.2
        const x2 = 7 + Math.cos(rad) * 5.5
        const y2 = 7 + Math.sin(rad) * 5.5
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      })}
    </svg>
  )
}

// Moon icon
function MoonIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M7 2 A5 5 0 1 0 7 12 A3.5 3.5 0 1 1 7 2 Z" fill={color}/>
    </svg>
  )
}

// High contrast icon — half-filled circle (de facto standard)
function HCIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="6" fill="none" stroke={color} strokeWidth="1.5"/>
      <path d="M7 1 A6 6 0 0 1 7 13 Z" fill={color}/>
    </svg>
  )
}

const BUTTONS = [
  { mode: 'light', label: 'Light mode',         Icon: SunIcon  },
  { mode: 'dark',  label: 'Dark mode',           Icon: MoonIcon },
  { mode: 'hc',    label: 'High contrast mode',  Icon: HCIcon   },
]

export default function ModeToggle() {
  const { mode, setMode } = useTheme()

  const tgBg          = 'var(--cf-toggle-bg)'
  const tgBorder      = 'var(--cf-toggle-border)'
  const tgIcon        = 'var(--cf-toggle-icon)'
  const tgActiveBg    = 'var(--cf-toggle-active-bg)'
  const tgActiveIcon  = 'var(--cf-toggle-active-icon)'
  const tgHover       = 'var(--cf-toggle-hover)'

  return (
    <div
      role="group"
      aria-label="Display mode"
      style={{
        display: 'inline-flex',
        borderRadius: 6,
        overflow: 'hidden',
        border: `1px solid ${tgBorder}`,
        background: tgBg,
      }}
    >
      {BUTTONS.map(({ mode: m, label, Icon }, idx) => {
        const isActive = mode === m
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            style={{
              width: 32,
              height: 28,
              border: 'none',
              borderLeft: idx > 0 ? `1px solid ${tgBorder}` : 'none',
              background: isActive ? tgActiveBg : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = tgHover }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
          >
            <Icon color={isActive ? tgActiveIcon : tgIcon} />
          </button>
        )
      })}
    </div>
  )
}
