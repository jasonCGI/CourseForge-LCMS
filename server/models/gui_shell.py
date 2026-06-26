import uuid
from datetime import datetime
from ..extensions import db


class GuiShell(db.Model):
    """A reusable ForgeGUI shell in the global library (upload once, select
    per-project). Distinct from per-frame GUI blocks (MediaAsset kind='gui')."""
    __tablename__ = 'gui_shells'

    id            = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name          = db.Column(db.String(200), nullable=False)
    original_name = db.Column(db.String(255))
    stored_path   = db.Column(db.String(512))   # extracted dir (html + json + assets)
    html_file     = db.Column(db.String(255))
    json_file     = db.Column(db.String(255))
    stage_width   = db.Column(db.Integer, default=1024)
    stage_height  = db.Column(db.Integer, default=768)
    button_count  = db.Column(db.Integer, default=0)
    zone_count    = db.Column(db.Integer, default=0)
    shell_config  = db.Column(db.JSON, default=dict)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':            self.id,
            'name':          self.name,
            'original_name': self.original_name,
            'stage_width':   self.stage_width,
            'stage_height':  self.stage_height,
            'button_count':  self.button_count,
            'zone_count':    self.zone_count,
            'html_serve_url': f'/api/gui-shells/{self.id}/shell.html',
            # Per-shell shelled body-text override (top tier of the cascade).
            'text_mode':     ((self.shell_config or {}).get('content_area') or {}).get('text_mode', 'auto')
                             if isinstance(self.shell_config, dict) else 'auto',
            'created_at':    self.created_at.isoformat() if self.created_at else None,
        }
