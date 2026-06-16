"""
Resolves the three-layer theme stack into a flat token dict.

Resolution order (last wins):
  1. Global default theme (is_global=True)
  2. Named project theme (project.theme_id → gui_themes)
  3. Project-level delta (project.theme_overrides)
"""

from ..models.theme import GUITheme

# Absolute fallback — used if DB has no global theme
SYSTEM_FALLBACK = {
    "primary_color":       "#185FA5",
    "secondary_color":     "#042C53",
    "accent_color":        "#D4820A",
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


def resolve_theme(project) -> dict:
    """
    Given a Project instance, return a fully resolved flat token dict.
    Must be called within a Flask app context.
    """
    # Layer 1 — global default
    global_theme = GUITheme.query.filter_by(is_global=True).first()
    tokens = dict(SYSTEM_FALLBACK)
    if global_theme and global_theme.token_overrides:
        tokens.update(global_theme.token_overrides)

    # Layer 2 — named project theme
    if project.theme_id and project.theme:
        if project.theme.token_overrides:
            tokens.update(project.theme.token_overrides)

    # Layer 3 — project-level delta
    if project.theme_overrides:
        tokens.update(project.theme_overrides)

    return tokens


def tokens_to_css(tokens: dict) -> str:
    """
    Convert resolved token dict to CSS custom properties string.
    Injected into SCO pages and web bundle at publish time.
    """
    lines = [':root {']
    mapping = {
        'primary_color':      '--cf-primary',
        'secondary_color':    '--cf-secondary',
        'accent_color':       '--cf-accent',
        'text_color':         '--cf-text',
        'text_light':         '--cf-text-light',
        'bg_color':           '--cf-bg',
        'bg_secondary':       '--cf-bg-secondary',
        'font_family':        '--cf-font',
        'font_size_base':     '--cf-font-size',
        'border_radius':      '--cf-radius',
        'nav_bg':             '--cf-nav-bg',
        'nav_text':           '--cf-nav-text',
    }
    for token_key, css_var in mapping.items():
        if token_key in tokens and tokens[token_key]:
            lines.append(f'  {css_var}: {tokens[token_key]};')
    lines.append('}')
    return '\n'.join(lines)
