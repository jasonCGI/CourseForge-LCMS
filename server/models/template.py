import uuid
from datetime import datetime
from ..extensions import db


class FrameTemplate(db.Model):
    __tablename__ = 'frame_templates'

    id          = db.Column(db.String(36), primary_key=True,
                            default=lambda: str(uuid.uuid4()))
    name        = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500), default='')
    frame_type  = db.Column(db.String(50), default='content')
    content     = db.Column(db.JSON, nullable=False)
    is_builtin  = db.Column(db.Boolean, default=False)
    icon        = db.Column(db.String(10), default='📄')
    tags        = db.Column(db.JSON, default=list)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':          self.id,
            'name':        self.name,
            'description': self.description,
            'frame_type':  self.frame_type,
            'content':     self.content,
            'is_builtin':  self.is_builtin,
            'icon':        self.icon,
            'tags':        self.tags or [],
            'created_at':  self.created_at.isoformat() if self.created_at else None,
        }
