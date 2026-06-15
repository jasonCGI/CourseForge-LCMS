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

from ..models.project import Project, Frame
from ..services.theme_resolver import resolve_theme, tokens_to_css


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
            parts.append(
                f'<iframe class="cf-oam-frame" '
                f'src="oam/{asset_id}/{entry}" '
                f'width="{width}" height="{height}" '
                f'scrolling="no" allowfullscreen></iframe>'
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
            zf.writestr(fname, html)

    buf.seek(0)
    safe_name = project.name.replace(' ', '_').lower()[:40]
    filename  = f"{safe_name}_scorm12_{datetime.utcnow().strftime('%Y%m%d')}.zip"
    return buf, filename


def _has_oam_with_scorm(frame) -> bool:
    for block in frame.content.get('blocks', []):
        if block.get('type') == 'oam' and block.get('data', {}).get('scorm_bridge_enabled'):
            return True
    return False
