import uuid
from datetime import datetime
from ..extensions import db

def gen_uuid():
    return str(uuid.uuid4())

class MediaAsset(db.Model):
    __tablename__ = 'media_assets'
    id           = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    project_id   = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    kind         = db.Column(db.String(20), nullable=False)  # image | video | audio | oam
    original_name = db.Column(db.String(255))
    stored_path  = db.Column(db.String(512))
    file_size    = db.Column(db.Integer)
    mime_type    = db.Column(db.String(100))
    companion_files = db.Column(db.JSON, default=dict)
    created_at   = db.Column(db.DateTime, default=datetime.utcnow)
    oam_asset    = db.relationship('OamAsset', back_populates='media_asset', uselist=False, cascade='all, delete-orphan')

class OamAsset(db.Model):
    __tablename__ = 'oam_assets'
    id                  = db.Column(db.String(36), primary_key=True, default=gen_uuid)
    media_asset_id      = db.Column(db.String(36), db.ForeignKey('media_assets.id'), nullable=False)
    manifest_version    = db.Column(db.String(20))
    entry_point         = db.Column(db.String(255), default='index.html')
    width               = db.Column(db.Integer, default=800)
    height              = db.Column(db.Integer, default=600)
    responsive          = db.Column(db.Boolean, default=False)
    has_audio           = db.Column(db.Boolean, default=False)
    has_scorm_calls     = db.Column(db.Boolean, default=False)
    asset_file_tree     = db.Column(db.JSON, default=list)
    extracted_path      = db.Column(db.String(512))
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)
    media_asset         = db.relationship('MediaAsset', back_populates='oam_asset')
