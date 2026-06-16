import uuid
import copy
from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.template import FrameTemplate

templates_bp = Blueprint('templates', __name__)


@templates_bp.get('/api/templates')
def list_templates():
    """List templates, optional ?tag= filter (filtered in Python for DB portability)."""
    tag = request.args.get('tag')
    items = FrameTemplate.query.order_by(
        FrameTemplate.is_builtin.desc(), FrameTemplate.name.asc()
    ).all()
    out = [t.to_dict() for t in items]
    if tag:
        out = [t for t in out if tag in (t.get('tags') or [])]
    return jsonify(out)


@templates_bp.post('/api/templates')
def create_template():
    """Save a frame as a user template (fresh block IDs)."""
    data = request.get_json() or {}
    if not data.get('name') or not data.get('content'):
        return jsonify({'error': 'name and content are required.'}), 400
    content = copy.deepcopy(data['content'])
    for block in content.get('blocks', []):
        block['id'] = str(uuid.uuid4())
    t = FrameTemplate(
        id=str(uuid.uuid4()), name=data['name'],
        description=data.get('description', ''),
        frame_type=data.get('frame_type', 'content'),
        icon=data.get('icon', '📄'), tags=data.get('tags', []),
        content=content, is_builtin=False,
    )
    db.session.add(t)
    db.session.commit()
    return jsonify(t.to_dict()), 201


@templates_bp.delete('/api/templates/<template_id>')
def delete_template(template_id):
    """Delete a user template (built-ins are protected)."""
    t = FrameTemplate.query.get_or_404(template_id)
    if t.is_builtin:
        return jsonify({'error': 'Cannot delete built-in templates.'}), 403
    db.session.delete(t)
    db.session.commit()
    return jsonify({'deleted': template_id})
