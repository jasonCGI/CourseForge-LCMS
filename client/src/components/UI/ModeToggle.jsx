import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

function SunIcon({ color, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="3" fill={color}/>
      {[0,45,90,135,180,225,270,315].map((deg, i) => {
        const r  = (deg * Math.PI) / 180
        const x1 = 7 + Math.cos(r) * 4.2
        const y1 = 7 + Math.sin(r) * 4.2
        const x2 = 7 + Math.cos(r) * 5.6
        const y2 = 7 + Math.sin(r) * 5.6
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      })}
    </svg>
  )
}

function MoonIcon({ color, size = 14 }) {
  // Crescent = a filled disc with an offset disc masked out. Reliable solid
  // fill (the old two-arc path collapsed to a near-zero filled area).
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <defs>
        <mask id="cf-moon-cut">
          <rect width="14" height="14" fill="white"/>
          <circle cx="9.7" cy="5" r="4.6" fill="black"/>
        </mask>
      </defs>
      <circle cx="6.6" cy="7" r="5" fill={color} mask="url(#cf-moon-cut)"/>
    </svg>
  )
}

function HCIcon({ color, size = 14, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth={strokeWidth}/>
      <path d="M7 1.5 A5.5 5.5 0 0 1 7 12.5 Z" fill={color}/>
    </svg>
  )
}

const BUTTONS = [
  { mode: 'light', label: 'Light mode',        Icon: SunIcon  },
  { mode: 'dark',  label: 'Dark mode',          Icon: MoonIcon },
  { mode: 'hc',    label: 'High contrast mode', Icon: HCIcon   },
]

export default function ModeToggle() {
  const { mode, setMode } = useTheme()

  // Inactive icons — adapt per mode so they stay visible on each header bg
  const inactiveIcon =
    mode === 'light' ? '#90C0E8'   // visible on navy #1B3A5C header
    : mode === 'hc'  ? '#CCCCCC'   // grey on black, doesn't compete with amber
    :                  '#8AAAC8'   // dark mode

  // Active pill
  const activePillBg     = mode === 'hc' ? 'var(--forge-amber)' : '#1B3A5C'
  const activePillBorder = mode === 'hc' ? 'var(--forge-amber)' : '#2A5A8A'

  // Group wrapper
  const groupBg     = mode === 'hc' ? '#000000' : '#0e1320'
  const groupBorder = mode === 'hc' ? '1px solid #FFFFFF' : '1px solid #2a3848'

  return (
    <div
      role="group"
      aria-label="Display mode"
      style={{
        display:      'inline-flex',
        background:   groupBg,
        border:       groupBorder,
        borderRadius: 6,
        padding:      3,
        gap:          2,
      }}
    >
      {BUTTONS.map(({ mode: m, label, Icon }) => {
        const isActive = mode === m
        // Literal hex only — never a CSS var (var() doesn't resolve as an SVG fill attribute).
        // HC active stays black (amber-on-amber pill would be invisible).
        const iconColor = isActive ? (mode === 'hc' ? '#000000' : 'var(--forge-amber)') : inactiveIcon
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            style={{
              width:        30,
              height:       26,
              border:       isActive ? `1px solid ${activePillBorder}` : '1px solid transparent',
              borderRadius: 4,
              background:   isActive ? activePillBg : 'transparent',
              cursor:       'pointer',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              transition:   'background 0.15s, border-color 0.15s',
              flexShrink:   0,
            }}
          >
            <Icon
              color={iconColor}
              size={13}
              strokeWidth={m === 'hc' && mode === 'hc' ? 2.5 : 1.8}
            />
          </button>
        )
      })}
    </div>
  )
}
