"""
Frame search across a project — names, narration, text, quiz questions,
WCN, branch conditions, hotspot/3D labels, and author notes.
"""

import re
from flask import Blueprint, request, jsonify
from ..models.project import Frame, Lesson, Module, Course

search_bp = Blueprint('search', __name__)


@search_bp.get('/api/projects/<project_id>/search')
def search_frames(project_id):
    q          = (request.args.get('q') or '').strip().lower()
    block_type = request.args.get('type', '')
    has_notes  = request.args.get('has_notes') == '1'
    if not q and not block_type and not has_notes:
        return jsonify([])

    # Single joined query (Frame ⨝ Lesson ⨝ Module ⨝ Course) instead of an
    # N+1 walk — one round-trip for the whole project, ordered top-to-bottom.
    rows = (Frame.query
            .join(Lesson, Frame.lesson_id == Lesson.id)
            .join(Module, Lesson.module_id == Module.id)
            .join(Course, Module.course_id == Course.id)
            .filter(Course.project_id == project_id)
            .order_by(Course.order_index, Module.order_index,
                      Lesson.order_index, Frame.order_index)
            .add_entity(Lesson).add_entity(Module).add_entity(Course)
            .all())

    results = []
    for frame, lesson, module, course in rows:
        blocks = (frame.content or {}).get('blocks', [])

        if has_notes and not (frame.notes and frame.notes.strip()):
            continue
        if block_type and not any(b.get('type') == block_type for b in blocks):
            continue

        if q:
            parts = [frame.name or '', frame.notes or '']
            for b in blocks:
                d = b.get('data', {}); t = b.get('type', '')
                if t == 'text':
                    parts += [d.get('body', ''), d.get('narrator_script', '')]
                elif t == 'quiz':
                    parts.append(d.get('question', '')); parts += d.get('choices', [])
                elif t == 'wcn':
                    parts += [d.get('title', ''), d.get('text', '')]
                elif t == 'branch':
                    parts.append(d.get('condition', ''))
                elif t == 'hotspot':
                    for r in d.get('regions', []):
                        parts += [r.get('label', ''), r.get('description', '')]
                elif t == 'model3d':
                    for a in d.get('annotations', []):
                        parts += [a.get('label', ''), a.get('description', '')]
            blob = re.sub(r'<[^>]+>', ' ', ' '.join(p for p in parts if p)).lower()
            if q not in blob:
                continue

        note = frame.notes or ''
        results.append({
            'frame_id': frame.id, 'frame_name': frame.name,
            'frame_type': frame.frame_type, 'lesson_id': lesson.id,
            'lesson_name': lesson.name, 'module_name': module.name,
            'course_name': course.name,
            'breadcrumb': f'{course.name} › {module.name} › {lesson.name}',
            'block_types': list({b.get('type', '') for b in blocks}),
            'block_count': len(blocks),
            'has_notes': bool(note.strip()),
            'notes_preview': (note[:80] + '…') if len(note) > 80 else note,
        })

    if q:
        results.sort(key=lambda r: 0 if q in (r['frame_name'] or '').lower() else 1)
    return jsonify(results[:100])
