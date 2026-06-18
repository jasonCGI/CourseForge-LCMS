# cardonalab.dev — demo / showcase space

Self-contained, version-controlled showcase pages for the CourseForge tool
ecosystem, deployed to **cardonalab.dev**. The goal: let people *see* how each
tool works without installing anything — every page runs standalone in a browser
(no CourseForge backend, no build step).

## Pages

| File | Tool | Notes |
|------|------|-------|
| `forge3d.html` | Forge3D — Interactive 3D Block | Live Three.js viewer (procedural demo geometry) + technical white-paper. |

## Conventions

- **Standalone:** each page is a single self-contained `.html` (inline CSS/JS;
  only external dep is a pinned CDN lib like Three.js). No API calls to a live
  backend — the viewers use procedural/demo data so they work anywhere.
- **Brand:** locked CourseForge amber `#F59E0B` (not the deprecated `#EF9F27`),
  navy `#042C53`, IBM Plex Mono + Inter. See the CourseForge logo identity.
- **Accuracy:** the *documentation* in each page is audited against the real
  CourseForge code and kept in sync as the tools evolve — claims should match
  what the published tool actually does (e.g. note CDN-vs-bundled honestly).
- **Responsive:** must not clip/hide content at phone widths.

## Deploy

These files are static — host the folder on cardonalab.dev (any static host /
CDN). Not served by the CourseForge Flask app.

## Keeping in sync

When a tool's behavior changes (routes, schema, packaging, a11y), update the
matching showcase page in the same PR so the demo never drifts from reality.
