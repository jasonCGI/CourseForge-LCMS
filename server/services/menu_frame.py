"""
Menu Frame (v1) — navigation frame type.

A menu frame (`frame_type == 'menu'`) stores its navigation items in
`content.menu`, NOT in `content.blocks`:

    content.menu = {
        "title": "Course Menu",
        "items": [
            {"id": "<uuid>", "label": "...", "target_kind": "frame"|"lesson"|"module", "target_id": "<id>"},
            ...
        ]
    }

At runtime the items render as a branded vertical list of clickable nav buttons.
Clicking navigates to the target frame:
  * target_kind == 'frame'           -> that frame
  * target_kind == 'lesson'|'module' -> the FIRST frame (lowest order_index) of
                                        that lesson/module ("topic" target)

The actual href differs per renderer (published SCO -> '<frame>.html' via the
packager frame_map; live preview -> '/api/frames/<id>/preview-html'), so the
caller supplies a `resolve(item) -> href_or_None` callable and this module only
owns the markup + target-kind semantics.

Sub-menus are just nested menu frames (a menu whose items point at sub-topic
frames) — there is no separate sub-menu type. One mechanism.
"""
import json

from .scorm12 import esc


def _record_menu_onclick(title) -> str:
    """Build the inline onclick that records the SOURCE menu before a nav-button
    navigates, so the destination frame can show a "← {title}" back-pill.

    Stores {href: <this menu page's own URL>, title: <menu title>} in
    sessionStorage under 'cf_return_menu'. The menu page's URL is captured as
    window.location.href at click time (the learner is ON the menu), so no
    filename map is needed. Wrapped in try/catch so a sessionStorage failure
    (e.g. privacy mode) can never block the navigation itself.

    Returns an HTML attribute string: onclick="...". The title is JSON-encoded
    for the JS string literal, then HTML-escaped for the attribute value.
    """
    payload = "{href:location.href,title:" + json.dumps(title or "") + "}"
    js = ("try{sessionStorage.setItem('cf_return_menu',JSON.stringify("
          + payload + "))}catch(e){}")
    return f' onclick="{esc(js)}"'


def is_menu_frame(frame) -> bool:
    """True if `frame` is a menu frame."""
    return getattr(frame, "frame_type", None) == "menu"


def get_menu(frame) -> dict:
    """Return the frame's normalized menu dict ({title, items[]}), tolerating a
    missing/malformed content.menu."""
    content = getattr(frame, "content", None) or {}
    menu = content.get("menu") if isinstance(content, dict) else None
    if not isinstance(menu, dict):
        menu = {}
    items = menu.get("items")
    if not isinstance(items, list):
        items = []
    return {"title": menu.get("title", "") or "", "items": items}


def first_frame_of_lesson(lesson):
    """Lowest-order_index frame of a lesson, or None."""
    frames = sorted(getattr(lesson, "frames", []) or [],
                    key=lambda f: f.order_index or 0)
    return frames[0] if frames else None


def first_frame_of_module(module):
    """Lowest-order_index frame across the module's ordered lessons, or None."""
    for lesson in sorted(getattr(module, "lessons", []) or [],
                         key=lambda l: l.order_index or 0):
        fr = first_frame_of_lesson(lesson)
        if fr is not None:
            return fr
    return None


def resolve_target_frame_id(item, frame_index):
    """Resolve a menu item to the id of the frame it should navigate to.

    `frame_index` provides id-keyed lookups built from the project tree:
        {'frames': {id: Frame}, 'lessons': {id: Lesson}, 'modules': {id: Module}}
    A topic target (lesson/module) resolves to that section's first frame.
    Returns the target frame id, or None when it can't be resolved.
    """
    kind = item.get("target_kind", "frame")
    tid = item.get("target_id")
    if not tid:
        return None
    if kind == "frame":
        return tid if tid in frame_index.get("frames", {}) else None
    if kind == "lesson":
        lesson = frame_index.get("lessons", {}).get(tid)
        fr = first_frame_of_lesson(lesson) if lesson else None
        return fr.id if fr else None
    if kind == "module":
        module = frame_index.get("modules", {}).get(tid)
        fr = first_frame_of_module(module) if module else None
        return fr.id if fr else None
    return None


def build_frame_index(project):
    """Build the id->object lookup tables a resolver needs, from a project tree."""
    frames, lessons, modules = {}, {}, {}
    for course in getattr(project, "courses", []) or []:
        for module in getattr(course, "modules", []) or []:
            modules[module.id] = module
            for lesson in getattr(module, "lessons", []) or []:
                lessons[lesson.id] = lesson
                for frame in getattr(lesson, "frames", []) or []:
                    frames[frame.id] = frame
    return {"frames": frames, "lessons": lessons, "modules": modules}


def render_menu_html(menu, resolve, *, shelled=False) -> str:
    """Render a menu dict as a branded vertical nav-button list.

    resolve(item) -> href string (or None/'' for an unresolved/dangling target).
    Buttons with no resolvable target render disabled. Navy/amber to match the
    GUI shell. `shelled` only tweaks the outer padding for the #fgui-content area.
    """
    items = menu.get("items") or []
    title = menu.get("title") or ""

    # Each nav button records the source menu (this page's own URL + the menu
    # title) before navigating, so the destination frame can render a back-pill.
    record = _record_menu_onclick(title)

    btns = []
    for it in items:
        if not isinstance(it, dict):
            continue
        label = esc(it.get("label", "") or "Untitled")
        href = resolve(it) or ""
        if href:
            btns.append(
                f'<a class="cf-menu-btn" href="{esc(href)}"{record}>'
                f'<span class="cf-menu-btn-label">{label}</span>'
                f'<span class="cf-menu-btn-arrow" aria-hidden="true">&#8250;</span>'
                f'</a>'
            )
        else:
            btns.append(
                f'<span class="cf-menu-btn cf-menu-btn-disabled" '
                f'role="link" aria-disabled="true" title="No target set">'
                f'<span class="cf-menu-btn-label">{label}</span>'
                f'<span class="cf-menu-btn-arrow" aria-hidden="true">&#8250;</span>'
                f'</span>'
            )

    if not btns:
        btns.append('<p class="cf-menu-empty">No menu items yet.</p>')

    pad = "16px" if shelled else "32px 24px"
    title_html = (f'<h2 class="cf-menu-title">{esc(title)}</h2>' if title else '')
    return (
        f'<style>{_MENU_CSS}</style>'
        f'<nav class="cf-menu" aria-label="{esc(title) or "Menu"}" style="padding:{pad}">'
        f'{title_html}'
        f'<div class="cf-menu-list">{"".join(btns)}</div>'
        f'</nav>'
    )


_MENU_CSS = """
.cf-menu{max-width:640px;margin:0 auto}
.cf-menu-title{font-size:22px;font-weight:700;color:#042C53;margin:0 0 20px;
  padding-bottom:10px;border-bottom:2px solid #F59E0B}
.cf-menu-list{display:flex;flex-direction:column;gap:12px}
.cf-menu-btn{display:flex;align-items:center;justify-content:space-between;
  text-decoration:none;padding:16px 20px;border-radius:8px;
  background:#042C53;color:#fff;border:1px solid #042C53;
  font-size:16px;font-weight:600;line-height:1.3;cursor:pointer;
  transition:background .12s,border-color .12s,transform .06s;
  font-family:Inter,system-ui,sans-serif}
.cf-menu-btn:hover{background:#063D72;border-color:#F59E0B}
.cf-menu-btn:active{transform:translateY(1px)}
.cf-menu-btn-arrow{color:#F59E0B;font-size:22px;margin-left:16px;flex:none}
.cf-menu-btn-disabled{background:#9aa7b6;border-color:#9aa7b6;cursor:not-allowed;opacity:.7}
.cf-menu-btn-disabled:hover{background:#9aa7b6;border-color:#9aa7b6}
.cf-menu-empty{color:#6a7686;font-style:italic}
"""
