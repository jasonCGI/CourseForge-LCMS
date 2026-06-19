"""
Figma -> ForgeGUI importer.

Reads a Figma frame via the REST API and pre-fills a ForgeGUI shell
session (stage / content area / buttons / zones) from named layers, so
authors don't re-enter coordinates by hand.

Layer naming convention (case-insensitive, '-' or '_' separators):
  frame to import   first top-level FRAME on the first page, OR a frame
                    named 'stage' / 'gui' / 'shell'
  bg | background   -> stage background image (exported PNG)
  content-area      -> content area rectangle (region only, not exported)
  btn-<action>      -> button (NEXT/PREVIOUS/SUBMIT/CONTINUE/MENU/REPLAY/
                       HELP/CHECK...); exported PNG = the 'normal' state
  zone-<type>       -> text zone (prompt/feedback/frame_counter/
                       lesson_title/section_title/frame_title)

Auth: single service token from env FIGMA_TOKEN (File-content read scope).
"""

import os
import re
import uuid
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app

figma_bp = Blueprint('figma', __name__)

FIGMA_API = 'https://api.figma.com/v1'
EXPORT_SCALE = 2   # images exported @2x for crisp retina; recorded so the GUI can undo it

ACTION_MAP = {
    'next': 'NEXT', 'prev': 'PREVIOUS', 'previous': 'PREVIOUS', 'back': 'PREVIOUS',
    'submit': 'SUBMIT', 'continue': 'CONTINUE', 'menu': 'MENU', 'replay': 'REPLAY',
    'help': 'HELP', 'check': 'CHECK', 'tryagain': 'TRY_AGAIN', 'try_again': 'TRY_AGAIN',
    'yes': 'YES', 'no': 'NO', 'confirm': 'CONFIRM', 'cancel': 'CANCEL',
}
# Keys are matched against _suffix(), which _norm()s the layer name: lowercased,
# spaces stripped, '_' -> '-'. So every key here must be in that dash form (an
# underscore key like 'frame_title' could never match and would be dead).
ZONE_MAP = {
    'prompt': 'prompt', 'feedback': 'feedback',
    'counter': 'frame_counter', 'frame-counter': 'frame_counter',
    'framecounter': 'frame_counter', 'count': 'frame_counter',
    'lesson': 'lesson_title', 'lesson-title': 'lesson_title', 'lessontitle': 'lesson_title',
    'lesson-name': 'lesson_title', 'lessonname': 'lesson_title',
    'section': 'section_title', 'section-title': 'section_title', 'sectiontitle': 'section_title',
    'section-name': 'section_title', 'sectionname': 'section_title',
    'frame-title': 'frame_title', 'frametitle': 'frame_title', 'title': 'frame_title',
    'frame-name': 'frame_title', 'framename': 'frame_title',
}


def parse_file_key(url_or_key: str) -> str:
    """Extract the Figma file key from a /file/<key>/ or /design/<key>/ URL."""
    if not url_or_key:
        return ''
    m = re.search(r'/(?:file|design)/([A-Za-z0-9]+)', url_or_key)
    if m:
        return m.group(1)
    # Already a bare key
    return url_or_key.strip()


def _norm(name: str) -> str:
    return (name or '').strip().lower().replace(' ', '').replace('_', '-')


def _suffix(name: str, prefix: str) -> str:
    n = _norm(name)
    return n[len(prefix):] if n.startswith(prefix) else ''


def _figma_get(path: str, token: str):
    r = urllib.request.Request(FIGMA_API + path)
    r.add_header('X-Figma-Token', token)
    r.add_header('Accept', 'application/json')
    with urllib.request.urlopen(r, timeout=40) as resp:
        import json as _json
        return _json.loads(resp.read().decode())


def _find_target_frame(document: dict):
    """Prefer a frame named stage/gui/shell; else the first frame WITH layers;
    else the first frame of any kind (so an empty frame is still detected)."""
    named = with_children = any_frame = None
    for page in document.get('children', []):
        if page.get('type') != 'CANVAS':
            continue
        for node in page.get('children', []):
            if node.get('type') not in ('FRAME', 'COMPONENT', 'GROUP', 'SECTION'):
                continue
            if any_frame is None:
                any_frame = node
            if with_children is None and node.get('children'):
                with_children = node
            if named is None and _norm(node.get('name')) in ('stage', 'gui', 'shell'):
                named = node
    return named or with_children or any_frame


def _color_hex(node):
    """First solid fill of a TEXT node as #rrggbb, or None."""
    for fill in (node.get('fills') or []):
        if fill.get('type') == 'SOLID' and fill.get('visible', True):
            c = fill.get('color', {})
            return '#%02X%02X%02X' % (
                round(c.get('r', 0) * 255), round(c.get('g', 0) * 255), round(c.get('b', 0) * 255))
    return None


def map_layout(frame: dict) -> dict:
    """Pure mapping: Figma frame node -> partial ForgeGUI gui dict.
    Buttons/bg carry a `_node_id` for later image export. No I/O."""
    fb = frame.get('absoluteBoundingBox') or {}
    fx, fy = fb.get('x', 0), fb.get('y', 0)
    stage_w, stage_h = round(fb.get('width', 1024)), round(fb.get('height', 768))

    def rel(node):
        b = node.get('absoluteBoundingBox') or {}
        return (round(b.get('x', 0) - fx), round(b.get('y', 0) - fy),
                round(b.get('width', 0)), round(b.get('height', 0)))

    out = {
        'stage': {'width': stage_w, 'height': stage_h, 'scale_mode': 'fit'},
        'content_area': {'x': 0, 'y': 0, 'width': stage_w, 'height': stage_h,
                         'bg_color': 'transparent', 'overflow': 'auto'},
        'buttons': [], 'zones': [], 'bg_node_id': None, 'warnings': [],
    }
    tab = 1
    for node in frame.get('children', []):
        n = _norm(node.get('name'))
        x, y, w, h = rel(node)
        if n in ('bg', 'background'):
            out['bg_node_id'] = node.get('id')
        elif n in ('content-area', 'content', 'contentarea'):
            out['content_area'] = {'x': x, 'y': y, 'width': w, 'height': h,
                                   'bg_color': 'transparent', 'overflow': 'auto'}
        elif n.startswith('btn-'):
            suf = _suffix(node.get('name'), 'btn-')
            action = ACTION_MAP.get(suf, suf.upper() or 'NEXT')
            out['buttons'].append({
                'id': 'btn-' + uuid.uuid4().hex[:8], 'action': action,
                'label': action.replace('_', ' ').title(),
                'x': x, 'y': y, 'width': w, 'height': h,
                'asset_mode': 'individual', 'files': {}, 'states': {},
                'sprite_asset_id': None, 'sprite_url': None,
                'visible': True, 'enabled': True, 'tab_index': tab,
                '_node_id': node.get('id'),
            })
            tab += 1
        elif n.startswith('zone-'):
            suf = _suffix(node.get('name'), 'zone-')
            ztype = ZONE_MAP.get(suf, 'prompt')
            zone = {
                'id': 'zone-' + uuid.uuid4().hex[:8], 'type': ztype,
                'x': x, 'y': y, 'width': w, 'height': h,
                'font_family': 'IBM Plex Mono, monospace',
                'font_size': 13, 'font_weight': 400, 'color': '#C8D8E8',
                'bg_color': 'transparent', 'align': 'left',
                'padding': '4px 8px', 'overflow': 'hidden',
            }
            if node.get('type') == 'TEXT':
                style = node.get('style', {})
                if style.get('fontSize'):
                    zone['font_size'] = round(style['fontSize'])
                align = (style.get('textAlignHorizontal') or '').lower()
                if align in ('left', 'center', 'right'):
                    zone['align'] = align
                col = _color_hex(node)
                if col:
                    zone['color'] = col
            if ztype == 'frame_counter':
                zone['format'] = '{current} / {total}'
            out['zones'].append(zone)
    return out


def _download(url: str, dest: str, max_bytes: int = 50 * 1024 * 1024):
    """Stream a Figma asset to disk (was buffering the whole image in RAM via
    resp.read()), with a size cap so a hostile/huge export can't OOM the worker."""
    import shutil
    req = urllib.request.Request(url, headers={'User-Agent': 'ForgeGUI'})
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest, 'wb') as fh:
        total = 0
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ValueError('Figma asset exceeds size limit')
            fh.write(chunk)


@figma_bp.post('/api/figma/import')
def import_from_figma():
    """
    Import a Figma frame into a new ForgeGUI shell session.
    Body: { "file_url": "<figma url or key>" }
    """
    token = os.environ.get('FIGMA_TOKEN')
    if not token:
        return jsonify({'error': 'FIGMA_TOKEN is not configured on the server.'}), 400

    body = request.get_json(silent=True) or {}
    key  = parse_file_key(body.get('file_url') or body.get('file_key') or '')
    if not key:
        return jsonify({'error': 'Provide a Figma file URL or key.'}), 400

    # 1. Read the file
    try:
        data = _figma_get(f'/files/{key}?depth=4', token)
    except urllib.error.HTTPError as e:
        msg = 'Figma file not found or token lacks access.' if e.code in (403, 404) \
              else f'Figma API error {e.code}.'
        return jsonify({'error': msg}), 502
    except Exception as e:
        return jsonify({'error': f'Could not reach Figma: {e}'}), 502

    frame = _find_target_frame(data.get('document', {}))
    if not frame:
        return jsonify({'error': 'No frame found in the Figma file. Add a frame '
                                 '(named "stage" or "gui") containing bg / content-area / '
                                 'btn-* / zone-* layers.'}), 422

    layout = map_layout(frame)

    # Frame found but no recognized layers -> clearer guidance than a generic error.
    ca = layout['content_area']
    layers_empty = (not layout['bg_node_id'] and not layout['buttons']
                    and not layout['zones']
                    and ca['x'] == 0 and ca['y'] == 0
                    and ca['width'] == layout['stage']['width']
                    and ca['height'] == layout['stage']['height'])
    if layers_empty:
        return jsonify({'error': f"Frame '{frame.get('name')}' has no recognized layers. "
                                 "Add layers named bg / content-area / btn-<action> / "
                                 "zone-<type> inside it, then re-import."}), 422

    # 2. Export images for bg + each button (one Figma call)
    export_ids = [layout['bg_node_id']] if layout['bg_node_id'] else []
    export_ids += [b['_node_id'] for b in layout['buttons'] if b.get('_node_id')]
    images = {}
    if export_ids:
        ids_param = ','.join(export_ids)
        try:
            img_resp = _figma_get(f'/images/{key}?ids={ids_param}&format=png&scale={EXPORT_SCALE}', token)
            images = img_resp.get('images', {}) or {}
        except Exception as e:
            layout['warnings'].append(f'Image export failed: {e}')

    upload_root = Path(current_app.config['UPLOAD_FOLDER'])
    bg_dir  = upload_root / 'backgrounds'; bg_dir.mkdir(parents=True, exist_ok=True)
    spr_dir = upload_root / 'sprites';     spr_dir.mkdir(parents=True, exist_ok=True)

    # 3. Background
    if layout['bg_node_id'] and images.get(layout['bg_node_id']):
        aid = str(uuid.uuid4())
        try:
            _download(images[layout['bg_node_id']], str(bg_dir / f'{aid}.png'))
            layout['stage'].update({
                'background_asset_id': aid,
                'background_url': f'/api/assets/background/{aid}.png',
                'background_file': 'background.png',
                'export_scale': EXPORT_SCALE,
            })
        except Exception as e:
            layout['warnings'].append(f'Background download failed: {e}')
    else:
        layout['stage'].setdefault('background_asset_id', None)
        layout['stage'].setdefault('background_url', None)
        layout['stage'].setdefault('background_file', None)
        if not layout['bg_node_id']:
            layout['warnings'].append('No "bg" layer found — stage has no background.')

    # 4. Button sprites (individual normal-state PNGs)
    for b in layout['buttons']:
        nid = b.pop('_node_id', None)
        if nid and images.get(nid):
            aid = str(uuid.uuid4())
            try:
                _download(images[nid], str(spr_dir / f'{aid}.png'))
                b['files'] = {'normal': {
                    'asset_id': aid,
                    'filename': f'{b["action"].lower()}_normal.png',
                    'serve_url': f'/api/assets/sprite/{aid}.png',
                }}
                b['export_scale'] = EXPORT_SCALE   # PNG is 2x the button bounds
            except Exception as e:
                layout['warnings'].append(f'Button "{b["action"]}" sprite download failed: {e}')

    # 5. Build + store the gui session (same shape as create_gui)
    from routes.gui import _gui_put
    gid = str(uuid.uuid4())
    gui = {
        'id': gid,
        'name': data.get('name', 'Figma Import'),
        'created_at': datetime.utcnow().isoformat() + 'Z',
        'updated_at': datetime.utcnow().isoformat() + 'Z',
        'stage': layout['stage'],
        'content_area': layout['content_area'],
        'buttons': layout['buttons'],
        'zones': layout['zones'],
    }
    _gui_put(gid, gui)

    return jsonify({
        **gui,
        'source': 'figma',
        'frame_name': frame.get('name'),
        'imported': {
            'buttons': len(gui['buttons']),
            'zones': len(gui['zones']),
            'has_background': bool(gui['stage'].get('background_asset_id')),
        },
        'warnings': layout['warnings'],
    }), 201
