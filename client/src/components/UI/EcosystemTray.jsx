import React from 'react'

// Tool definitions — URLs from build-time env vars, fall back to # in dev.
const TOOLS = [
  {
    id: 'forgeblueprint', label: 'Blueprint', tagline: 'ISD structure tool',
    url: import.meta.env.VITE_FORGEBLUEPRINT_URL || '#',
    mark: ({ size = 16 }) => (
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="6" fill="#042C53" opacity="0.9"/>
        {[[1,1],[1,2],[1,3],[2,1],[2,3],[3,1],[3,2],[3,3]].map(([r,c], i) => (
          <circle key={i} cx={8 + c * 8} cy={8 + r * 8} r={2.2} fill="#185FA5" opacity="0.7"/>
        ))}
        <line x1="12" y1="20" x2="28" y2="20" stroke="var(--forge-amber)" strokeWidth="1" opacity="0.5"/>
        <line x1="20" y1="12" x2="20" y2="28" stroke="var(--forge-amber)" strokeWidth="1" opacity="0.5"/>
        <circle cx="20" cy="20" r="4" fill="var(--forge-amber)"/>
        <circle cx="20" cy="20" r="1.8" fill="#FAC775"/>
      </svg>
    ),
  },
  {
    id: 'forgepack', label: 'Pack', tagline: 'Asset processing',
    url: import.meta.env.VITE_FORGEPACK_URL || '#',
    mark: ({ size = 16 }) => (
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
        <rect x="2" y="17" width="22" height="4" rx="2" fill="#185FA5" opacity="0.4"/>
        <rect x="2" y="11" width="22" height="4" rx="2" fill="#185FA5" opacity="0.65"/>
        <rect x="2" y="5"  width="22" height="4" rx="2" fill="#185FA5"/>
        <polygon points="14,0 19,5 9,5" fill="var(--forge-amber)"/>
      </svg>
    ),
  },
  {
    id: 'forgeclip', label: 'Clip', tagline: 'Interactive video',
    url: import.meta.env.VITE_FORGECLIP_URL || '#',
    mark: ({ size = 16 }) => (
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
        <rect x="3" y="17" width="22" height="4" rx="2" fill="#185FA5" opacity="0.3"/>
        <line x1="3" y1="19" x2="13" y2="19" stroke="#185FA5" strokeWidth="4" strokeLinecap="round" opacity="0.9"/>
        <rect x="12.5" y="15" width="2" height="8" rx="1" fill="var(--forge-amber)"/>
        <circle cx="13.5" cy="15" r="3" fill="var(--forge-amber)"/>
        <polygon points="6,5 22,14 6,23" fill="#185FA5"/>
        <polygon points="8,8 19,14 8,20" fill="#2A7ACA" opacity="0.5"/>
      </svg>
    ),
  },
]

export default function EcosystemTray() {
  return (
    <nav role="navigation" aria-label="Ecosystem tools" style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 6, padding: '3px 6px', marginRight: 8,
    }}>
      {TOOLS.map((tool, i) => (
        <React.Fragment key={tool.id}>
          {i > 0 && (
            <div aria-hidden="true" style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', margin: '0 3px' }}/>
          )}
          <a href={tool.url} target="_blank" rel="noopener noreferrer"
            aria-label={`Open ${tool.label} — ${tool.tagline}`}
            title={`Forge/${tool.label} · ${tool.tagline}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 6px', borderRadius: 4, textDecoration: 'none',
              color: 'var(--cf-text-tertiary)', transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'color-mix(in srgb, var(--forge-amber) 12%, transparent)'
              e.currentTarget.style.color = 'var(--forge-amber)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--cf-text-tertiary)'
            }}>
            <tool.mark size={16}/>
            <span style={{ fontFamily: 'var(--forge-font, IBM Plex Mono, monospace)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', color: 'inherit' }}>
              {tool.label}
            </span>
          </a>
        </React.Fragment>
      ))}
    </nav>
  )
}
