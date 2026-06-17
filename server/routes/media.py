import os
import json
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from sqlalchemy.orm import selectinload
from ..extensions import db
from ..models.media import MediaAsset, OamAsset
from ..services.oam_importer import ingest_oam, OAMIngestError

media_bp = Blueprint('media', __name__)

ALLOWED_IMAGE   = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}
ALLOWED_VIDEO   = {'mp4', 'mov', 'avi', 'webm', 'mkv'}
ALLOWED_AUDIO   = {'mp3', 'wav', 'ogg', 'm4a', 'aac'}
ALLOWED_CAPTION = {'vtt', 'srt'}
ALLOWED_OAM     = {'oam'}
ALLOWED_3D      = {'glb', 'gltf'}


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

    # Detect audio track on video uploads → caption guardrail can skip silent video.
    if kind == 'video':
        ha = _mp4_has_audio(str(stored_path))
        if ha is not None:
            comp = dict(media_asset.companion_files or {})
            comp['has_audio'] = ha
            media_asset.companion_files = comp
            db.session.commit()

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


# ── ForgeClip .clip.json Upload ───────────────────────────────────────────────

@media_bp.post('/api/media/clip')
def upload_clip():
    """
    Upload a .clip.json file exported from ForgeClip.
    Stored as kind='clip' and paired to its video (by base name, or by an
    explicit video_asset_id when uploaded from an ivideo block's Step 2).
    Multipart form fields: file, project_id, video_asset_id (optional)
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    f          = request.files['file']
    project_id = request.form.get('project_id')
    video_id   = request.form.get('video_asset_id', '')

    if not project_id:
        return jsonify({'error': 'project_id is required.'}), 400
    if not f.filename or not f.filename.lower().endswith('.json'):
        return jsonify({'error': 'File must be a .clip.json file.'}), 400

    try:
        content = json.loads(f.read())
    except Exception:
        return jsonify({'error': 'Invalid JSON in .clip.json file.'}), 422

    if content.get('tool') != 'ForgeClip':
        return jsonify({'error': 'File does not appear to be a ForgeClip export.'}), 422

    asset_id  = str(uuid.uuid4())
    clip_dir  = get_upload_root() / 'clips'
    clip_dir.mkdir(parents=True, exist_ok=True)
    stored    = clip_dir / f"{asset_id}.clip.json"
    payload   = json.dumps(content)
    Path(stored).write_text(payload, encoding='utf-8')

    media_asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        kind='clip',
        original_name=secure_filename(f.filename),
        stored_path=str(stored),
        file_size=len(payload.encode('utf-8')),
        mime_type='application/json',
        companion_files={'video_asset_id': video_id} if video_id else {},
    )
    db.session.add(media_asset)

    # Explicit bidirectional link when an ivideo block supplied the video id
    if video_id:
        video_asset = MediaAsset.query.get(video_id)
        if video_asset:
            comp = dict(video_asset.companion_files or {})
            comp['clip_asset_id'] = asset_id
            video_asset.companion_files = comp

    db.session.commit()

    # Also pair by base name (handles drag-drop of <name>.mp4 + <name>.clip.json)
    _pair_companions(media_asset, project_id)

    return jsonify({
        'id':                asset_id,
        'project_id':        project_id,
        'kind':              'clip',
        'original_name':     media_asset.original_name,
        'serve_url':         f'/api/media/clip/{asset_id}',
        'interaction_count': len(content.get('interactions', [])),
        'video_duration':    content.get('video', {}).get('duration', 0),
        'schema_version':    content.get('schema_version', '1.0'),
    }), 201


@media_bp.get('/api/media/clip/<asset_id>')
def serve_clip(asset_id):
    """Serve a stored .clip.json file."""
    asset = MediaAsset.query.get_or_404(asset_id)
    if not asset.stored_path or not Path(asset.stored_path).exists():
        return jsonify({'error': 'File not found.'}), 404
    return send_file(asset.stored_path, mimetype='application/json')


# ── 3D Model (.glb / .gltf) Upload ────────────────────────────────────────────

@media_bp.post('/api/media/model')
def upload_model():
    """Upload a .glb / .gltf file for a model3d block. Form: file, project_id."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400
    f          = request.files['file']
    project_id = request.form.get('project_id')
    if not f.filename:
        return jsonify({'error': 'No filename.'}), 400
    if not allowed_ext(f.filename, ALLOWED_3D):
        return jsonify({'error': 'File must be .glb or .gltf.'}), 400
    if not project_id:
        return jsonify({'error': 'project_id is required.'}), 400

    asset_id  = str(uuid.uuid4())
    suffix    = '.' + f.filename.rsplit('.', 1)[-1].lower()
    model_dir = get_upload_root() / 'models'
    model_dir.mkdir(parents=True, exist_ok=True)
    stored_path = str(model_dir / f"{asset_id}{suffix}")
    f.save(stored_path)
    file_size = os.path.getsize(stored_path)

    asset = MediaAsset(
        id=asset_id, project_id=project_id, kind='model3d',
        original_name=secure_filename(f.filename), stored_path=stored_path,
        file_size=file_size,
        mime_type='model/gltf-binary' if suffix == '.glb' else 'model/gltf+json',
        companion_files={},
    )
    db.session.add(asset)
    db.session.commit()

    return jsonify({
        'id': asset_id, 'project_id': project_id, 'kind': 'model3d',
        'original_name': asset.original_name, 'file_size': file_size,
        'file_size_mb': round(file_size / 1024 / 1024, 2),
        'serve_url': f'/api/media/model/{asset_id}{suffix}',
    }), 201


@media_bp.get('/api/media/model/<path:filename>')
def serve_model(filename):
    """Serve a .glb / .gltf file (traversal-guarded)."""
    base   = (get_upload_root() / 'models').resolve()
    target = (base / filename).resolve()
    if not str(target).startswith(str(base)) or not target.exists():
        return jsonify({'error': 'Model not found.'}), 404
    mime = 'model/gltf-binary' if target.suffix.lower() == '.glb' else 'model/gltf+json'
    return send_file(str(target), mimetype=mime)


@media_bp.get('/api/media/project/<project_id>')
def list_project_media(project_id):
    """List all media assets for a project."""
    assets = MediaAsset.query.options(selectinload(MediaAsset.oam_asset))\
        .filter_by(project_id=project_id)\
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

    def _base(name):
        n = (name or '').lower()
        if n.endswith('.clip.json'):        # ForgeClip exports <name>.clip.json
            return n[:-len('.clip.json')]
        return n.rsplit('.', 1)[0] if '.' in n else n

    base = _base(asset.original_name)
    ext  = asset.original_name.rsplit('.', 1)[-1].lower() if '.' in (asset.original_name or '') else ''

    # Prefilter in SQL to same-base-name candidates ("<base>.<ext>") instead of
    # loading every asset in the project; keep the exact _base() check below.
    siblings = MediaAsset.query.filter(
        MediaAsset.project_id == project_id,
        MediaAsset.id != asset.id,
        MediaAsset.original_name.ilike(base + '.%'),
    ).all()

    matches = [s for s in siblings if _base(s.original_name) == base]

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

        # Clip (.clip.json) ↔ video companions
        elif ext == 'json' and sib_ext in ('mp4', 'mov', 'webm'):
            companions['video_asset_id']     = sibling.id
            sib_companions['clip_asset_id']  = asset.id
        elif ext in ('mp4', 'mov', 'webm') and sib_ext == 'json':
            companions['clip_asset_id']      = sibling.id
            sib_companions['video_asset_id'] = asset.id

        sibling.companion_files = sib_companions

    asset.companion_files = companions
    db.session.commit()


def _mp4_has_audio(path):
    """Detect whether an MP4 has an audio track, pure-Python (no ffmpeg).
    Returns True / False / None (unknown — non-mp4 or unparseable).

    Walks top-level boxes to 'moov', then looks for an audio handler ('soun')
    in the movie box. Bias is safe for the caption guardrail: audio tracks
    always carry a 'soun' hdlr, so this never returns a false 'no audio'
    (which would wrongly drop the caption requirement); at worst it returns
    True when unsure, keeping the warning.
    """
    try:
        with open(path, 'rb') as fh:
            data = fh.read(4 * 1024 * 1024)  # moov is typically near the front (faststart)
    except Exception:
        return None
    if b'ftyp' not in data[:64]:
        return None

    def find_box(buf, name):
        i = 0
        while i + 8 <= len(buf):
            size = int.from_bytes(buf[i:i + 4], 'big')
            typ  = buf[i + 4:i + 8]
            hdr  = 8
            if size == 1:
                size = int.from_bytes(buf[i + 8:i + 16], 'big'); hdr = 16
            if size < hdr:
                break
            if typ == name:
                return buf[i + hdr:i + size]
            i += size
        return None

    moov = find_box(data, b'moov')
    if moov is None:
        return None
    if b'soun' in moov:   # audio handler present
        return True
    if b'vide' in moov:   # has video track(s) but no audio handler
        return False
    return None


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
        'has_audio':      companions.get('has_audio'),   # True/False/None(unknown)
        'has_clip':       bool(companions.get('clip_asset_id')),
        'clip_asset_id':  companions.get('clip_asset_id'),
        'video_asset_id': companions.get('video_asset_id'),
        'created_at':     asset.created_at.isoformat(),
    }
