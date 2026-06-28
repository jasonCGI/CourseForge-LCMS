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
    "#fgui-content{font-family:'IBM Plex Mono','Inter',system-ui,sans-serif;"
    "font-size:14px;line-height:1.6;padding:12px;box-sizing:border-box;"
    "overflow:hidden;height:100%}"
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
    # Title/prompt/counter zones: let glyph descenders show; keep the counter on one line.
    '[data-zone-type="frame_title"],[data-zone-type="lesson_title"],'
    '[data-zone-type="section_title"],[data-zone-type="prompt"],'
    '[data-zone-type="frame_counter"]'
    "{overflow:visible!important;line-height:1.35!important;transform:translateY(-5px)!important}"
    '[data-zone-type="frame_counter"]{white-space:nowrap!important;width:auto!important;min-width:max-content!important}'
)


def fgui_text_css(text_color, halo_css):
    """Per-frame dynamic rule appended after SHELL_CONTENT_CSS by each renderer:
    the luminance-derived body text color (+ optional text-shadow halo)."""
    return '#fgui-content{color:' + (text_color or '') + ';' + (halo_css or '') + '}'
