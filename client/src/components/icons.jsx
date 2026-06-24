// Curated Iconoir (MIT) icon set for the React editor/preview.
//
// CourseForge renders in two worlds: this module backs the React side, while
// server/services/cf_icons.py carries the SAME icons as raw inline SVG strings
// for vanilla SCORM / preview-html output. Keep both in sync.
//
// Import named icons only (never `import *`) so Vite tree-shakes the bundle.
import {
  Play,
  Pause,
  Text,
  MediaImage,
  HelpCircle,
  FrameSelect,
  GitFork,
  WarningTriangle,
  Sparks,
  PlaySolid,
  Box3dPoint,
} from 'iconoir-react'

// Audio player controls (React AudioBar). Mirrors PLAY_SVG / PAUSE_SVG server-side.
export { Play, Pause }

// blockType -> Iconoir component, used by the add-block palette and block tabs.
// Confirmed against the installed iconoir-react package export names.
export const BLOCK_ICONS = {
  text:    Text,             // paragraph / text block
  media:   MediaImage,       // image/media block
  quiz:    HelpCircle,       // question / quiz block
  hotspot: FrameSelect,      // selectable region / hotspot
  branch:  GitFork,          // branching scenario
  wcn:     WarningTriangle,  // "what could go next" / warning
  oam:     Sparks,           // on-asset media / animated overlay
  ivideo:  PlaySolid,        // interactive video
  model3d: Box3dPoint,       // 3D model
}
