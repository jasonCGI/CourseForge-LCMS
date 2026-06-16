import uuid
from datetime import datetime
from ..extensions import db

def gen_uuid():
    return str(uuid.uuid4())

class PublishJob(db.Model):
    __tablename__ = 'publish_jobs'
    id           = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    project_id   = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    format       = db.Column(db.String(20), nullable=False)  # scorm12 | scorm2004 | web
    status       = db.Column(db.String(20), default='pending')  # pending | running | complete | failed
    output_path  = db.Column(db.String(512))
    error        = db.Column(db.Text)
    cf_version   = db.Column(db.String(20))
    frame_count  = db.Column(db.Integer)
    file_size    = db.Column(db.BigInteger)
    publish_name = db.Column(db.String(200))
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

# Reserved for future auth sprint
class User(db.Model):
    __tablename__ = 'users'
    id           = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    email        = db.Column(db.String(255), unique=True, nullable=False)
    role         = db.Column(db.String(20), default='author')  # author | reviewer | admin
    is_active    = db.Column(db.Boolean, default=True)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
