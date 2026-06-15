"""
SCORM 2004 3rd Edition Package Builder

Produces a ZIP containing:
  - imsmanifest.xml   (SCORM 2004 schema)
  - metadata.xml      (LOM metadata)
  - One SCO HTML per frame (SCORM 2004 API calls)
  - Shared assets: Video.js, media files, OAM extracted files
"""

import os
import json
import uuid
import zipfile
import urllib.request
from io import BytesIO
from pathlib import Path
from datetime import datetime
from flask import current_app, render_template

from ..models.project import Project
from ..models.media import MediaAsset, OamAsset
from ..services.theme_resolver import resolve_theme, tokens_to_css
from ..services.scorm12 import _render_blocks, _has_oam_with_scorm

# Video.js CDN — same files as SCORM 1.2, cached locally
VIDEOJS_CDN = {
    'assets/video-js/video.min.js':
        'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video.min.js',
    'assets/video-js/video-js.min.css':
        'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video-js.min.css',
}


def _get_videojs_cache(upload_root: Path) -> Path:
    cache = upload_root / 'cache' / 'videojs'
    cache.mkdir(parents=True, exist_ok=True)
    return cache


def _ensure_videojs_cached(cache_dir: Path) -> None:
    for arc_path, url in VIDEOJS_CDN.items():
        filename = arc_path.split('/')[-1]
        cached   = cache_dir / filename
        if not cached.exists():
            urllib.request.urlretrieve(url, str(cached))


def build_frame_html_2004(frame, lesson, frame_index,
                           total_frames, frame_map,
                           theme_css, scorm_bridge=False):
    """Render a single SCO HTML page using SCORM 2004 API."""
    blocks_html = _render_blocks(frame.content.get('blocks', []), scorm_bridge)

    return render_template(
        'sco_shell_2004.html',
        frame_name=frame.name,
        lesson_name=lesson.name,
        frame_index=frame_index,
        total_frames=total_frames,
        progress_pct=round((frame_index / max(total_frames - 1, 1)) * 100),
        frame_map_json=json.dumps(frame_map),
        blocks_html=blocks_html,
        theme_css=theme_css,
        scorm_bridge=scorm_bridge,
    )


def build_scorm2004_package(project_id: str) -> tuple[BytesIO, str]:
    """
    Build a SCORM 2004 3rd Edition ZIP package.
    Returns (BytesIO buffer, suggested filename).
    Must be called within Flask app context.
    """
    project     = Project.query.get_or_404(project_id)
    tokens      = resolve_theme(project)
    css         = tokens_to_css(tokens)
    upload_root = Path(current_app.config['UPLOAD_FOLDER'])

    # ── Collect frames in order ──────────────────────────────
    all_frames = []
    for course in sorted(project.courses, key=lambda c: c.order_index):
        for mod in sorted(course.modules, key=lambda m: m.order_index):
            for lesson in sorted(mod.lessons, key=lambda l: l.order_index):
                for frame in sorted(lesson.frames, key=lambda f: f.order_index):
                    all_frames.append((frame, lesson, course))

    total       = len(all_frames)
    manifest_id = f"cf2004_{project_id.replace('-','')}"
    org_id      = f"org_{manifest_id}"

    # ── Build frame map ───────────────────────────────────────
    frame_map  = {}
    items      = []
    resources  = []

    for idx, (frame, lesson, course) in enumerate(all_frames):
        fname  = f"frame_{idx:04d}_{frame.id[:8]}.html"
        res_id = f"res_{idx:04d}"
        frame_map[idx] = fname
        items.append({
            'item_id': f"item_{idx:04d}",
            'res_id':  res_id,
            'title':   frame.name,
        })
        resources.append({
            'res_id':       res_id,
            'href':         fname,
            'dependencies': [],
        })

    # ── Render manifests ──────────────────────────────────────
    manifest_xml = render_template(
        'imsmanifest2004.xml',
        manifest_id=manifest_id,
        org_id=org_id,
        project_name=project.name,
        items=items,
        resources=resources,
    )

    metadata_xml = render_template(
        'metadata.xml',
        project_name=project.name,
        project_description=project.description or '',
    )

    # ── Ensure Video.js cached ────────────────────────────────
    videojs_cache = _get_videojs_cache(upload_root)
    try:
        _ensure_videojs_cached(videojs_cache)
    except Exception:
        pass  # Proceed without Video.js if network unavailable

    # ── Build ZIP ─────────────────────────────────────────────
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:

        zf.writestr('imsmanifest.xml', manifest_xml)
        zf.writestr('metadata.xml',    metadata_xml)

        # SCO HTML files
        for idx, (frame, lesson, course) in enumerate(all_frames):
            fname = frame_map[idx]
            html  = build_frame_html_2004(
                frame=frame,
                lesson=lesson,
                frame_index=idx,
                total_frames=total,
                frame_map=frame_map,
                theme_css=css,
                scorm_bridge=_has_oam_with_scorm(frame),
            )
            zf.writestr(fname, html)

        # Video.js assets
        for arc_path in VIDEOJS_CDN:
            filename = arc_path.split('/')[-1]
            cached   = videojs_cache / filename
            if cached.exists():
                zf.write(str(cached), arc_path)

        # ── Media files + companions (deduped) ────────────────
        _seen = set()

        def _w(stored_path, arc):
            if arc in _seen or not stored_path or not Path(stored_path).exists():
                return
            zf.write(stored_path, arc)
            _seen.add(arc)

        bundled_oam_ids = set()
        for asset in MediaAsset.query.filter_by(project_id=project_id).all():

            if asset.kind == 'video':
                ext = (asset.original_name or 'video.mp4').rsplit('.', 1)[-1].lower()
                _w(asset.stored_path, f'media/video/{asset.id}.{ext}')
            elif asset.kind in ('image', 'audio'):
                ext    = (asset.original_name or '').rsplit('.', 1)[-1].lower() or 'bin'
                subdir = 'images' if asset.kind == 'image' else 'audio'
                _w(asset.stored_path, f'media/{subdir}/{asset.id}.{ext}')

            # Companion files
            companions = asset.companion_files or {}
            for key, companion_id in companions.items():
                if not companion_id:
                    continue
                companion = MediaAsset.query.get(companion_id)
                if not companion:
                    continue
                if key == 'vtt_asset_id':
                    _w(companion.stored_path, f'media/captions/{companion.id}.vtt')
                elif key == 'poster_asset_id':
                    ext = (companion.original_name or 'poster.jpg').rsplit('.', 1)[-1].lower()
                    _w(companion.stored_path, f'media/images/{companion.id}.{ext}')
                elif key == 'webm_asset_id':
                    _w(companion.stored_path, f'media/video/{companion.id}.webm')

            # OAM extracted files
            if asset.kind == 'oam' and asset.oam_asset:
                oam_asset = asset.oam_asset
                if oam_asset.extracted_path and asset.id not in bundled_oam_ids:
                    extract_dir = Path(oam_asset.extracted_path)
                    if extract_dir.exists():
                        for oam_file in extract_dir.rglob('*'):
                            if oam_file.is_file():
                                arc = f"oam/{asset.id}/{oam_file.relative_to(extract_dir)}"
                                _w(str(oam_file), arc)
                        bundled_oam_ids.add(asset.id)

    buf.seek(0)
    safe_name = project.name.replace(' ', '_').lower()[:40]
    filename  = f"{safe_name}_scorm2004_{datetime.utcnow().strftime('%Y%m%d')}.zip"
    return buf, filename
