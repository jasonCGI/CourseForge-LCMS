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
from io import BytesIO
from pathlib import Path
from datetime import datetime
from flask import current_app, render_template

from ..models.project import Project, project_full_query
from ..models.media import MediaAsset, OamAsset
from ..services.theme_resolver import resolve_theme, tokens_to_css
from ..services.scorm12 import (_render_blocks, _has_oam_with_scorm, _project_hotspot_cfg,
                                _bundle_three_assets, _bundle_videojs_assets,
                                _frames_have_model3d)
from ..version import VERSION


def build_frame_html_2004(frame, lesson, frame_index,
                           total_frames, frame_map,
                           theme_css, scorm_bridge=False,
                           disp_index=None, disp_total=None, asset_map=None, hotspot_cfg=None,
                           branch_resolve=None):
    """Render a single SCO HTML page using SCORM 2004 API.

    Visible counter + progress use disp_index/disp_total (required frames only,
    excluding optional); navigation uses the real frame_index/total_frames.
    branch_resolve: frame id -> '<frame>.html' for branch-block navigation.
    """
    blocks_html = _render_blocks(frame.content.get('blocks', []), scorm_bridge, asset_map, hotspot_cfg,
                                 branch_resolve=branch_resolve)

    counter_index = disp_index if disp_index is not None else (frame_index + 1)
    counter_total = disp_total if disp_total is not None else total_frames

    return render_template(
        'sco_shell_2004.html',
        frame_name=frame.name,
        lesson_name=lesson.name,
        frame_index=frame_index,
        total_frames=total_frames,
        counter_index=counter_index,
        counter_total=counter_total,
        progress_pct=round(((counter_index - 1) / max(counter_total - 1, 1)) * 100),
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
    project     = project_full_query().get_or_404(project_id)
    tokens      = resolve_theme(project)
    css         = tokens_to_css(tokens)
    hotspot_cfg = _project_hotspot_cfg(project)

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
    frame_map         = {}
    frame_id_to_fname = {}
    items      = []
    resources  = []

    for idx, (frame, lesson, course) in enumerate(all_frames):
        fname  = f"frame_{idx:04d}_{frame.id[:8]}.html"
        res_id = f"res_{idx:04d}"
        frame_map[idx] = fname
        frame_id_to_fname[frame.id] = fname
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
        cf_version=VERSION,
        publish_date=datetime.utcnow().strftime('%Y-%m-%d'),
    )

    metadata_xml = render_template(
        'metadata.xml',
        project_name=project.name,
        project_description=project.description or '',
    )

    # ── Build ZIP ─────────────────────────────────────────────
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:

        zf.writestr('imsmanifest.xml', manifest_xml)
        zf.writestr('metadata.xml',    metadata_xml)

        # Frame counter excludes optional frames: required total + per-frame
        # running required index (optional frames hold the previous value).
        req_total = sum(1 for (fr, _, _) in all_frames if not getattr(fr, 'optional', False)) or total
        req_index = {}
        _run = 0
        for _i, (fr, _, _) in enumerate(all_frames):
            if not getattr(fr, 'optional', False):
                _run += 1
            req_index[_i] = _run or 1

        # SCO HTML files
        comment_prefix = (
            f"<!-- CourseForge v{VERSION} | SCORM 2004 3rd Ed | "
            f"published {datetime.utcnow().strftime('%Y-%m-%d')} -->\n"
        )
        # One media query, threaded into rendering (no per-block SELECT) and
        # reused for the bundling pass below.
        project_assets = MediaAsset.query.filter_by(project_id=project_id).all()
        asset_by_id = {a.id: a for a in project_assets}

        # Branch-block target resolver: frame id -> published '<frame>.html'.
        def branch_resolve(target_frame_id):
            return frame_id_to_fname.get(target_frame_id) if target_frame_id else None

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
                disp_index=req_index[idx],
                disp_total=req_total,
                asset_map=asset_by_id,
                hotspot_cfg=hotspot_cfg,
                branch_resolve=branch_resolve,
            )
            html = comment_prefix + html
            zf.writestr(fname, html)

        # Video.js assets (vendored, offline — security review H4)
        _bundle_videojs_assets(zf)

        # three.js + loaders + Draco (only if a 3D block exists) → fully offline
        if _frames_have_model3d(f for (f, _l, _c) in all_frames):
            _bundle_three_assets(zf)

        # ── Media files + companions (deduped) ────────────────
        _seen = set()

        def _w(stored_path, arc):
            if arc in _seen or not stored_path or not Path(stored_path).exists():
                return
            zf.write(stored_path, arc)
            _seen.add(arc)

        bundled_oam_ids = set()
        # project_assets / asset_by_id built once above (reused here).
        for asset in project_assets:

            if asset.kind == 'video':
                ext = (asset.original_name or 'video.mp4').rsplit('.', 1)[-1].lower()
                _w(asset.stored_path, f'media/video/{asset.id}.{ext}')
            elif asset.kind in ('image', 'audio'):
                ext    = (asset.original_name or '').rsplit('.', 1)[-1].lower() or 'bin'
                subdir = 'images' if asset.kind == 'image' else 'audio'
                _w(asset.stored_path, f'media/{subdir}/{asset.id}.{ext}')
            elif asset.kind == 'clip':
                _w(asset.stored_path, f'media/clips/{asset.id}.clip.json')
            elif asset.kind == 'model3d':
                _w(asset.stored_path, f'media/models/{asset.id}{Path(asset.stored_path).suffix.lower()}')

            # Companion files. Only the known companion-ID keys are asset IDs;
            # other kinds (e.g. 'gui') store metadata dicts/strings here, so
            # restrict to the keys we actually bundle and require a string id.
            companions = asset.companion_files or {}
            for key, companion_id in companions.items():
                if key not in ('vtt_asset_id', 'poster_asset_id', 'webm_asset_id'):
                    continue
                if not companion_id or not isinstance(companion_id, str):
                    continue
                companion = asset_by_id.get(companion_id)
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
