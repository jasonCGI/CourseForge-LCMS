from flask import Blueprint, jsonify
media_bp = Blueprint('media', __name__)

@media_bp.post('/api/media')
def upload_media():
    return jsonify({'status': 'stub', 'route': 'POST /api/media'})

@media_bp.post('/api/media/oam')
def upload_oam():
    return jsonify({'status': 'stub', 'route': 'POST /api/media/oam'})
