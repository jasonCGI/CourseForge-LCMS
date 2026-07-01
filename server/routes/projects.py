import json
import re
from flask import Blueprint, request, jsonify
from ..extensions import db
from sqlalchemy.orm import selectinload
from ..models.project import Project, Course, Module, Lesson, Frame, project_full_query
from ..schemas.project_schemas import (
    ProjectSchema, ProjectListSchema, CourseSchema,
    ModuleSchema, LessonSchema, FrameSchema
)

projects_bp = Blueprint('projects', __name__)

project_schema      = ProjectSchema()
project_list_schema = ProjectListSchema(many=True)
course_schema       = CourseSchema()
module_schema       = ModuleSchema()
lesson_schema       = LessonSchema()
frame_schema        = FrameSchema()


# ── Projects ────────────────────────────────────────────────────────────────

@projects_bp.get('/api/projects')
def list_projects():
    projects = Project.query.order_by(Project.created_at.desc()).all()
    return jsonify(project_list_schema.dump(projects))


@projects_bp.get('/api/projects/<project_id>')
def get_project(project_id):
    # Eager-load the whole tree (one query per level) — the editor's main load.
    project = project_full_query().get_or_404(project_id)
    return jsonify(project_schema.dump(project))


@projects_bp.get('/api/projects/<project_id>/export.json')
def export_project_json(project_id):
    """Download the whole course build as a JSON file (backup / inspect / move
    between environments). The full project tree is included; media binaries are
    NOT — asset_id references point at this environment's media library, so a
    cross-environment import re-links media by id (or leaves it to be re-uploaded).
    """
    project = project_full_query().get_or_404(project_id)
    payload = project_schema.dump(project)
    # Tag the file so the importer routes it to the lossless round-trip restore
    # (vs the ForgeBlueprint authoring import, which rebuilds blocks and is lossy).
    payload['format'] = 'courseforge-project'
    payload['format_version'] = 1
    # ProjectSchema omits these project-level styling columns — include them so the
    # round-trip is truly lossless (forge_config = project-wide hotspot/OAM style,
    # theme_overrides = theme tweaks, theme_id = library theme link).
    payload['theme_overrides'] = project.theme_overrides or {}
    payload['forge_config'] = project.forge_config or {}
    payload['theme_id'] = project.theme_id
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    slug = (re.sub(r'[^a-z0-9]+', '-', (project.name or 'course').lower()).strip('-')
            or 'course')
    return body, 200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': f'attachment; filename="{slug}.courseforge.json"',
    }


@projects_bp.post('/api/projects')
def create_project():
    data = request.get_json()
    errors = project_schema.validate(data)
    if errors:
        return jsonify({'errors': errors}), 400
    project = Project(name=data['name'], description=data.get('description', ''))
    db.session.add(project)
    db.session.commit()
    return jsonify(project_schema.dump(project)), 201


@projects_bp.patch('/api/projects/<project_id>')
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    data = request.get_json()
    if 'name' in data:
        project.name = data['name']
    if 'description' in data:
        project.description = data['description']
    if 'gui_shell_id' in data:
        project.gui_shell_id = data['gui_shell_id'] or None
    if 'text_mode' in data:
        # Project-level shelled body-text override. Whitelist server-side (the API,
        # not just the UI, is the trust boundary) — anything else falls to 'auto'.
        tm = str(data['text_mode']).strip().lower() if data['text_mode'] is not None else 'auto'
        project.text_mode = tm if tm in ('auto', 'light', 'dark') else 'auto'
    db.session.commit()
    return jsonify(project_schema.dump(project))


@projects_bp.get('/api/projects/<project_id>/forge-config')
def get_forge_config(project_id):
    """Project-level ForgeJS config (currently the hotspot style). Empty dict
    means 'use the runtime's built-in brand defaults'."""
    project = Project.query.get_or_404(project_id)
    return jsonify(project.forge_config or {})


@projects_bp.put('/api/projects/<project_id>/forge-config')
def set_forge_config(project_id):
    """Replace the project's ForgeJS config. Accepts {"hotspot": {...}} (or {}
    to clear back to defaults). Values are sanitized server-side — this config is
    baked into published SCORM <script> and into CSS in the OAM runtime, so the
    API (not just the UI) is the trust boundary."""
    project = Project.query.get_or_404(project_id)
    data = request.get_json() or {}
    if not isinstance(data, dict):
        return jsonify({'error': 'forge-config must be an object'}), 400
    project.forge_config = _sanitize_forge_config(data)
    db.session.commit()
    return jsonify(project.forge_config or {})


# Hotspot style is baked into an inline <script> and concatenated into CSS in the
# OAM runtime, so every value is whitelisted + bounded here. Unknown keys and
# malformed values are dropped rather than rejected (lenient: a bad field just
# falls back to the runtime brand default).
_HS_COLOR_KEYS = {'strokeColor', 'outColor', 'overColor', 'focusOutline', 'fill', 'shadow'}
_HS_NUM_KEYS   = {'strokeWidth': (0, 20), 'radius': (0, 100), 'hitPadding': (0, 400)}
_HS_BOOL_KEYS  = {'pulse'}
_HS_CURSORS    = {'pointer', 'default', 'crosshair', 'grab', 'grabbing', 'help', 'zoom-in', 'none'}
_CSS_SAFE      = re.compile(r'^[#0-9a-zA-Z(),.%\s+-]*$')   # no ; { } < > : url( etc.


def _clean_css_value(v):
    if not isinstance(v, str):
        return None
    v = v.strip()
    if not v or len(v) > 120:
        return None
    low = v.lower()
    if any(bad in low for bad in (';', '{', '}', '<', '>', ':', 'url(', 'expression', '/*', '@')):
        return None
    return v if _CSS_SAFE.match(v) else None


def _sanitize_forge_config(data):
    hs_in = data.get('hotspot') if isinstance(data, dict) else None
    if not isinstance(hs_in, dict):
        return {}
    hs = {}
    for k, v in hs_in.items():
        if k in _HS_COLOR_KEYS:
            cv = _clean_css_value(v)
            if cv is not None:
                hs[k] = cv
        elif k in _HS_NUM_KEYS:
            try:
                n = float(v)
            except (TypeError, ValueError):
                continue
            if n != n or n in (float('inf'), float('-inf')):   # NaN / inf guard
                continue
            lo, hi = _HS_NUM_KEYS[k]
            hs[k] = max(lo, min(hi, n))
        elif k in _HS_BOOL_KEYS:
            hs[k] = bool(v)
        elif k == 'cursor' and isinstance(v, str) and v in _HS_CURSORS:
            hs[k] = v
        # unknown keys dropped
    return {'hotspot': hs} if hs else {}


@projects_bp.delete('/api/projects/<project_id>')
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    # MediaAsset and PublishJob reference projects.id but are NOT in the
    # Project->Course->...->Frame ORM cascade, so the DB-level FK blocks the
    # delete (500) unless we remove them first. Delete MediaAssets via the ORM
    # so their OamAsset children cascade; PublishJobs have no children.
    from ..models.media import MediaAsset
    from ..models.publish_job import PublishJob
    # Eager-load oam_asset so the ORM cascade doesn't fire a SELECT per asset.
    assets = (MediaAsset.query
              .options(selectinload(MediaAsset.oam_asset))
              .filter_by(project_id=project_id).all())
    for asset in assets:
        db.session.delete(asset)
    PublishJob.query.filter_by(project_id=project_id).delete()
    db.session.delete(project)
    db.session.commit()
    return jsonify({'deleted': project_id})


# ── Courses ──────────────────────────────────────────────────────────────────

@projects_bp.post('/api/projects/<project_id>/courses')
def create_course(project_id):
    Project.query.get_or_404(project_id)
    data = request.get_json()
    count = Course.query.filter_by(project_id=project_id).count()
    course = Course(project_id=project_id, name=data['name'], order_index=count)
    db.session.add(course)
    db.session.commit()
    return jsonify(course_schema.dump(course)), 201


@projects_bp.patch('/api/courses/<course_id>')
def update_course(course_id):
    course = Course.query.get_or_404(course_id)
    data = request.get_json()
    if 'name' in data:
        course.name = data['name']
    if 'order_index' in data:
        course.order_index = data['order_index']
    db.session.commit()
    return jsonify(course_schema.dump(course))


@projects_bp.delete('/api/courses/<course_id>')
def delete_course(course_id):
    course = Course.query.get_or_404(course_id)
    db.session.delete(course)
    db.session.commit()
    return jsonify({'deleted': course_id})


# ── Modules ──────────────────────────────────────────────────────────────────

@projects_bp.post('/api/courses/<course_id>/modules')
def create_module(course_id):
    Course.query.get_or_404(course_id)
    data = request.get_json()
    count = Module.query.filter_by(course_id=course_id).count()
    module = Module(course_id=course_id, name=data['name'], order_index=count)
    db.session.add(module)
    db.session.commit()
    return jsonify(module_schema.dump(module)), 201


@projects_bp.patch('/api/modules/<module_id>')
def update_module(module_id):
    module = Module.query.get_or_404(module_id)
    data = request.get_json()
    if 'name' in data:
        module.name = data['name']
    if 'order_index' in data:
        module.order_index = data['order_index']
    db.session.commit()
    return jsonify(module_schema.dump(module))


@projects_bp.delete('/api/modules/<module_id>')
def delete_module(module_id):
    module = Module.query.get_or_404(module_id)
    db.session.delete(module)
    db.session.commit()
    return jsonify({'deleted': module_id})


# ── Lessons ───────────────────────────────────────────────────────────────────

@projects_bp.post('/api/modules/<module_id>/lessons')
def create_lesson(module_id):
    Module.query.get_or_404(module_id)
    data = request.get_json()
    count = Lesson.query.filter_by(module_id=module_id).count()
    lesson = Lesson(module_id=module_id, name=data['name'], order_index=count)
    db.session.add(lesson)
    db.session.commit()
    return jsonify(lesson_schema.dump(lesson)), 201


@projects_bp.patch('/api/lessons/<lesson_id>')
def update_lesson(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    data = request.get_json()
    if 'name' in data:
        lesson.name = data['name']
    if 'order_index' in data:
        lesson.order_index = data['order_index']
    db.session.commit()
    return jsonify(lesson_schema.dump(lesson))


@projects_bp.delete('/api/lessons/<lesson_id>')
def delete_lesson(lesson_id):
    lesson = Lesson.query.get_or_404(lesson_id)
    db.session.delete(lesson)
    db.session.commit()
    return jsonify({'deleted': lesson_id})


# ── Frames ────────────────────────────────────────────────────────────────────

@projects_bp.post('/api/lessons/<lesson_id>/frames')
def create_frame(lesson_id):
    Lesson.query.get_or_404(lesson_id)
    data = request.get_json()
    count = Frame.query.filter_by(lesson_id=lesson_id).count()
    # Honor the content the client posts (e.g. a template's pre-built blocks, or a
    # menu frame's content.menu). Previously this hardcoded an empty {'blocks': []},
    # which silently dropped every template's blocks — a "Text + Image" frame was
    # born empty. Fall back to an empty block list when no content is supplied.
    content = data.get('content')
    if not isinstance(content, dict):
        content = {'blocks': []}
    frame = Frame(
        lesson_id=lesson_id,
        name=data['name'],
        frame_type=data.get('frame_type', 'content'),
        order_index=count,
        content=content
    )
    db.session.add(frame)
    db.session.commit()
    return jsonify(frame_schema.dump(frame)), 201


@projects_bp.get('/api/frames/<frame_id>')
def get_frame(frame_id):
    frame = Frame.query.get_or_404(frame_id)
    return jsonify(frame_schema.dump(frame))


@projects_bp.patch('/api/frames/<frame_id>')
def update_frame(frame_id):
    frame = Frame.query.get_or_404(frame_id)
    data = request.get_json()
    if 'name' in data:
        frame.name = data['name']
    if 'frame_type' in data:
        frame.frame_type = data['frame_type']
    if 'order_index' in data:
        frame.order_index = data['order_index']
    if 'content' in data:
        frame.content = data['content']
    if 'notes' in data:
        frame.notes = data['notes']
    if 'optional' in data:
        frame.optional = bool(data['optional'])
    db.session.commit()
    return jsonify(frame_schema.dump(frame))


@projects_bp.delete('/api/frames/<frame_id>')
def delete_frame(frame_id):
    frame = Frame.query.get_or_404(frame_id)
    db.session.delete(frame)
    db.session.commit()
    return jsonify({'deleted': frame_id})


@projects_bp.post('/api/frames/<frame_id>/duplicate')
def duplicate_frame(frame_id):
    """
    Duplicate a frame within the same lesson, or into another lesson via
    body { target_lesson_id }. Blocks get fresh IDs so nothing collides.
    """
    import copy as _copy
    import uuid as _uuid

    frame = Frame.query.get_or_404(frame_id)
    data  = request.get_json(silent=True) or {}
    target_lesson_id = data.get('target_lesson_id') or frame.lesson_id
    Lesson.query.get_or_404(target_lesson_id)

    last = (Frame.query.filter_by(lesson_id=target_lesson_id)
            .order_by(Frame.order_index.desc()).first())
    next_order = (last.order_index + 1) if last else 0

    content = _copy.deepcopy(frame.content or {'blocks': []})
    for block in content.get('blocks', []):
        block['id'] = str(_uuid.uuid4())

    same_lesson = target_lesson_id == frame.lesson_id
    new_frame = Frame(
        lesson_id=target_lesson_id,
        name=(frame.name + ' (copy)') if same_lesson else frame.name,
        frame_type=frame.frame_type,
        order_index=next_order,
        content=content,
        notes=frame.notes,
        optional=frame.optional,
    )
    db.session.add(new_frame)
    db.session.commit()
    return jsonify(frame_schema.dump(new_frame)), 201


@projects_bp.get('/api/frames/<frame_id>/preview-html')
def preview_frame_html(frame_id):
    """
    Single-frame live HTML preview: returns a self-contained HTML page that
    renders this frame's blocks exactly as the SCO will, with stubbed SCORM
    APIs and live asset URLs. Meant to be opened in a browser tab.
    """
    from ..services.frame_preview import build_frame_preview_html
    frame = Frame.query.get_or_404(frame_id)
    # embed=1 suppresses the page's own LIVE PREVIEW banner when the pane already
    # shows its PreviewHeader (avoids a doubled banner in the in-app Published view).
    embed = request.args.get('embed') in ('1', 'true')
    html = build_frame_preview_html(frame, embed=embed)
    return html, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
    }


@projects_bp.get('/api/projects/<project_id>/preview-course')
def preview_course_html(project_id):
    """
    Full-course live preview: a navigable wrapper that chains each frame's
    single-frame preview (Prev/Next/jump/keyboard), so authors can walk the
    whole course and test flow/navigation without publishing to an LMS.
    """
    from ..services.frame_preview import build_course_preview_html
    project = project_full_query().get_or_404(project_id)
    html = build_course_preview_html(project)
    return html, 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'SAMEORIGIN',
    }


# ── Reorder (drag-and-drop support) ─────────────────────────────────────────

@projects_bp.post('/api/reorder')
def reorder():
    """
    Bulk update order_index values after drag-to-reorder in UI.
    Body: { "type": "frames", "items": [{"id": "...", "order_index": 0}, ...] }
    """
    data = request.get_json()
    entity_type = data.get('type')
    items = data.get('items', [])

    model_map = {
        'courses': Course,
        'modules': Module,
        'lessons': Lesson,
        'frames': Frame,
    }

    model = model_map.get(entity_type)
    if not model:
        return jsonify({'error': f'Unknown type: {entity_type}'}), 400

    # One query for all rows instead of a SELECT per item.
    ids = [it['id'] for it in items]
    by_id = {o.id: o for o in model.query.filter(model.id.in_(ids)).all()}
    for item in items:
        obj = by_id.get(item['id'])
        if obj:
            obj.order_index = item['order_index']

    db.session.commit()
    return jsonify({'reordered': entity_type, 'count': len(items)})
