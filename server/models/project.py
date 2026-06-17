import uuid
from datetime import datetime
from sqlalchemy.orm import selectinload
from ..extensions import db

def gen_uuid():
    return str(uuid.uuid4())

class Project(db.Model):
    __tablename__ = 'projects'
    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name        = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    theme_id        = db.Column(db.String(36), db.ForeignKey('gui_themes.id'), nullable=True)
    theme_overrides = db.Column(db.JSON, default=dict)
    theme           = db.relationship('GUITheme', back_populates='projects')
    # Per-project GUI shell (from the GuiShell library). Plain id (no FK
    # constraint) — publish + serializer tolerate a missing/deleted shell.
    gui_shell_id    = db.Column(db.String(36), nullable=True)
    courses     = db.relationship('Course', back_populates='project', cascade='all, delete-orphan', order_by='Course.order_index')

class Course(db.Model):
    __tablename__ = 'courses'
    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    project_id  = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    name        = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    project     = db.relationship('Project', back_populates='courses')
    modules     = db.relationship('Module', back_populates='course', cascade='all, delete-orphan', order_by='Module.order_index')

class Module(db.Model):
    __tablename__ = 'modules'
    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    course_id   = db.Column(db.String(36), db.ForeignKey('courses.id'), nullable=False)
    name        = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    course      = db.relationship('Course', back_populates='modules')
    lessons     = db.relationship('Lesson', back_populates='module', cascade='all, delete-orphan', order_by='Lesson.order_index')

class Lesson(db.Model):
    __tablename__ = 'lessons'
    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    module_id   = db.Column(db.String(36), db.ForeignKey('modules.id'), nullable=False)
    name        = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    module      = db.relationship('Module', back_populates='lessons')
    frames      = db.relationship('Frame', back_populates='lesson', cascade='all, delete-orphan', order_by='Frame.order_index')

class Frame(db.Model):
    __tablename__ = 'frames'
    id          = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    lesson_id   = db.Column(db.String(36), db.ForeignKey('lessons.id'), nullable=False)
    name        = db.Column(db.String(255), nullable=False)
    frame_type  = db.Column(db.String(50), default='content')  # content | assessment | branch
    order_index = db.Column(db.Integer, default=0)
    content     = db.Column(db.JSON, default=lambda: {'blocks': []})
    notes       = db.Column(db.Text, default='')        # author notes — not published
    optional    = db.Column(db.Boolean, default=False)  # excluded from completion count (Sprint D)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    lesson      = db.relationship('Lesson', back_populates='frames')


def project_full_query():
    """Project query that eager-loads the whole Course→Module→Lesson→Frame tree
    in one query per level (selectinload), avoiding the N+1 cascade when the
    editor loads a project or a packager walks every frame."""
    return Project.query.options(
        selectinload(Project.courses)
        .selectinload(Course.modules)
        .selectinload(Module.lessons)
        .selectinload(Lesson.frames)
    )
