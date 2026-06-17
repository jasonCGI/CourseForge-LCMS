# Forge3D

FBX → GLB conversion pipeline. Part of the CourseForge ecosystem.

## What it does

Drop an FBX file. Forge3D runs a preflight compatibility scan, then invokes
Blender headlessly to import the FBX and export a production-ready GLB.
Output previewed in-app via Three.js with OrbitControls.

## Requirements

- Node.js 18+
- [Blender 3.6 LTS or 4.x](https://www.blender.org/download/) — installed separately

## Quick start

```bash
cd forge-3d/electron
npm install
npm start
```

First launch will prompt for your Blender executable path.

## Build installer

```bash
npm run build:win   # NSIS .exe (Windows)
npm run build:mac   # .dmg (Mac)
```

## Pipeline

FBX → Node.js preflight scan → Blender headless (bpy) → GLB → Three.js preview

## Blender API

- `bpy.ops.import_scene.fbx` — https://docs.blender.org/api/current/bpy.ops.import_scene.html
- `bpy.ops.export_scene.gltf` — https://docs.blender.org/api/current/bpy.ops.export_scene.html

## Accessibility

WCAG 2.1 AA (Night + Day modes) · AAA (High Contrast) · Section 508
Night / Day / HC theme switcher in header. Keyboard-navigable throughout.

## CourseForge ecosystem

ForgeBlueprint · ForgePack · ForgeClip · **Forge3D**
Repo: `courseforge/forge-3d/`
