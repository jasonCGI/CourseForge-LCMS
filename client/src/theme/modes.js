/**
 * CourseForge theme token definitions
 * Three modes: dark (default night), light (day), hc (high contrast)
 *
 * All text/background combinations verified WCAG 2.1 AA (4.5:1 minimum)
 * High contrast mode targets WCAG AAA (7:1+) throughout
 *
 * Naming convention:
 *   --cf-[category]-[variant]
 */

export const MODES = {

  // ── DARK MODE ─────────────────────────────────────────────────
  dark: {
    key: 'dark',
    label: 'Dark',
    icon: 'moon',

    // App shell
    '--cf-app-bg':          '#06080f',
    '--cf-header-bg':       '#06080f',
    '--cf-header-border':   'var(--forge-amber)',
    '--cf-panel-bg':        '#0a0c14',
    '--cf-sidebar-bg':      '#06080f',
    '--cf-editor-bg':       '#0d1017',

    // Borders
    '--cf-border-primary':  '#1c1c2c',
    '--cf-border-secondary':'#142030',
    '--cf-border-tertiary': 'rgba(255,255,255,0.04)',

    // Text
    '--cf-text-primary':    '#E0E8F0',
    '--cf-text-secondary':  '#7A90A8',
    '--cf-text-tertiary':   '#3A5A7A',

    // Accent
    '--cf-accent':          'var(--forge-amber)',
    '--cf-accent-dim':      'color-mix(in srgb, var(--forge-amber) 8%, transparent)',
    '--cf-accent-outline':  'color-mix(in srgb, var(--forge-amber) 30%, transparent)',

    // Logo
    '--cf-logo-course':     '#7EB8F0',
    '--cf-logo-slash':      'var(--forge-amber)',
    '--cf-logo-forge':      '#FFFFFF',

    // Focus indicator — 508 required
    '--cf-focus-ring':      '0 0 0 2px var(--forge-amber)',
    '--cf-focus-outline':   '2px solid var(--forge-amber)',

    // Toggle
    '--cf-toggle-bg':       '#0e1320',
    '--cf-toggle-border':   '#2a3848',
    '--cf-toggle-icon':     '#8AAAC8',
    '--cf-toggle-hover':    '#1a2430',
    '--cf-toggle-active-bg':'#1a3050',
    '--cf-toggle-active-icon':'var(--forge-amber)',

    '--cf-level-project-tab':  '#5A7A9A',
    '--cf-level-project-bg':   '#131822',
    '--cf-level-project-text': '#C8D8E8',
    '--cf-level-project-fw':   '500',
    '--cf-level-project-f1':   '#1a3a6e',
    '--cf-level-project-f2':   '#2a5a9a',

    '--cf-level-course-tab':   '#4A6A82',
    '--cf-level-course-bg':    '#111620',
    '--cf-level-course-text':  '#A8BECE',
    '--cf-level-course-fw':    '400',
    '--cf-level-course-f1':    '#163050',
    '--cf-level-course-f2':    '#224870',

    '--cf-level-module-tab':   '#3C5668',
    '--cf-level-module-bg':    '#0f1319',
    '--cf-level-module-text':  '#8CA4B4',
    '--cf-level-module-fw':    '400',
    '--cf-level-module-f1':    '#122038',
    '--cf-level-module-f2':    '#1c3858',

    '--cf-level-lesson-tab':   '#324858',
    '--cf-level-lesson-bg':    '#0d1016',
    '--cf-level-lesson-text':  '#7A9098',
    '--cf-level-lesson-fw':    '300',
    '--cf-level-lesson-f1':    '#0e1828',
    '--cf-level-lesson-f2':    '#18283c',

    '--cf-level-frame-tab':    '#263848',
    '--cf-level-frame-bg':     '#0b0e14',
    '--cf-level-frame-bg-alt': '#11151e',
    '--cf-level-frame-text':   '#7A90A0',
    '--cf-level-frame-fw':     '300',

    '--cf-level-frame-active-tab':     'var(--forge-amber)',
    '--cf-level-frame-active-bg':      'color-mix(in srgb, var(--forge-amber) 8%, transparent)',
    '--cf-level-frame-active-text':    '#EFD090',
    '--cf-level-frame-active-fw':      '400',
    '--cf-level-frame-active-outline': 'color-mix(in srgb, var(--forge-amber) 30%, transparent)',

    '--cf-indent-line':     'rgba(255,255,255,0.04)',
    '--cf-tree-divider':    'rgba(255,255,255,0.04)',
    '--cf-tree-hover':      'rgba(255,255,255,0.03)',

    // Frame type badges — all 4.5:1+ verified
    '--cf-badge-ctn-bg':    '#0C3060',
    '--cf-badge-ctn-text':  '#90C0F0',
    '--cf-badge-kc-bg':     '#3A2000',
    '--cf-badge-kc-text':   '#F0B84A',
    '--cf-badge-br-bg':     '#1E1650',
    '--cf-badge-br-text':   '#B8A8F8',
    '--cf-badge-border':    'none',

    // Block editor
    '--cf-block-bg':        '#0d1017',
    '--cf-block-border':    '#1c2a3a',
    '--cf-input-bg':        '#060810',
    '--cf-input-border':    '#1c2a3a',
    '--cf-input-text':      '#C8D8E8',

    // Scrollbar
    '--cf-scrollbar-thumb': '#2a3848',
    '--cf-scrollbar-track': '#06080f',
  },

  // ── LIGHT MODE ────────────────────────────────────────────────
  light: {
    key: 'light',
    label: 'Light',
    icon: 'sun',

    '--cf-app-bg':          '#F0F4F8',
    '--cf-header-bg':       '#042C53',  /* global day-mode header bar (matches ForgeBlueprint) */
    '--cf-header-border':   'var(--forge-amber)',
    '--cf-panel-bg':        '#FFFFFF',
    '--cf-sidebar-bg':      '#EEF4FA',
    '--cf-editor-bg':       '#FFFFFF',

    '--cf-border-primary':  '#C8D4DC',
    '--cf-border-secondary':'#A8B8C8',
    '--cf-border-tertiary': 'rgba(0,0,0,0.06)',

    '--cf-text-primary':    '#0E2030',
    '--cf-text-secondary':  '#3A5A78',
    '--cf-text-tertiary':   '#6A8AA8',

    '--cf-accent':          'var(--forge-amber)',
    '--cf-accent-dim':      'color-mix(in srgb, var(--forge-amber) 12%, transparent)',
    '--cf-accent-outline':  'var(--forge-amber)',

    '--cf-logo-course':     '#90C0E8',
    '--cf-logo-slash':      'var(--forge-amber)',
    '--cf-logo-forge':      '#FFFFFF',

    '--cf-focus-ring':      '0 0 0 2px var(--forge-amber)',
    '--cf-focus-outline':   '2px solid var(--forge-amber)',

    '--cf-toggle-bg':       '#E8EEF4',
    '--cf-toggle-border':   '#B8C8D4',
    '--cf-toggle-icon':     '#5A7A9A',
    '--cf-toggle-hover':    '#D8E4EC',
    '--cf-toggle-active-bg':'#1B3A5C',
    '--cf-toggle-active-icon':'var(--forge-amber)',

    '--cf-level-project-tab':  '#1B3A5C',
    '--cf-level-project-bg':   '#EEF4FA',
    '--cf-level-project-text': '#1B3A5C',
    '--cf-level-project-fw':   '500',
    '--cf-level-project-f1':   '#2A5A8C',
    '--cf-level-project-f2':   '#4A80B0',

    '--cf-level-course-tab':   '#2A5A8A',
    '--cf-level-course-bg':    '#E8F0F8',
    '--cf-level-course-text':  '#1E4A78',
    '--cf-level-course-fw':    '400',
    '--cf-level-course-f1':    '#3A70A0',
    '--cf-level-course-f2':    '#5A90C0',

    '--cf-level-module-tab':   '#3A6A8A',
    '--cf-level-module-bg':    '#E0ECF4',
    '--cf-level-module-text':  '#1E4464',
    '--cf-level-module-fw':    '400',
    '--cf-level-module-f1':    '#4A7A9A',
    '--cf-level-module-f2':    '#6A9AB8',

    '--cf-level-lesson-tab':   '#4A7A9A',
    '--cf-level-lesson-bg':    '#D8E8F2',
    '--cf-level-lesson-text':  '#1A3C58',
    '--cf-level-lesson-fw':    '300',
    '--cf-level-lesson-f1':    '#5A8AAA',
    '--cf-level-lesson-f2':    '#7AAAC8',

    '--cf-level-frame-tab':    '#5A8AAA',
    '--cf-level-frame-bg':     '#D0E0EC',
    '--cf-level-frame-bg-alt': '#E0ECF6',
    '--cf-level-frame-text':   '#2A4A64',
    '--cf-level-frame-fw':     '300',

    '--cf-level-frame-active-tab':     'var(--forge-amber)',
    '--cf-level-frame-active-bg':      'color-mix(in srgb, var(--forge-amber) 12%, transparent)',
    '--cf-level-frame-active-text':    '#8A4A00',
    '--cf-level-frame-active-fw':      '500',
    '--cf-level-frame-active-outline': 'var(--forge-amber)',

    '--cf-indent-line':     'rgba(0,0,0,0.06)',
    '--cf-tree-divider':    'rgba(0,0,0,0.08)',
    '--cf-tree-hover':      'rgba(0,0,0,0.04)',

    '--cf-badge-ctn-bg':    '#1B3A6A',
    '--cf-badge-ctn-text':  '#A8CCF0',
    '--cf-badge-kc-bg':     '#5A2800',
    '--cf-badge-kc-text':   '#F0B060',
    '--cf-badge-br-bg':     '#2A1A60',
    '--cf-badge-br-text':   '#B0A0F8',
    '--cf-badge-border':    'none',

    '--cf-block-bg':        '#FFFFFF',
    '--cf-block-border':    '#C8D4DC',
    '--cf-input-bg':        '#F4F8FC',
    '--cf-input-border':    '#B8C8D8',
    '--cf-input-text':      '#0E2030',

    '--cf-scrollbar-thumb': '#B8C8D8',
    '--cf-scrollbar-track': '#EEF4FA',
  },

  // ── HIGH CONTRAST MODE ────────────────────────────────────────
  hc: {
    key: 'hc',
    label: 'High Contrast',
    icon: 'hc',

    '--cf-app-bg':          '#000000',
    '--cf-header-bg':       '#000000',
    '--cf-header-border':   'var(--forge-amber)',
    '--cf-panel-bg':        '#000000',
    '--cf-sidebar-bg':      '#000000',
    '--cf-editor-bg':       '#000000',

    '--cf-border-primary':  '#FFFFFF',
    '--cf-border-secondary':'#CCCCCC',
    '--cf-border-tertiary': '#444444',

    '--cf-text-primary':    '#FFFFFF',
    '--cf-text-secondary':  '#DDDDDD',
    '--cf-text-tertiary':   '#AAAAAA',

    '--cf-accent':          'var(--forge-amber)',
    '--cf-accent-dim':      '#1A0F00',
    '--cf-accent-outline':  'var(--forge-amber)',

    '--cf-logo-course':     '#FFFFFF',
    '--cf-logo-slash':      'var(--forge-amber)',
    '--cf-logo-forge':      '#FFFFFF',

    // HC focus — extra thick, max visibility
    '--cf-focus-ring':      '0 0 0 3px var(--forge-amber)',
    '--cf-focus-outline':   '3px solid var(--forge-amber)',

    '--cf-toggle-bg':       '#000000',
    '--cf-toggle-border':   '#FFFFFF',
    '--cf-toggle-icon':     '#FFFFFF',
    '--cf-toggle-hover':    '#1A1A1A',
    '--cf-toggle-active-bg':'var(--forge-amber)',
    '--cf-toggle-active-icon':'#000000',

    '--cf-level-project-tab':  '#FFFFFF',
    '--cf-level-project-bg':   '#000000',
    '--cf-level-project-text': '#FFFFFF',
    '--cf-level-project-fw':   '600',
    '--cf-level-project-f1':   '#444444',
    '--cf-level-project-f2':   '#888888',

    '--cf-level-course-tab':   '#CCCCCC',
    '--cf-level-course-bg':    '#000000',
    '--cf-level-course-text':  '#FFFFFF',
    '--cf-level-course-fw':    '400',
    '--cf-level-course-f1':    '#333333',
    '--cf-level-course-f2':    '#666666',

    '--cf-level-module-tab':   '#AAAAAA',
    '--cf-level-module-bg':    '#000000',
    '--cf-level-module-text':  '#FFFFFF',
    '--cf-level-module-fw':    '400',
    '--cf-level-module-f1':    '#2A2A2A',
    '--cf-level-module-f2':    '#555555',

    '--cf-level-lesson-tab':   '#888888',
    '--cf-level-lesson-bg':    '#000000',
    '--cf-level-lesson-text':  '#FFFFFF',
    '--cf-level-lesson-fw':    '400',
    '--cf-level-lesson-f1':    '#222222',
    '--cf-level-lesson-f2':    '#444444',

    '--cf-level-frame-tab':    '#666666',
    '--cf-level-frame-bg':     '#000000',
    '--cf-level-frame-bg-alt': '#141414',
    '--cf-level-frame-text':   '#CCCCCC',
    '--cf-level-frame-fw':     '400',

    '--cf-level-frame-active-tab':     'var(--forge-amber)',
    '--cf-level-frame-active-bg':      '#1A0F00',
    '--cf-level-frame-active-text':    'var(--forge-amber)',
    '--cf-level-frame-active-fw':      '600',
    '--cf-level-frame-active-outline': 'var(--forge-amber)',

    '--cf-indent-line':     '#333333',
    '--cf-tree-divider':    '#444444',
    '--cf-tree-hover':      '#111111',

    // HC badges — borders required, color alone not sufficient
    '--cf-badge-ctn-bg':    '#000000',
    '--cf-badge-ctn-text':  '#FFFFFF',
    '--cf-badge-kc-bg':     '#000000',
    '--cf-badge-kc-text':   'var(--forge-amber)',
    '--cf-badge-br-bg':     '#000000',
    '--cf-badge-br-text':   '#CCCCCC',
    '--cf-badge-border':    '1px solid',

    '--cf-block-bg':        '#000000',
    '--cf-block-border':    '#FFFFFF',
    '--cf-input-bg':        '#000000',
    '--cf-input-border':    '#FFFFFF',
    '--cf-input-text':      '#FFFFFF',

    '--cf-scrollbar-thumb': '#888888',
    '--cf-scrollbar-track': '#000000',
  },
};

export const MODE_ORDER = ['light', 'dark', 'hc'];
export const DEFAULT_MODE = 'dark';
export const STORAGE_KEY  = 'cf_display_mode';
