"""
Standalone Web HTML Bundle Builder
Single self-contained HTML file — no LMS required.
All frames rendered as sections, JS handles navigation.
"""

import uuid
import json
from io import BytesIO
import zipfile
from datetime import datetime
from flask import render_template

from ..models.project import Project, project_full_query
from ..models.media import MediaAsset
from ..services.theme_resolver import resolve_theme, tokens_to_css
from ..services.scorm12 import _render_blocks, _project_hotspot_cfg
from ..version import VERSION, SCHEMA_VERSION

# 508-compliant WCN modal controller (focus trap, Escape, focus return).
# Shared by SCO templates; included here so WCN modal blocks work in the web
# bundle too (the shared _render_blocks emits onclick="wcnOpenModal(...)").
# Plain string (not an f-string) so the JS braces stay literal.
WCN_SCRIPT = """
  <script>
  var wcnActiveModal = null, wcnTrigger = null;
  function wcnOpenModal(modalId, triggerId) {
    var modal = document.getElementById(modalId), trigger = document.getElementById(triggerId);
    if (!modal) return;
    wcnActiveModal = modal; wcnTrigger = trigger;
    modal.removeAttribute('hidden'); modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false');
    var f = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (f.length > 0) f[0].focus();
    document.body.style.overflow = 'hidden';
  }
  function wcnCloseModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true');
    if (wcnTrigger) wcnTrigger.focus();
    wcnActiveModal = null; wcnTrigger = null; document.body.style.overflow = '';
  }
  function wcnAcknowledge(modalId, ackBtnId) {
    var b = document.getElementById(ackBtnId);
    if (b) { b.textContent = '\\u2713 Acknowledged'; b.disabled = true; b.style.opacity = '0.6'; }
    var trig = wcnTrigger;
    wcnCloseModal(modalId);
    if (trig) {
      trig.style.display = 'none';
      var a = document.createElement('span');
      a.textContent = '\\u2713 ' + (trig.dataset.type || 'WCN') + ' acknowledged';
      a.style.cssText = 'font-size:11px;color:#4CAF50;margin-left:4px';
      trig.parentNode.insertBefore(a, trig.nextSibling);
    }
  }
  document.addEventListener('keydown', function(e) {
    if (!wcnActiveModal) return;
    var f = wcnActiveModal.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    var first = f[0], last = f[f.length - 1];
    if (e.key === 'Escape') { e.preventDefault(); wcnCloseModal(wcnActiveModal.id); return; }
    if (e.key === 'Tab') {
      if (f.length === 0) { e.preventDefault(); return; }
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }
  });
  </script>
"""


def _ivideo_runtime_js() -> str:
    """Lift JUST the interactive-video runtime <script> (iVideoInit + the branded
    transport bar controller iVideoWireBar) from sco_shell.html, so the standalone
    web bundle gets the SAME custom control bar + interaction layer as the SCO —
    no copy-paste drift. WCN modal JS is supplied separately (WCN_SCRIPT), so we
    take only the iVideo block to avoid redefining it. Returns '' if unavailable."""
    from flask import current_app
    from pathlib import Path
    try:
        src = (Path(current_app.root_path) / "templates" / "sco_shell.html").read_text(encoding="utf-8")
    except OSError:
        return ""
    marker = src.find("IVideo runtime")
    if marker == -1:
        return ""
    start = src.rfind("<script>", 0, marker)
    end = src.find("</script>", marker)
    if start == -1 or end == -1:
        return ""
    return src[start:end + len("</script>")]


def build_web_bundle(project_id: str) -> tuple[BytesIO, str]:
    """
    Build a standalone web ZIP containing index.html + assets.
    Returns (BytesIO zip buffer, suggested filename).
    """
    project = project_full_query().get_or_404(project_id)
    tokens  = resolve_theme(project)
    css     = tokens_to_css(tokens)

    all_frames = []
    for course in sorted(project.courses, key=lambda c: c.order_index):
        for mod in sorted(course.modules, key=lambda m: m.order_index):
            for lesson in sorted(mod.lessons, key=lambda l: l.order_index):
                for frame in sorted(lesson.frames, key=lambda f: f.order_index):
                    all_frames.append((frame, lesson, course))

    total = len(all_frames)

    # One media query, threaded into rendering so ivideo/model3d blocks resolve
    # their asset extension via dict lookup instead of a SELECT per block.
    asset_by_id = {a.id: a for a in MediaAsset.query.filter_by(project_id=project_id).all()}

    # Build frames data for JS
    frames_data = []
    for idx, (frame, lesson, course) in enumerate(all_frames):
        frames_data.append({
            'id':       frame.id,
            'name':     frame.name,
            'lesson':   lesson.name,
            'course':   course.name,
            'html':     _render_blocks(frame.content.get('blocks', []), asset_map=asset_by_id,
                                       hotspot_cfg=_project_hotspot_cfg(project)),
            'progress': round((idx / max(total - 1, 1)) * 100),
        })

    IVIDEO_RUNTIME = _ivideo_runtime_js()

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="CourseForge v{VERSION}">
  <meta name="cf-schema" content="{SCHEMA_VERSION}">
  <meta name="cf-published" content="{datetime.utcnow().strftime('%Y-%m-%d')}">
  <title>{project.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;400;600&display=swap" rel="stylesheet">
  <style>
    {css}
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: var(--cf-font, Inter, system-ui, sans-serif);
      background: var(--cf-bg, #fff);
      color: var(--cf-text, #1a1a1a);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }}
    .cf-nav {{
      background: var(--cf-nav-bg, #042C53);
      color: var(--cf-nav-text, #B5D4F4);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
    }}
    .cf-nav-title {{ font-size: 15px; font-weight: 500; flex: 1; }}
    .cf-nav-btn {{
      padding: 6px 16px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: var(--cf-radius, 6px);
      background: transparent;
      color: var(--cf-nav-text, #B5D4F4);
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
    }}
    .cf-nav-btn:hover {{ background: rgba(255,255,255,0.1); }}
    .cf-nav-btn:disabled {{ opacity: 0.3; cursor: default; }}
    .cf-progress {{ height: 3px; background: rgba(255,255,255,0.15); }}
    .cf-progress-fill {{
      height: 100%;
      background: var(--cf-accent, #D4820A);
      transition: width 0.3s ease;
    }}
    .cf-content {{
      flex: 1;
      padding: 32px 40px;
      max-width: 900px;
      margin: 0 auto;
      width: 100%;
    }}
    .cf-frame-title {{
      font-size: 22px;
      font-weight: 600;
      color: var(--cf-secondary, #042C53);
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 3px solid var(--cf-accent, #D4820A);
    }}
    .cf-text {{ margin-bottom: 20px; line-height: 1.7; }}
    /* Global reset zeroes padding-left — restore a real list indent. */
    .cf-text ul, .cf-text ol {{ margin: 8px 0 12px 0; padding-left: 1.6em; }}
    .cf-text li {{ margin-bottom: 4px; }}
    .cf-media {{
      padding: 32px; border: 2px dashed var(--cf-primary, #185FA5);
      border-radius: var(--cf-radius, 6px); text-align: center;
      background: #F8FBFF; color: var(--cf-primary, #185FA5);
      margin-bottom: 20px;
    }}
    .cf-quiz {{ margin-bottom: 20px; }}
    .cf-quiz-question {{ font-size:16px; font-weight:600; margin-bottom:16px; }}
    .cf-choice {{
      display:block; width:100%; padding:12px 16px; margin-bottom:8px;
      border:2px solid #ddd; border-radius:var(--cf-radius,6px);
      background:#fff; font-size:15px; text-align:left; cursor:pointer;
      font-family:inherit; transition:all 0.15s;
    }}
    .cf-choice:hover {{ border-color:var(--cf-primary,#185FA5); background:#F0F6FF; }}
    .cf-choice.correct   {{ border-color:#3B8A4A; background:#EAF6EC; color:#1E7E34; }}
    .cf-choice.incorrect {{ border-color:#C0392B; background:#FDECEA; color:#C0392B; }}
    .cf-submit {{
      padding:10px 24px; background:var(--cf-primary,#185FA5); color:#fff;
      border:none; border-radius:var(--cf-radius,6px); font-size:14px;
      font-weight:600; cursor:pointer; font-family:inherit; margin-top:8px;
    }}
    .cf-feedback {{
      padding:12px 16px; border-radius:var(--cf-radius,6px);
      margin-top:12px; font-weight:500; display:none;
    }}
    .cf-feedback.correct   {{ background:#EAF6EC; color:#1E7E34; border:1px solid #3B8A4A; }}
    .cf-feedback.incorrect {{ background:#FDECEA; color:#C0392B; border:1px solid #C0392B; }}
    .cf-branch-btns {{ display:flex; gap:12px; }}
    .cf-branch-btn {{
      flex:1; padding:14px 20px; border:2px solid;
      border-radius:var(--cf-radius,6px); font-size:15px;
      font-weight:600; cursor:pointer; font-family:inherit;
    }}
    .cf-branch-btn.true  {{ border-color:#3B8A4A; color:#3B8A4A; background:#fff; }}
    .cf-branch-btn.false {{ border-color:#C0392B; color:#C0392B; background:#fff; }}
    .cf-branch-condition {{ font-size:16px; font-weight:600; margin-bottom:16px; }}
  </style>
</head>
<body>
  <nav class="cf-nav">
    <span class="cf-nav-title" id="nav-title"></span>
    <button class="cf-nav-btn" id="btn-prev" onclick="navigate(-1)">← Back</button>
    <span id="nav-count" style="font-size:12px;opacity:0.6;"></span>
    <button class="cf-nav-btn" id="btn-next" onclick="navigate(1)">Next →</button>
  </nav>
  <div class="cf-progress">
    <div class="cf-progress-fill" id="progress-fill" style="width:0%"></div>
  </div>
  <div class="cf-content" id="main-content"></div>

  <script>
  var frames = {json.dumps(frames_data, ensure_ascii=False)};
  var current = 0;

  function render(idx) {{
    var f = frames[idx];
    document.getElementById('nav-title').textContent = f.lesson;
    document.getElementById('nav-count').textContent = (idx+1) + ' / ' + frames.length;
    document.getElementById('progress-fill').style.width = f.progress + '%';
    document.getElementById('btn-prev').disabled = idx === 0;
    document.getElementById('btn-next').disabled = idx === frames.length - 1;
    var mc = document.getElementById('main-content');
    mc.innerHTML = '<h1 class="cf-frame-title">' + f.name + '</h1>' + f.html;
    // Frame HTML is injected via innerHTML, so its inline <script> tags (the
    // iVideo / 3D / OAM block initializers) do NOT auto-run. Re-create them so
    // those blocks come alive — including the interactive-video transport bar
    // and its interaction runtime (iVideoInit), defined by the lifted shell JS.
    var scripts = mc.querySelectorAll('script');
    for (var s = 0; s < scripts.length; s++) {{
      var old = scripts[s], ns = document.createElement('script');
      if (old.src) ns.src = old.src; else ns.textContent = old.textContent;
      old.parentNode.replaceChild(ns, old);
    }}
    current = idx;
    window.scrollTo(0, 0);
  }}

  function navigate(dir) {{
    var next = current + dir;
    if (next >= 0 && next < frames.length) render(next);
  }}

  // Quiz functions
  function cfSelectChoice(blockId, btn) {{
    document.querySelectorAll('#quiz-' + blockId + ' .cf-choice')
      .forEach(function(b) {{ b.classList.remove('selected'); b.style.borderColor=''; b.style.background=''; }});
    btn.classList.add('selected');
    btn.style.borderColor = 'var(--cf-primary)';
    btn.style.background  = '#F0F6FF';
  }}

  function cfSubmitQuiz(blockId, correctIndex) {{
    var selected = document.querySelector('#quiz-' + blockId + ' .cf-choice.selected');
    if (!selected) return;
    var idx = parseInt(selected.getAttribute('data-index'));
    document.querySelectorAll('#quiz-' + blockId + ' .cf-choice')
      .forEach(function(b) {{ b.disabled = true; }});
    document.querySelectorAll('#quiz-' + blockId + ' .cf-choice')[correctIndex].classList.add('correct');
    if (idx !== correctIndex) selected.classList.add('incorrect');
    var fb = document.getElementById('feedback-' + blockId);
    fb.style.display = 'block';
    fb.classList.add(idx === correctIndex ? 'correct' : 'incorrect');
  }}

  render(0);
  </script>
{WCN_SCRIPT}
{IVIDEO_RUNTIME}
</body>
</html>"""

    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('index.html', html)

    buf.seek(0)
    safe_name = project.name.replace(' ', '_').lower()[:40]
    filename  = f"{safe_name}_web_{datetime.utcnow().strftime('%Y%m%d')}.zip"
    return buf, filename
