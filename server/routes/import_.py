from flask import Blueprint, jsonify
import_bp = Blueprint('import_', __name__)

@import_bp.post('/api/import')
def import_json():
    return jsonify({'status': 'stub', 'route': 'POST /api/import'})
