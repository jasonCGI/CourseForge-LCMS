import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from services.image_processor import start_image_job, get_image_job

image_bp = Blueprint('image', __name__)

ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp', '.gif'}

IMAGE_PRESETS = {
    'web_standard': {
        'label':'Web Standard','description':'WebP q85 · PNG lossless · max 4096px · for CourseForge media',
        'max_dimension':4096,'webp_quality':85,'png_compress':6,'thumb_size':256,
    },
    'high_quality': {
        'label':'High Quality','description':'WebP q92 · PNG lossless · max 4096px · maximum fidelity',
        'max_dimension':4096,'webp_quality':92,'png_compress':3,'thumb_size':256,
    },
    'low_bandwidth': {
        'label':'Low Bandwidth','description':'WebP q72 · PNG compressed · max 2048px · smaller files',
        'max_dimension':2048,'webp_quality':72,'png_compress':9,'thumb_size':192,
    },
}


@image_bp.post('/api/image/upload')
def upload_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        return jsonify({'error': f'Unsupported format: {suffix}. Accepted: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

    preset_key = request.form.get('preset', 'web_standard')
    preset     = IMAGE_PRESETS.get(preset_key, IMAGE_PRESETS['web_standard'])

    safe_name   = secure_filename(f.filename)
    base_name   = Path(safe_name).stem
    file_id     = str(uuid.uuid4())[:8]
    unique_base = f"{base_name}_{file_id}"

    source_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'source' / 'images'
    source_dir.mkdir(parents=True, exist_ok=True)
    input_path = str(source_dir / f"{unique_base}{suffix}")
    f.save(input_path)

    job_id = start_image_job(input_path, unique_base, current_app.config['OUTPUT_FOLDER'], preset)
    return jsonify({'job_id': job_id, 'base_name': unique_base}), 202


@image_bp.get('/api/image/status/<job_id>')
def image_status(job_id):
    job = get_image_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    return jsonify({
        'job_id': job_id, 'status': job['status'], 'progress': job['progress'],
        'message': job['message'], 'error': job.get('error'),
        'original_w': job.get('original_w'), 'original_h': job.get('original_h'),
        'output_w': job.get('output_w'), 'output_h': job.get('output_h'),
        'webp_kb': job.get('webp_kb'), 'png_kb': job.get('png_kb'),
    })


@image_bp.get('/api/image/download/<job_id>')
def image_download(job_id):
    job = get_image_job(job_id)
    if not job:
        return jsonify({'error': 'Job not found.'}), 404
    if job['status'] != 'complete':
        return jsonify({'error': f"Job not ready: {job['status']}"}), 409
    output_path = job.get('output_path')
    if not output_path or not Path(output_path).exists():
        return jsonify({'error': 'Output file not found.'}), 404
    base_name = job.get('base_name', 'forgepack_image')
    return send_file(output_path, mimetype='application/zip', as_attachment=True,
                     download_name=f"{base_name}_forgepack.zip")


@image_bp.get('/api/image/presets')
def image_presets():
    return jsonify([
        {'key': key, 'label': p['label'], 'description': p['description'],
         'max_dim': p['max_dimension'], 'webp_quality': p['webp_quality']}
        for key, p in IMAGE_PRESETS.items()
    ])
