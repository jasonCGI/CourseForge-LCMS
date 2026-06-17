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
import re
from html import escape
from pathlib import Path

from flask import current_app

from .scorm12 import _render_blocks
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


def _shell_runtime_js() -> str:
    """
    Lift the WCN-modal + interactive-video runtime scripts verbatim from
    sco_shell.html so preview behaviour matches the SCO exactly (no copy-paste
    drift). Returns the two contiguous <script>...</script> blocks, or '' if the
    template can't be read.
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


def build_frame_preview_html(frame) -> str:
    """Build a self-contained preview HTML page for a single frame."""
    blocks = (frame.content or {}).get("blocks", []) if isinstance(frame.content, dict) else []
    blocks_html = _rewrite_asset_paths(_render_blocks(blocks, scorm_bridge=False))

    project = _project_for_frame(frame)
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
        "<link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&display=swap\" rel=\"stylesheet\">",
        "<link href=\"https://vjs.zencdn.net/8.10.0/video-js.css\" rel=\"stylesheet\">",
        "<script src=\"https://vjs.zencdn.net/8.10.0/video.min.js\"></script>",
        "<style>", _BASE_CSS, theme_css, "</style></head><body>",
        _BANNER,
        "<main class=\"cf-preview-main\">", blocks_html, "</main>",
        "<script>", _STUB_JS, "</script>",
        runtime_js,
        "</body></html>",
    ])
