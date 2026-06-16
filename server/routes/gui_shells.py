"""
GUI Shell library — reusable ForgeGUI shells (upload once, select per-project).
"""

import uuid
import json
import zipfile
import shutil
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from ..extensions import db
from ..models.gui_shell import GuiShell
from ..models.project import Project

gui_shells_bp = Blueprint('gui_shells', __name__)


def _lib_root():
    root = Path(current_app.config['UPLOAD_FOLDER']) / 'gui_shells_lib'
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_extract(zf, dest):
    dest = Path(dest).resolve()
    for m in zf.namelist():
        if not str((dest / m).resolve()).startswith(str(dest)):
            raise ValueError('unsafe zip path')
    zf.extractall(str(dest))


@gui_shells_bp.get('/api/gui-shells')
def list_gui_shells():
    items = GuiShell.query.order_by(GuiShell.created_at.desc()).all()
    return jsonify([s.to_dict() for s in items])


@gui_shells_bp.post('/api/gui-shells')
def upload_gui_shell():
    """Upload a ForgeGUI ZIP into the reusable library."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f = request.files['file']
    if not f.filename or not f.filename.lower().endswith('.zip'):
        return jsonify({'error': 'File must be a ForgeGUI ZIP (.zip).'}), 400

    shell_id = str(uuid.uuid4())
    sdir = _lib_root() / shell_id
    sdir.mkdir(parents=True, exist_ok=True)
    zpath = str(sdir / 'source.zip')
    f.save(zpath)
    try:
        with zipfile.ZipFile(zpath, 'r') as zf:
            _safe_extract(zf, sdir)
    except (zipfile.BadZipFile, ValueError):
        shutil.rmtree(str(sdir), ignore_errors=True)
        return jsonify({'error': 'Invalid or unsafe ZIP file.'}), 422

    json_files = list(sdir.glob('*.json'))
    html_files = list(sdir.glob('*.html'))
    if not json_files or not html_files:
        shutil.rmtree(str(sdir), ignore_errors=True)
        return jsonify({'error': 'ZIP must contain a .json and .html (ForgeGUI export).'}), 422
    try:
        cfg = json.loads(json_files[0].read_text(encoding='utf-8'))
    except Exception:
        shutil.rmtree(str(sdir), ignore_errors=True)
        return jsonify({'error': 'Could not parse gui_shell.json.'}), 422
    if cfg.get('tool') != 'ForgeGUI':
        shutil.rmtree(str(sdir), ignore_errors=True)
        return jsonify({'error': 'This ZIP does not appear to be a ForgeGUI export.'}), 422

    stage = cfg.get('stage', {})
    shell = GuiShell(
        id=shell_id,
        name=request.form.get('name') or cfg.get('name') or json_files[0].stem,
        original_name=secure_filename(f.filename),
        stored_path=str(sdir),
        html_file=html_files[0].name,
        json_file=json_files[0].name,
        stage_width=stage.get('width', 1024),
        stage_height=stage.get('height', 768),
        button_count=len(cfg.get('buttons', [])),
        zone_count=len(cfg.get('zones', [])),
        shell_config=cfg,
    )
    db.session.add(shell)
    db.session.commit()
    return jsonify(shell.to_dict()), 201


@gui_shells_bp.get('/api/gui-shells/<shell_id>/shell.html')
def serve_shell_html(shell_id):
    s = GuiShell.query.get_or_404(shell_id)
    p = Path(s.stored_path) / (s.html_file or '')
    if not p.exists():
        cands = list(Path(s.stored_path).glob('*.html'))
        if not cands:
            return jsonify({'error': 'Shell HTML not found.'}), 404
        p = cands[0]
    return send_file(str(p), mimetype='text/html')


@gui_shells_bp.get('/api/gui-shells/<shell_id>/shell.json')
def serve_shell_json(shell_id):
    s = GuiShell.query.get_or_404(shell_id)
    return jsonify(s.shell_config or {})


@gui_shells_bp.get('/api/gui-shells/<shell_id>/assets/<path:filename>')
def serve_shell_asset(shell_id, filename):
    s = GuiShell.query.get_or_404(shell_id)
    base = Path(s.stored_path).resolve()
    target = (base / 'assets' / filename).resolve()
    if not target.exists():
        target = (base / filename).resolve()
    if not str(target).startswith(str(base)) or not target.exists():
        return jsonify({'error': f'Asset not found: {filename}'}), 404
    mime = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.webp': 'image/webp', '.gif': 'image/gif'}.get(target.suffix.lower(), 'application/octet-stream')
    return send_file(str(target), mimetype=mime)


@gui_shells_bp.delete('/api/gui-shells/<shell_id>')
def delete_gui_shell(shell_id):
    s = GuiShell.query.get_or_404(shell_id)
    # Un-select from any project using it.
    for p in Project.query.filter_by(gui_shell_id=shell_id).all():
        p.gui_shell_id = None
    if s.stored_path and Path(s.stored_path).exists():
        shutil.rmtree(s.stored_path, ignore_errors=True)
    db.session.delete(s)
    db.session.commit()
    return jsonify({'deleted': shell_id})
