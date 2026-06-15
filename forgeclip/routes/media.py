import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename

media_bp = Blueprint('media', __name__)

ALLOWED = {'.mp4', '.webm', '.mov', '.m4v'}


@media_bp.post('/api/media/video')
def upload_video():
    """Upload a video file for preview in the timeline editor."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400

    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED:
        return jsonify({'error': f'Unsupported: {suffix}. Use .mp4 or .webm.'}), 400

    asset_id    = str(uuid.uuid4())
    safe_name   = secure_filename(f.filename)
    video_dir   = Path(current_app.config['UPLOAD_FOLDER']) / 'videos'
    video_dir.mkdir(parents=True, exist_ok=True)
    stored_path = str(video_dir / f"{asset_id}{suffix}")
    f.save(stored_path)

    return jsonify({
        'asset_id':  asset_id,
        'filename':  safe_name,
        'serve_url': f'/api/media/video/{asset_id}{suffix}',
        'mime_type': f'video/{suffix[1:]}',
    }), 201


@media_bp.get('/api/media/video/<path:filename>')
def serve_video(filename):
    """Serve an uploaded video file."""
    video_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'videos'
    target    = video_dir / filename
    if not target.exists():
        return jsonify({'error': 'Not found.'}), 404
    suffix = target.suffix.lower()
    return send_file(str(target), mimetype=f'video/{suffix[1:]}')
