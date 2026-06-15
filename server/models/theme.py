import uuid
from datetime import datetime
from ..extensions import db

def gen_uuid():
    return str(uuid.uuid4())

class GUITheme(db.Model):
    __tablename__ = 'gui_themes'

    id              = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    name            = db.Column(db.String(255), nullable=False)
    is_global       = db.Column(db.Boolean, default=False)
    token_overrides = db.Column(db.JSON, default=dict)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects        = db.relationship('Project', back_populates='theme')
