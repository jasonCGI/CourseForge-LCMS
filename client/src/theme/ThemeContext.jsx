import React, { createContext, useContext, useEffect, useState } from 'react'
import { MODES, DEFAULT_MODE, STORAGE_KEY } from './modes'

const ThemeContext = createContext(null)

function safeGet(key) {
  try { return localStorage.getItem(key) } catch (e) { return null }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val) } catch (e) { /* private mode — silent */ }
}

function detectOSDefault() {
  if (typeof window === 'undefined') return DEFAULT_MODE
  if (window.matchMedia('(forced-colors: active)').matches) return 'hc'
  if (window.matchMedia('(prefers-contrast: more)').matches)  return 'hc'
  if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  return 'dark'
}

function applyMode(modeKey) {
  const tokens = MODES[modeKey]
  if (!tokens) return
  const root = document.documentElement
  Object.entries(tokens).forEach(([key, val]) => {
    if (key.startsWith('--')) root.style.setProperty(key, val)
  })
  // Set data attribute for any CSS that needs mode-specific overrides
  root.setAttribute('data-cf-mode', modeKey)
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    // 1. Check localStorage  2. OS default
    const saved = safeGet(STORAGE_KEY)
    const initial = (saved && MODES[saved]) ? saved : detectOSDefault()
    // Apply synchronously to avoid a one-frame flash of default tokens
    applyMode(initial)
    return initial
  })

  useEffect(() => {
    applyMode(mode)
    safeSet(STORAGE_KEY, mode)
  }, [mode])

  // Listen for OS preference changes (user switches OS theme while app is open)
  useEffect(() => {
    const saved = safeGet(STORAGE_KEY)
    if (saved) return // User has explicit preference — don't override

    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = (e) => setMode(e.matches ? 'light' : 'dark')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
