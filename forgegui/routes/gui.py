import json
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, current_app
from services.shell_builder import build_shell_html
from services.json_builder  import build_shell_json

gui_bp = Blueprint('gui', __name__)

# In-memory GUI sessions. Bounded so it can't grow unbounded (one entry is
# created per page load); evict oldest-inserted past the cap. Lost on restart.
GUIS = {}
GUIS_MAX = 500

def _gui_put(gui_id, data):
    GUIS[gui_id] = data
    while len(GUIS) > GUIS_MAX:
        GUIS.pop(next(iter(GUIS)))


@gui_bp.post('/api/gui')
def create_gui():
    """Create a new GUI session."""
    data   = request.get_json() or {}
    gui_id = str(uuid.uuid4())
    gui    = {
        'id':         gui_id,
        'name':       data.get('name', 'Untitled Shell'),
        'created_at': datetime.utcnow().isoformat() + 'Z',
        'updated_at': datetime.utcnow().isoformat() + 'Z',
        'stage': {
            'width':           data.get('width',  1024),
            'height':          data.get('height', 768),
            'background_asset_id': None,
            'background_url':  None,
            'background_file': None,
            'scale_mode':      'fit',
        },
        'content_area': {
            'x':       200, 'y': 80,
            'width':   600, 'height': 500,
            'bg_color':   'transparent',
            'overflow':   'hidden',
        },
        'buttons': [],
        'zones':   [],
    }
    _gui_put(gui_id, gui)
    return jsonify(gui), 201


@gui_bp.post('/api/gui/import-zip')
def import_gui_zip():
    """
    Re-import a ForgeGUI export ZIP for editing. Extracts gui_shell.json +
    assets/, re-saves the background and button sprites with fresh asset IDs
    (so they serve correctly again), and creates a new session.
    """
    import shutil
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f = request.files['file']
    if not f.filename or not f.filename.lower().endswith('.zip'):
        return jsonify({'error': 'File must be a ForgeGUI ZIP (.zip).'}), 400

    upload_root = Path(current_app.config['UPLOAD_FOLDER'])
    tmp = upload_root / 'imports' / str(uuid.uuid4())
    tmp.mkdir(parents=True, exist_ok=True)
    zpath = tmp / 'in.zip'
    f.save(str(zpath))
    try:
        with zipfile.ZipFile(zpath, 'r') as zf:
            dest = tmp.resolve()
            for member in zf.namelist():
                if not str((dest / member).resolve()).startswith(str(dest)):
                    raise ValueError('unsafe zip path')
            zf.extractall(str(tmp))
    except (zipfile.BadZipFile, ValueError):
        shutil.rmtree(str(tmp), ignore_errors=True)
        return jsonify({'error': 'Invalid or unsafe ZIP file.'}), 422

    json_files = list(tmp.glob('*.json'))
    if not json_files:
        shutil.rmtree(str(tmp), ignore_errors=True)
        return jsonify({'error': 'ZIP has no gui_shell.json — is this a ForgeGUI export?'}), 422
    try:
        cfg = json.loads(json_files[0].read_text(encoding='utf-8'))
    except Exception:
        shutil.rmtree(str(tmp), ignore_errors=True)
        return jsonify({'error': 'Could not parse gui_shell.json.'}), 422
    if cfg.get('tool') != 'ForgeGUI':
        shutil.rmtree(str(tmp), ignore_errors=True)
        return jsonify({'error': 'This ZIP does not appear to be a ForgeGUI export.'}), 422

    bg_dir  = upload_root / 'backgrounds'; bg_dir.mkdir(parents=True, exist_ok=True)
    spr_dir = upload_root / 'sprites';     spr_dir.mkdir(parents=True, exist_ok=True)

    def resave(filename, dest_dir, url_prefix):
        if not filename:
            return None, None
        src = tmp / 'assets' / filename
        if not src.exists():
            src = tmp / filename
        if not src.exists():
            return None, None
        aid = str(uuid.uuid4())
        ext = src.suffix or '.png'
        shutil.copy(str(src), str(dest_dir / f'{aid}{ext}'))
        return aid, f'{url_prefix}/{aid}{ext}'

    stage = cfg.get('stage', {})
    if stage.get('background_file'):
        aid, url = resave(stage['background_file'], bg_dir, '/api/assets/background')
        if aid:
            stage['background_asset_id'] = aid
            stage['background_url'] = url

    for b in cfg.get('buttons', []):
        if b.get('asset_mode') == 'spritesheet' and b.get('sprite_file'):
            aid, url = resave(b['sprite_file'], spr_dir, '/api/assets/sprite')
            if aid:
                b['sprite_asset_id'] = aid
                b['sprite_url'] = url
        for info in (b.get('files') or {}).values():
            aid, url = resave(info.get('filename'), spr_dir, '/api/assets/sprite')
            if aid:
                info['asset_id'] = aid
                info['serve_url'] = url

    shutil.rmtree(str(tmp), ignore_errors=True)

    gid = str(uuid.uuid4())
    gui = {
        'id': gid, 'name': cfg.get('name', 'Imported Shell'),
        'created_at': datetime.utcnow().isoformat() + 'Z',
        'updated_at': datetime.utcnow().isoformat() + 'Z',
        'stage': stage,
        'content_area': cfg.get('content_area', {}),
        'buttons': cfg.get('buttons', []),
        'zones': cfg.get('zones', []),
    }
    _gui_put(gid, gui)
    return jsonify(gui), 201


@gui_bp.get('/api/gui/<gui_id>')
def get_gui(gui_id):
    if gui_id not in GUIS:
        return jsonify({'error': 'Not found.'}), 404
    return jsonify(GUIS[gui_id])


@gui_bp.put('/api/gui/<gui_id>')
def update_gui(gui_id):
    if gui_id not in GUIS:
        return jsonify({'error': 'Not found.'}), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'JSON body required.'}), 400
    data['id']         = gui_id
    data['updated_at'] = datetime.utcnow().isoformat() + 'Z'
    _gui_put(gui_id, data)
    return jsonify(data)


def _build_shell_zip(gui):
    """Build the shell export ZIP in memory. Returns (BytesIO buf, safe_name).
    Shared by the download export and the server-to-server send-to-LCMS."""
    safe_name = ''.join(
        c for c in gui['name'] if c.isalnum() or c in '-_ '
    ).strip().replace(' ', '_')[:40] or 'gui_shell'

    # Build the ZIP in memory (was writing 3 files to uploads/outputs/ that
    # were never cleaned up). Asset writes are deduped by archive name so a
    # spritesheet shared by N buttons is written once, not N times.
    shell_html = build_shell_html(gui, current_app.config['UPLOAD_FOLDER'])
    shell_json = build_shell_json(gui)
    UP = Path(current_app.config['UPLOAD_FOLDER'])

    buf     = BytesIO()
    written = set()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        def add_disk(src, arc):
            if arc in written or not Path(src).exists():
                return
            zf.write(str(src), arc)
            written.add(arc)

        zf.writestr(f"{safe_name}.html", shell_html)
        zf.writestr(f"{safe_name}.json", json.dumps(shell_json, indent=2))

        # Include background image
        bg_id  = gui['stage'].get('background_asset_id')
        bg_url = gui['stage'].get('background_url', '')
        if bg_id and bg_url:
            suffix  = Path(bg_url).suffix
            bg_path = UP / 'backgrounds' / f"{bg_id}{suffix}"
            bg_file = gui['stage'].get('background_file', f"bg{suffix}")
            add_disk(bg_path, f"assets/{bg_file}")

        # Include sprite assets (deduped)
        for btn in gui.get('buttons', []):
            if btn.get('asset_mode') == 'spritesheet':
                sid   = btn.get('sprite_asset_id')
                s_url = btn.get('sprite_url', '')
                if sid and s_url:
                    suffix = Path(s_url).suffix
                    add_disk(UP / 'sprites' / f"{sid}{suffix}",
                             f"assets/{btn.get('sprite_file', f'btn_{sid}{suffix}')}")
            elif btn.get('asset_mode') == 'individual':
                for state, info in btn.get('files', {}).items():
                    sid   = info.get('asset_id')
                    s_url = info.get('serve_url', '')
                    if sid and s_url:
                        suffix = Path(s_url).suffix
                        add_disk(UP / 'sprites' / f"{sid}{suffix}",
                                 f"assets/{info.get('filename', f'{state}{suffix}')}")

        # README
        readme = f"""ForgeGUI Shell — {gui['name']}
{'='*(18+len(gui['name']))}
Created:  {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}
Tool:     ForgeGUI v1.0.0
Stage:    {gui['stage']['width']} x {gui['stage']['height']}px
Buttons:  {len(gui.get('buttons', []))}
Zones:    {len(gui.get('zones', []))}

FILES
  {safe_name}.html  — Self-contained GUI shell (SCO page)
  {safe_name}.json  — Shell configuration
  assets/           — Background + button sprites

IMPORT INTO COURSEFORGE
  Drop this ZIP into a CourseForge GUI block.
  CourseForge injects frame content into the
  defined content area. The shell handles all
  navigation via NEXT/PREVIOUS/SUBMIT buttons.

SCORM BRIDGE
  window.API (SCORM 1.2) and window.API_1484_11
  (SCORM 2004) are accessible to the shell.
  Button actions dispatch to the SCORM API
  automatically. Override window.fgui.onAction()
  for custom behavior.
"""
        zf.writestr('README.txt', readme)

    buf.seek(0)
    return buf, safe_name


@gui_bp.get('/api/gui/<gui_id>/export')
def export_gui(gui_id):
    """Export gui_shell.html + gui_shell.json as a downloadable ZIP."""
    if gui_id not in GUIS:
        return jsonify({'error': 'Not found.'}), 404
    buf, safe_name = _build_shell_zip(GUIS[gui_id])
    return send_file(
        buf, mimetype='application/zip', as_attachment=True,
        download_name=f"ForgeGUI_{safe_name}.zip",
    )


@gui_bp.post('/api/gui/<gui_id>/send-to-lcms')
def send_to_lcms(gui_id):
    """Build the shell ZIP and POST it server-to-server to CourseForge's shell
    library (POST /api/gui-shells), so the author skips download → locate →
    import. Cross-origin CORS doesn't apply (this is server-side, not browser)."""
    if gui_id not in GUIS:
        return jsonify({'error': 'Not found.'}), 404
    base = (current_app.config.get('COURSEFORGE_URL') or '').rstrip('/')
    if not base:
        return jsonify({'error': 'COURSEFORGE_URL is not configured.'}), 500
    buf, safe_name = _build_shell_zip(GUIS[gui_id])
    try:
        import httpx
        resp = httpx.post(
            f"{base}/api/gui-shells",
            files={'file': (f"ForgeGUI_{safe_name}.zip", buf.getvalue(), 'application/zip')},
            timeout=60,
        )
    except Exception as e:
        return jsonify({'error': f'Could not reach CourseForge at {base}: {e}'}), 502
    if resp.status_code >= 400:
        return jsonify({'error': f'CourseForge rejected the shell ({resp.status_code}).'}), 502
    try:
        shell = resp.json()
    except Exception:
        shell = {}
    return jsonify({'ok': True, 'shell': shell, 'target': base})
