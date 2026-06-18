import io
import json
import uuid
import zipfile
from pathlib import Path
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, current_app

clip_bp = Blueprint('clip', __name__)

# In-memory clip store — sufficient for standalone authoring sessions.
# Single gunicorn worker (see railway.toml) keeps this consistent. Bounded so
# it can't grow unbounded; oldest-inserted evicted past the cap. Lost on restart.
CLIPS = {}
CLIPS_MAX = 500

def _clip_put(clip_id, clip):
    CLIPS[clip_id] = clip
    while len(CLIPS) > CLIPS_MAX:
        CLIPS.pop(next(iter(CLIPS)))


@clip_bp.post('/api/clip')
def create_clip():
    """Create a new empty clip session."""
    data    = request.get_json() or {}
    clip_id = str(uuid.uuid4())
    clip    = {
        'id':             clip_id,
        'schema_version': '1.0',
        'tool':           'ForgeClip',
        'tool_version':   '1.0.0',
        'created_at':     datetime.utcnow().isoformat() + 'Z',
        'updated_at':     datetime.utcnow().isoformat() + 'Z',
        'video': {
            'filename':       data.get('filename', ''),
            'duration':       data.get('duration', 0),
            'width':          data.get('width', 1920),
            'height':         data.get('height', 1080),
            'video_asset_id': data.get('video_asset_id', ''),
        },
        'interactions': [],
    }
    _clip_put(clip_id, clip)
    return jsonify(clip), 201


@clip_bp.get('/api/clip/<clip_id>')
def get_clip(clip_id):
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    return jsonify(CLIPS[clip_id])


@clip_bp.put('/api/clip/<clip_id>')
def update_clip(clip_id):
    """Full replace of clip data — called on every autosave."""
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'JSON body required.'}), 400
    data['id']         = clip_id
    data['updated_at'] = datetime.utcnow().isoformat() + 'Z'
    _clip_put(clip_id, data)
    return jsonify(data)


@clip_bp.post('/api/clip/<clip_id>/interaction')
def add_interaction(clip_id):
    """Add a single interaction to a clip."""
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    clip        = CLIPS[clip_id]
    interaction = request.get_json(silent=True)
    if not isinstance(interaction, dict):
        return jsonify({'error': 'JSON body required.'}), 400
    interaction['id'] = str(uuid.uuid4())
    clip.setdefault('interactions', []).append(interaction)
    clip['updated_at'] = datetime.utcnow().isoformat() + 'Z'
    return jsonify(interaction), 201


@clip_bp.put('/api/clip/<clip_id>/interaction/<interaction_id>')
def update_interaction(clip_id, interaction_id):
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    clip = CLIPS[clip_id]
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'JSON body required.'}), 400
    for i, item in enumerate(clip.get('interactions', [])):
        if item.get('id') == interaction_id:
            data['id'] = interaction_id
            clip['interactions'][i] = data
            clip['updated_at'] = datetime.utcnow().isoformat() + 'Z'
            return jsonify(data)
    return jsonify({'error': 'Interaction not found.'}), 404


@clip_bp.delete('/api/clip/<clip_id>/interaction/<interaction_id>')
def delete_interaction(clip_id, interaction_id):
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    clip = CLIPS[clip_id]
    clip['interactions'] = [
        i for i in clip.get('interactions', []) if i.get('id') != interaction_id
    ]
    clip['updated_at'] = datetime.utcnow().isoformat() + 'Z'
    return jsonify({'deleted': interaction_id})


@clip_bp.get('/api/clip/<clip_id>/export')
def export_clip(clip_id):
    """Export clip as downloadable .clip.json file."""
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404

    clip      = CLIPS[clip_id]
    filename  = (clip['video'].get('filename') or 'clip').rsplit('.', 1)[0]
    safe_name = ''.join(c for c in filename if c.isalnum() or c in '-_')[:40] or 'clip'

    # Serve from memory (was writing a .clip.json to uploads/clips/ on every
    # export, never cleaned up).
    buf = io.BytesIO(json.dumps(clip, indent=2).encode('utf-8'))
    return send_file(
        buf,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"{safe_name}.clip.json",
    )


@clip_bp.get('/api/clip/<clip_id>/package')
def export_package(clip_id):
    """
    Export a single drop-in package (.zip) = the uploaded media files (mp4 +
    webm + poster + captions) with the injected <name>.clip.json interaction
    layer. One artifact for the CourseForge ivideo block.
    """
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    clip      = CLIPS[clip_id]
    filename  = (clip['video'].get('filename') or 'clip').rsplit('.', 1)[0]
    safe_name = ''.join(c for c in filename if c.isalnum() or c in '-_')[:40] or 'clip'

    asset_id = clip['video'].get('video_asset_id')
    media_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'videos' / str(asset_id or '')

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        # media files from the per-asset dir
        if asset_id and media_dir.exists():
            for fp in sorted(media_dir.iterdir()):
                if fp.is_file():
                    zf.write(str(fp), fp.name)
        # injected interaction layer
        zf.writestr(f"{safe_name}.clip.json", json.dumps(clip, indent=2))
        # import note
        zf.writestr('README.txt',
            "ForgeClip Interactive Video package\n"
            "===================================\n"
            f"Clip: {clip['video'].get('filename') or '(no video)'}\n"
            f"Interactions: {len(clip.get('interactions', []))}\n\n"
            "Drop this folder's contents (video files + .clip.json) into a\n"
            "CourseForge ivideo block. CourseForge auto-pairs them by name and\n"
            "executes the interactions at their timecodes during playback.\n")

    buf.seek(0)
    return send_file(buf, mimetype='application/zip', as_attachment=True,
                     download_name=f"{safe_name}_clip_package.zip")
