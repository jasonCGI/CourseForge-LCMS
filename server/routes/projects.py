from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models.project import Project, Course, Module, Lesson, Frame
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
    project = Project.query.get_or_404(project_id)
    return jsonify(project_schema.dump(project))


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
    db.session.commit()
    return jsonify(project_schema.dump(project))


@projects_bp.delete('/api/projects/<project_id>')
def delete_project(project_id):
    project = Project.query.get_or_404(project_id)
    # MediaAsset and PublishJob reference projects.id but are NOT in the
    # Project->Course->...->Frame ORM cascade, so the DB-level FK blocks the
    # delete (500) unless we remove them first. Delete MediaAssets via the ORM
    # so their OamAsset children cascade; PublishJobs have no children.
    from ..models.media import MediaAsset
    from ..models.publish_job import PublishJob
    for asset in MediaAsset.query.filter_by(project_id=project_id).all():
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
    frame = Frame(
        lesson_id=lesson_id,
        name=data['name'],
        frame_type=data.get('frame_type', 'content'),
        order_index=count,
        content={'blocks': []}
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
    )
    db.session.add(new_frame)
    db.session.commit()
    return jsonify(frame_schema.dump(new_frame)), 201


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

    for item in items:
        obj = model.query.get(item['id'])
        if obj:
            obj.order_index = item['order_index']

    db.session.commit()
    return jsonify({'reordered': entity_type, 'count': len(items)})
