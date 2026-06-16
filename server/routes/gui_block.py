"""
GUI block route — accepts a ForgeGUI ZIP, extracts assets,
stores shell config in MediaAsset (kind='gui').
"""

import uuid
import json
import zipfile
import shutil
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from ..extensions import db
from ..models.media import MediaAsset

gui_block_bp = Blueprint('gui_block', __name__)


def get_gui_root():
    upload_root = Path(current_app.config['UPLOAD_FOLDER'])
    gui_root    = upload_root / 'gui_shells'
    gui_root.mkdir(parents=True, exist_ok=True)
    return gui_root


def _safe_extract(zf, dest):
    """Extract a ZIP guarding against path traversal (zip-slip)."""
    dest = Path(dest).resolve()
    for member in zf.namelist():
        target = (dest / member).resolve()
        if not str(target).startswith(str(dest)):
            raise ValueError(f'Unsafe path in ZIP: {member}')
    zf.extractall(str(dest))


@gui_block_bp.post('/api/media/gui')
def upload_gui():
    """
    Upload a ForgeGUI ZIP. Extracts gui_shell.html, gui_shell.json, assets/.
    Form fields: file (ForgeGUI_xxx.zip), project_id.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    f          = request.files['file']
    project_id = request.form.get('project_id')

    if not f.filename or not f.filename.lower().endswith('.zip'):
        return jsonify({'error': 'File must be a ForgeGUI ZIP (.zip).'}), 400

    asset_id = str(uuid.uuid4())
    gui_dir  = get_gui_root() / asset_id
    gui_dir.mkdir(parents=True, exist_ok=True)
    zip_path = str(gui_dir / 'source.zip')
    f.save(zip_path)

    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            _safe_extract(zf, gui_dir)
    except (zipfile.BadZipFile, ValueError):
        shutil.rmtree(str(gui_dir), ignore_errors=True)
        return jsonify({'error': 'Invalid or unsafe ZIP file.'}), 422

    json_files = list(gui_dir.glob('*.json'))
    html_files = list(gui_dir.glob('*.html'))
    if not json_files or not html_files:
        shutil.rmtree(str(gui_dir), ignore_errors=True)
        return jsonify({'error': 'ZIP must contain a .json and .html file. '
                                 'Export from ForgeGUI and try again.'}), 422

    json_path = json_files[0]
    html_path = html_files[0]

    try:
        shell_config = json.loads(json_path.read_text(encoding='utf-8'))
    except Exception:
        shutil.rmtree(str(gui_dir), ignore_errors=True)
        return jsonify({'error': 'Could not parse gui_shell.json.'}), 422

    if shell_config.get('tool') != 'ForgeGUI':
        shutil.rmtree(str(gui_dir), ignore_errors=True)
        return jsonify({'error': 'This ZIP does not appear to be a ForgeGUI export.'}), 422

    stage      = shell_config.get('stage', {})
    shell_name = shell_config.get('name', json_path.stem)

    asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        kind='gui',
        original_name=secure_filename(f.filename),
        stored_path=str(gui_dir),
        file_size=Path(zip_path).stat().st_size,
        mime_type='application/zip',
        companion_files={
            'shell_name':   shell_name,
            'html_file':    html_path.name,
            'json_file':    json_path.name,
            'stage_width':  stage.get('width',  1024),
            'stage_height': stage.get('height', 768),
            'button_count': len(shell_config.get('buttons', [])),
            'zone_count':   len(shell_config.get('zones',   [])),
            'shell_config': shell_config,
        },
    )
    db.session.add(asset)
    db.session.commit()

    return jsonify({
        'id':             asset_id,
        'project_id':     project_id,
        'kind':           'gui',
        'original_name':  asset.original_name,
        'shell_name':     shell_name,
        'stage_width':    stage.get('width',  1024),
        'stage_height':   stage.get('height', 768),
        'button_count':   len(shell_config.get('buttons', [])),
        'zone_count':     len(shell_config.get('zones',   [])),
        'html_serve_url': f'/api/media/gui/{asset_id}/shell.html',
        'json_serve_url': f'/api/media/gui/{asset_id}/shell.json',
    }), 201


@gui_block_bp.get('/api/media/gui/<asset_id>/shell.html')
def serve_gui_html(asset_id):
    asset      = MediaAsset.query.get_or_404(asset_id)
    gui_dir    = Path(asset.stored_path)
    html_file  = (asset.companion_files or {}).get('html_file', '')
    html_path  = gui_dir / html_file
    if not html_path.exists():
        candidates = list(gui_dir.glob('*.html'))
        if not candidates:
            return jsonify({'error': 'Shell HTML not found.'}), 404
        html_path = candidates[0]
    return send_file(str(html_path), mimetype='text/html')


@gui_block_bp.get('/api/media/gui/<asset_id>/shell.json')
def serve_gui_json(asset_id):
    asset      = MediaAsset.query.get_or_404(asset_id)
    companions = asset.companion_files or {}
    config     = companions.get('shell_config', {})
    if not config:
        gui_dir   = Path(asset.stored_path)
        json_file = companions.get('json_file', '')
        json_path = gui_dir / json_file
        if json_path.exists():
            config = json.loads(json_path.read_text(encoding='utf-8'))
    return jsonify(config)


@gui_block_bp.get('/api/media/gui/<asset_id>/assets/<path:filename>')
def serve_gui_asset(asset_id, filename):
    asset    = MediaAsset.query.get_or_404(asset_id)
    gui_dir  = Path(asset.stored_path).resolve()
    target   = (gui_dir / 'assets' / filename).resolve()
    if not target.exists():
        target = (gui_dir / filename).resolve()
    # Traversal guard — keep within the asset's dir.
    if not str(target).startswith(str(gui_dir)) or not target.exists():
        return jsonify({'error': f'Asset not found: {filename}'}), 404
    suffix = target.suffix.lower()
    mime   = {
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif':  'image/gif',
    }.get(suffix, 'application/octet-stream')
    return send_file(str(target), mimetype=mime)
