"""
Single-frame live HTML preview (CF-PREVIEW-01).

Renders ONE frame's blocks as a standalone, self-contained HTML page that runs
in a normal browser tab — an escape hatch for verifying media, interactions and
shell fidelity without building/uploading a full SCORM package to an LMS.

It reuses the exact SCORM block renderer (`_render_blocks` from scorm12) so the
preview shows the same markup the published SCO will, then:
  * rewrites SCORM-relative asset paths (media/..., oam/...) to live CourseForge
    serve URLs so assets actually load, and
  * supplies stubbed SCORM 1.2 + 2004 APIs (calls logged to the console) plus the
    WCN-modal and interactive-video runtimes lifted verbatim from sco_shell.html,
    so quizzes, knowledge-check modals, interactive video, and 3D models behave.

This module is import-only against scorm12 — it never mutates the packager.
"""
import json
import re
from functools import lru_cache
from html import escape
from pathlib import Path

from flask import current_app

from .scorm12 import _render_blocks, _build_project_shell_frame, _project_hotspot_cfg
from .theme_resolver import resolve_theme, tokens_to_css

# media/<kind>/<uuid>.<ext>  ->  /api/media/serve/<uuid>   (serve route is kind-agnostic)
_MEDIA_RE = re.compile(
    r"media/(?:images|video|audio|captions|models|clips)/"
    r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
    r"[^\"'\s)]*"
)
# oam/<uuid>/<entry...>  ->  /api/media/oam/<uuid>/files/<entry...>
_OAM_RE = re.compile(
    r"(?<![\w/])oam/"
    r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/"
    r"([^\"'\s)]+)"
)


def _rewrite_asset_paths(html: str) -> str:
    """Turn SCORM package-relative asset paths into absolute live serve URLs."""
    html = _MEDIA_RE.sub(lambda m: f"/api/media/serve/{m.group(1)}", html)
    html = _OAM_RE.sub(lambda m: f"/api/media/oam/{m.group(1)}/files/{m.group(2)}", html)
    return html


def _project_for_frame(frame):
    """Walk Frame -> Lesson -> Module -> Course -> Project (any link may be missing)."""
    lesson = getattr(frame, "lesson", None)
    module = getattr(lesson, "module", None) if lesson else None
    course = getattr(module, "course", None) if module else None
    return getattr(course, "project", None) if course else None


@lru_cache(maxsize=1)
def _shell_runtime_js() -> str:
    """
    Lift the WCN-modal + interactive-video runtime scripts verbatim from
    sco_shell.html so preview behaviour matches the SCO exactly (no copy-paste
    drift). Returns the two contiguous <script>...</script> blocks, or '' if the
    template can't be read. Cached — the template is static at runtime.
    """
    try:
        shell_src = (Path(current_app.root_path) / "templates" / "sco_shell.html").read_text(
            encoding="utf-8"
        )
    except OSError:
        return ""
    marker = shell_src.find("WCN Modal system")
    if marker == -1:
        return ""
    start = shell_src.rfind("<script>", 0, marker)
    end = shell_src.rfind("</script>")
    if start == -1 or end == -1:
        return ""
    return shell_src[start : end + len("</script>")]


# Static reading layout — kept separate from the theme tokens (which define --cf-* vars).
_BASE_CSS = """
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  background:#0d1017;color:#e6edf3;line-height:1.6;
}
.cf-preview-main{
  max-width:880px;margin:0 auto;padding:88px 32px 64px;background:#ffffff;color:#1a1a1a;min-height:100vh;
}
.cf-preview-main img{max-width:100%;height:auto}
.cf-preview-main iframe{max-width:100%;border:0}
.cf-media{
  border:1px dashed #c9ced6;border-radius:8px;padding:24px;text-align:center;
  color:#6a7686;font-size:14px;margin-bottom:20px;background:#f6f8fb;
}
"""

_BANNER = """
<div id="cf-preview-banner" role="status" style="
  position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;align-items:center;gap:10px;
  padding:9px 16px;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;
  background:#1a1f29;color:#f5f6f8;border-bottom:2px solid #F59E0B;box-shadow:0 2px 12px rgba(0,0,0,0.4)">
  <span style="width:8px;height:8px;border-radius:50%;background:#F59E0B;box-shadow:0 0 8px #F59E0B;flex:none"></span>
  <span style="font-weight:600;color:#F59E0B;letter-spacing:0.04em">LIVE PREVIEW</span>
  <span style="color:#9aa4b2">single frame · SCORM calls are stubbed (open the console to watch them)</span>
  <button type="button" aria-label="Dismiss preview banner"
    onclick="var b=document.getElementById('cf-preview-banner');if(b)b.remove();"
    style="margin-left:auto;background:none;border:none;color:#9aa4b2;font-size:14px;cursor:pointer;padding:2px 6px;line-height:1">✕</button>
</div>
"""

# Stubbed SCORM 1.2 + 2004 APIs and the quiz helpers the SCO shell normally provides.
_STUB_JS = """
(function(){
  function mk(api){
    var o={};
    ['Initialize','LMSInitialize','Terminate','LMSFinish','Commit','LMSCommit'].forEach(function(fn){
      o[fn]=function(){console.log('[preview '+api+'] '+fn,[].slice.call(arguments));return 'true';};
    });
    ['GetValue','LMSGetValue'].forEach(function(fn){
      o[fn]=function(k){console.log('[preview '+api+'] '+fn,k);return '';};
    });
    ['SetValue','LMSSetValue'].forEach(function(fn){
      o[fn]=function(k,v){console.log('[preview '+api+'] '+fn,k,v);return 'true';};
    });
    ['GetLastError','LMSGetLastError'].forEach(function(fn){o[fn]=function(){return '0';};});
    ['GetErrorString','LMSGetErrorString','GetDiagnostic','LMSGetDiagnostic'].forEach(function(fn){o[fn]=function(){return '';};});
    return o;
  }
  window.API = mk('1.2');            // SCORM 1.2 (window.API)
  window.API_1484_11 = mk('2004');   // SCORM 2004 (window.API_1484_11)
})();

// Minimal SCORM facade + quiz helpers (mirror sco_shell.html, navigation omitted).
var scorm = {
  api:null, found:false,
  init:function(){ this.api=window.API||null; if(this.api){this.found=true;this.api.LMSInitialize('');} },
  setValue:function(k,v){ if(this.api) this.api.LMSSetValue(k,v); },
  complete:function(){ this.setValue('cmi.core.lesson_status','completed'); if(this.api) this.api.LMSFinish(''); }
};
function cfSelectChoice(blockId, btn){
  document.querySelectorAll('#quiz-'+blockId+' .cf-choice').forEach(function(b){b.classList.remove('selected');});
  btn.classList.add('selected');
  btn.style.borderColor='var(--cf-primary)';
  btn.style.background='#F0F6FF';
}
function cfSubmitQuiz(blockId, correctIndex){
  var selected=document.querySelector('#quiz-'+blockId+' .cf-choice.selected');
  if(!selected) return;
  var idx=parseInt(selected.getAttribute('data-index'));
  var choices=document.querySelectorAll('#quiz-'+blockId+' .cf-choice');
  choices.forEach(function(btn){btn.disabled=true;});
  choices[correctIndex].classList.add('correct');
  if(idx!==correctIndex) selected.classList.add('incorrect');
  var fb=document.getElementById('feedback-'+blockId);
  if(fb){fb.style.display='block';fb.classList.add(idx===correctIndex?'correct':'incorrect');}
  scorm.setValue('cmi.core.score.raw', idx===correctIndex?'100':'0');
}
scorm.init();
"""


# Head assets shared by both preview layouts (fonts + Video.js from CDN).
_HEAD_ASSETS = (
    "<link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap\" rel=\"stylesheet\">"
    "<link href=\"https://vjs.zencdn.net/8.10.0/video-js.css\" rel=\"stylesheet\">"
    "<script src=\"https://vjs.zencdn.net/8.10.0/video.min.js\"></script>"
)


def _project_shell_for(project):
    """Return the GuiShell selected at the project level, or None."""
    if not project or not getattr(project, "gui_shell_id", None):
        return None
    from ..models.gui_shell import GuiShell
    shell = GuiShell.query.get(project.gui_shell_id)
    return shell if (shell and shell.stored_path) else None


def _build_shell_preview(shell, frame, project) -> str | None:
    """
    Render the frame wrapped in the project's GUI shell exactly as the published
    SCO will (shell becomes the page, blocks injected via window.fgui), then
    rewire its paths to live serve URLs and graft in the preview chrome.
    """
    from ..version import VERSION
    lesson = getattr(frame, "lesson", None)
    module = getattr(lesson, "module", None) if lesson else None
    course = getattr(module, "course", None) if module else None
    html, _ = _build_project_shell_frame(
        shell, frame, 0, 1,
        getattr(lesson, "name", "") or "",
        getattr(course, "name", "") or "",
        {0: ""}, VERSION, 1, 1,
        hotspot_cfg=_project_hotspot_cfg(project),
        preview=True,
    )
    if not html:
        return None

    # gui_assets/<id>/  -> live shell-asset serve URL;  media/.. / oam/.. -> live serve.
    html = html.replace(f"gui_assets/{shell.id}/", f"/api/gui-shells/{shell.id}/assets/")
    html = _rewrite_asset_paths(html)

    # Graft preview chrome into the shell's own document.
    chrome_scripts = "<script>" + _STUB_JS + "</script>" + _shell_runtime_js()
    if "</head>" in html:
        html = html.replace("</head>", _HEAD_ASSETS + "</head>", 1)
    else:
        html = _HEAD_ASSETS + html
    if "</body>" in html:
        html = html.replace("</body>", _BANNER + chrome_scripts + "</body>", 1)
    else:
        html = html + _BANNER + chrome_scripts
    return html


def build_frame_preview_html(frame) -> str:
    """Build a self-contained preview HTML page for a single frame."""
    project = _project_for_frame(frame)

    # Project-level GUI shell: render the frame inside the shell (the real SCO look).
    shell = _project_shell_for(project)
    if shell:
        shell_html = _build_shell_preview(shell, frame, project)
        if shell_html:
            return shell_html

    blocks = (frame.content or {}).get("blocks", []) if isinstance(frame.content, dict) else []
    blocks_html = _rewrite_asset_paths(_render_blocks(blocks, scorm_bridge=False,
                                                      hotspot_cfg=_project_hotspot_cfg(project),
                                                      preview=True))

    try:
        theme_css = tokens_to_css(resolve_theme(project)) if project else ""
    except Exception:
        theme_css = ""

    title = escape(frame.name or "Untitled frame")
    runtime_js = _shell_runtime_js()

    return "".join([
        "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        f"<title>Preview · {title}</title>",
        _HEAD_ASSETS,
        "<style>", _BASE_CSS, theme_css, "</style></head><body>",
        _BANNER,
        "<main class=\"cf-preview-main\">", blocks_html, "</main>",
        "<script>", _STUB_JS, "</script>",
        runtime_js,
        "</body></html>",
    ])


# ── Full-course preview ─────────────────────────────────────────────────────
# A navigable wrapper that chains each frame's single-frame preview in an iframe,
# so authors can walk the whole course (Prev/Next/jump/keyboard) and test flow
# exactly as it renders — shell, media, OAM and all.

_COURSE_PREVIEW_TPL = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Course preview · __TITLE__</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{display:flex;flex-direction:column;background:#0d1017;font-family:'IBM Plex Mono',ui-monospace,monospace;color:#e6edf3}
  #cbar{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:9px 14px;background:#1a1f29;border-bottom:2px solid #F59E0B;box-shadow:0 2px 12px rgba(0,0,0,0.4);position:relative}
  #cbar .dot{width:8px;height:8px;border-radius:50%;background:#F59E0B;box-shadow:0 0 8px #F59E0B;flex:none}
  #cbar .brand{font-weight:600;color:#F59E0B;letter-spacing:.04em}
  #cbar .ctx{color:#9aa4b2;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46vw}
  #cbar .spacer{flex:1}
  #cbar button,#cbar select{font-family:inherit;font-size:12px;background:#2a313d;color:#e6edf3;border:1px solid #39414f;border-radius:5px;padding:6px 12px;cursor:pointer}
  #cbar button:disabled{opacity:.4;cursor:not-allowed}
  #cbar button.nav{background:#F59E0B;color:#042C53;border:none;font-weight:600}
  #cbar select{max-width:240px}
  #counter{font-size:12px;color:#c8d2de;min-width:96px;text-align:center}
  #prog{flex:0 0 auto;height:3px;background:#222a35}
  #prog>i{display:block;height:100%;background:#F59E0B;width:0;transition:width .2s}
  #frame{flex:1;width:100%;border:0;background:#fff;display:block}
</style></head>
<body>
  <div id="cbar">
    <span class="dot"></span><span class="brand">COURSE PREVIEW</span>
    <span class="ctx" id="ctx"></span>
    <span class="spacer"></span>
    <button id="prev" aria-label="Previous frame">&#9664; Prev</button>
    <span id="counter"></span>
    <button id="next" class="nav" aria-label="Next frame">Next &#9654;</button>
    <select id="jump" aria-label="Jump to frame"></select>
  </div>
  <div id="prog"><i id="progfill"></i></div>
  <iframe id="frame" title="Course frame preview"></iframe>
<script>
(function(){
  var FRAMES = __FRAMES__;
  var i = 0;
  var frame=document.getElementById('frame'), ctx=document.getElementById('ctx'),
      counter=document.getElementById('counter'), prev=document.getElementById('prev'),
      next=document.getElementById('next'), jump=document.getElementById('jump'),
      progfill=document.getElementById('progfill');
  if(!FRAMES.length){ ctx.textContent='This course has no frames yet.'; counter.textContent=''; prev.disabled=next.disabled=true; return; }
  FRAMES.forEach(function(f,n){
    var o=document.createElement('option'); o.value=n;
    o.textContent=(n+1)+'. '+f.name+(f.optional?'  (optional)':'');
    jump.appendChild(o);
  });
  function go(n){
    i=Math.max(0,Math.min(FRAMES.length-1,n));
    var f=FRAMES[i];
    frame.src='/api/frames/'+f.id+'/preview-html?cp='+i;
    ctx.textContent=[f.course,f.lesson,f.name].filter(Boolean).join('  ·  ');
    counter.textContent='Frame '+(i+1)+' of '+FRAMES.length;
    prev.disabled=(i===0); next.disabled=(i===FRAMES.length-1);
    jump.value=i;
    progfill.style.width=(FRAMES.length>1?(i/(FRAMES.length-1)*100):100)+'%';
    try{ history.replaceState(null,'','#'+(i+1)); }catch(e){}
  }
  prev.onclick=function(){ go(i-1); };
  next.onclick=function(){ go(i+1); };
  jump.onchange=function(){ go(parseInt(jump.value,10)||0); };
  document.addEventListener('keydown',function(e){
    if(e.target&&/^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if(e.key==='ArrowRight'||e.key==='PageDown'){ e.preventDefault(); go(i+1); }
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); go(i-1); }
  });
  // Shell NEXT/PREV (postMessage from a GUI-shell frame) also drive the course.
  window.addEventListener('message',function(e){
    if(e.source!==frame.contentWindow) return;   // only the embedded frame may drive nav
    var d=e.data||{}; if(d.type!=='fgui_action') return;
    if(d.action==='NEXT'||d.action==='CONTINUE'||d.action==='SUBMIT') go(i+1);
    else if(d.action==='PREVIOUS') go(i-1);
    else if(d.action==='MENU') go(0);
  });
  var start=parseInt((location.hash||'').replace('#',''),10);
  go(isNaN(start)?0:start-1);
})();
</script>
</body></html>"""


def build_course_preview_html(project) -> str:
    """Navigable preview of the whole course (chains per-frame previews)."""
    frames = []
    # `or 0` — order_index can be NULL (raw inserts / PATCH bodies); None<int crashes sorted().
    for course in sorted(getattr(project, "courses", []) or [], key=lambda c: c.order_index or 0):
        for mod in sorted(course.modules or [], key=lambda m: m.order_index or 0):
            for lesson in sorted(mod.lessons or [], key=lambda l: l.order_index or 0):
                for fr in sorted(lesson.frames or [], key=lambda f: f.order_index or 0):
                    frames.append({
                        "id": fr.id,
                        "name": fr.name or "Untitled frame",
                        "lesson": lesson.name or "",
                        "course": course.name or "",
                        "optional": bool(getattr(fr, "optional", False)),
                    })
    data = json.dumps(frames).replace("</", "<\\/")
    repl = {"__FRAMES__": data, "__TITLE__": escape(project.name or "Course")}
    # single pass so an injected value can't contain (and re-trigger) the other token
    return re.sub("__FRAMES__|__TITLE__", lambda m: repl[m.group(0)], _COURSE_PREVIEW_TPL)
