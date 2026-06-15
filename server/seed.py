"""
Run once after migration:
  python -m server.seed
"""
from server.app import create_app
from server.extensions import db
from server.models.theme import GUITheme

app = create_app()

DEFAULT_TOKENS = {
    "primary_color":       "#185FA5",
    "secondary_color":     "#042C53",
    "accent_color":        "#EF9F27",
    "text_color":          "#1a1a1a",
    "text_light":          "#ffffff",
    "bg_color":            "#ffffff",
    "bg_secondary":        "#F0F4F8",
    "font_family":         "Inter, system-ui, sans-serif",
    "font_size_base":      "16px",
    "frame_layout":        "top-nav",
    "button_style":        "rounded",
    "progress_indicator":  "bar",
    "logo_asset_id":       None,
    "border_radius":       "6px",
    "nav_bg":              "#042C53",
    "nav_text":            "#B5D4F4",
}

with app.app_context():
    existing = GUITheme.query.filter_by(is_global=True).first()
    if not existing:
        theme = GUITheme(
            name='CourseForge Default',
            is_global=True,
            token_overrides=DEFAULT_TOKENS,
        )
        db.session.add(theme)
        db.session.commit()
        print(f"Seeded global theme: {theme.id}")
    else:
        print(f"Global theme already exists: {existing.id}")
