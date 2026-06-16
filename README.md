# Forge Token System

The single source of truth for the **CourseForge LCMS** brand: the path marks
(`Course/Forge_`, `Course/Forge/Blueprint_`, …), badges, brand color, and the
blinking cursor — shared across all four tools (CourseForge, ForgeBlueprint,
ForgePack, ForgeClip).

## Files

| File | Role |
|------|------|
| `forge-tokens.css` | CSS custom properties — **source of truth**. Light on `:root`, dark on `[data-bs-theme="dark"]`. |
| `forge-bootstrap.css` | Maps tokens onto Bootstrap 5 `--bs-*` vars so stock components inherit the brand. |
| `forge-components.css` | Component classes: `.forge-path*`, `.forge-badge*`. Static appearance only. |
| `forge-motion.css` | Every `@keyframes` + animation binding, plus the `prefers-reduced-motion` kill-switch. |
| `forge-demo.html` | Renders all four marks × all sizes × light/dark using only component classes. |

## Load order

Order matters — tokens define the variables everything else reads, motion binds
last so it can override the static cursor rule:

```html
<link rel="stylesheet" href="/tokens/forge-tokens.css">
<link rel="stylesheet" href="bootstrap.css">            <!-- if using Bootstrap -->
<link rel="stylesheet" href="/tokens/forge-bootstrap.css">
<link rel="stylesheet" href="/tokens/forge-components.css">
<link rel="stylesheet" href="/tokens/forge-motion.css">
```

## Dark mode

Follows the Bootstrap 5 convention — toggle the attribute on `<html>` (or any
ancestor):

```html
<html data-bs-theme="dark">
```

All tokens re-resolve automatically; no per-component dark rules needed.

## Path marks

A path mark is `root [/ mid] / tool _`. Two-level for the master mark, three for
sub-tools. Use the empty-comment trick to avoid whitespace between segments.

```html
<!-- Master: Course/Forge_ -->
<span class="forge-path forge-path--lg">
  <span class="forge-path__root">Course</span><!--
--><span class="forge-path__slash">/</span><!--
--><span class="forge-path__tool">Forge</span><!--
--><span class="forge-path__cursor">_</span>
</span>

<!-- Sub-tool: Course/Forge/Blueprint_ -->
<span class="forge-path forge-path--lg">
  <span class="forge-path__root">Course</span><!--
--><span class="forge-path__slash">/</span><!--
--><span class="forge-path__mid">Forge</span><!--
--><span class="forge-path__slash">/</span><!--
--><span class="forge-path__tool">Blueprint</span><!--
--><span class="forge-path__cursor">_</span>
</span>
```

### Elements

| Class | Purpose | Light | Dark |
|-------|---------|-------|------|
| `.forge-path__root` | "Course" segment | `#6B7280` | `#2a2a2a` |
| `.forge-path__mid` | "Forge" in 3-level paths | `#374151` | `#4B5563` |
| `.forge-path__tool` | active tool — amber | `#D4820A` | `#F59E0B` |
| `.forge-path__slash` | separator | `#D1D5DB` | `#1e1e1e` |
| `.forge-path__cursor` | blinking underscore | matches tool | matches tool |

### Sizes

| Modifier | Size |
|----------|------|
| `.forge-path--xl` | 38px |
| `.forge-path--lg` | 28px |
| `.forge-path--md` | 20px (default) |
| `.forge-path--sm` | 14px |
| `.forge-path--xs` | 11px |

## Badges

```html
<span class="forge-badge forge-badge--brand">CourseForge</span>
<span class="forge-badge forge-badge--tool">Blueprint</span>
```

| Class | Use |
|-------|-----|
| `.forge-badge--brand` | amber-tinted pill for the master mark |
| `.forge-badge--tool` | neutral pill for sub-tools |

## Tokens reference

| Token | Light | Dark |
|-------|-------|------|
| `--forge-brand` | `#D4820A` | `#F59E0B` |
| `--forge-path-root` | `#6B7280` | `#2a2a2a` |
| `--forge-path-forge` | `#374151` | `#4B5563` |
| `--forge-path-tool` | `#D4820A` | `#F59E0B` |
| `--forge-path-slash` | `#D1D5DB` | `#1e1e1e` |
| `--forge-bg-secondary` | `#f8f9fa` | `#212529` |
| `--forge-radius-card` | `12px` | — |
| `--forge-radius-badge` | `6px` | — |
| `--forge-cursor-blink` | `1.1s` | — |
| `--forge-font` | `IBM Plex Mono` 600 | — |

## Motion

The cursor blink (and any future micro-animation) lives only in
`forge-motion.css`. It is disabled wholesale under
`@media (prefers-reduced-motion: reduce)` — add new animations there so the
reduced-motion guarantee holds.

## /src audit — existing → forge mapping

The CourseForge React app (`client/src`) was swept and its brand color rewired
onto the forge tokens. Decisions: **adopt the forge spec amber** (was `#EF9F27`,
now `#D4820A` light / `#F59E0B` dark) and **full sweep** of every hex that
corresponds to a forge token.

**Integration note:** the app themes via `data-cf-mode` (set by `ThemeContext`),
not Bootstrap's `data-bs-theme`. A cross-root `@import` of `/tokens` trips Vite's
dev fs guard, so `--forge-brand` is mirrored as an app-local bridge in
`client/src/index.css`, reactive to `data-cf-mode`:

```css
:root                  { --forge-brand: #F59E0B; }  /* dark-first default */
[data-cf-mode="light"] { --forge-brand: #D4820A; }
[data-cf-mode="dark"]  { --forge-brand: #F59E0B; }
[data-cf-mode="hc"]    { --forge-brand: #F59E0B; }
```

| Existing | → Forge | Where |
|----------|---------|-------|
| `#EF9F27` (brand, 60×) | `var(--forge-brand)` | `index.css`, `theme/modes.js` (×27), 9 components |
| `rgba(239,159,39,α)` (brand-rgb tints) | `color-mix(in srgb, var(--forge-brand) α, transparent)` | `modes.js`, HotspotBlock, FramePreview, AuditPanel |
| `#FFF3E0` (light accent tint) | `color-mix(… 12% …)` | `modes.js` (accent-dim, frame-active-bg) |
| `--cf-accent`, `--cf-header-border`, `--cf-focus-*`, `--cf-logo-slash`, `--cf-*-active-*` | now resolve from `var(--forge-brand)` | `modes.js` (all 3 modes) |

**Deliberately left untouched** (no forge-token equivalent):

- **Semantic amber family** — `#854F0B` (quiz/audio category), `#B87A1A`/`#7A4800`/`#5A3800` (WCN caution palette), `#FAC775`/`#633806`/`#F0B84A`/`#F0B060` (badges), `#8A4A00` (warning text). These are *status/category* colors, not brand. Candidates for a future `--forge-warn`/`--forge-caution` set.
- **`ThemeEditorModal` `accent_color`** — adopted the spec as a *concrete* `#D4820A` (not a var): it is persisted as `token_overrides` and baked into published SCORM output, and feeds color pickers, where a CSS var can't resolve.
- **The ~377 non-amber UI hex** — navy/blue (`#185FA5`, `#06080f`, `#1B3A5C`…), reds (`#C0392B`), greens (`#3B8A4A`), purples (`#533AB7`). The forge palette has no equivalent; these would need their own token layer.

The forge path-hierarchy/neutral tokens (`--forge-path-*`, `--forge-bg-secondary`)
back the new `.forge-path`/`.forge-badge` components — they do **not** map onto
the app's existing navy chrome, which is a separate palette.
