import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from services.audio_processor import start_audio_job, get_audio_job

audio_bp = Blueprint('audio', __name__)

ALLOWED_EXTENSIONS = {
    '.wav', '.aiff', '.aif', '.flac',
    '.mp3', '.m4a', '.aac', '.ogg', '.opus',
}

# Default presets — config.py provides AUDIO_PRESETS; this is the fallback.
AUDIO_PRESETS_DEFAULT = {
    'training_standard': {
        'label':'Training Standard','description':'-16 LUFS · 128kbps MP3 · DoD narration standard',
        'target_lufs':-16,'true_peak':-1.5,'lra':11,'mp3_bitrate':'128k','ogg_quality':'4','m4a_bitrate':'128k',
    },
    'low_bandwidth': {
        'label':'Low Bandwidth','description':'-18 LUFS · 96kbps MP3 · Restricted networks',
        'target_lufs':-18,'true_peak':-2.0,'lra':11,'mp3_bitrate':'96k','ogg_quality':'3','m4a_bitrate':'96k',
    },
    'high_quality': {
        'label':'High Quality','description':'-14 LUFS · 192kbps MP3 · Maximum fidelity',
        'target_lufs':-14,'true_peak':-1.0,'lra':13,'mp3_bitrate':'192k','ogg_quality':'6','m4a_bitrate':'192k',
    },
}


@audio_bp.post('/api/audio/upload')
def upload_audio():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'Unsupported format: {suffix}. Accepted: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    preset_key = request.form.get('preset', 'training_standard')
    presets    = current_app.config.get('AUDIO_PRESETS', AUDIO_PRESETS_DEFAULT)
    preset     = presets.get(preset_key, presets['training_standard'])

    safe_name   = secure_filename(f.filename)
    base_name   = Path(safe_name).stem
    file_id     = str(uuid.uuid4())[:8]
    unique_base = f"{base_name}_{file_id}"

    source_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'source' / 'audio'
    source_dir.mkdir(parents=True, exist_ok=True)
    input_path = str(source_dir / f"{unique_base}{suffix}")
    f.save(input_path)

    job_id = start_audio_job(input_path, unique_base, current_app.config['OUTPUT_FOLDER'], preset)
    return jsonify({'job_id': job_id, 'base_name': unique_base}), 202


@audio_bp.get('/api/audio/status/<job_id>')
def audio_status(job_id):
    job = get_audio_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    return jsonify({
        'job_id': job_id, 'status': job['status'], 'progress': job['progress'],
        'message': job['message'], 'error': job.get('error'),
        'source_lufs': job.get('source_lufs'), 'target_lufs': job.get('target_lufs'),
        'duration': job.get('duration'),
    })


@audio_bp.get('/api/audio/download/<job_id>')
def audio_download(job_id):
    job = get_audio_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    if job['status'] != 'complete':
        return jsonify({'error': f"Job not ready: {job['status']}"}), 409
    output_path = job.get('output_path')
    if not output_path or not Path(output_path).exists():
        return jsonify({'error': 'Output file not found.'}), 404
    base_name = job.get('base_name', 'forgepack_audio')
    return send_file(output_path, mimetype='application/zip', as_attachment=True,
                     download_name=f"{base_name}_forgepack.zip")


@audio_bp.get('/api/audio/presets')
def audio_presets():
    presets = current_app.config.get('AUDIO_PRESETS', AUDIO_PRESETS_DEFAULT)
    return jsonify([
        {'key': key, 'label': p['label'], 'description': p['description'], 'target_lufs': p['target_lufs']}
        for key, p in presets.items()
    ])
