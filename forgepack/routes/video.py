import os
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from services.video_processor import (
    allowed_video, start_job, get_job, JOBS
)
from config import Config, compose_preset

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
      file       — video file
      resolution — source | 2160 | 1080 | 720   (default 1080)
      quality    — draft | standard | high      (default standard)
    (Legacy: a single `preset` field is still accepted and mapped.)
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

    # Two-axis selection (resolution × quality). A legacy single `preset` key from
    # the old UI maps to a resolution+quality pair for backward compatibility.
    _LEGACY = {'training_standard': ('1080', 'standard'),
               'low_bandwidth':     ('720',  'draft'),
               'high_fidelity':     ('1080', 'high')}
    if request.form.get('preset') in _LEGACY:
        resolution_key, quality_key = _LEGACY[request.form['preset']]
    else:
        resolution_key = request.form.get('resolution', Config.DEFAULT_RESOLUTION)
        quality_key    = request.form.get('quality', Config.DEFAULT_QUALITY)
    preset = compose_preset(resolution_key, quality_key)

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
    """Return the two preset axes (resolution × quality) + their defaults."""
    def _axis(d):
        return [{'key': k, 'label': v['label'], 'description': v['description']} for k, v in d.items()]
    return jsonify({
        'resolutions':       _axis(Config.RESOLUTIONS),
        'qualities':         _axis(Config.QUALITIES),
        'default_resolution': Config.DEFAULT_RESOLUTION,
        'default_quality':    Config.DEFAULT_QUALITY,
    })
