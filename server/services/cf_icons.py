"""Curated Iconoir (MIT) icon set as raw inline SVG strings.

The React editor/preview uses the `iconoir-react` components; published SCORM
and the server `/preview-html` renderer are vanilla HTML with no React, so the
SAME icons live here as inline SVG markup. Icons use stroke="currentColor" so
they inherit the surrounding text color.

Keep this set SMALL — only icons actually emitted into SCO output belong here.
The path data is copied verbatim from iconoir-react (MIT-licensed); see
client/src/components/icons.jsx for the matching React component set.
"""

# Inner <path> markup for each icon (no wrapping <svg>). Extracted from the
# installed iconoir-react package (regular weight, 24x24 viewBox).
_PLAY_PATHS = (
    '<path d="M6.90588 4.53682C6.50592 4.2998 6 4.58808 6 5.05299V18.947C6 '
    '19.4119 6.50592 19.7002 6.90588 19.4632L18.629 12.5162C19.0211 12.2838 '
    '19.0211 11.7162 18.629 11.4838L6.90588 4.53682Z" fill="currentColor" '
    'stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>'
)

_PAUSE_PATHS = (
    '<path d="M6 18.4V5.6C6 5.26863 6.26863 5 6.6 5H9.4C9.73137 5 10 5.26863 '
    '10 5.6V18.4C10 18.7314 9.73137 19 9.4 19H6.6C6.26863 19 6 18.7314 6 '
    '18.4Z" fill="currentColor" stroke="currentColor"/>'
    '<path d="M14 18.4V5.6C14 5.26863 14.2686 5 14.6 5H17.4C17.7314 5 18 '
    '5.26863 18 5.6V18.4C18 18.7314 17.7314 19 17.4 19H14.6C14.2686 19 14 '
    '18.7314 14 18.4Z" fill="currentColor" stroke="currentColor"/>'
)


def _svg(inner, size=18):
    """Wrap inner path markup in a sized, currentColor SVG element."""
    return (
        f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
        f'stroke-width="1.5" xmlns="http://www.w3.org/2000/svg" '
        f'color="currentColor" aria-hidden="true" focusable="false">'
        f'{inner}</svg>'
    )


# Public, ready-to-inline SVG strings used by the audio bar (sized for the 32px
# circular play/pause button).
PLAY_SVG = _svg(_PLAY_PATHS)
PAUSE_SVG = _svg(_PAUSE_PATHS)

# A JS-string-literal form (double-quotes escaped) for embedding inside the
# inline <script> that swaps the glyph on play/pause.
PLAY_SVG_JS = PLAY_SVG.replace('"', '\\"')
PAUSE_SVG_JS = PAUSE_SVG.replace('"', '\\"')
