import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename

media_bp = Blueprint('media', __name__)

ALLOWED_VIDEO = {'.mp4', '.webm', '.mov', '.m4v'}
# Files we pull out of a ForgePack package (mp4/webm/poster/captions).
COMPANION_EXTS = {'.mp4', '.webm', '.jpg', '.jpeg', '.png', '.vtt', '.srt'}


def _asset_dir(asset_id: str) -> Path:
    d = Path(current_app.config['UPLOAD_FOLDER']) / 'videos' / asset_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _mime_for(suffix: str) -> str:
    s = suffix.lower().lstrip('.')
    return {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'vtt': 'text/vtt', 'srt': 'text/plain'}.get(s, f'video/{s}')


@media_bp.post('/api/media/video')
def upload_video():
    """Upload a single raw video for preview (stored in a per-asset dir)."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_VIDEO:
        return jsonify({'error': f'Unsupported: {suffix}. Use .mp4 or .webm (or a ForgePack .zip).'}), 400

    asset_id  = str(uuid.uuid4())
    safe_name = secure_filename(f.filename)
    f.save(str(_asset_dir(asset_id) / safe_name))

    return jsonify({
        'asset_id':   asset_id,
        'filename':   safe_name,
        'serve_url':  f'/api/media/video/{asset_id}/{safe_name}',
        'mime_type':  _mime_for(suffix),
        'companions': {},
    }), 201


@media_bp.post('/api/media/zip')
def upload_zip():
    """
    Accept a ForgePack output .zip (mp4 + webm + poster + vtt), extract it into
    a per-asset dir, and return the MP4 for preview plus companion filenames.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f = request.files['file']
    if not f.filename or Path(f.filename).suffix.lower() != '.zip':
        return jsonify({'error': 'Upload a .zip (ForgePack output).'}), 400

    try:
        zf = zipfile.ZipFile(BytesIO(f.read()))
    except zipfile.BadZipFile:
        return jsonify({'error': 'Not a valid .zip file.'}), 400

    asset_id = str(uuid.uuid4())
    out_dir  = _asset_dir(asset_id)
    extracted = {}
    for name in zf.namelist():
        base = Path(name).name              # flatten; ignore folders / paths (zip-slip safe)
        if not base:
            continue
        ext = Path(base).suffix.lower()
        if ext not in COMPANION_EXTS:
            continue
        safe = secure_filename(base)
        (out_dir / safe).write_bytes(zf.read(name))
        extracted.setdefault(ext, safe)

    mp4 = extracted.get('.mp4')
    if not mp4:
        return jsonify({'error': 'No .mp4 found in the package.'}), 400

    companions = {
        'webm':    extracted.get('.webm'),
        'poster':  extracted.get('.jpg') or extracted.get('.jpeg') or extracted.get('.png'),
        'captions': extracted.get('.vtt') or extracted.get('.srt'),
    }
    return jsonify({
        'asset_id':   asset_id,
        'filename':   mp4,
        'serve_url':  f'/api/media/video/{asset_id}/{mp4}',
        'mime_type':  'video/mp4',
        'companions': {k: v for k, v in companions.items() if v},
    }), 201


@media_bp.get('/api/media/video/<path:filename>')
def serve_video(filename):
    """Serve an uploaded media file (path may include the per-asset dir)."""
    base = Path(current_app.config['UPLOAD_FOLDER']) / 'videos'
    target = (base / filename).resolve()
    # zip-slip / traversal guard
    if not str(target).startswith(str(base.resolve())) or not target.exists():
        return jsonify({'error': 'Not found.'}), 404
    return send_file(str(target), mimetype=_mime_for(target.suffix))
