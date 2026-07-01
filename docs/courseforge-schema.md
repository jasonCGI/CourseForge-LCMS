# CourseForge Schema Document

> **version: 0.1.1**
> **date: 2026-06-26**
> **status: DRAFT (Priority-1 artifact of the "ForgeAgent" epic) — for human review**

This document is **dual-purpose**:

1. **LLM system context** — it is injected as system context for the ForgeAgent LLM that turns a
   natural-language prompt into a complete, valid **frame JSON** object. The rules below are the
   contract the model's output must satisfy.
2. **Developer spec** — it is the human-readable specification of the frame / block schema for the
   CourseForge LCMS (Flask + React).

> **Definition of Done.** Updating this schema document is **part of the Definition of Done for any
> new component (block type) or frame type.** A block, frame type, or field that ships without a
> corresponding entry here is considered incomplete. Several sections are mechanically derivable from
> code (see [§11 Drift risk](#11-derivability--drift-risk)); keep them in sync.

---

## Changelog

| Version | Date       | Notes                                                                 |
| ------- | ---------- | --------------------------------------------------------------------- |
| 0.1.1   | 2026-06-26 | Callout: `box` is now the **connection point** (facing edge-center, not box center); added the `anchor` field (`auto\|top\|bottom\|left\|right`, default `auto`) — the line connects to the center of that box edge. §4.10 + §10.3 updated. |
| 0.1.0   | 2026-06-26 | Initial draft. Derived from `editorStore.js`, the block editors, `scorm12.py`, `menu_frame.py`, and the `Frame`/`Project` models. Covers all 11 palette block types + 10 stored block-`type` values, `content` and `menu` frame types, layouts/zones, exclusivity caps, asset placeholders, design tokens, 508 constraints, and SCORM output requirements. |

Engine versions at time of writing (from `server/version.py`): `VERSION = "1.0.0"`,
`SCHEMA_VERSION = "1.0"`.

---

## 1. Conventions used in this document

- **required / optional** describes whether the field must be present for the frame to render and
  publish correctly — NOT a database constraint. The DB stores `content` as opaque JSON.
- **default** is the value produced by `_makeBlock(type)` in `client/src/store/editorStore.js`
  (the single source of truth for new-block shape). A field with a default is always seeded.
- **asset_id fields cannot be invented by the agent.** See [§5 Asset handling](#5-asset-handling).
- Coordinates described as **normalized 0–100** are percentages of the relevant area.

---

## 2. Frame object schema

A frame is the publishable unit. The agent emits **one frame object**. Its persisted shape (see the
`Frame` model in `server/models/project.py` and the editor store) is:

```jsonc
{
  "name":       "string",            // frame title (Frame.name, required, non-empty)
  "frame_type": "content",           // "content" | "menu"  (also legacy: "assessment" | "branch")
  "lesson":     "string",            // human lesson name this frame belongs to (authoring grouping)
  "content": {                       // Frame.content — opaque JSON column
    "layout":  "text-left",          // "full" | "text-left" | "text-right"  (content frames)
    "prompt":  "",                   // optional per-frame GUI-shell prompt text (empty = inherit title)
    "blocks":  [ /* Block[] */ ],    // content frames: the ordered block list
    "menu":    { /* Menu */ }        // menu frames: nav items (see §2.2)
  }
}
```

Notes on field provenance:

- `id` is **server-assigned** (a UUIDv4, `Frame.id = db.String(36)`); the agent does **not** emit a
  frame `id`. Block `id`s ARE part of block objects and are UUIDv4 (`crypto.randomUUID()`).
- `frame_type` defaults to `"content"` in the model (`db.String(50), default='content'`). The
  model comment lists `content | assessment | branch`; the **live, code-exercised** types are
  `content` and `menu`. `menu` is detected by `is_menu_frame()` (`menu_frame.py`) and routes through
  a different renderer. Treat `content` and `menu` as the two the agent should emit; see
  [§12 Assumptions](#12-assumptions--open-questions) on the legacy values.
- `lesson` is the human lesson name. In the persisted model the frame's membership is the
  `lesson_id` foreign key; the authoring/seed layer carries a readable `lesson` name (see
  `demo_seed.py` frame dicts: `{'name', 'frame_type', 'lesson', 'layout', 'blocks'}`). The agent
  should emit `lesson` as a readable string for the author to place.
- `order_index` (frame ordering) is **server-assigned** on insert; not emitted by the agent.
- `optional` (bool, excluded from completion count) and `notes` (author notes, never published)
  exist on the model but are not part of generated content.

### 2.1 `content` frame

`frame_type: "content"`. Uses `content.layout` + `content.blocks[]`. This is the default and most
common frame. Rules for blocks, layouts, and zones are in [§3](#3-layouts--zones) and
[§4](#4-block-component-catalog).

### 2.2 `menu` frame

`frame_type: "menu"`. A **navigation** frame. It stores its items in **`content.menu`**, NOT in
`content.blocks` (a menu frame's `blocks` are ignored by the menu renderer). Shape (from
`menu_frame.py` and `editorStore._menu` / `MenuEditor.jsx`):

```jsonc
{
  "name": "Course Menu",
  "frame_type": "menu",
  "lesson": "…",
  "content": {
    "menu": {
      "title": "Course Menu",          // optional heading shown above the buttons
      "items": [
        {
          "id": "uuid",                // UUIDv4
          "label": "Start Module 1",   // button text (defaults to "New item")
          "target_kind": "frame",      // "frame" | "lesson" | "module"
          "target_id": "uuid-or-empty" // id of the target (see resolution below)
        }
      ]
    }
  }
}
```

- Each item renders as a vertical nav button.
- `target_kind: "frame"` → navigates to that frame.
- `target_kind: "lesson" | "module"` ("topic" target) → resolves at render time to that section's
  **first** frame (lowest `order_index`) via `resolve_target_frame_id()`.
- An item whose target cannot be resolved renders **disabled** (no broken link). A menu must not
  point at itself (`MenuEditor` filters the active frame out of the picker).
- **Sub-menus** are just nested menu frames — a menu item whose `target_kind: "frame"` points at
  another `menu` frame. There is no separate sub-menu type.

> The agent cannot know real frame/lesson/module `id`s. For a generated menu it should emit items
> with empty `target_id` (or a `__TARGET__`-style placeholder, see [§5](#5-asset-handling)) and a
> meaningful `label` for the author to wire. The `menu.title` and `label`s ARE author-meaningful and
> should be generated.

---

## 3. Layouts & zones

`content.layout` ∈ `{ "full", "text-left", "text-right" }`. The renderer default when unset is
`"text-left"` (`resolveExclusivity` and `scorm12._render_blocks`). Layout decides how many
**zone-filler** blocks fit and where they go.

### 3.1 Content groups

From `client/src/store/editorStore.js` (THE source of truth):

```js
PRIMARY_TYPES   = ['text', 'quiz']                    // text-zone fillers (mutually exclusive)
MEDIA_TYPES     = ['media', 'model3d', 'oam', 'ivideo'] // media-zone fillers (mutually exclusive)
AUXILIARY_TYPES = ['wcn', 'hotspot', 'branch', 'audio', 'gui', 'callout'] // never capped
```

- **PRIMARY** fills the text zone. `text` and `quiz` are mutually exclusive.
- **MEDIA** fills the media zone. `media` (image/video), `model3d`, `oam`, `ivideo` are mutually
  exclusive **with each other**.
- **AUXILIARY** never occupies a zone and is never blocked: WCN, hotspot, branch, audio, GUI,
  callout. Auxiliary blocks may appear in unlimited quantity.

> **Audio is auxiliary even though it is a `media` block.** The Audio palette button creates a
> `media` block with `data.kind === "audio"` that docks as a bar (see `_makeBlock('audio')`). The
> `isZoneMedia()` helper returns `false` for audio-kind media, so it does NOT count as a media
> zone-filler. A `media` block with any other `kind` (image/video) IS a zone-filler.

> **Callout is auxiliary** — a free-floating annotation overlay over the content area, rendered
> OUTSIDE the layout zones.

### 3.2 Zone layout per layout value

| `layout`     | Zones                                                                          |
| ------------ | ------------------------------------------------------------------------------ |
| `full`       | One full-bleed content area. The single zone-filler (text OR quiz OR a media-group block) fills it. |
| `text-left`  | 50/50 split — **PRIMARY (text/quiz) on the left**, **MEDIA on the right**.     |
| `text-right` | 50/50 split — **MEDIA on the left**, **PRIMARY (text/quiz) on the right**.     |

Text zones carry 40px CSS padding; media zones fill edge-to-edge (`scorm12._render_blocks`).

### 3.3 Exclusivity caps — the EXACT rule

From `resolveExclusivity(frame)` in `editorStore.js`:

- **`full` layout → ONE zone-filler total.** Any existing zone-filler (a PRIMARY or a zone-MEDIA)
  blocks BOTH groups. You cannot have text AND an image on a `full` frame.
  - Tooltip/reason: *"One content element per Full-layout frame"*.
- **Split layouts (`text-left` / `text-right`) → ONE PRIMARY + ONE MEDIA.** The two halves are
  independent: at most one text/quiz block AND at most one media-group block.
  - `primaryReason`: *"Only one text/quiz block per frame"*; `mediaReason`: *"One media block per
    frame"*.

`isBlockTypeBlocked(frame, type)` enforces this at the store level (defense-in-depth alongside the
toolbar). AUXILIARY types always return `false` (never blocked).

**Agent rule:** a generated frame must never exceed these caps. Concretely:
- `full`: at most ONE of `{text, quiz, media(non-audio), model3d, oam, ivideo}`, plus any number of
  auxiliary blocks.
- `text-left`/`text-right`: at most ONE PRIMARY (`text` or `quiz`) **and** at most ONE MEDIA
  (`media(non-audio)`/`model3d`/`oam`/`ivideo`), plus any number of auxiliary blocks.

---

## 4. Block component catalog

Every block has the shape `{ "id": "<uuidv4>", "type": "<type>", "data": { … } }`. `id` is
`crypto.randomUUID()`. The `data` field shapes below are derived from `_makeBlock` defaults plus the
fields each block editor reads/writes.

The **palette** (`BlockToolbar.BLOCK_TYPES`) exposes 11 buttons. Note that the **Audio** button
produces a stored `type: "media"` block — so there are **10 distinct stored `type` values**:
`text, media, quiz, hotspot, branch, wcn, oam, ivideo, model3d, callout` (plus `gui`, applied at the
project level, not from the per-frame palette). `audio` is a palette label, not a stored type.

Palette registry (type, label, color, group):

| Palette button | Stored `type`            | Color     | Group     |
| -------------- | ------------------------ | --------- | --------- |
| Text           | `text`                   | `#185FA5` | PRIMARY   |
| Media          | `media`                  | `#3B6D11` | MEDIA     |
| Audio          | `media` (kind=`audio`)   | `#1A7A5E` | AUX       |
| Quiz           | `quiz`                   | `#854F0B` | PRIMARY   |
| Hotspot        | `hotspot`                | `#533AB7` | AUX       |
| Branch         | `branch`                 | `#3C3489` | AUX       |
| WCN            | `wcn`                    | `#C0392B` | AUX       |
| OAM            | `oam`                    | `#533AB7` | MEDIA     |
| iVideo         | `ivideo`                 | `#7A3A9A` | MEDIA     |
| 3D Model       | `model3d`                | `#2A5A8A` | MEDIA     |
| Callout        | `callout`                | `#A8572B` | AUX       |
| (project-level)| `gui`                    | `#3A5A8A` | AUX       |

### 4.1 `text` — PRIMARY

On-screen rich text (TipTap/HTML).

| Field             | Type   | Req/Opt  | Default | Notes |
| ----------------- | ------ | -------- | ------- | ----- |
| `body`            | string (HTML) | required | `""` | TipTap HTML. May embed inline `<a data-cf-frame="<frameId>">` (frame link) and `<a data-cf-swap="<assetId>">` (image-swap trigger) anchors. The author never hand-types these ids. |
| `narrator_script` | string | optional | `""`    | Seeded by `_makeBlock`, but the current editor no longer renders a field for it (narration lives on audio/video). Safe to omit/leave empty. |

`_makeBlock('text')` default: `{ body: '', narrator_script: '' }`.

### 4.2 `media` (image / video / audio / oam-kind) — MEDIA or AUX

A single media slot. `data.kind` selects the sub-type. `MEDIA_KINDS = ['image','video','audio','oam']`.

| Field               | Type    | Req/Opt  | Default          | Notes |
| ------------------- | ------- | -------- | ---------------- | ----- |
| `kind`              | enum    | required | `"image"`        | `image` \| `video` \| `audio` \| `oam`. **`audio` makes the block auxiliary** (docked bar). |
| `placeholder_label` | string  | optional | `""`             | Slot identifier shown until a real asset is uploaded (e.g. `nose_section_photo`). Also used as fallback alt. |
| `asset_id`          | string\|null | required for render | `null` | **Agent emits `null` or a placeholder** (§5). Set on upload. |
| `caption`           | string  | optional | `""`             | Caption below media. |
| `bounds`            | object\|null | optional | `null`      | Per-block absolute box within the content area (set via BoundsControl). |
| `alt_text`          | string  | required for `image` (508) | (unset) | Screen-reader text. **Required for images**; video uses it as accessible description. |
| `fit`               | string  | optional | (unset)          | e.g. `"cover"` — fill behavior for image/video. |
| `placement`         | enum    | optional (audio) | `"inline"` | **Audio placement model.** `inline` \| `bar` \| `mini`. `inline` = in-flow player (rides a layout zone). `bar` = full-width strip along an edge (auxiliary). `mini` = compact rounded corner pill over the content (auxiliary). `bar`/`mini` never consume the media zone, so an **image + a bar/mini audio coexist** on one frame. Legacy: absent `placement` derives from `dock` (`dock:'bottom'` → `bar`/`bottom`). Resolved by `resolveAudioPlacement` (client) / `_audio_placement` (server). |
| `anchor`            | enum    | optional (audio) | `bar`→`"bottom"`, `mini`→`"bottom-right"` | Edge/corner for a `bar`/`mini` audio player. `bar`: `bottom` \| `top`. `mini`: `bottom-right` \| `bottom-left` \| `top-right` \| `top-left`. Ignored for `inline`. |
| `dock`              | enum    | optional | `"inline"` | **Video** playbar: `inline` vs `bottom` ("snap to bottom"). **Legacy for audio** — superseded by `placement` (`dock:'bottom'` maps to `placement:'bar'`, anchor `bottom`); still read for back-compat. |
| `use_videojs`       | bool    | optional | `true` (effective) | Video only. `false` → plain `<video>`. |
| `serve_url`, `original_name`, `asset_meta` | — | runtime | — | Populated on upload; not authored. |

`_makeBlock('media')` default: `{ kind: 'image', placeholder_label: '', asset_id: null, caption: '', bounds: null }`.
`_makeBlock('audio')` (Audio button) default: `{ kind: 'audio', placeholder_label: '', asset_id: null, caption: '', placement: 'inline', anchor: 'bottom', bounds: null }` — stored as `type: 'media'`. **Bar/mini audio is a companion layer** (auxiliary): it never occupies the media zone, so an image media block + a bar/mini audio block coexist on one frame.

### 4.3 `quiz` — PRIMARY

Single-answer multiple-choice knowledge check.

| Field                | Type      | Req/Opt  | Default              | Notes |
| -------------------- | --------- | -------- | -------------------- | ----- |
| `question`           | string    | required | `""`                 | Prompt text. |
| `choices`            | string[]  | required | `['', '', '', '']`   | Answer options. Default is 4 empty strings; the editor reads/writes a flat array (length is flexible but the UI seeds 4). |
| `correct_index`      | int       | required | `0`                  | 0-based index into `choices` of the correct answer. |
| `feedback_correct`   | string    | optional | `""`                 | Shown on correct answer. |
| `feedback_incorrect` | string    | optional | `""`                 | Shown on incorrect answer. |

`_makeBlock('quiz')` default: `{ question: '', choices: ['', '', '', ''], correct_index: 0, feedback_correct: '', feedback_incorrect: '' }`.

### 4.4 `hotspot` — AUX

Clickable regions drawn over an image.

| Field          | Type        | Req/Opt  | Default | Notes |
| -------------- | ----------- | -------- | ------- | ----- |
| `image_id`     | string\|null | required for render | `null` | Media **asset id** of the background image (author pastes it after uploading via a Media block). Agent emits `null`/placeholder. |
| `regions`      | Region[]    | required | `[]`    | Hotspot regions (below). |
| `background_url` | string    | optional | (unset) | Alternative direct image URL (demo/seed). |
| `alt_text`     | string      | optional | (unset) | Background alt text. |

**Region** object (created in `HotspotBlock` `onUp`):

```jsonc
{
  "id": "uuid",
  "x": 12, "y": 34, "w": 20, "h": 15,   // normalized 0-100 (% of image), integers (rounded)
  "shape": "rect",                        // "rect" | "rounded" | "circle"
  "label": "Region 1",                    // shown on the region
  "description": "",                      // optional detail
  "color": "#D4820A"                      // optional per-region color override (508 contrast)
}
```

`_makeBlock('hotspot')` default: `{ image_id: null, regions: [] }`.

### 4.5 `branch` — AUX

A two-way decision that jumps to another frame.

| Field            | Type        | Req/Opt  | Default  | Notes |
| ---------------- | ----------- | -------- | -------- | ----- |
| `condition`      | string      | required | `""`     | Decision prompt shown to the learner. |
| `true_frame_id`  | string\|null | required for render | `null` | Frame id for the "true" path. Author picks from a frame list. Agent emits `null`/placeholder. |
| `false_frame_id` | string\|null | required for render | `null` | Frame id for the "false" path. |
| `true_label`     | string      | optional | `"Yes"`  | Button label. |
| `false_label`    | string      | optional | `"No"`   | Button label. |

`_makeBlock('branch')` default: `{ condition: '', true_frame_id: null, false_frame_id: null, true_label: 'Yes', false_label: 'No' }`.
Unresolvable target ids render as disabled buttons (never broken links).

### 4.6 `wcn` — AUX

Warning / Caution / Note callout box.

| Field       | Type   | Req/Opt  | Default                          | Notes |
| ----------- | ------ | -------- | -------------------------------- | ----- |
| `wcn_type`  | enum   | required | `"note"`                         | `warning` \| `caution` \| `note`. Drives color + icon. |
| `title`     | string | optional | `""`                             | Heading (optional). |
| `text`      | string | required | `""`                             | Body of the WCN. |
| `modal`     | bool   | optional | `false`                          | If true, renders as a modal interrupt requiring acknowledgment. |
| `ack_label` | string | optional | `"I understand — proceed"`       | Acknowledge button label (used when `modal`). |

`_makeBlock('wcn')` default: `{ wcn_type: 'note', title: '', text: '', modal: false, ack_label: 'I understand — proceed' }`.

### 4.7 `oam` — MEDIA

Adobe Animate (OAM) canvas, ForgeJS-bridged.

| Field                  | Type        | Req/Opt  | Default | Notes |
| ---------------------- | ----------- | -------- | ------- | ----- |
| `oam_asset_id`         | string\|null | required for render | `null` | Agent emits `null`/placeholder. Set on upload. |
| `width`                | int         | optional | `800`   | Stage width (px). Ignored when `responsive`. |
| `height`               | int         | optional | `600`   | Stage height (px). |
| `responsive`           | bool        | optional | `false` | Fills container width. |
| `scorm_bridge_enabled` | bool        | optional | `false` | Required if the OAM makes LMS API calls. |
| `caption`              | string      | optional | `""`    | Caption below the animation. |
| `bounds`               | object\|null | optional | `null` | Per-block absolute box. |
| `prompts`              | string[]    | optional | (unset) | Stop prompts, one per stop, in order. |
| `end_prompt`           | string      | optional | (unset) | Final-frame prompt. |
| `gate_next`            | bool        | optional | (unset) | Disable NEXT until the animation completes. |
| `entry_point`         | string       | runtime  | (unset) | Set from upload metadata. |

`_makeBlock('oam')` default: `{ oam_asset_id: null, width: 800, height: 600, responsive: false, scorm_bridge_enabled: false, caption: '', bounds: null }`.

### 4.8 `ivideo` — MEDIA

Interactive video (ForgeClip). Needs a video file AND a `.clip.json` interaction file.

| Field               | Type        | Req/Opt  | Default | Notes |
| ------------------- | ----------- | -------- | ------- | ----- |
| `video_asset_id`    | string\|null | required for render | `null` | The video file asset. Agent emits `null`/placeholder. |
| `clip_asset_id`     | string\|null | required for render | `null` | The ForgeClip `.clip.json` asset. |
| `video_filename`    | string\|null | runtime  | `null`  | From upload. |
| `video_serve_url`   | string\|null | runtime  | `null`  | From upload. |
| `interaction_count` | int\|null   | runtime  | `null`  | From clip metadata. |
| `video_duration`    | number\|null | runtime | `null`  | Seconds, from clip metadata. |
| `caption`           | string      | optional | `""`    | Caption below the player. |
| `bounds`            | object\|null | optional | `null` | Per-block absolute box. |

`_makeBlock('ivideo')` default: `{ video_asset_id: null, clip_asset_id: null, video_filename: null, video_serve_url: null, interaction_count: null, video_duration: null, caption: '', bounds: null }`.

### 4.9 `model3d` — MEDIA

GLB/glTF 3D model viewer (Three.js) with annotations and optional part-highlighting.

| Field            | Type        | Req/Opt  | Default  | Notes |
| ---------------- | ----------- | -------- | -------- | ----- |
| `model_asset_id` | string\|null | required for render | `null` | GLB asset. Agent emits `null`/placeholder. |
| `model_filename` | string\|null | runtime  | `null`   | From upload. |
| `model_serve_url`| string\|null | runtime  | `null`   | From upload. |
| `file_size_mb`   | number\|null | runtime  | `null`   | From upload. |
| `viewer_height`  | int         | optional | `400`    | Viewer height (px), 200–800. |
| `bg_color`       | string\|null | optional | `null`  | Viewer background hex; seeds from shell content-area color. |
| `bounds`         | object\|null | optional | `null`   | Per-block absolute box. |
| `caption`        | string      | optional | `""`     | Doubles as the 508/WCAG text alternative unless `decorative`. |
| `annotations`    | Annotation[]| optional | `[]`     | 3D pins (below). |
| `attribution`    | string      | optional | (unset)  | Credit overlay. |
| `environment`    | enum        | optional | `"studio"` | `studio` \| `day` \| `night` \| `none`. |
| `env_intensity`  | number      | optional | `1`      | 0–2 reflection intensity. |
| `auto_rotate`    | bool        | optional | (unset)  | Honors reduce-motion. |
| `part_highlight` | bool        | optional | (unset)  | Hover/click named meshes. |
| `parts`          | object      | optional | (unset)  | Map of meshKey → `{label, description}`. |
| `decorative`     | bool        | optional | (unset)  | Hide from screen readers (no text alternative needed). |

**Annotation** object: `{ id, label, description, position: {x,y,z}, color }` (`color` defaults to `#F59E0B`).

`_makeBlock('model3d')` default: `{ model_asset_id: null, model_filename: null, model_serve_url: null, file_size_mb: null, viewer_height: 400, bg_color: null, bounds: null, caption: '', annotations: [] }`.

### 4.10 `callout` — AUX

A free-floating annotation overlay (box + connector line to a target point) over the content area
(typically over a still image). **Never a zone-filler.**

| Field     | Type           | Req/Opt  | Default              | Notes |
| --------- | -------------- | -------- | -------------------- | ----- |
| `text`    | string         | required | `"Callout"`          | Box label. |
| `box`     | `{x,y}`        | required | `{ x: 55, y: 60 }`   | **CONNECTION POINT** — the center of the box edge that faces the target — normalized **0–100** (% of content area). The box is positioned so its chosen edge-center lands here and extends AWAY from the target. |
| `target`  | `{x,y}`        | required | `{ x: 32, y: 32 }`   | Connector target point, normalized **0–100**. The line runs straight from `box` → `target`. |
| `padding` | int            | optional | `10`                 | Uniform padding (px) on all four sides. Clamped 0–40. |
| `anchor`  | enum           | optional | `"auto"`             | `auto \| top \| bottom \| left \| right`. The line connects to the center of **this box edge**; `auto` picks the edge facing the target (compare `|target.x−box.x|` vs `|target.y−box.y|`). |

`_makeBlock('callout')` default: `{ text: 'Callout', box: { x: 55, y: 60 }, target: { x: 32, y: 32 }, padding: 10, anchor: 'auto' }`.
Positioning/aiming is done by dragging in the live preview (the box follows the cursor; its connecting edge stays on `box`); the panel sets text, padding, and the anchor edge.

### 4.11 `gui` — AUX (project-level)

ForgeGUI shell block. **Applied at the PROJECT level** (header ▣ Shell button), not from the
per-frame palette. The agent should **not** generate `gui` blocks.

`_makeBlock('gui')` default: `{ gui_asset_id: null, shell_name: null, stage_width: 1024, stage_height: 768, button_count: 0, zone_count: 0, html_serve_url: null, json_serve_url: null }`. All fields populate from a ZIP upload; not authored by hand.

---

## 5. Asset handling

**The agent cannot generate or guess asset ids or frame/lesson/module ids.** Every `*_asset_id`,
`image_id`, `oam_asset_id`, `model_asset_id`, `video_asset_id`, `clip_asset_id`, `gui_asset_id`, and
every menu/branch target id refers to a real, uploaded artifact or a real tree node that does not yet
exist at generation time.

Rules for generated output:

1. **Default to `null`.** For any asset field whose `_makeBlock` default is `null`, the agent emits
   `null`. The author fills it by uploading.
2. **Use a placeholder when the asset must be referenced from text.** Inline image-swap anchors and
   any field where `null` would lose authoring intent should use a **`__SWAP_A__`-style placeholder
   token** — uppercase, double-underscore-delimited (e.g. `__SWAP_A__`, `__SWAP_B__`, `__SWAP_C__`).
   This mirrors the demo seed convention (`server/demo_seed.py`), where `_wire_demo_assets()` rewrites
   `__SWAP_A__`/`__SWAP_B__`/`__SWAP_C__` to real asset ids once they exist. Example text body:
   `<a data-cf-swap="__SWAP_A__">view one</a>`.
3. **Always set the human-meaningful fields** that DO carry authoring intent even when the asset is
   absent: `placeholder_label`, `caption`, `alt_text`, hotspot region `label`/`description`, menu
   `label`/`title`, branch `condition`/`true_label`/`false_label`. These are what make a generated
   frame useful before assets are wired.
4. **Menu/branch targets:** emit empty `target_id`/`null` `*_frame_id` (or a `__TARGET__`-style
   placeholder) with a descriptive `label`; the author wires the real frame via the picker.

> The placeholder convention is intentionally distinctive (`__UPPER__`) so a validator/author can
> grep for unfilled slots before publishing.

---

## 6. Design-token constraints

The forge design-token vocabulary lives in `client/src/styles/forge-tokens.css` (mirrored into each
standalone tool's `static/forge-tokens.css`). Generated content **should reference these tokens
rather than hard-coded values** wherever a token exists. Vocabulary:

- **Typography:** `--forge-font` (`'IBM Plex Mono', 'Courier New', monospace`),
  `--forge-weight-semibold` (`600`).
- **Brand amber:** `--forge-amber` (`#D4820A` light / `#F59E0B` dark), `--forge-amber-hover`,
  `--forge-amber-bg`, `--forge-amber-border`.
- **Path hierarchy:** `--forge-path-root`, `--forge-path-mid`, `--forge-path-tool`,
  `--forge-path-slash`, `--forge-path-cursor` (+ nav-bar prefix/slash variants).
- **Surface & border:** `--forge-surface`, `--forge-surface-raised`, `--forge-border`,
  `--forge-border-subtle`.
- **Text:** `--forge-text-primary`, `--forge-text-secondary`, `--forge-text-tertiary`,
  `--forge-text-muted`.
- **Radius:** `--forge-radius-card` (`12px`), `--forge-radius-badge` (`6px`), `--forge-radius-sm`
  (`4px`).
- **Modes:** tokens have light (`:root`), dark (`[data-cf-mode="dark"]` etc.), and high-contrast
  (`[data-cf-mode="hc"]`) values. Do not hard-code a single mode's hex; reference the token so all
  three modes resolve correctly.

> **Shells do NOT load forge-tokens.** When content is injected into a ForgeGUI shell's
> `#fgui-content`, the forge-tokens stylesheet is not present. Shelled **body text color** is instead
> governed by the `#fgui-content` text cascade resolved in
> `scorm12.resolve_shell_text_style(shell_text_mode, project_text_mode, content_bg)`:
>
> 1. per-shell `text_mode` explicit (`light`/`dark`) wins;
> 2. else project `text_mode` (`Project.text_mode` ∈ `auto|light|dark`, default `auto`) wins;
> 3. else (`auto`/`auto`) → luminance pick from the content background (`shell_text_style(bg)`):
>    `#042C53` (brand navy) on light backgrounds, `#C8D8E8` (light glyphs) on dark, with an optional
>    text-shadow halo when contrast is marginal.
>
> Generated **text content should not bake in a literal body-text color** for shelled output — let
> the cascade pick it. (Inline accent colors, e.g. WCN/hotspot/callout brand colors, are emitted by
> their own renderers and are fine.)

---

## 7. 508 / WCAG hard constraints

Generated frames must satisfy these non-negotiables:

1. **Image alt text is required.** A `media` block with `kind: "image"` must have a meaningful
   `alt_text` (the editor flags it "required for 508"). Video should carry an accessible-description
   `alt_text`.
2. **3D models need a text alternative.** `model3d.caption` is the 508/WCAG text alternative **unless**
   `decorative: true` is set (which hides the model from screen readers). Do not mark substantive
   models decorative.
3. **Video captions.** If a video has speech, a VTT caption track is required for 508 (the editor
   surfaces a "Captions (VTT)" companion indicator). Generated video blocks should assume captions
   will be supplied.
4. **WCN / hotspot / callout contrast.** WCN colors, hotspot region colors, and callout box colors
   are chosen for contrast. Hotspot regions expose a per-region `color` override expressly so an
   author can fix contrast on a light background — do not override these to low-contrast values.
5. **Shelled body-text contrast (AA).** The `resolve_shell_text_style` cascade picks a body text
   color and adds a text-shadow halo when the computed contrast against the content background is
   below **4.5:1** (AA for normal text). Generated text must not fight this by hard-coding a body
   color (see [§6](#6-design-token-constraints)).
6. **Menus must not produce dead-ends.** Disabled (unresolved) menu/branch targets render inert
   rather than navigating to a broken link — but a published course should have its targets wired;
   generated placeholders are a TODO for the author, not a shippable state.

---

## 8. SCORM output requirements

The packager (`server/services/scorm12.py` → `build_scorm12_package`, plus
`server/services/scorm2004.py` and `web_export.py`) imposes the following on what makes a frame
package validly:

1. **Frame must have a non-empty `name`.** It becomes the manifest item `title` and the SCO label.
2. **Filenames are server-generated:** each frame publishes to `frame_{idx:04d}_{frame.id[:8]}.html`.
   The agent does not control filenames; it must not assume any naming.
3. **Manifest:** one `imsmanifest.xml` is rendered with `manifest_id = cf_<projectid>`,
   `org_id = org_<manifest_id>`, one `<item>`/`<resource>` per frame. SCORM **1.2** is the primary
   target; **2004** and a plain Web Bundle are also produced. (`SCHEMA_VERSION = "1.0"`,
   `VERSION = "1.0.0"`.)
4. **Branch/menu targets must be resolvable to be live.** `menu_resolve` maps a menu item (via
   `resolve_target_frame_id`) and `branch_resolve` maps a branch `*_frame_id` to a published
   `<frame>.html`. **Topic** menu targets (`lesson`/`module`) resolve to that section's first frame.
   An unresolvable id degrades to a disabled button / inert anchor (never a broken `.html` link) — so
   a generated frame with placeholder targets still packages without error, but those buttons are
   dead until wired.
5. **GUI shell vs. plain SCO.** A per-frame `gui` block (or a per-project shell) makes the ForgeGUI
   shell the SCO page in SCORM 1.2; in SCORM 2004 / Web Bundle a `gui` block renders a notice. Agents
   should not emit `gui` blocks.
6. **Menu frames** render through `render_menu_html` (their `content.menu`), not `_render_blocks`.
7. **Layout must be one of `full` / `text-left` / `text-right`** (anything else falls back to
   `text-left`). Exclusivity caps (§3.3) must hold for the renderer to lay out zones correctly.

---

## 9. Naming & structural conventions

- **ids:** UUIDv4. Frame ids and order are server-assigned; block ids and menu-item ids are
  `crypto.randomUUID()` and ARE part of the JSON the editor/agent produces.
- **`name`:** human-readable frame title; required and non-empty (it surfaces in the manifest and
  navigation). Title-case, concise.
- **`lesson`:** readable lesson name used for authoring placement (mirrors the demo-seed frame dict).
- **ordering:** `order_index` per frame/lesson/module/course; assigned on insert, not by the agent.
  Frames publish in `order_index` order within `lesson → module → course`.
- **block order:** the order of `content.blocks[]` IS the render order within a zone (the layout
  reflow groups by zone but preserves source order within each group).

---

## 10. Example prompt → frame-JSON mappings

The following are **valid** against the catalog above. The agent emits block `id`s (UUIDv4); asset
fields are `null` or `__PLACEHOLDER__` tokens for the author to fill.

### 10.1 "Intro text frame with a hero image on the right"

`text-left` puts the PRIMARY (text) on the left, MEDIA (image) on the right — one PRIMARY + one
MEDIA is exactly within the split-layout cap.

```jsonc
{
  "name": "Welcome to Espresso Fundamentals",
  "frame_type": "content",
  "lesson": "Introduction",
  "content": {
    "layout": "text-left",
    "blocks": [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "type": "text",
        "data": {
          "body": "<h2>Welcome</h2><p>In this lesson you'll learn the core steps of pulling a balanced espresso shot — dose, distribution, tamp, and extraction.</p>",
          "narrator_script": ""
        }
      },
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "type": "media",
        "data": {
          "kind": "image",
          "placeholder_label": "hero_barista_pulling_shot",
          "asset_id": null,
          "caption": "A barista pulling a fresh espresso shot",
          "alt_text": "Barista operating an espresso machine, pulling a shot into a cup",
          "fit": "cover",
          "bounds": null
        }
      }
    ]
  }
}
```

### 10.2 "4-option knowledge check"

`quiz` is PRIMARY. On a `full` layout it is the single zone-filler.

```jsonc
{
  "name": "Knowledge Check — Extraction",
  "frame_type": "content",
  "lesson": "Extraction",
  "content": {
    "layout": "full",
    "blocks": [
      {
        "id": "33333333-3333-4333-8333-333333333333",
        "type": "quiz",
        "data": {
          "question": "Which variable most directly controls espresso extraction time?",
          "choices": [
            "Grind size",
            "Cup color",
            "Room temperature",
            "Machine brand"
          ],
          "correct_index": 0,
          "feedback_correct": "Correct — finer grind slows flow and increases extraction time.",
          "feedback_incorrect": "Not quite. Grind size is the primary lever on extraction time."
        }
      }
    ]
  }
}
```

### 10.3 "Image with two callout labels"

A `full`-layout image (the single MEDIA zone-filler) plus two AUXILIARY callouts. Callouts never
count against the cap, so they coexist with the full-bleed image. `box`/`target` are normalized
0–100; `box` is the box center.

```jsonc
{
  "name": "Anatomy of the Portafilter",
  "frame_type": "content",
  "lesson": "Equipment",
  "content": {
    "layout": "full",
    "blocks": [
      {
        "id": "44444444-4444-4444-8444-444444444444",
        "type": "media",
        "data": {
          "kind": "image",
          "placeholder_label": "portafilter_diagram",
          "asset_id": null,
          "caption": "Labeled portafilter",
          "alt_text": "A portafilter with its basket and spout visible",
          "fit": "cover",
          "bounds": null
        }
      },
      {
        "id": "55555555-5555-4555-8555-555555555555",
        "type": "callout",
        "data": {
          "text": "Basket — holds the coffee puck",
          "box": { "x": 30, "y": 28 },
          "target": { "x": 48, "y": 40 },
          "padding": 10,
          "anchor": "auto"
        }
      },
      {
        "id": "66666666-6666-4666-8666-666666666666",
        "type": "callout",
        "data": {
          "text": "Spout — directs the flow",
          "box": { "x": 70, "y": 75 },
          "target": { "x": 52, "y": 66 },
          "padding": 10,
          "anchor": "auto"
        }
      }
    ]
  }
}
```

---

## 11. Derivability & drift risk

The following sections are **mechanically derivable from code** and SHOULD be auto-generated / synced
later (flag for drift):

| Section | Source of truth (code) | Drift risk |
| ------- | ---------------------- | ---------- |
| §3.1 content groups (`PRIMARY_TYPES`/`MEDIA_TYPES`/`AUXILIARY_TYPES`) | `client/src/store/editorStore.js` | **High** — a new block type added to a group here must be reflected. |
| §3.3 exclusivity caps | `resolveExclusivity` / `isBlockTypeBlocked` (`editorStore.js`) | Medium. |
| §4 block registry (type/label/color/group) | `BlockToolbar.BLOCK_TYPES` + `MEDIA_KINDS` (`MediaBlock.jsx`) | **High** — palette additions. |
| §4 `data` defaults | `_makeBlock` in `editorStore.js` | **High** — defaults change with each block. |
| §2.2 menu shape | `menu_frame.py` + `editorStore` menu helpers | Medium. |
| §6 tokens | `forge-tokens.css` | Medium. |
| §6 shell text cascade / §7.5 | `scorm12.resolve_shell_text_style` / `shell_text_style` | Medium. |
| §8 packaging (filenames, manifest ids, resolvers) | `scorm12.build_scorm12_package`, `menu_frame.resolve_target_frame_id` | Medium. |
| Engine versions | `server/version.py` (`VERSION`, `SCHEMA_VERSION`) | Low. |

**Hand-authored** (require human judgment, not directly in code): §1 conventions, §5 placeholder
policy (the `__SWAP_A__` convention is *observed* in `demo_seed.py` but its use as the agent output
convention is a documentation decision), §7 the 508 *expectations* wording, §10 worked examples, and
this §11/§12.

---

## 12. Assumptions & open questions

> **v0.1.0 review resolutions (approved).** (1) Agent emits **`content` / `menu` only** — `assessment`/`branch` frame types are vestigial; branching is a *block*. (2) `quiz.choices` may be **≥2** (4 canonical); renderer handling of ≠4 to be confirmed during the handler build. (3) `narrator_script` → emit `""`. (4) **OPEN until the handler build** — confirm the frame-ingest path accepts a readable `lesson` name vs. requiring a `lesson_id` (determines whether ForgeAgent needs an ingest adapter). (5 & 7) **Minimal placeholder policy for v1:** `null` for asset/target fields (author fills via the existing upload/picker UI); `__SWAP_n__` **only** for inline image-swap *text* anchors — no broader `__ASSET_n__`/`__TARGET_n__` grammar in v1. (6) Agent emits `bounds: null`. The original analysis is retained below.

1. **Legacy `frame_type` values.** The `Frame` model comment lists `content | assessment | branch`,
   but the live, code-exercised renderer paths are `content` and `menu`. **ASSUMPTION:** the agent
   should emit only `content` and `menu`. `assessment`/`branch` as *frame types* appear vestigial
   (branching is a `branch` **block**, not a frame type). OPEN: confirm whether `assessment`/`branch`
   frame types are still routed anywhere before the agent is allowed to emit them.
2. **`quiz.choices` length.** `_makeBlock('quiz')` seeds exactly 4 empty strings and the editor reads
   a flat array; nothing in the editor hard-caps the count. **ASSUMPTION:** the agent may emit a
   different number of choices (≥2) with `correct_index` in range, but 4 is the canonical default.
   OPEN: confirm the SCORM quiz renderer handles ≠4 choices.
3. **`narrator_script`.** Seeded by `_makeBlock('text')` but the current TextBlock editor removed its
   input. **ASSUMPTION:** keep emitting `""` (harmless) or omit. OPEN: confirm the publisher ignores
   it.
4. **`lesson` in generated JSON.** The persisted model uses `lesson_id` (FK); the seed/authoring
   layer carries a readable `lesson` string. **ASSUMPTION:** the agent emits `lesson` as a readable
   name and the ingest layer resolves/creates the lesson. OPEN: confirm the ingest path for
   agent-produced frames (does it accept a `lesson` name and place the frame, or require a
   `lesson_id`?).
5. **Placeholder token grammar.** `__SWAP_A__`/`B`/`C` are confirmed in `demo_seed.py` for image-swap
   anchors only. **ASSUMPTION:** generalize the `__UPPER__` token convention to all unfillable
   slots (asset ids, menu/branch targets). OPEN: decide the exact token vocabulary the validator will
   recognize (`__SWAP_n__`, `__ASSET_n__`, `__TARGET_n__`?) and document it canonically.
6. **`bounds` object shape.** Several blocks carry `bounds` (set via `BoundsControl`). Its exact
   field set (`x/y/width/height`?) was not fully derived here. **ASSUMPTION:** the agent should leave
   `bounds: null` and let the author position via the preview. OPEN: document the `bounds` shape from
   `BoundsControl.jsx` if the agent ever needs to emit it.
7. **`menu` items target placeholders.** No existing placeholder convention for menu/branch targets
   was found in code (unlike `__SWAP__`). **ASSUMPTION:** emit empty `target_id` / `null`
   `*_frame_id`. OPEN: see (5).
