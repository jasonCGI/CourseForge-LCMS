import os
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from services.video_processor import (
    allowed_video, start_job, get_job, JOBS
)

video_bp = Blueprint('video', __name__)

ALLOWED_EXTENSIONS = {
    '.mov','.mp4','.avi','.mts','.m2ts',
    '.mkv','.wmv','.flv','.webm','.m4v',
}


@video_bp.post('/api/video/upload')
def upload_video():
    """
    Upload a source video file and start processing.
    Form fields:
      file   — video file
      preset — training_standard | low_bandwidth | high_fidelity
    Returns: { job_id }
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400

    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'Unsupported format: {suffix}. Accepted: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    preset_key = request.form.get('preset', 'training_standard')
    presets    = current_app.config['PRESETS']
    preset     = presets.get(preset_key, presets['training_standard'])

    # Save source file
    safe_name = secure_filename(f.filename)
    base_name = Path(safe_name).stem
    file_id   = str(uuid.uuid4())[:8]
    unique_base = f"{base_name}_{file_id}"

    source_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'source'
    source_dir.mkdir(parents=True, exist_ok=True)

    input_path = str(source_dir / f"{unique_base}{suffix}")
    f.save(input_path)

    output_dir = current_app.config['OUTPUT_FOLDER']
    job_id     = start_job(input_path, unique_base, output_dir, preset)

    return jsonify({'job_id': job_id, 'base_name': unique_base}), 202


@video_bp.get('/api/video/status/<job_id>')
def job_status(job_id):
    """Poll job status and progress."""
    job = get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    return jsonify({
        'job_id':   job_id,
        'status':   job['status'],
        'progress': job['progress'],
        'message':  job['message'],
        'error':    job.get('error'),
        'has_audio': job.get('has_audio'),
    })


@video_bp.get('/api/video/download/<job_id>')
def download_output(job_id):
    """Download the processed ZIP once job is complete."""
    job = get_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    if job['status'] != 'complete':
        return jsonify({'error': f"Job not ready: {job['status']}"}), 409

    output_path = job.get('output_path')
    if not output_path or not Path(output_path).exists():
        return jsonify({'error': 'Output file not found.'}), 404

    base_name = job.get('base_name', 'forgepack_output')
    return send_file(
        output_path,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"{base_name}_forgepack.zip",
    )


@video_bp.get('/api/video/presets')
def get_presets():
    """Return available quality presets."""
    presets = current_app.config['PRESETS']
    return jsonify([
        {
            'key':         key,
            'label':       p['label'],
            'description': p['description'],
        }
        for key, p in presets.items()
    ])
