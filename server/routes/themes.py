from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.theme import GUITheme
from ..models.project import Project

themes_bp = Blueprint('themes', __name__)


@themes_bp.get('/api/themes')
def list_themes():
    themes = GUITheme.query.order_by(GUITheme.created_at).all()
    return jsonify([_serialize(t) for t in themes])


@themes_bp.get('/api/themes/<theme_id>')
def get_theme(theme_id):
    theme = GUITheme.query.get_or_404(theme_id)
    return jsonify(_serialize(theme))


@themes_bp.post('/api/themes')
def create_theme():
    data  = request.get_json()
    theme = GUITheme(
        name=data.get('name', 'Untitled Theme'),
        is_global=False,
        token_overrides=data.get('token_overrides', {}),
    )
    db.session.add(theme)
    db.session.commit()
    return jsonify(_serialize(theme)), 201


@themes_bp.patch('/api/themes/<theme_id>')
def update_theme(theme_id):
    theme = GUITheme.query.get_or_404(theme_id)
    if theme.is_global:
        return jsonify({'error': 'Global theme cannot be modified here.'}), 403
    data = request.get_json()
    if 'name' in data:
        theme.name = data['name']
    if 'token_overrides' in data:
        theme.token_overrides = data['token_overrides']
    db.session.commit()
    return jsonify(_serialize(theme))


@themes_bp.delete('/api/themes/<theme_id>')
def delete_theme(theme_id):
    theme = GUITheme.query.get_or_404(theme_id)
    if theme.is_global:
        return jsonify({'error': 'Global theme cannot be deleted.'}), 403
    db.session.delete(theme)
    db.session.commit()
    return jsonify({'deleted': theme_id})


@themes_bp.post('/api/projects/<project_id>/theme')
def assign_theme(project_id):
    """Assign a named theme + optional delta overrides to a project."""
    project = Project.query.get_or_404(project_id)
    data    = request.get_json()
    project.theme_id        = data.get('theme_id')
    project.theme_overrides = data.get('theme_overrides', {})
    db.session.commit()
    return jsonify({
        'project_id':      project.id,
        'theme_id':        project.theme_id,
        'theme_overrides': project.theme_overrides,
    })


def _serialize(theme):
    return {
        'id':              theme.id,
        'name':            theme.name,
        'is_global':       theme.is_global,
        'token_overrides': theme.token_overrides,
        'created_at':      theme.created_at.isoformat(),
    }
