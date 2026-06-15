import json
import uuid
from pathlib import Path
from datetime import datetime
from flask import Blueprint, request, jsonify, send_file, current_app

clip_bp = Blueprint('clip', __name__)

# In-memory clip store — sufficient for standalone authoring sessions.
# Single gunicorn worker (see railway.toml) keeps this consistent.
CLIPS = {}


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
    CLIPS[clip_id] = clip
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
    data = request.get_json()
    data['id']         = clip_id
    data['updated_at'] = datetime.utcnow().isoformat() + 'Z'
    CLIPS[clip_id]     = data
    return jsonify(data)


@clip_bp.post('/api/clip/<clip_id>/interaction')
def add_interaction(clip_id):
    """Add a single interaction to a clip."""
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    clip        = CLIPS[clip_id]
    interaction = request.get_json()
    interaction['id'] = str(uuid.uuid4())
    clip['interactions'].append(interaction)
    clip['updated_at'] = datetime.utcnow().isoformat() + 'Z'
    return jsonify(interaction), 201


@clip_bp.put('/api/clip/<clip_id>/interaction/<interaction_id>')
def update_interaction(clip_id, interaction_id):
    if clip_id not in CLIPS:
        return jsonify({'error': 'Clip not found.'}), 404
    clip = CLIPS[clip_id]
    for i, item in enumerate(clip['interactions']):
        if item['id'] == interaction_id:
            data       = request.get_json()
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
        i for i in clip['interactions'] if i['id'] != interaction_id
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

    output_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'clips'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(output_dir / f"{safe_name}_{clip_id[:8]}.clip.json")
    Path(output_path).write_text(json.dumps(clip, indent=2), encoding='utf-8')

    return send_file(
        output_path,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"{safe_name}.clip.json",
    )
