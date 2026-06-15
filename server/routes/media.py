import os
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from ..extensions import db
from ..models.media import MediaAsset, OamAsset
from ..services.oam_importer import ingest_oam, OAMIngestError

media_bp = Blueprint('media', __name__)

ALLOWED_IMAGE   = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}
ALLOWED_VIDEO   = {'mp4', 'mov', 'avi', 'webm', 'mkv'}
ALLOWED_AUDIO   = {'mp3', 'wav', 'ogg', 'm4a', 'aac'}
ALLOWED_CAPTION = {'vtt', 'srt'}
ALLOWED_OAM     = {'oam'}


def allowed_ext(filename, allowed_set):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_set


def get_upload_root() -> Path:
    return Path(current_app.config['UPLOAD_FOLDER'])


# ── OAM Upload ────────────────────────────────────────────────────────────────

@media_bp.post('/api/media/oam')
def upload_oam():
    """
    Upload a .oam file.
    Multipart form fields:
      file       — the .oam file
      project_id — UUID of the parent project
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    f          = request.files['file']
    project_id = request.form.get('project_id')

    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400

    if not allowed_ext(f.filename, ALLOWED_OAM):
        return jsonify({'error': 'File must be a .oam file.'}), 400

    if not project_id:
        return jsonify({'error': 'project_id is required.'}), 400

    asset_id    = str(uuid.uuid4())
    upload_root = get_upload_root()
    oam_dir     = upload_root / 'oam' / asset_id
    oam_dir.mkdir(parents=True, exist_ok=True)

    original_path = oam_dir / 'original.oam'
    f.save(str(original_path))

    # Ingest
    try:
        meta = ingest_oam(original_path, asset_id, upload_root)
    except OAMIngestError as e:
        # Clean up on failure
        import shutil
        shutil.rmtree(str(oam_dir), ignore_errors=True)
        return jsonify({'error': str(e)}), 422

    # Create DB records
    media_asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        kind='oam',
        original_name=secure_filename(f.filename),
        stored_path=str(original_path),
        file_size=os.path.getsize(str(original_path)),
        mime_type='application/vnd.adobe.oam+zip',
    )
    db.session.add(media_asset)
    db.session.flush()

    oam_asset = OamAsset(
        media_asset_id=asset_id,
        **meta,
    )
    db.session.add(oam_asset)
    db.session.commit()

    return jsonify(_serialize_oam(media_asset, oam_asset)), 201


@media_bp.get('/api/media/oam/<asset_id>')
def get_oam(asset_id):
    """Return OAM asset metadata."""
    media_asset = MediaAsset.query.get_or_404(asset_id)
    oam_asset   = OamAsset.query.filter_by(media_asset_id=asset_id).first_or_404()
    return jsonify(_serialize_oam(media_asset, oam_asset))


@media_bp.get('/api/media/oam/<asset_id>/files/<path:file_path>')
def serve_oam_file(asset_id, file_path):
    """
    Serve an extracted OAM file — used as the iframe src in the SCO page.
    e.g. GET /api/media/oam/{id}/files/index.html
    """
    oam_asset   = OamAsset.query.filter_by(media_asset_id=asset_id).first_or_404()
    extract_dir = Path(oam_asset.extracted_path)
    target      = extract_dir / file_path

    # Security: ensure the resolved path stays within extracted_path
    try:
        target.resolve().relative_to(extract_dir.resolve())
    except ValueError:
        return jsonify({'error': 'Path traversal not allowed.'}), 403

    if not target.exists():
        return jsonify({'error': 'File not found.'}), 404

    return send_file(str(target))


def _serialize_oam(media_asset, oam_asset):
    return {
        'id':               media_asset.id,
        'project_id':       media_asset.project_id,
        'kind':             'oam',
        'original_name':    media_asset.original_name,
        'file_size':        media_asset.file_size,
        'entry_point':      oam_asset.entry_point,
        'width':            oam_asset.width,
        'height':           oam_asset.height,
        'responsive':       oam_asset.responsive,
        'has_audio':        oam_asset.has_audio,
        'has_scorm_calls':  oam_asset.has_scorm_calls,
        'asset_file_tree':  oam_asset.asset_file_tree,
        'iframe_src':       f'/api/media/oam/{media_asset.id}/files/{oam_asset.entry_point}',
        'created_at':       media_asset.created_at.isoformat(),
    }


# ── Generic Media Upload ──────────────────────────────────────────────────────

@media_bp.post('/api/media')
def upload_media():
    """
    Upload an image, video, or audio file.
    Multipart form fields:
      file       — the media file
      project_id — UUID of the parent project
      kind       — image | video | audio (auto-detected if omitted)
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    f          = request.files['file']
    project_id = request.form.get('project_id')

    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400

    if not project_id:
        return jsonify({'error': 'project_id is required.'}), 400

    # Detect kind from extension
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''

    if ext in ALLOWED_IMAGE:
        kind = 'image'
        subdir = 'images'
    elif ext in ALLOWED_VIDEO:
        kind = 'video'
        subdir = 'video'
    elif ext in ALLOWED_AUDIO:
        kind = 'audio'
        subdir = 'audio'
    elif ext in ALLOWED_CAPTION:
        kind = 'caption'
        subdir = 'captions'
    else:
        return jsonify({'error': f'Unsupported file type: .{ext}'}), 400

    # Override with explicit kind if provided
    provided_kind = request.form.get('kind')
    if provided_kind in ('image', 'video', 'audio'):
        kind = provided_kind

    asset_id    = str(uuid.uuid4())
    upload_root = get_upload_root()
    media_dir   = upload_root / 'media' / subdir
    media_dir.mkdir(parents=True, exist_ok=True)

    safe_name     = secure_filename(f.filename)
    stored_name   = f"{asset_id}_{safe_name}"
    stored_path   = media_dir / stored_name

    f.save(str(stored_path))

    media_asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        kind=kind,
        original_name=safe_name,
        stored_path=str(stored_path),
        file_size=os.path.getsize(str(stored_path)),
        mime_type=f.mimetype or f'{kind}/{ext}',
    )
    db.session.add(media_asset)
    db.session.commit()

    _pair_companions(media_asset, project_id)

    return jsonify(_serialize_media(media_asset)), 201


@media_bp.get('/api/media/<asset_id>')
def get_media(asset_id):
    """Return media asset metadata."""
    asset = MediaAsset.query.get_or_404(asset_id)
    if asset.kind == 'oam':
        oam = OamAsset.query.filter_by(media_asset_id=asset_id).first_or_404()
        return jsonify(_serialize_oam(asset, oam))
    return jsonify(_serialize_media(asset))


@media_bp.get('/api/media/serve/<asset_id>')
def serve_media(asset_id):
    """Serve an uploaded media file."""
    asset = MediaAsset.query.get_or_404(asset_id)
    if not asset.stored_path or not Path(asset.stored_path).exists():
        return jsonify({'error': 'File not found on disk.'}), 404
    return send_file(asset.stored_path, mimetype=asset.mime_type)


@media_bp.get('/api/media/project/<project_id>')
def list_project_media(project_id):
    """List all media assets for a project."""
    assets = MediaAsset.query.filter_by(project_id=project_id)\
        .order_by(MediaAsset.created_at.desc()).all()
    result = []
    for a in assets:
        if a.kind == 'oam' and a.oam_asset:
            result.append(_serialize_oam(a, a.oam_asset))
        else:
            result.append(_serialize_media(a))
    return jsonify(result)


def _pair_companions(asset: MediaAsset, project_id: str) -> None:
    """
    After uploading a media file, scan existing project assets for
    companion files with the same base name and link them bidirectionally.
    """
    if not asset.original_name:
        return

    base = asset.original_name.rsplit('.', 1)[0].lower()
    ext  = asset.original_name.rsplit('.', 1)[-1].lower() if '.' in asset.original_name else ''

    siblings = MediaAsset.query.filter(
        MediaAsset.project_id == project_id,
        MediaAsset.id != asset.id,
    ).all()

    def base_name(name):
        return name.rsplit('.', 1)[0].lower() if name and '.' in name else (name or '').lower()

    matches = [s for s in siblings if base_name(s.original_name) == base]

    companions = dict(asset.companion_files or {})

    for sibling in matches:
        sib_ext = sibling.original_name.rsplit('.', 1)[-1].lower()
        sib_companions = dict(sibling.companion_files or {})

        # Video companions
        if ext in ('mp4', 'mov') and sib_ext == 'webm':
            companions['webm_asset_id']     = sibling.id
            sib_companions['mp4_asset_id']  = asset.id
        elif ext in ('mp4', 'mov') and sib_ext == 'vtt':
            companions['vtt_asset_id']      = sibling.id
            sib_companions['mp4_asset_id']  = asset.id
        elif ext in ('mp4', 'mov') and sib_ext in ('jpg', 'jpeg', 'png'):
            companions['poster_asset_id']   = sibling.id
            sib_companions['video_asset_id'] = asset.id
        elif ext in ('jpg', 'jpeg', 'png') and sib_ext in ('mp4', 'mov'):
            companions['video_asset_id']     = sibling.id
            sib_companions['poster_asset_id'] = asset.id
        elif ext == 'webm' and sib_ext in ('mp4', 'mov'):
            companions['mp4_asset_id']      = sibling.id
            sib_companions['webm_asset_id'] = asset.id
        elif ext == 'vtt' and sib_ext in ('mp4', 'mov', 'webm'):
            companions['video_asset_id']    = sibling.id
            sib_companions['vtt_asset_id']  = asset.id

        # Audio companions
        elif ext == 'wav' and sib_ext == 'mp3':
            companions['mp3_asset_id']      = sibling.id
            sib_companions['wav_asset_id']  = asset.id
        elif ext == 'wav' and sib_ext == 'ogg':
            companions['ogg_asset_id']      = sibling.id
            sib_companions['wav_asset_id']  = asset.id
        elif ext == 'mp3' and sib_ext == 'ogg':
            companions['ogg_asset_id']      = sibling.id
            sib_companions['mp3_asset_id']  = asset.id

        sibling.companion_files = sib_companions

    asset.companion_files = companions
    db.session.commit()


def _serialize_media(asset):
    companions = asset.companion_files or {}
    return {
        'id':             asset.id,
        'project_id':     asset.project_id,
        'kind':           asset.kind,
        'original_name':  asset.original_name,
        'file_size':      asset.file_size,
        'mime_type':      asset.mime_type,
        'serve_url':      f'/api/media/serve/{asset.id}',
        'companion_files': companions,
        'has_captions':   bool(companions.get('vtt_asset_id')),
        'has_webm':       bool(companions.get('webm_asset_id')),
        'has_poster':     bool(companions.get('poster_asset_id')),
        'created_at':     asset.created_at.isoformat(),
    }
