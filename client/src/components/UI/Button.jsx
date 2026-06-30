import React from 'react'

// Shared CourseForge button — the 3:1 padding system + brand states (hover/pressed/
// focus/disabled) live in forge-components.css (.cf-btn*). This is a thin wrapper that
// composes the classes; pass through any button props (onClick, disabled, title, etc.).
//
//   variant: 'primary' | 'secondary' | 'ghost' | 'icon'   (default 'secondary')
//   size:    'sm' | 'md' | 'lg'                            (default 'md')
//   on:      true → amber "selected" treatment (e.g. a shell is applied)
export default function Button({
  variant = 'secondary', size = 'md', on = false, className = '', children, ...props
}) {
  const cls = [
    'cf-btn', `cf-btn--${variant}`, `cf-btn--${size}`, on ? 'cf-btn--on' : '', className,
  ].filter(Boolean).join(' ')
  return <button className={cls} {...props}>{children}</button>
}
