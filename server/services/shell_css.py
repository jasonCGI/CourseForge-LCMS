"""Single source of truth for the SHELLED CONTENT CSS.

CourseForge renders shelled frame content in two worlds that must look identical:
  * PUBLISHED / preview-html  — server, scorm12._patch_shell inlines this CSS into
    the SCO page (the SCO runs offline on an LMS, so it cannot fetch at runtime).
  * GUI-ON EDIT preview       — client, GUIShellRenderer fetches GET /api/shell-content.css
    and injects it into the stored-shell iframe.

Keeping the CSS here (one constant) and feeding both consumers removes the silent
drift that produced a long parade of Edit-vs-Published rendering bugs (media
overflow, heading color/font shift, containment). See the `shell-css-single-source`
project memory.

NOT included here (intentionally): the PER-FRAME DYNAMIC `#fgui-content` text color
+ halo, which is computed by background luminance per frame
(resolve_shell_text_style server-side / shellTextCSS client-side) and appended by
each renderer. Everything in this constant is static and shared verbatim.
"""

# Static shelled-content CSS. Rules are byte-for-byte the ones scorm12._patch_shell
# previously emitted inline, MINUS the dynamic `color:…;<halo>` (now appended by the
# caller). Property order within a rule is irrelevant to rendering.
SHELL_CONTENT_CSS = (
    # Base content box (font/metrics/clip). Color + halo are appended per-frame.
    # NOTE: do NOT set height here. The shell positions #fgui-content at the
    # Figma-exported content_area (e.g. y:100, height:900) via its own runtime style;
    # forcing height:100% would override that and stretch the content box to the FULL
    # stage (1080), pushing content past the content area into the title/prompt chrome.
    # Let the shell's content_area height govern.
    "#fgui-content{font-family:'IBM Plex Mono','Inter',system-ui,sans-serif;"
    "font-size:14px;line-height:1.6;padding:12px;box-sizing:border-box;"
    "overflow:hidden}"
    # Typography.
    "#fgui-content h1,#fgui-content h2,#fgui-content h3{color:#F59E0B;margin-bottom:12px}"
    "#fgui-content p{margin-bottom:10px}"
    "#fgui-content ul,#fgui-content ol{margin:8px 0 10px 0;padding-left:1.6em}"
    "#fgui-content li{margin-bottom:4px}#fgui-content img{max-width:100%;height:auto}"
    # Explicit-bounds blocks + cover/contain fit.
    ".cf-bounds{margin:0}.cf-bounds video,.cf-bounds img{width:100%;height:100%;object-fit:contain;border-radius:0}"
    ".cf-fit-cover video,.cf-fit-cover img{object-fit:cover}"
    # Text-only shelled frame fills the content area and scrolls itself.
    ".cf-shelled-text-top{position:absolute;top:0;left:0;width:100%;height:100%;padding:40px;box-sizing:border-box;overflow:auto}"
    ".cf-zone-text{font-size:14px}"
    ".cf-zone-media>*{margin:0!important}"
    # Media containment: class-less, id-less <div> wrappers (iVideo=#ivideo-, OAM=.cf-oam,
    # 3D=.cf-3d-viewer, hotspot=.cf-hotspot-wrap, video.js all carry an id/class, so the
    # :not() guards exclude them). Inline height:auto on the <img>/<video> would otherwise
    # win and let the REPLACED element snap to intrinsic height, overflowing the zone.
    ".cf-zone-media>div:not([class]):not([id]){position:absolute!important;inset:0!important;margin:0!important;overflow:hidden}"
    ".cf-zone-media>div:not([class]):not([id])>img,.cf-zone-media>div:not([class]):not([id])>video:not(.video-js){position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:contain;display:block}"
    # iVideo: container edge-bound to the zone (the native <video> re-evaluates its used
    # height on loadedmetadata and would overflow off an indefinite %-height chain).
    '.cf-zone-media [id^="ivideo-"] video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}'
    '.cf-zone-media [id^="ivideo-"]{position:absolute!important;inset:0!important;margin:0!important}'
    # 3D + OAM (sized by their own JS); OAM centers its scaled stage, iframe exempt.
    ".cf-zone-media .cf-3d-viewer{height:100%!important;margin:0!important}"
    ".cf-zone-media .cf-oam{height:100%!important;margin:0!important;display:flex!important;align-items:center;justify-content:center;overflow:hidden}"
    ".cf-zone-media .cf-oam .cf-oam-stage{max-height:100%}"
    ".cf-zone-media .cf-oam iframe{width:auto;height:auto}"
    ".cf-zone-media iframe{width:100%;height:100%;border:0;display:block}"
    # A bare caption <p> directly in a media zone (e.g. the 3D model caption) sits
    # AFTER a height:100% viewer, so in flow it is pushed past the zone and clipped.
    # Pin it as a readable bottom overlay so it stays fully visible and never pushes.
    ".cf-zone-media>p{position:absolute;left:0;right:0;bottom:0;margin:0;padding:6px 12px;font-size:12px;line-height:1.4;color:#C8D8E8;text-align:center;background:linear-gradient(to top,rgba(4,17,34,.85),rgba(4,17,34,0))}"
    # Title/prompt/counter zones: let glyph descenders show; keep the counter on one line.
    '[data-zone-type="frame_title"],[data-zone-type="lesson_title"],'
    '[data-zone-type="section_title"],[data-zone-type="prompt"],'
    '[data-zone-type="frame_counter"]'
    "{overflow:visible!important;line-height:1.35!important;transform:translateY(-5px)!important}"
    '[data-zone-type="frame_counter"]{white-space:nowrap!important;width:auto!important;min-width:max-content!important}'
    # ── Slide-out lesson menu (nav drawer) ────────────────────────────────────
    # A self-contained .cf-lmenu-root block, position:absolute within the content
    # area (its nearest positioned ancestor: #fgui-content / .cf-content), so the
    # drawer is bounded to the CONTENT AREA and never escapes into the shell chrome.
    # Hamburger trigger top-right; drawer slides in from the LEFT (L->R); scrim
    # dims the content behind it. Open state = .cf-lmenu-root.is-open (runtime
    # toggles it + the aria-* on the button/aside). Locked items are completion-gated.
    ".cf-lmenu-root{position:absolute;inset:0;z-index:40;pointer-events:none}"
    ".cf-lmenu-root.is-open{pointer-events:auto}"
    ".cf-lmenu-btn{position:absolute;top:10px;right:10px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:#042C53;color:#F59E0B;border:1px solid #F59E0B;border-radius:6px;cursor:pointer;pointer-events:auto;z-index:43}"
    ".cf-lmenu-btn:hover{background:#063D72}"
    ".cf-lmenu-scrim{position:absolute;inset:0;background:rgba(4,17,34,.5);opacity:0;transition:opacity .25s ease;z-index:41}"
    ".cf-lmenu-root.is-open .cf-lmenu-scrim{opacity:1}"
    ".cf-lmenu{position:absolute;top:0;left:0;bottom:0;width:min(300px,80%);background:#042C53;color:#E8EEF6;box-shadow:2px 0 18px rgba(0,0,0,.45);transform:translateX(-100%);transition:transform .25s ease;z-index:42;overflow-y:auto;-webkit-overflow-scrolling:touch}"
    ".cf-lmenu-root.is-open .cf-lmenu{transform:translateX(0)}"
    ".cf-lmenu-title{font-family:'IBM Plex Mono','Inter',monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#F59E0B;padding:16px 18px 10px;border-bottom:1px solid #F59E0B}"
    ".cf-lmenu-list{display:flex;flex-direction:column;padding:8px}"
    ".cf-lmenu-item{display:flex;align-items:center;gap:8px;padding:11px 14px;border-radius:6px;color:#E8EEF6;text-decoration:none;font-size:14px;cursor:pointer;border:0;background:none;text-align:left;width:100%;box-sizing:border-box;font:inherit}"
    ".cf-lmenu-item:hover{background:#063D72}"
    ".cf-lmenu-item.is-current{background:#063D72;box-shadow:inset 3px 0 0 #F59E0B}"
    ".cf-lmenu-item.is-locked{color:#7d8da0;cursor:not-allowed;pointer-events:none}"
    ".cf-lmenu-item .cf-lmenu-mark{margin-left:auto;font-size:12px;opacity:.85}"
    "@media (prefers-reduced-motion:reduce){.cf-lmenu,.cf-lmenu-scrim{transition:none}}"
)


def _signals_light_bg(text_color):
    """The body text color is already luminance-derived: a DARK body color means the
    content background is LIGHT. On a light background the brand-amber heading
    (#F59E0B in SHELL_CONTENT_CSS) fails WCAG AA (~1.7:1), so callers swap headings
    to a dark color there. Returns True when text_color is dark (=> light bg)."""
    h = (text_color or '').lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if len(h) != 6:
        return False
    try:
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return False
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140


def fgui_text_css(text_color, halo_css):
    """Per-frame dynamic rule appended after SHELL_CONTENT_CSS by each renderer:
    the luminance-derived body text color (+ optional text-shadow halo), plus a
    luminance-aware HEADING color. Amber headings (the SHELL_CONTENT_CSS default)
    are brand + pass on dark content areas; on a LIGHT content area they fail AA, so
    override headings to brand navy (#042C53) there — matching the body's adaptation
    and the live-preview (Edit) render."""
    css = '#fgui-content{color:' + (text_color or '') + ';' + (halo_css or '') + '}'
    if _signals_light_bg(text_color):
        css += '#fgui-content h1,#fgui-content h2,#fgui-content h3{color:#042C53}'
    return css
