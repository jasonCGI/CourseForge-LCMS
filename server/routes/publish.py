from flask import Blueprint, jsonify
publish_bp = Blueprint('publish', __name__)

@publish_bp.post('/api/publish')
def publish():
    return jsonify({'status': 'stub', 'route': 'POST /api/publish'})
