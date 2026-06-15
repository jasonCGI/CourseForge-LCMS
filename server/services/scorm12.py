"""
SCORM 1.2 Package Builder
Produces a ZIP file containing:
  - imsmanifest.xml
  - One SCO HTML file per frame
  - Shared assets (CSS tokens baked in)
"""

import os
import uuid
import zipfile
import json
from io import BytesIO
from pathlib import Path
from datetime import datetime
from flask import current_app, render_template

import urllib.request
from ..models.project import Project, Frame
from ..models.media import OamAsset, MediaAsset
from ..services.theme_resolver import resolve_theme, tokens_to_css
from ..version import VERSION, SCHEMA_VERSION


def build_frame_html(frame, lesson, frame_index, total_frames,
                     frame_map, theme_css, scorm_bridge=False):
    """Render a single SCO HTML page for one frame."""

    blocks_html = _render_blocks(frame.content.get('blocks', []), scorm_bridge)

    return render_template(
        'sco_shell.html',
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


def _render_blocks(blocks, scorm_bridge=False):
    """Convert block list to HTML string."""
    parts = []
    for block in blocks:
        btype = block.get('type')
        data  = block.get('data', {})
        bid   = block.get('id', str(uuid.uuid4()))

        if btype == 'text':
            html = f'<div class="cf-text">{data.get("body","")}</div>'
            if data.get('narrator_script'):
                html += f'<div class="cf-narration">🎙 {data["narrator_script"]}</div>'
            parts.append(html)

        elif btype == 'media' and data.get('kind') == 'video' and data.get('asset_id'):
            asset_id   = data['asset_id']
            use_vjs    = data.get('use_videojs', True)
            companions = data.get('asset_meta', {}).get('companion_files', {}) or {}
            webm_id    = companions.get('webm_asset_id')
            vtt_id     = companions.get('vtt_asset_id')
            poster_id  = companions.get('poster_asset_id')
            title      = data.get('original_name', 'Video')
            caption    = data.get('caption', '')

            mp4_src    = f'media/video/{asset_id}.mp4'
            webm_src   = f'media/video/{webm_id}.webm'   if webm_id   else None
            vtt_src    = f'media/captions/{vtt_id}.vtt'   if vtt_id    else None
            poster_src = f'media/images/{poster_id}.jpg'  if poster_id else None

            sources = ''
            if webm_src:
                sources += f'<source src="{webm_src}" type="video/webm">'
            sources += f'<source src="{mp4_src}" type="video/mp4">'
            track = f'<track kind="captions" src="{vtt_src}" srclang="en" label="English" default>' if vtt_src else ''
            poster_attr = f'poster="{poster_src}"' if poster_src else ''
            cap_html = f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>' if caption else ''

            if use_vjs:
                parts.append(
                    f'<div style="margin-bottom:20px">'
                    f'<video id="vid-{asset_id}" class="video-js vjs-big-play-centered cf-video-player" '
                    f'controls {poster_attr} aria-label="{title}" '
                    f'data-setup=\'{{"playbackRates":[0.5,0.75,1,1.25,1.5,2]}}\'>'
                    f'{sources}{track}'
                    f'<p>Your browser does not support HTML5 video.</p>'
                    f'</video>{cap_html}</div>'
                )
            else:
                parts.append(
                    f'<video controls {poster_attr} style="width:100%;border-radius:6px;margin-bottom:20px" '
                    f'aria-label="{title}">{sources}{track}'
                    f'<p>Your browser does not support HTML5 video.</p></video>{cap_html}'
                )

        elif btype == 'media':
            kind  = data.get('kind', 'image')
            label = data.get('placeholder_label', '')
            cap   = data.get('caption', '')
            icons = {'image':'🖼','video':'🎬','audio':'🎙','oam':'⚙'}
            icon  = icons.get(kind, '📎')
            parts.append(
                f'<div class="cf-media">'
                f'{icon} [{kind}: {label}]'
                f'{"<br><small>" + cap + "</small>" if cap else ""}'
                f'</div>'
            )

        elif btype == 'quiz':
            choices_html = ''
            for i, choice in enumerate(data.get('choices', [])):
                choices_html += (
                    f'<button class="cf-choice" data-index="{i}" '
                    f'onclick="cfSelectChoice(\'{bid}\', this)">'
                    f'{choice}</button>'
                )
            fb_correct   = data.get('feedback_correct',   'Correct!')
            fb_incorrect = data.get('feedback_incorrect', 'Incorrect — please review.')
            correct_idx  = data.get('correct_index', 0)
            parts.append(
                f'<div class="cf-quiz" id="quiz-{bid}">'
                f'<p class="cf-quiz-question">{data.get("question","")}</p>'
                f'{choices_html}'
                f'<button class="cf-submit" '
                f'onclick="cfSubmitQuiz(\'{bid}\', {correct_idx})">Submit</button>'
                f'<div class="cf-feedback correct" id="feedback-{bid}">{fb_correct}</div>'
                f'<div class="cf-feedback incorrect" id="feedback-{bid}-wrong">{fb_incorrect}</div>'
                f'</div>'
            )

        elif btype == 'hotspot':
            regions_html = ''
            for r in data.get('regions', []):
                regions_html += (
                    f'<div class="cf-hotspot-region" '
                    f'style="left:{r["x"]}%;top:{r["y"]}%;'
                    f'width:{r["w"]}%;height:{r["h"]}%">'
                    f'<span class="cf-hotspot-label">{r.get("label","")}</span>'
                    f'</div>'
                )
            parts.append(
                f'<div class="cf-hotspot-wrap">{regions_html}</div>'
            )

        elif btype == 'branch':
            true_label  = data.get('true_label',  'Yes')
            false_label = data.get('false_label', 'No')
            true_frame  = data.get('true_frame_id',  '')
            false_frame = data.get('false_frame_id', '')
            parts.append(
                f'<div class="cf-branch">'
                f'<p class="cf-branch-condition">{data.get("condition","")}</p>'
                f'<div class="cf-branch-btns">'
                f'<button class="cf-branch-btn true" '
                f'onclick="window.location.href=\'{true_frame}.html\'">'
                f'✓ {true_label}</button>'
                f'<button class="cf-branch-btn false" '
                f'onclick="window.location.href=\'{false_frame}.html\'">'
                f'✕ {false_label}</button>'
                f'</div></div>'
            )

        elif btype == 'oam':
            asset_id = data.get('oam_asset_id', '')
            width    = data.get('width',  800)
            height   = data.get('height', 600)
            entry    = data.get('entry_point', 'index.html')
            # In SCORM package, OAM files are bundled at oam/{asset_id}/{entry}
            src = f"oam/{asset_id}/{entry}" if asset_id else ''
            parts.append(
                f'<iframe class="cf-oam-frame" '
                f'src="{src}" '
                f'width="{width}" height="{height}" '
                f'scrolling="no" allowfullscreen '
                f'title="Interactive animation"></iframe>'
            )

    return '\n'.join(parts)


def build_scorm12_package(project_id: str) -> tuple[BytesIO, str]:
    """
    Build a SCORM 1.2 ZIP package for the given project.
    Returns (BytesIO zip buffer, suggested filename).
    Must be called within Flask app context.
    """
    project = Project.query.get_or_404(project_id)
    tokens  = resolve_theme(project)
    css     = tokens_to_css(tokens)

    # Collect all frames in order
    all_frames = []   # list of (frame, lesson, course)
    for course in sorted(project.courses, key=lambda c: c.order_index):
        for mod in sorted(course.modules, key=lambda m: m.order_index):
            for lesson in sorted(mod.lessons, key=lambda l: l.order_index):
                for frame in sorted(lesson.frames, key=lambda f: f.order_index):
                    all_frames.append((frame, lesson, course))

    total = len(all_frames)
    manifest_id = f"cf_{project_id.replace('-','')}"
    org_id      = f"org_{manifest_id}"

    # Build frame filename map {index: filename}
    frame_map  = {}
    items      = []
    resources  = []

    for idx, (frame, lesson, course) in enumerate(all_frames):
        fname = f"frame_{idx:04d}_{frame.id[:8]}.html"
        frame_map[idx] = fname
        res_id = f"res_{idx:04d}"
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

    # Render imsmanifest
    manifest_xml = render_template(
        'imsmanifest.xml',
        manifest_id=manifest_id,
        org_id=org_id,
        project_name=project.name,
        items=items,
        resources=resources,
        cf_version=VERSION,
        publish_date=datetime.utcnow().strftime('%Y-%m-%d'),
    )

    # Build ZIP in memory
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:

        # imsmanifest.xml
        zf.writestr('imsmanifest.xml', manifest_xml)

        # SCO HTML files
        for idx, (frame, lesson, course) in enumerate(all_frames):
            fname = frame_map[idx]
            html  = build_frame_html(
                frame=frame,
                lesson=lesson,
                frame_index=idx,
                total_frames=total,
                frame_map=frame_map,
                theme_css=css,
                scorm_bridge=_has_oam_with_scorm(frame),
            )
            html = (
                f"<!-- CourseForge v{VERSION} | schema {SCHEMA_VERSION} | "
                f"published {datetime.utcnow().strftime('%Y-%m-%d')} -->\n" + html
            )
            zf.writestr(fname, html)

        # ── Bundle OAM assets ──────────────────────────────────────
        bundled_oam_ids = set()
        for idx, (frame, lesson, course) in enumerate(all_frames):
            for block in frame.content.get('blocks', []):
                if block.get('type') != 'oam':
                    continue
                oam_asset_id = block.get('data', {}).get('oam_asset_id')
                if not oam_asset_id or oam_asset_id in bundled_oam_ids:
                    continue
                oam_asset = OamAsset.query.filter_by(media_asset_id=oam_asset_id).first()
                if not oam_asset or not oam_asset.extracted_path:
                    continue
                extract_dir = Path(oam_asset.extracted_path)
                if not extract_dir.exists():
                    continue
                for oam_file in extract_dir.rglob('*'):
                    if oam_file.is_file():
                        arc_path = f"oam/{oam_asset_id}/{oam_file.relative_to(extract_dir)}"
                        zf.write(str(oam_file), arc_path)
                bundled_oam_ids.add(oam_asset_id)

        # ── Bundle Video.js (cached) ───────────────────────────────
        try:
            cache_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'cache' / 'videojs'
            cache_dir.mkdir(parents=True, exist_ok=True)
            videojs_cdn = {
                'assets/video-js/video.min.js':     'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video.min.js',
                'assets/video-js/video-js.min.css': 'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video-js.min.css',
            }
            for arc_path, url in videojs_cdn.items():
                cached = cache_dir / arc_path.split('/')[-1]
                if not cached.exists():
                    urllib.request.urlretrieve(url, str(cached))
                zf.write(str(cached), arc_path)
        except Exception:
            # Network egress unavailable — omit player JS; publish still succeeds.
            pass

        # ── Bundle video + companion media (webm/vtt/poster) ───────
        _bundled_media = set()

        def _bundle_media(stored_path, arc_path):
            if arc_path in _bundled_media:
                return
            if stored_path and Path(stored_path).exists():
                zf.write(stored_path, arc_path)
                _bundled_media.add(arc_path)

        for asset in MediaAsset.query.filter_by(project_id=project_id).all():
            companions = asset.companion_files or {}
            if asset.kind == 'video':
                vext = asset.original_name.rsplit('.', 1)[-1].lower() if '.' in (asset.original_name or '') else 'mp4'
                _bundle_media(asset.stored_path, f'media/video/{asset.id}.{vext}')
            if companions.get('webm_asset_id'):
                webm = MediaAsset.query.get(companions['webm_asset_id'])
                if webm:
                    _bundle_media(webm.stored_path, f'media/video/{webm.id}.webm')
            if companions.get('vtt_asset_id'):
                vtt = MediaAsset.query.get(companions['vtt_asset_id'])
                if vtt:
                    _bundle_media(vtt.stored_path, f'media/captions/{vtt.id}.vtt')
            if companions.get('poster_asset_id'):
                poster = MediaAsset.query.get(companions['poster_asset_id'])
                if poster:
                    pext = poster.original_name.rsplit('.', 1)[-1].lower() if '.' in (poster.original_name or '') else 'jpg'
                    _bundle_media(poster.stored_path, f'media/images/{poster.id}.{pext}')

    buf.seek(0)
    safe_name = project.name.replace(' ', '_').lower()[:40]
    filename  = f"{safe_name}_scorm12_{datetime.utcnow().strftime('%Y%m%d')}.zip"
    return buf, filename


def _has_oam_with_scorm(frame) -> bool:
    for block in frame.content.get('blocks', []):
        if block.get('type') == 'oam' and block.get('data', {}).get('scorm_bridge_enabled'):
            return True
    return False
