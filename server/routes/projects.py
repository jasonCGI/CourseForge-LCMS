from flask import Blueprint, jsonify
projects_bp = Blueprint('projects', __name__)

@projects_bp.get('/api/projects')
def list_projects():
    return jsonify({'status': 'stub', 'route': 'GET /api/projects'})
