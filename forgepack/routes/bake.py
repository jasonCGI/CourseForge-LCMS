import uuid
import json
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from services.bake_processor import start_bake_job, get_bake_job, allowed_video

bake_bp = Blueprint('bake', __name__)


@bake_bp.post('/api/bake')
def bake():
    """Accept source video + .clip.json, run the bake pipeline. Returns {job_id}."""
    if 'video' not in request.files or 'clip' not in request.files:
        return jsonify({'error': 'Both video and clip files are required.'}), 400

    video_file = request.files['video']
    clip_file  = request.files['clip']

    if not video_file.filename or not allowed_video(video_file.filename):
        return jsonify({'error': 'Video must be .mp4, .mov, or .webm.'}), 400
    if not clip_file.filename or not clip_file.filename.lower().endswith('.json'):
        return jsonify({'error': 'Clip must be a .clip.json file.'}), 400

    try:
        clip_data = json.loads(clip_file.read())
    except Exception:
        return jsonify({'error': 'Invalid JSON in clip file.'}), 422

    if clip_data.get('baked'):
        return jsonify({'error': 'This clip.json is already baked. Use the source clip.json from the mediaPackage to re-bake.'}), 422
    if not clip_data.get('interactions'):
        return jsonify({'error': 'No interactions found in clip.json. Add interactions in ForgeClip before baking.'}), 422

    safe_name   = secure_filename(video_file.filename)
    base_name   = Path(safe_name).stem
    unique_base = f"{base_name}_{str(uuid.uuid4())[:8]}"

    source_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'source' / 'bake'
    source_dir.mkdir(parents=True, exist_ok=True)
    video_path = str(source_dir / f"{unique_base}{Path(safe_name).suffix.lower()}")
    video_file.save(video_path)

    job_id = start_bake_job(video_path, clip_data, base_name, current_app.config['OUTPUT_FOLDER'])
    return jsonify({
        'job_id': job_id,
        'base_name': base_name,
        'interaction_count': len(clip_data.get('interactions', [])),
    }), 202


@bake_bp.get('/api/bake/status/<job_id>')
def bake_status(job_id):
    job = get_bake_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    return jsonify({
        'job_id': job_id, 'status': job['status'], 'progress': job['progress'],
        'message': job['message'], 'error': job.get('error'),
        'hold_count': job.get('hold_count'), 'baked_duration': job.get('baked_duration'),
        'timecode_map': job.get('timecode_map'),
    })


@bake_bp.get('/api/bake/download/<job_id>')
def bake_download(job_id):
    job = get_bake_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    if job['status'] != 'complete':
        return jsonify({'error': f"Job not ready: {job['status']}"}), 409
    output_path = job.get('output_path')
    if not output_path or not Path(output_path).exists():
        return jsonify({'error': 'Output file not found.'}), 404
    return send_file(output_path, mimetype='application/zip', as_attachment=True,
                     download_name=f"mediaPackage_{job.get('base_name', 'clip')}.zip")
