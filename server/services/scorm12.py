"""
SCORM 1.2 Package Builder
Produces a ZIP file containing:
  - imsmanifest.xml
  - One SCO HTML file per frame
  - Shared assets (CSS tokens baked in)
"""

import os
import re
import uuid
import zipfile
import json
from io import BytesIO
from pathlib import Path
from datetime import datetime
from functools import lru_cache
from flask import current_app, render_template
from markupsafe import escape as _mk_escape

# ── Stored-XSS hardening (security review C4) ────────────────────────────────
# User-authored block fields are interpolated into generated SCO/preview HTML and
# into inline on*= handlers. Everything below escapes those values at the point of
# interpolation. Plain-text fields go through esc(); the one RICH-HTML field (text
# block body) is run through a bleach allowlist so intended formatting survives
# while scripts / event handlers / javascript: URLs are stripped.
try:
    import bleach
    _HAVE_BLEACH = True
except ImportError:                       # pragma: no cover - bleach is a hard dep
    _HAVE_BLEACH = False

# Allowlist for author rich text. Mirrors the editor's formatting toolbar:
# block/inline text, lists, links, headings, quotes, code. No script/style, no
# event-handler attributes, and href is URL-scheme filtered (no javascript:).
_RICH_TAGS = ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a',
              'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre', 'span']
_RICH_ATTRS = {'a': ['href', 'title', 'target', 'rel']}
_RICH_PROTOCOLS = ['http', 'https', 'mailto', 'tel']

# Conservative fallback if bleach is unavailable: strip <script>/<style> blocks
# and any on*= handlers, neutralize javascript: URLs, then keep the rest.
_FALLBACK_SCRIPT_RE = re.compile(r'(?is)<\s*(script|style)\b.*?<\s*/\s*\1\s*>')
_FALLBACK_ON_RE = re.compile(r'(?is)\son[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)')
_FALLBACK_JSURL_RE = re.compile(r'(?i)(href|src)\s*=\s*(["\']?)\s*javascript:[^"\'>\s]*\2')


def esc(value):
    """HTML-escape an arbitrary user value for safe interpolation into markup or
    an attribute / on*= string. Coerces to str first so None/ints don't blow up."""
    return str(_mk_escape('' if value is None else value))


def _sanitize_rich_html(html):
    """Allowlist-sanitize author rich text (the text block body) so intended
    formatting survives but scripts / event handlers / javascript: URLs cannot."""
    s = '' if html is None else str(html)
    if _HAVE_BLEACH:
        return bleach.clean(s, tags=_RICH_TAGS, attributes=_RICH_ATTRS,
                            protocols=_RICH_PROTOCOLS, strip=True)
    # Hand-rolled fallback (bleach missing): drop script/style, on*= handlers and
    # javascript: URLs. Less robust than bleach but blocks the obvious vectors.
    s = _FALLBACK_SCRIPT_RE.sub('', s)
    s = _FALLBACK_ON_RE.sub('', s)
    s = _FALLBACK_JSURL_RE.sub(r'\1=\2#\2', s)
    return s


def _safe_id(value):
    """Validate a frame id / filename token used in navigation. Returns the value
    only if it matches the expected [\\w-]+ shape, else '' (so a malformed/hostile
    value can't break out of the onclick string)."""
    s = '' if value is None else str(value)
    return s if re.fullmatch(r'[\w-]+', s) else ''


def _f(value, default=0.0):
    """Coerce a user dimension to float (so a string can't break out of a style
    attribute). Non-numeric / NaN / inf -> default."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return float(default)
    if n != n or n in (float('inf'), float('-inf')):
        return float(default)
    return n

from ..models.project import Project, Frame, project_full_query


@lru_cache(maxsize=32)
def _read_text_cached(path):
    """Read a (static, immutable) shell HTML file once per publish process —
    the per-project shell is otherwise re-read from disk for every frame."""
    return Path(path).read_text(encoding='utf-8')
from ..models.media import MediaAsset
from ..services.theme_resolver import resolve_theme, tokens_to_css
from ..services.cf_icons import PLAY_SVG, PLAY_SVG_JS, PAUSE_SVG_JS
from ..version import VERSION, SCHEMA_VERSION


# ── Branded slim audio player ────────────────────────────────────────────────
# A self-contained on-brand audio bar (navy surface, amber accent, mono time,
# video-matched speed set) used by every vanilla renderer (live preview HTML,
# published SCO, GUI shell injection). No React, no external CSS — each player
# carries inline styles and the page-wide wiring script is emitted once.
CF_AUDIO_NAVY  = '#042C53'   # matches the GUI/preview chrome navy
CF_AUDIO_AMBER = '#F59E0B'   # play/pause + progress fill accent
CF_AUDIO_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]   # mirrors the video playbackRates


def _cf_audio_bar(src, caption='', dock='inline', bid=None):
    """Emit the branded slim audio bar markup (no <script>).

    dock='inline'  -> renders in content flow.
    dock='bottom'  -> pinned full-width to the bottom of the content/frame
                      container (position:absolute; the container is relative).
    """
    bid = bid or uuid.uuid4().hex[:8]
    cap = (f'<div style="font-size:12px;color:#888;margin-top:6px">{esc(caption)}</div>'
           if caption and dock != 'bottom' else '')
    docked = dock == 'bottom'
    # Outer wrapper: inline flows; bottom pins to the bottom of the nearest
    # positioned ancestor (the content/frame container, made relative below).
    wrap_style = (
        'position:absolute;left:0;right:0;bottom:0;z-index:40;padding:8px 12px;'
        'box-sizing:border-box;background:rgba(4,44,83,0.96);'
        'box-shadow:0 -2px 12px rgba(0,0,0,0.18)'
        if docked else 'margin:8px 0'
    )
    dock_attr = ' data-cf-dock="bottom"' if docked else ''
    rates = ','.join(str(r) for r in CF_AUDIO_RATES)
    bar = (
        f'<div class="cf-audio" data-cf-audio data-rates="{rates}" '
        f'style="display:flex;align-items:center;gap:12px;height:48px;'
        f'padding:0 12px;box-sizing:border-box;'
        f'background:{CF_AUDIO_NAVY};color:#E8EEF6;'
        f"font-family:'IBM Plex Mono',ui-monospace,monospace;\">"
        f'<audio data-cf-src preload="metadata" src="{esc(src)}"></audio>'
        f'<button type="button" data-cf-play aria-label="Play" '
        f'style="flex:0 0 auto;width:32px;height:32px;border:none;border-radius:50%;'
        f'background:{CF_AUDIO_AMBER};color:{CF_AUDIO_NAVY};cursor:pointer;'
        f'display:flex;align-items:center;justify-content:center;font-size:14px;'
        f'line-height:1;padding:0">{PLAY_SVG}</button>'
        f'<span data-cf-cur style="flex:0 0 auto;font-size:12px;letter-spacing:.02em">0:00</span>'
        f'<input data-cf-seek type="range" min="0" max="1000" value="0" step="1" '
        f'aria-label="Seek" '
        f'style="flex:1 1 auto;height:4px;accent-color:{CF_AUDIO_AMBER};cursor:pointer;'
        f'min-width:60px">'
        f'<span data-cf-dur style="flex:0 0 auto;font-size:12px;letter-spacing:.02em;'
        f'color:#9FB4CC">0:00</span>'
        f'<button type="button" data-cf-rate aria-label="Playback speed" '
        f'style="flex:0 0 auto;min-width:42px;height:26px;border:1px solid rgba(245,158,11,.5);'
        f'border-radius:6px;background:transparent;color:{CF_AUDIO_AMBER};cursor:pointer;'
        f"font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px;padding:0 6px\">1x</button>"
        f'</div>{cap}'
    )
    return f'<div{dock_attr} style="{wrap_style}">{bar}</div>'


# One page-wide controller wires every [data-cf-audio] bar. Idempotent: guarded
# by a global flag so multiple audio blocks (or repeated injections) don't double
# the script. Self-contained vanilla JS — no React, no deps.
def _cf_audio_script():
    return (
        '<script>(function(){'
        'if(window.__cfAudioWired)return;window.__cfAudioWired=true;'
        'function fmt(s){if(!isFinite(s)||s<0)s=0;var m=Math.floor(s/60),'
        'x=Math.floor(s%60);return m+":"+(x<10?"0":"")+x;}'
        'function wire(bar){'
        'if(bar.__cfWired)return;bar.__cfWired=true;'
        'var a=bar.querySelector("[data-cf-src]"),'
        'play=bar.querySelector("[data-cf-play]"),'
        'seek=bar.querySelector("[data-cf-seek]"),'
        'cur=bar.querySelector("[data-cf-cur]"),'
        'dur=bar.querySelector("[data-cf-dur]"),'
        'rateBtn=bar.querySelector("[data-cf-rate]");'
        'var rates=(bar.getAttribute("data-rates")||"1").split(",").map(parseFloat),ri=rates.indexOf(1);'
        'if(ri<0)ri=0;var seeking=false;'
        'function ico(p){play.innerHTML=p?"' + PAUSE_SVG_JS + '":"' + PLAY_SVG_JS + '";'
        'play.setAttribute("aria-label",p?"Pause":"Play");}'
        'play.addEventListener("click",function(){a.paused?a.play():a.pause();});'
        'a.addEventListener("play",function(){ico(true);});'
        'a.addEventListener("pause",function(){ico(false);});'
        'a.addEventListener("loadedmetadata",function(){dur.textContent=fmt(a.duration);});'
        'a.addEventListener("timeupdate",function(){'
        'cur.textContent=fmt(a.currentTime);'
        'if(!seeking&&a.duration)seek.value=String(Math.round(a.currentTime/a.duration*1000));});'
        'a.addEventListener("ended",function(){ico(false);seek.value="0";cur.textContent="0:00";});'
        'seek.addEventListener("input",function(){seeking=true;'
        'if(a.duration)cur.textContent=fmt(seek.value/1000*a.duration);});'
        'seek.addEventListener("change",function(){'
        'if(a.duration)a.currentTime=seek.value/1000*a.duration;seeking=false;});'
        'rateBtn.addEventListener("click",function(){ri=(ri+1)%rates.length;'
        'a.playbackRate=rates[ri];rateBtn.textContent=rates[ri]+"x";});'
        '}'
        'function scan(){var bars=document.querySelectorAll("[data-cf-audio]");'
        'for(var i=0;i<bars.length;i++)wire(bars[i]);}'
        'if(document.readyState!=="loading")scan();'
        'else document.addEventListener("DOMContentLoaded",scan);'
        '})();</script>'
    )


def build_frame_html(frame, lesson, frame_index, total_frames,
                     frame_map, theme_css, scorm_bridge=False,
                     disp_index=None, disp_total=None, asset_map=None, hotspot_cfg=None):
    """Render a single SCO HTML page for one frame.

    The visible counter + progress bar use disp_index/disp_total (required
    frames only, excluding optional); navigation still uses the real
    frame_index/total_frames positions.
    """

    blocks_html = _render_blocks(frame.content.get('blocks', []), scorm_bridge, asset_map, hotspot_cfg,
                                 layout=frame.content.get('layout'))

    counter_index = disp_index if disp_index is not None else (frame_index + 1)
    counter_total = disp_total if disp_total is not None else total_frames

    return render_template(
        'sco_shell.html',
        frame_name=frame.name,
        lesson_name=lesson.name,
        frame_index=frame_index,
        total_frames=total_frames,
        counter_index=counter_index,
        counter_total=counter_total,
        progress_pct=round(((counter_index - 1) / max(counter_total - 1, 1)) * 100),
        frame_map_json=json.dumps(frame_map),
        blocks_html=blocks_html,
        theme_css=theme_css,
        scorm_bridge=scorm_bridge,
    )


def _frame_has_gui(frame) -> bool:
    """True if a frame contains a GUI shell block."""
    return any(b.get('type') == 'gui'
               for b in (frame.content or {}).get('blocks', []))


def _get_gui_block(frame):
    """Return the first GUI block in a frame, or None."""
    for b in (frame.content or {}).get('blocks', []):
        if b.get('type') == 'gui':
            return b
    return None


def _int_dim(v, default):
    """Coerce a stored block dimension to a positive int (a non-numeric value
    injected into the player's inline JS would be a syntax error)."""
    try:
        n = int(float(v))
        return n if n > 0 else default
    except (TypeError, ValueError):
        return default


_OAM_PLAYER_TPL = """
<div id="oamwrap-__BID__" style="margin-bottom:20px;width:100%">
  <div id="oamstage-__BID__" style="position:relative;width:100%;overflow:hidden;background:#0d1117">
    <iframe id="oam-__BID__" src="__SRC__" width="__W__" height="__H__" scrolling="no" allowfullscreen
      title="Interactive animation" sandbox="allow-scripts allow-same-origin"
      style="position:absolute;top:0;left:0;border:0;transform-origin:top left;display:block;background:#0d1117"></iframe>
  </div>
  <div id="oambar-__BID__" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1117;border:1px solid #1c2a3a;border-top:none">
    <button id="oamplay-__BID__" aria-label="Play" style="background:#F59E0B;color:#042C53;border:none;border-radius:4px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:'IBM Plex Mono',monospace">&#9658;</button>
    <div id="oamtrack-__BID__" style="flex:1;position:relative;height:8px;background:#1c2a3a;border-radius:4px;cursor:pointer">
      <div id="oamfill-__BID__" style="position:absolute;left:0;top:0;bottom:0;width:0%;background:#F59E0B;border-radius:4px"></div>
      <div id="oammarks-__BID__"></div>
    </div>
    <button id="oamnext-__BID__" aria-label="Next stop" style="background:#F59E0B;color:#042C53;border:none;border-radius:4px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;font-family:'IBM Plex Mono',monospace">&#10515; Next stop</button>
    <span id="oamtime-__BID__" style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#7A90A8;min-width:60px;text-align:right"></span>
  </div>
</div>
<script>
(function(){
  var SW=__W__, SH=__H__;
  var wrap=document.getElementById('oamwrap-__BID__'), stage=document.getElementById('oamstage-__BID__'), bar=document.getElementById('oambar-__BID__');
  var f=document.getElementById('oam-__BID__');
  var play=document.getElementById('oamplay-__BID__'), nextb=document.getElementById('oamnext-__BID__');
  var track=document.getElementById('oamtrack-__BID__'), fill=document.getElementById('oamfill-__BID__'), marks=document.getElementById('oammarks-__BID__'), tm=document.getElementById('oamtime-__BID__');
  if(!f) return;
  // -- Scale-to-fit: letterbox into the GUI shell content area (#fgui-content)
  //    when present, else fit the container width (preserve aspect, never clip). --
  var lastKey='';
  function fit(){
    if(!stage||!SW||!SH) return;
    var cw=stage.clientWidth||SW;
    var sc=document.getElementById('fgui-content');
    var inShell=sc && sc.contains(wrap);
    var barH=bar?bar.offsetHeight:36;
    var ch=inShell?sc.clientHeight:0;
    // Key on every input to the scale (width, content height, bar height) so a
    // height-only change (bar settling, vertical resize) still re-fits — while
    // still skipping our own stage-height write (which changes none of these).
    var key=cw+'x'+ch+'x'+barH;
    if(key===lastKey) return;
    lastKey=key;
    var s=cw/SW;
    if(inShell){
      var cs=getComputedStyle(sc);
      var padV=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0);
      var availH=ch-padV-barH;                   // content-box height minus padding + bar
      if(availH>0) s=Math.min(s, availH/SH);     // letterbox inside the content box
    } else {
      s=Math.min(s,1);                           // flowing layout: don't upscale past native
    }
    if(!(s>0)||!isFinite(s)) s=1;
    f.style.transform='scale('+s+')';
    f.style.left=Math.max(0,(cw-SW*s)/2)+'px';
    stage.style.height=(SH*s)+'px';
  }
  fit();
  if(window.ResizeObserver){ try{ new ResizeObserver(fit).observe(stage); }catch(e){} }
  window.addEventListener('resize', function(){ lastKey=''; fit(); });
  // -- media bar protocol + prompt cue wiring --
  var dur=0, supported=false;
  var PROMPTS=__PROMPTS__, END_PROMPT=__ENDPROMPT__, lastWasDefined=false, lastStopFrame=-1;
  var GATE_NEXT=__GATENEXT__;
  var HOTSPOT=__HOTSPOT__;   // project-level ForgeJS hotspot style, or null for runtime defaults
  function send(m){ try{ f.contentWindow.postMessage(m,'*'); }catch(e){} }
  function sendConfig(){ if(HOTSPOT) send({type:'forge:config', config:HOTSPOT}); }
  // Gate progression: disable NEXT/CONTINUE until the stream completes.
  function gateButtons(disabled){
    var b=document.querySelectorAll('[data-action="NEXT"],[data-action="CONTINUE"]');
    for(var i=0;i<b.length;i++){ try{ b[i].disabled=disabled; b[i].style.opacity=disabled?'0.4':''; b[i].style.pointerEvents=disabled?'none':''; }catch(e){} }
  }
  if(GATE_NEXT) gateButtons(true);
  // Find the SCORM API — the LMS often hosts it on a parent/opener frame, not
  // the SCO document itself (canonical walk-up-the-frame-tree).
  function findAPI(name){
    var w=window;
    for(var i=0;i<8 && w;i++){ try{ if(w[name]) return w[name]; }catch(e){} if(w===w.parent) break; w=w.parent; }
    try{ if(window.opener && window.opener[name]) return window.opener[name]; }catch(e){}
    return null;
  }
  var _reported=false;
  // Report completion/score to the LMS (latched so it fires once).
  function reportComplete(score){
    if(_reported) return; _reported=true;
    var a12=findAPI('API'), a04=findAPI('API_1484_11');
    try{ if(a12){ a12.LMSSetValue('cmi.core.lesson_status','completed'); if(score!=null) a12.LMSSetValue('cmi.core.score.raw', String(score)); a12.LMSCommit(''); } }catch(e){}
    try{ if(a04){ a04.SetValue('cmi.completion_status','completed'); if(score!=null) a04.SetValue('cmi.score.raw', String(score)); a04.Commit(''); } }catch(e){}
  }
  function reportScore(score){
    if(score==null) return;                       // never write "undefined"/"null"
    var a12=findAPI('API'), a04=findAPI('API_1484_11');
    try{ if(a12) a12.LMSSetValue('cmi.core.score.raw', String(score)); }catch(e){}
    try{ if(a04) a04.SetValue('cmi.score.raw', String(score)); }catch(e){}
  }
  // In a GUI shell -> drive the shell's prompt zone; otherwise console-trace.
  function showPrompt(text){
    if(text==null) return;
    if(window.fgui && window.fgui.setFrameData) window.fgui.setFrameData({prompt:text});
    else { try{ console.log('[ForgeJS] prompt:', text); }catch(e){} }
  }
  window.addEventListener('message', function(e){
    if(e.source!==f.contentWindow) return; var d=e.data||{};
    if(d.type==='oam:state'){
      supported=true; dur=d.duration||0;
      fill.style.width=(dur?(d.t/dur*100):0)+'%';
      play.innerHTML=d.playing?'&#9208;':'&#9658;'; play.setAttribute('data-playing', d.playing?'1':'');
      tm.textContent=(d.t||0).toFixed(1)+'/'+dur.toFixed(0)+'s';
      // Redraw markers when the stop set changes (stops can be discovered during play).
      if(d.stops && marks.getAttribute('data-n')!==String(d.stops.length)){ marks.setAttribute('data-n',String(d.stops.length)); marks.innerHTML=''; d.stops.forEach(function(s){ var k=document.createElement('div'); k.style.cssText='position:absolute;left:'+(dur?s/dur*100:0)+'%;top:-4px;width:2px;height:16px;background:#7EB8F0;border-radius:1px;transform:translateX(-50%);pointer-events:none'; marks.appendChild(k); }); }
    } else if(d.type==='forge:command' && d.parity==='stop'){
      // prompt keyed by the resolved stop index (seek-safe); undefined/unresolved
      // (-1) -> persist previous.
      var idx=(d.index!=null)?d.index:(d.n-1)/2, p=(idx>=0 && idx<PROMPTS.length)?PROMPTS[idx]:null;
      lastStopFrame=d.frame; lastWasDefined=(p!=null && p!=='');
      if(lastWasDefined) showPrompt(p);
    } else if(d.type==='forge:command' && d.parity==='start'){
      showPrompt(''); lastWasDefined=false;   // button press / resume clears the prompt until the next stop
    } else if(d.type==='forge:end'){
      // generic end prompt — unless a defined prompt coincided with the final frame.
      if(END_PROMPT && !(lastWasDefined && lastStopFrame===d.frame)) showPrompt(END_PROMPT);
      if(GATE_NEXT) gateButtons(false);   // stream complete -> allow NEXT
    } else if(d.type==='forge:complete'){
      reportComplete(d.score);
      if(GATE_NEXT) gateButtons(false);
    } else if(d.type==='forge:score'){
      reportScore(d.score);
    }
  });
  f.addEventListener('load', function(){ sendConfig(); send({type:'oam:getState'}); });
  setTimeout(function(){ sendConfig(); send({type:'oam:getState'}); }, 500);
  play.onclick=function(){ if(!supported) return; send({type: play.getAttribute('data-playing')?'oam:pause':'oam:play'}); };
  nextb.onclick=function(){ if(!supported) return; send({type:'oam:nextStop'}); };
  track.onclick=function(ev){ if(!supported||!dur) return; var r=track.getBoundingClientRect(); send({type:'oam:seek', t:Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*dur}); };
})();
</script>
"""


def _bundle_videojs_assets(zf):
    """Copy the vendored Video.js player (assets/video-js/) into a package so the
    PUBLISHED SCORM bundle is self-contained — no CDN fetch at publish time and no
    runtime network dependency (security review H4). Output archive paths match the
    SCO templates (sco_shell*.html → assets/video-js/...). Best-effort: a missing
    vendored file is simply omitted, exactly like the three.js bundling pattern."""
    base = Path(__file__).resolve().parent.parent / 'assets' / 'video-js'
    for rel in ('video.min.js', 'video-js.min.css'):
        try:
            src = base / rel
            if src.exists():
                zf.write(str(src), 'assets/video-js/' + rel)
        except Exception:
            pass


def _bundle_three_assets(zf):
    """Copy the vendored three.js + GLTF/DRACO loaders + Draco WASM decoder into
    a package (assets/three/) so 3D blocks run fully offline — no CDN at runtime.
    Best-effort: a missing file just falls back to the runtime's CDN path."""
    base = Path(__file__).resolve().parent.parent / 'assets' / 'three'
    for rel in ('three.min.js', 'GLTFLoader.js', 'DRACOLoader.js', 'RGBELoader.js',
                'draco/draco_wasm_wrapper.js', 'draco/draco_decoder.wasm'):
        try:
            src = base / rel
            if src.exists():
                zf.write(str(src), 'assets/three/' + rel)
        except Exception:
            pass


def _bundle_hdri_assets(zf, names):
    """Copy the equirectangular HDRIs (assets/hdri/<name>.hdr) used by 3D blocks
    into the package so day/night environments work offline. Best-effort."""
    base = Path(__file__).resolve().parent.parent / 'assets' / 'hdri'
    for name in names:
        try:
            src = base / f'{name}.hdr'
            if src.exists():
                zf.write(str(src), f'assets/hdri/{name}.hdr')
        except Exception:
            pass


def _model3d_hdri_names(frames):
    """Set of HDRI environment names (day/night) referenced by 3D blocks, so we
    bundle only the .hdr files actually used."""
    names = set()
    for fr in frames:
        for b in (getattr(fr, 'content', None) or {}).get('blocks', []):
            if b.get('type') == 'model3d':
                env = str((b.get('data') or {}).get('environment', '') or '').lower()
                if env in ('day', 'night'):
                    names.add(env)
    return names


def _frames_have_model3d(frames):
    """True if any frame contains a 3D model block (frames: iterable of Frame)."""
    for fr in frames:
        for b in (getattr(fr, 'content', None) or {}).get('blocks', []):
            if b.get('type') == 'model3d':
                return True
    return False


def _project_hotspot_cfg(project):
    """Project-level ForgeJS hotspot config ({"hotspot": {...}}), or None when the
    project hasn't customized it (OAM players then keep the runtime brand defaults)."""
    fc = getattr(project, 'forge_config', None)
    if isinstance(fc, dict) and isinstance(fc.get('hotspot'), dict) and fc['hotspot']:
        return {'hotspot': fc['hotspot']}
    return None


def _get_asset(asset_id, asset_map):
    """Resolve a MediaAsset by id. Uses the prebuilt project asset map when one
    is threaded in (publish path) to avoid a per-block SELECT; falls back to a
    direct query for single-frame callers (preview) that pass no map."""
    if not asset_id:
        return None
    if asset_map is not None and asset_id in asset_map:
        return asset_map[asset_id]
    return MediaAsset.query.get(asset_id)


@lru_cache(maxsize=64)
def _read_clip_cached(path, mtime):
    """Read a clip JSON file, cached by (path, mtime) — the same clip would
    otherwise be re-read from disk for every publish/preview of its frame."""
    return Path(path).read_text(encoding='utf-8')


def _hotspot_colors(color):
    """Mirror client utils/hotspotStyle.js: strokeColor -> (border color, translucent fill)."""
    import re
    c = (color or '#F59E0B').strip()
    m = re.match(r'^#([0-9a-fA-F]{3})$', c)
    if m:
        h = m.group(1)
        rgb = (int(h[0] * 2, 16), int(h[1] * 2, 16), int(h[2] * 2, 16))
    else:
        m = re.match(r'^#([0-9a-fA-F]{6})$', c)
        rgb = (int(m.group(1)[0:2], 16), int(m.group(1)[2:4], 16), int(m.group(1)[4:6], 16)) if m else None
    return (c, f'rgba({rgb[0]},{rgb[1]},{rgb[2]},0.15)') if rgb else (c, c)


def _hotspot_radius(shape):
    return '50%' if shape in ('circle', 'round') else ('14%' if shape == 'rounded' else '4px')


def _render_blocks(blocks, scorm_bridge=False, asset_map=None, hotspot_cfg=None, shelled=False,
                   preview=False, layout=None):
    """Convert block list to HTML string.

    shelled: True when injecting into a GUI shell's #fgui-content (positioned
    content area). Blocks with custom `bounds` are then wrapped as absolute boxes
    in content-area pixels; otherwise bounds are ignored (normal flow).

    asset_map: optional {asset_id: MediaAsset} for the whole project so media
    blocks resolve via dict lookup instead of one DB query per block.
    hotspot_cfg: optional project-level ForgeJS config ({"hotspot": {...}})
    baked into each OAM player so its hotspots adopt the project style.

    preview: True for the live single-frame / course preview (build_frame_preview_html).
    Image/video/audio blocks then resolve their source as `serve_url ||
    /api/media/serve/<asset_id>` and render even when `asset_id` is absent — a
    fresh upload (or a demo placeholder) often carries only `serve_url`, which the
    package-relative `media/...` path scheme can't express, so without this the
    preview would drop the media to a "[image: …]" placeholder and look blank.
    The published packager (preview=False) is unchanged: it keeps the
    package-relative paths the SCORM ZIP bundles assets under.
    """
    # Escape every '<' so no stored value can break out of the inline player
    # <script> -- covers </script, <!--, <script. (json.dumps is ensure_ascii,
    # so U+2028/2029 are already escaped.) null when unset -> brand defaults.
    hotspot_js = ('null' if not (isinstance(hotspot_cfg, dict) and hotspot_cfg)
                  else json.dumps(hotspot_cfg).replace('<', '\\u003c'))
    parts = []
    # Per-top-level-block tags so the two-zone (text-left / media-right) layout
    # can group flow blocks the same way FramePreview.jsx does. Each entry is
    # ('text'|'other', start_index) marking where that block's HTML begins in
    # `parts`; populated only for the non-shelled flow path (see two-zone below).
    block_tags = []
    # Set True if any block is bounds-wrapped into an absolute box (shelled path).
    # Bounds-wrapping mutates `parts` (del/append), which invalidates the
    # block_tags start offsets used by the shelled text-top reflow below, so we
    # skip that reflow when absolute positioning is already in play.
    _shelled_has_bounds = False
    for block in blocks:
        btype = block.get('type')
        data  = block.get('data', {})
        bid   = block.get('id', str(uuid.uuid4()))
        start = len(parts)   # where this block's HTML begins (for bounds-wrapping)
        if btype != 'gui':
            block_tags.append(('text' if btype == 'text' else 'other', start))

        if btype == 'gui':
            # GUI shell blocks only render as the SCO page in SCORM 1.2 (handled
            # in build_scorm12_package). When a gui block reaches _render_blocks
            # (SCORM 2004 / Web Bundle), show a clear notice instead of nothing.
            parts.append(
                '<div style="padding:24px;border:2px dashed #3A5A8A;border-radius:8px;'
                'background:rgba(58,90,138,0.06);color:#3A5A8A;text-align:center;'
                'font-family:\'IBM Plex Mono\',monospace;font-size:13px;margin-bottom:16px">'
                '&#x2B22; This frame uses a ForgeGUI shell. '
                'Publish as <strong>SCORM 1.2</strong> for the full interactive shell.'
                '</div>'
            )
            continue

        if btype == 'text':
            # body is author RICH HTML -> allowlist-sanitize (keep formatting,
            # strip script/handlers); narrator_script is plain text -> escape.
            html = f'<div class="cf-text">{_sanitize_rich_html(data.get("body",""))}</div>'
            if data.get('narrator_script'):
                html += f'<div class="cf-narration">🎙 {esc(data["narrator_script"])}</div>'
            parts.append(html)

        elif (preview and btype == 'media' and data.get('kind') == 'video'
              and (data.get('serve_url') or data.get('video_serve_url') or data.get('asset_id'))):
            # Live preview: resolve via serve_url like the React renderer so a
            # video carrying only serve_url (no asset_id) still plays.
            src      = esc(data.get('serve_url') or data.get('video_serve_url')
                        or f"/api/media/serve/{data['asset_id']}")
            title    = esc(data.get('original_name', 'Video'))
            caption  = esc(data.get('caption', ''))
            is_cover = data.get('fit') == 'cover'
            poster   = data.get('poster_url')
            poster_attr = f'poster="{esc(poster)}"' if poster else ''
            # dock: 'inline' (default — video flows with a 20px gap below it) |
            # 'bottom' (full-bleed: video fills its content box and the native
            # control bar / playbar snaps flush to the bottom of the content area
            # instead of sitting underneath the video in the flow). Mirrors the
            # audio block's dock toggle. Only meaningful for cover/full videos.
            dock     = data.get('dock', 'inline')
            docked   = is_cover and dock == 'bottom'
            wrap_mb  = '' if docked else 'margin-bottom:20px;'
            dock_attr = ' data-cf-video-dock="bottom"' if docked else ''
            if is_cover:
                # Cover video: fills its content box (object-fit:cover, no
                # rounding/letterbox), plays seamlessly (muted/loop/autoplay/
                # playsinline) AND exposes native controls so it's a usable content
                # video. Because the native control bar sits at the bottom, the
                # caption rides on a TOP-down gradient scrim (white text, WCAG AA)
                # so it never overlaps the controls. Mirrors the cover Image Block
                # preview branch below.
                #   dock='bottom': fill the full content-box height so the native
                #   control bar lands flush at the content-area bottom (no gap
                #   underneath); dock='inline': height:auto in the flow as before.
                v_height = '100%' if docked else 'auto'
                video_html = (
                    f'<video controls muted loop autoplay playsinline {poster_attr} '
                    f'style="display:block;width:100%;height:{v_height};object-fit:cover" '
                    f'aria-label="{title}"><source src="{src}">'
                    f'<p>Your browser does not support HTML5 video.</p></video>')
                if caption:
                    parts.append(
                        f'<div{dock_attr} style="{wrap_mb}position:relative;display:block;line-height:0'
                        f'{";height:100%" if docked else ""}">'
                        f'{video_html}'
                        f'<div style="position:absolute;left:0;right:0;top:0;'
                        f'padding:12px 16px 28px;color:#fff;font-size:13px;line-height:1.45;'
                        f'text-shadow:0 1px 3px rgba(0,0,0,.85);background:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,.45) 50%,transparent)">'
                        f'{caption}</div></div>'
                    )
                else:
                    parts.append(
                        f'<div{dock_attr} style="{wrap_mb}line-height:0'
                        f'{";height:100%" if docked else ""}">{video_html}</div>')
            else:
                cap_html = f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>' if caption else ''
                parts.append(
                    f'<div style="margin-bottom:20px">'
                    f'<video controls playsinline {poster_attr} style="max-width:100%;height:auto" '
                    f'aria-label="{title}"><source src="{src}">'
                    f'<p>Your browser does not support HTML5 video.</p></video>{cap_html}</div>'
                )

        elif (preview and btype == 'media' and data.get('kind') == 'audio'
              and (data.get('serve_url') or data.get('asset_id'))):
            src   = data.get('serve_url') or f"/api/media/serve/{data['asset_id']}"
            dock  = data.get('dock', 'inline')
            # caption is escaped inside _cf_audio_bar; src is escaped there too.
            wrap  = '' if dock == 'bottom' else 'margin-bottom:20px'
            parts.append(
                f'<div style="{wrap}">'
                f'{_cf_audio_bar(src, data.get("caption", ""), dock, bid)}</div>'
            )

        elif btype == 'media' and data.get('kind') == 'video' and data.get('asset_id'):
            asset_id   = data['asset_id']
            use_vjs    = data.get('use_videojs', True)
            companions = data.get('asset_meta', {}).get('companion_files', {}) or {}
            webm_id    = companions.get('webm_asset_id')
            vtt_id     = companions.get('vtt_asset_id')
            poster_id  = companions.get('poster_asset_id')
            title      = esc(data.get('original_name', 'Video'))
            caption    = esc(data.get('caption', ''))
            is_cover   = data.get('fit') == 'cover'
            # dock: 'inline' (default) | 'bottom' — see the preview branch above.
            # For cover/full videos, 'bottom' fills the content box so the native
            # playbar snaps flush to the content-area bottom (no gap underneath).
            dock       = data.get('dock', 'inline')
            docked     = is_cover and dock == 'bottom'
            wrap_mb    = '' if docked else 'margin-bottom:20px;'
            dock_attr  = ' data-cf-video-dock="bottom"' if docked else ''
            v_height   = '100%' if docked else 'auto'

            # asset ids become part of <source>/<track>/poster src attributes and
            # the player element id -> validate to id tokens so they can't break out.
            asset_id   = _safe_id(asset_id)
            mp4_src    = f'media/video/{asset_id}.mp4'
            webm_src   = f'media/video/{_safe_id(webm_id)}.webm'   if webm_id   else None
            vtt_src    = f'media/captions/{_safe_id(vtt_id)}.vtt'   if vtt_id    else None
            poster_src = f'media/images/{_safe_id(poster_id)}.jpg'  if poster_id else None

            sources = ''
            if webm_src:
                sources += f'<source src="{webm_src}" type="video/webm">'
            sources += f'<source src="{mp4_src}" type="video/mp4">'
            track = f'<track kind="captions" src="{vtt_src}" srclang="en" label="English" default>' if vtt_src else ''
            poster_attr = f'poster="{poster_src}"' if poster_src else ''
            cap_html = f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>' if caption else ''

            if is_cover:
                # Cover/fill video: bypass the Video.js chrome (which would fight
                # the fill look) and render a plain video that fills its content
                # box (object-fit:cover, no rounding/letterbox), played muted/loop/
                # autoplay/playsinline WITH native controls so it's a usable content
                # video. The native control bar sits at the bottom, so the caption
                # rides on a TOP-down gradient scrim (white text, WCAG AA) and never
                # overlaps the controls. Mirrors the cover Image Block branch below.
                video_html = (
                    f'<video controls muted loop autoplay playsinline {poster_attr} '
                    f'style="display:block;width:100%;height:{v_height};object-fit:cover" '
                    f'aria-label="{title}">{sources}{track}'
                    f'<p>Your browser does not support HTML5 video.</p></video>')
                if caption:
                    parts.append(
                        f'<div{dock_attr} style="{wrap_mb}position:relative;display:block;line-height:0'
                        f'{";height:100%" if docked else ""}">'
                        f'{video_html}'
                        f'<div style="position:absolute;left:0;right:0;top:0;'
                        f'padding:12px 16px 28px;color:#fff;font-size:13px;line-height:1.45;'
                        f'text-shadow:0 1px 3px rgba(0,0,0,.85);background:linear-gradient(to bottom,rgba(0,0,0,.85),rgba(0,0,0,.45) 50%,transparent)">'
                        f'{caption}</div></div>'
                    )
                else:
                    parts.append(
                        f'<div{dock_attr} style="{wrap_mb}line-height:0'
                        f'{";height:100%" if docked else ""}">{video_html}</div>')
            elif use_vjs:
                parts.append(
                    f'<div style="margin-bottom:20px">'
                    f'<video id="vid-{asset_id}" class="video-js vjs-big-play-centered cf-video-player" '
                    f'controls {poster_attr} aria-label="{title}" '
                    f'data-setup=\'{{"playbackRates":[0.5,0.75,1,1.25,1.5,2]}}\'>'
                    f'{sources}{track}'
                    f'<p>Your browser does not support HTML5 video.</p>'
                    f'</video>{cap_html}</div>'
                )
            else:
                parts.append(
                    f'<video controls {poster_attr} style="width:100%;margin-bottom:20px" '
                    f'aria-label="{title}">{sources}{track}'
                    f'<p>Your browser does not support HTML5 video.</p></video>{cap_html}'
                )

        elif (preview and btype == 'media' and data.get('kind') == 'image'
              and (data.get('serve_url') or data.get('asset_id'))):
            # Live preview: resolve the image source the same way the React
            # renderer does (serve_url, else the asset's serve route) so an image
            # whose serve_url is set but asset_id isn't (fresh upload / demo
            # placeholder) still shows instead of dropping to a placeholder card.
            # Image comes in as-is: square, no rounding (matches the publish look).
            src      = esc(data.get('serve_url') or f"/api/media/serve/{data['asset_id']}")
            name     = data.get('original_name') or ''
            alt      = esc(data.get('alt_text') or data.get('placeholder_label') or name or 'Image')
            caption  = esc(data.get('caption', ''))
            is_cover = data.get('fit') == 'cover'
            if caption and is_cover:
                # Cover image WITH a caption: the caption is an overlay pinned to
                # the bottom of the image over a bottom-up gradient scrim, so it
                # stays readable (WCAG AA) over any image and never pushes content
                # below the fold. Image stays as-sent (object-fit:cover, no crop).
                parts.append(
                    f'<div style="margin-bottom:20px;position:relative;display:block;line-height:0">'
                    f'<img src="{src}" alt="{alt}" '
                    f'style="display:block;width:100%;height:auto;object-fit:cover">'
                    f'<div style="position:absolute;left:0;right:0;bottom:0;'
                    f'padding:28px 16px 12px;color:#fff;font-size:13px;line-height:1.45;'
                    f'text-shadow:0 1px 3px rgba(0,0,0,.85);background:linear-gradient(to top,rgba(0,0,0,.9),rgba(0,0,0,.5) 50%,rgba(0,0,0,0))">'
                    f'{caption}</div></div>'
                )
            else:
                cap_html = (f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>'
                            if caption else '')
                parts.append(
                    f'<div style="margin-bottom:20px">'
                    f'<img src="{src}" alt="{alt}" '
                    f'style="max-width:100%;height:auto">'
                    f'{cap_html}</div>'
                )

        elif btype == 'media' and data.get('kind') == 'image' and data.get('asset_id'):
            asset_id = data['asset_id']
            name     = data.get('original_name') or ''
            ext      = name.rsplit('.', 1)[-1].lower() if '.' in name else 'jpg'
            if not re.fullmatch(r'[a-z0-9]+', ext):
                ext = 'jpg'
            alt      = esc(data.get('placeholder_label') or name or 'Image')
            caption  = esc(data.get('caption', ''))
            is_cover = data.get('fit') == 'cover'
            img_src  = f'media/images/{_safe_id(asset_id)}.{ext}'
            if caption and is_cover:
                # Cover image WITH a caption: overlay the caption on the image over
                # a bottom-up gradient scrim (white text, WCAG AA) instead of a
                # below-image <p>, so it never pushes content below the fold.
                parts.append(
                    f'<div style="margin-bottom:20px;position:relative;display:block;line-height:0">'
                    f'<img src="{img_src}" alt="{alt}" '
                    f'style="display:block;width:100%;height:auto;object-fit:cover">'
                    f'<div style="position:absolute;left:0;right:0;bottom:0;'
                    f'padding:28px 16px 12px;color:#fff;font-size:13px;line-height:1.45;'
                    f'text-shadow:0 1px 3px rgba(0,0,0,.85);background:linear-gradient(to top,rgba(0,0,0,.9),rgba(0,0,0,.5) 50%,rgba(0,0,0,0))">'
                    f'{caption}</div></div>'
                )
            else:
                cap_html = (f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>'
                            if caption else '')
                parts.append(
                    f'<div style="margin-bottom:20px">'
                    f'<img src="{img_src}" alt="{alt}" '
                    f'style="max-width:100%;height:auto">'
                    f'{cap_html}</div>'
                )

        elif btype == 'media' and data.get('kind') == 'audio' and (data.get('asset_id') or data.get('serve_url')):
            # Published SCO: package-relative path when an asset is bundled,
            # else fall back to the seeded serve_url (demo placeholder data-URI).
            if data.get('asset_id'):
                asset_id = data['asset_id']
                name     = data.get('original_name') or ''
                ext      = name.rsplit('.', 1)[-1].lower() if '.' in name else 'mp3'
                if not re.fullmatch(r'[a-z0-9]+', ext):
                    ext = 'mp3'
                src      = f'media/audio/{_safe_id(asset_id)}.{ext}'
            else:
                # serve_url is escaped at the <audio src> point inside _cf_audio_bar.
                src = data['serve_url']
            dock = data.get('dock', 'inline')
            wrap = '' if dock == 'bottom' else 'margin-bottom:20px'
            parts.append(
                f'<div style="{wrap}">'
                f'{_cf_audio_bar(src, data.get("caption", ""), dock, bid)}</div>'
            )

        elif btype == 'media':
            kind  = esc(data.get('kind', 'image'))
            label = esc(data.get('placeholder_label', ''))
            cap   = esc(data.get('caption', ''))
            icons = {'image':'🖼','video':'🎬','audio':'🎙','oam':'⚙'}
            icon  = icons.get(data.get('kind', 'image'), '📎')
            parts.append(
                f'<div class="cf-media">'
                f'{icon} [{kind}: {label}]'
                f'{"<br><small>" + cap + "</small>" if cap else ""}'
                f'</div>'
            )

        elif btype == 'quiz':
            safe_bid = esc(bid)
            choices_html = ''
            for i, choice in enumerate(data.get('choices', [])):
                choices_html += (
                    f'<button class="cf-choice" data-index="{i}" '
                    f'onclick="cfSelectChoice(\'{safe_bid}\', this)">'
                    f'{esc(choice)}</button>'
                )
            fb_correct   = esc(data.get('feedback_correct',   'Correct!'))
            fb_incorrect = esc(data.get('feedback_incorrect', 'Incorrect — please review.'))
            # correct_index/correct_idx -> int so it can't inject JS into onclick.
            try:
                correct_idx = int(data.get('correct_index', data.get('correct_idx', 0)) or 0)
            except (TypeError, ValueError):
                correct_idx = 0
            parts.append(
                f'<div class="cf-quiz" id="quiz-{safe_bid}">'
                f'<p class="cf-quiz-question">{esc(data.get("question",""))}</p>'
                f'{choices_html}'
                f'<button class="cf-submit" '
                f'onclick="cfSubmitQuiz(\'{safe_bid}\', {correct_idx})">Submit</button>'
                f'<div class="cf-feedback correct" id="feedback-{safe_bid}">{fb_correct}</div>'
                f'<div class="cf-feedback incorrect" id="feedback-{safe_bid}-wrong">{fb_incorrect}</div>'
                f'</div>'
            )

        elif btype == 'hotspot':
            regions_html = ''
            for r in data.get('regions', []):
                radius = _hotspot_radius(r.get('shape'))
                stroke, fill = _hotspot_colors(r.get('color'))
                # x/y/w/h -> float so a string can't break out of the style attr;
                # label escaped; color values escaped (CSS-context defense).
                rx = _f(r.get('x')); ry = _f(r.get('y'))
                rw = _f(r.get('w', r.get('width'))); rh = _f(r.get('h', r.get('height')))
                regions_html += (
                    f'<div class="cf-hotspot-region" '
                    f'style="left:{rx}%;top:{ry}%;'
                    f'width:{rw}%;height:{rh}%;border-radius:{radius};'
                    f'border:2px solid {esc(stroke)};background:{esc(fill)}">'
                    f'<span class="cf-hotspot-label">{esc(r.get("label",""))}</span>'
                    f'</div>'
                )
            parts.append(
                f'<div class="cf-hotspot-wrap">{regions_html}</div>'
            )

        elif btype == 'branch':
            true_label  = esc(data.get('true_label',  'Yes'))
            false_label = esc(data.get('false_label', 'No'))
            # Frame targets become a filename in window.location.href — validate
            # they're plain id tokens ([\w-]+) and blank anything else, so a hostile
            # value can't break out of the onclick string. (true_frame / false_frame
            # are the legacy keys; *_frame_id the current ones.)
            true_frame  = _safe_id(data.get('true_frame_id',  data.get('true_frame',  '')))
            false_frame = _safe_id(data.get('false_frame_id', data.get('false_frame', '')))
            parts.append(
                f'<div class="cf-branch">'
                f'<p class="cf-branch-condition">{esc(data.get("condition",""))}</p>'
                f'<div class="cf-branch-btns">'
                f'<button class="cf-branch-btn true" '
                f'onclick="window.location.href=\'{true_frame}.html\'">'
                f'✓ {true_label}</button>'
                f'<button class="cf-branch-btn false" '
                f'onclick="window.location.href=\'{false_frame}.html\'">'
                f'✕ {false_label}</button>'
                f'</div></div>'
            )

        elif btype == 'wcn':
            # wcn_type keys the color/icon maps and becomes the visible tag; clamp
            # it to the known set so it can't carry markup. title/text/ack_label are
            # plain user text -> escape everywhere they enter markup, attrs, onclick.
            wcn_type  = data.get('wcn_type', 'note')
            if wcn_type not in ('warning', 'caution', 'note'):
                wcn_type = 'note'
            title     = esc(data.get('title', ''))
            text      = esc(data.get('text', ''))
            modal     = data.get('modal', False)
            ack_label = esc(data.get('ack_label', 'I understand — proceed'))
            block_id  = _safe_id(block.get('id', str(uuid.uuid4()))[:8]) or uuid.uuid4().hex[:8]
            modal_id   = f'wcn-modal-{block_id}'
            trigger_id = f'wcn-trigger-{block_id}'
            ack_btn_id = f'wcn-ack-{block_id}'
            title_id   = f'wcn-title-{block_id}'

            icons = {
                'warning': '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,2 30,29 2,29" fill="#FF4D00"/><text x="16" y="24" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="14" fill="#1a0800">!</text></svg>',
                'caution': '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,2 30,16 16,30 2,16" fill="#D4820A"/><text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="13" fill="#1a1000">!</text></svg>',
                'note':    '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#185FA5"/><text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#fff">i</text></svg>',
            }
            small_icons = {
                'warning': '<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,2 30,29 2,29" fill="#FF4D00"/><text x="16" y="24" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="14" fill="#1a0800">!</text></svg>',
                'caution': '<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><polygon points="16,2 30,16 16,30 2,16" fill="#D4820A"/><text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="13" fill="#1a1000">!</text></svg>',
                'note':    '<svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#185FA5"/><text x="16" y="21" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="14" fill="#fff">i</text></svg>',
            }

            colors = {
                'warning': {'tag':'#C0392B','border':'#C0392B','bg':'rgba(192,57,43,0.07)','title':'#FF7070','text':'#C4A0A0','header':'#1a0800'},
                'caution': {'tag':'#B87A1A','border':'#B87A1A','bg':'rgba(184,122,26,0.07)','title':'#D4820A','text':'#C4A870','header':'#1a1000'},
                'note':    {'tag':'#185FA5','border':'#185FA5','bg':'rgba(24,95,165,0.07)', 'title':'#7EB8F0','text':'#8AAAC0','header':'#06080f'},
            }

            c     = colors.get(wcn_type, colors['note'])
            icon  = icons.get(wcn_type, icons['note'])
            sicon = small_icons.get(wcn_type, small_icons['note'])
            tag   = wcn_type.upper()

            if modal:
                parts.append(f'''
<div style="margin-bottom:20px">
  <button
    id="{trigger_id}"
    data-type="{tag}"
    onclick="wcnOpenModal('{modal_id}', '{trigger_id}')"
    aria-haspopup="dialog"
    style="padding:8px 16px;border-radius:4px;border:1px solid {c["border"]};
           background:{c["bg"]};color:{c["title"]};cursor:pointer;
           font-family:inherit;font-size:13px;font-weight:600;
           display:inline-flex;align-items:center;gap:8px"
  >
    {sicon} {tag}{': ' + title if title else ''}
  </button>
  <div
    id="{modal_id}"
    role="dialog"
    aria-modal="true"
    aria-labelledby="{title_id}"
    aria-hidden="true"
    style="display:none;position:fixed;inset:0;
           background:rgba(4,44,83,0.75);z-index:999;
           align-items:center;justify-content:center;padding:24px"
  >
    <div style="background:#fff;border-radius:8px;max-width:480px;width:100%;
                overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
      <div style="background:{c["header"]};padding:14px 18px;display:flex;
                  align-items:center;gap:12px;border-bottom:3px solid {c["border"]}">
        {icon}
        <div style="flex:1">
          <div style="font-family:'IBM Plex Mono','Courier New',monospace;font-size:9px;font-weight:700;
                      color:{c["tag"]};letter-spacing:0.12em;margin-bottom:3px">{tag}</div>
          <div id="{title_id}" style="font-size:15px;font-weight:700;color:{c["tag"]}">{title or tag}</div>
        </div>
        <button
          onclick="wcnCloseModal('{modal_id}')"
          aria-label="Close dialog"
          style="background:none;border:none;color:{c["tag"]};
                 font-size:22px;cursor:pointer;padding:4px;line-height:1;
                 margin-left:auto;flex-shrink:0"
        >✕</button>
      </div>
      <div style="padding:16px 18px;font-size:13px;line-height:1.65;color:#1a1a1a">
        {text}
      </div>
      <div style="padding:12px 18px;border-top:1px solid #eee;
                  display:flex;justify-content:flex-end;background:#f8f8f8">
        <button
          id="{ack_btn_id}"
          onclick="wcnAcknowledge('{modal_id}', '{ack_btn_id}')"
          aria-label="{ack_label} — closes dialog"
          style="padding:8px 20px;background:{c["tag"]};color:#fff;border:none;
                 border-radius:4px;font-size:13px;font-weight:600;
                 cursor:pointer;font-family:inherit"
        >✓ {ack_label}</button>
      </div>
    </div>
  </div>
</div>''')
            else:
                title_html = f'<span style="font-size:13px;font-weight:600;color:{c["title"]}">{title}</span>' if title else ''
                parts.append(f'''
<div role="note" aria-label="{tag}{': ' + title if title else ''}"
  style="display:flex;border-radius:6px;border:1px solid {c["border"]};
         border-left:4px solid {c["border"]};padding:14px 16px;gap:14px;
         align-items:flex-start;background:{c["bg"]};margin-bottom:20px">
  <div style="flex-shrink:0;margin-top:2px">{icon}</div>
  <div style="flex:1">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span style="background:{c["tag"]};color:#fff;font-family:'IBM Plex Mono','Courier New',monospace;font-size:9px;
                   font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:0.1em">{tag}</span>
      {title_html}
    </div>
    <div style="font-size:13px;color:{c["text"]};line-height:1.65">{text}</div>
    <button
      onclick="this.textContent='✓ Acknowledged';this.disabled=true;this.style.opacity='0.6'"
      aria-label="Acknowledge {tag.lower()}"
      style="margin-top:10px;padding:5px 14px;border-radius:4px;
             border:1px solid {c["border"]};background:{c["bg"]};
             color:{c["title"]};cursor:pointer;font-size:11px;
             font-weight:600;font-family:inherit"
    >✓ {ack_label}</button>
  </div>
</div>''')

        elif btype == 'oam':
            asset_id = data.get('oam_asset_id', '')
            # Coerce to int — a non-numeric width/height (e.g. a legacy '100%' or
            # null) would inject `var SW=100%` and throw, killing the whole player.
            width    = _int_dim(data.get('width'),  800)
            height   = _int_dim(data.get('height'), 600)
            entry    = data.get('entry_point', 'index.html')
            if not asset_id:
                parts.append('<div class="cf-media">&#9881; [OAM — no animation linked]</div>')
            else:
                # OAM files are bundled at oam/{asset_id}/{entry}; the media bar
                # drives the animation via the oam:* postMessage protocol. asset_id
                # is validated to an id token and entry is restricted to a relative
                # path of id-ish segments (no quotes/spaces) so neither can break out
                # of the iframe src="" attribute it's spliced into.
                safe_entry = entry if re.fullmatch(r'[\w./-]+', str(entry)) else 'index.html'
                src = esc(f"oam/{_safe_id(asset_id)}/{safe_entry}")
                # Ordered prompt list (by stop index) + final-frame fallback. The
                # OAM carries no text — CourseForge owns it. '</' escaped so a
                # prompt can't close the player's <script>.
                prompts = data.get('prompts') if isinstance(data.get('prompts'), list) else []
                prompts_js = json.dumps([str(p) for p in prompts]).replace('</', '<\\/')
                end_js = json.dumps(str(data.get('end_prompt') or 'Press NEXT to continue.')).replace('</', '<\\/')
                gate_js = 'true' if data.get('gate_next') else 'false'
                parts.append(
                    _OAM_PLAYER_TPL.replace('__BID__', bid[:8]).replace('__SRC__', src)
                                   .replace('__W__', str(width)).replace('__H__', str(height))
                                   .replace('__PROMPTS__', prompts_js).replace('__ENDPROMPT__', end_js)
                                   .replace('__GATENEXT__', gate_js).replace('__HOTSPOT__', hotspot_js)
                )

        elif btype == 'ivideo':
            video_id = data.get('video_asset_id', '')
            clip_id  = data.get('clip_asset_id', '')
            caption  = data.get('caption', '')
            block_id = _safe_id(bid[:8]) or uuid.uuid4().hex[:8]

            if not video_id:
                parts.append('<div class="cf-media">▶⊕ [Interactive Video — no video linked]</div>')
            else:
                vext = 'mp4'
                v_asset = _get_asset(video_id, asset_map)
                if v_asset and v_asset.original_name and '.' in v_asset.original_name:
                    vext = v_asset.original_name.rsplit('.', 1)[-1].lower()
                if not re.fullmatch(r'[a-z0-9]+', vext):
                    vext = 'mp4'
                # video_id / vext become part of a <source src> and a video/<ext>
                # type -> validate so neither can break out of the attribute.
                video_src = f'media/video/{_safe_id(video_id)}.{vext}'

                # Inline the clip interactions — robust across LMS that block fetch()
                clip_json = '{"interactions":[]}'
                if clip_id:
                    c_asset = _get_asset(clip_id, asset_map)
                    if c_asset and c_asset.stored_path and Path(c_asset.stored_path).exists():
                        clip_json = _read_clip_cached(c_asset.stored_path, os.path.getmtime(c_asset.stored_path))
                clip_json = clip_json.replace('</', '<\\/')  # don't break the <script> tag

                # Full layout: the interactive video fills the content area — no
                # caption/label text, square corners (no corner mask).
                parts.append(f'''
<div id="ivideo-{block_id}" style="position:relative;width:100%;margin-bottom:20px">
  <video controls style="width:100%;display:block" aria-label="Interactive video">
    <source src="{video_src}" type="video/{vext}">
    <p>Your browser does not support HTML5 video.</p>
  </video>
  <div class="ivideo-overlay" style="position:absolute;inset:0;pointer-events:none"></div>
</div>
<script>
(function() {{
  var clipData = {clip_json};
  if (window.iVideoInit) iVideoInit("ivideo-{block_id}", (clipData && clipData.interactions) || [], {{}});
}})();
</script>''')

        elif btype == 'model3d':
            model_id = data.get('model_asset_id', '')
            caption  = esc(data.get('caption', ''))
            attribution = data.get('attribution', '')
            # height feeds both CSS (height:{height}px) and JS (a bare number arg)
            # -> coerce to int so a string can't break out of either context.
            height   = _int_dim((data.get('bounds') or {}).get('height') or data.get('viewer_height', 400), 400)
            # bg_color feeds CSS and a JS string literal -> validate it's a hex/
            # rgb()/named color shape; anything else falls back to the dark default.
            bg_color = data.get('bg_color') or '#0d1017'   # null (unseeded inherit) -> classic dark
            if not re.fullmatch(r'#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|[a-zA-Z]+', str(bg_color)):
                bg_color = '#0d1017'
            block_id = _safe_id(bid[:8]) or uuid.uuid4().hex[:8]
            annotations = data.get('annotations', [])
            decorative = bool(data.get('decorative'))
            ann_json = json.dumps(annotations).replace('</', '<\\/')
            # Part highlighting (mirrors the editor's Model3DViewer): per-mesh
            # hover/click highlight + a centroid-anchored label. parts maps a
            # mesh name -> {label, description}.
            part_hl = bool(data.get('part_highlight'))
            parts_cfg = data.get('parts', {}) if part_hl else {}
            parts_json = json.dumps(parts_cfg).replace('</', '<\\/')
            part_hl_js = 'true' if part_hl else 'false'
            env_name_raw = str(data.get('environment', 'studio') or 'studio').lower()
            env_name = env_name_raw if env_name_raw in ('studio', 'day', 'night', 'none') else 'studio'
            hdri_src = f'assets/hdri/{env_name}.hdr' if env_name in ('day', 'night') else ''
            auto_rotate_js = 'true' if data.get('auto_rotate') else 'false'
            try:
                env_int = float(data.get('env_intensity', 1))
            except (TypeError, ValueError):
                env_int = 1.0
            # NaN/inf would inject the bare JS identifiers nan/inf -> ReferenceError;
            # clamp to a finite, sane range.
            if env_int != env_int or env_int in (float('inf'), float('-inf')):
                env_int = 1.0
            env_int = max(0.0, min(env_int, 4.0))

            if not model_id:
                parts.append('<div style="padding:32px;text-align:center;color:#2A5A8A;font-size:13px">⬡ 3D Model — no model linked</div>')
            else:
                m_ext = '.glb'
                m_asset = _get_asset(model_id, asset_map)
                if m_asset and m_asset.stored_path:
                    m_ext = Path(m_asset.stored_path).suffix.lower()
                # model_id becomes part of a JS string literal ('{model_src}')
                # -> validate it's an id token so it can't break out of the string.
                model_src = f'media/models/{_safe_id(model_id)}{m_ext}'
                cap_html = f'<p style="font-size:12px;color:#888;margin-top:6px">{caption}</p>' if caption else ''
                aria = caption or '3D model viewer — use arrow keys to rotate, plus/minus to zoom, R to reset'
                # Decorative models are hidden from assistive tech (508/WCAG 1.1.1 —
                # purely visual content needs no text alternative).
                canvas_a11y = ('tabindex="-1" aria-hidden="true"' if decorative
                               else f'tabindex="0" role="img" aria-label="{aria}"')
                # WCAG 2.2.2 Pause/Stop/Hide: auto-rotation needs a visible pause
                # control (only rendered when auto-rotate is on).
                rotate_btn_html = (f'''<button id="rotbtn-{block_id}" type="button" aria-label="Pause auto-rotation" style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.55);color:#F59E0B;border:1px solid rgba(245,158,11,0.5);border-radius:4px;font-family:'IBM Plex Mono',monospace;font-size:10px;padding:3px 9px;cursor:pointer;letter-spacing:0.04em;z-index:5">Pause spin</button>''' if auto_rotate_js == 'true' else '')
                # Optional attribution overlay (e.g. CC-BY credit) — empty = hidden.
                _attr_safe = attribution.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                attr_html = (f'''<div style="position:absolute;bottom:6px;left:8px;max-width:70%;background:rgba(0,0,0,0.45);color:#9FB4CC;font-family:'IBM Plex Mono',monospace;font-size:8.5px;padding:2px 7px;border-radius:4px;letter-spacing:0.03em;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none">{_attr_safe}</div>''' if attribution else '')
                parts.append(f'''
<div id="viewer3d-{block_id}" style="position:relative;width:100%;margin-bottom:20px">
  <canvas id="canvas3d-{block_id}" {canvas_a11y}
    style="width:100%;height:{height}px;display:block;cursor:grab;outline:none;touch-action:none"></canvas>
  <div id="annoverlay-{block_id}" style="position:absolute;inset:0;pointer-events:none;overflow:hidden"></div>
  <div id="loading3d-{block_id}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:{bg_color}">
    <div style="text-align:center">
      <div class="cf-spin3d" style="width:28px;height:28px;border-radius:50%;border:3px solid #1c2a3a;border-top-color:#F59E0B;animation:spin3d 0.8s linear infinite;margin:0 auto 8px"></div>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#3A5A7A;letter-spacing:0.08em">Loading model…</span>
    </div>
  </div>
  <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);color:#3A5A7A;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:3px 8px;border-radius:4px;letter-spacing:0.06em" aria-hidden="true">
    arrows orbit · +/- zoom · R reset
  </div>
  {rotate_btn_html}
  {attr_html}
  {cap_html}
</div>
<style>
  @keyframes spin3d {{ to {{ transform: rotate(360deg); }} }}
  @keyframes annFadeIn {{ from {{ opacity:0; transform:translateY(-3px); }} to {{ opacity:1; transform:translateY(0); }} }}
  #viewer3d-{block_id} .ann-dot {{ position:absolute; width:14px; height:14px; border-radius:50%; background:#F59E0B; border:2px solid rgba(255,255,255,0.9); box-shadow:0 0 0 3px rgba(245,158,11,0.25),0 2px 8px rgba(0,0,0,0.4); transform:translate(-50%,-50%); cursor:pointer; pointer-events:all; transition:transform 0.15s; }}
  #viewer3d-{block_id} .ann-dot:hover {{ transform:translate(-50%,-50%) scale(1.3); }}
  #viewer3d-{block_id} .ann-dot:focus-visible {{ outline:2px solid #F59E0B; outline-offset:3px; }}
  #viewer3d-{block_id} .ann-popover {{ position:absolute; background:#0d1017; border:1px solid #1c2a3a; border-left:3px solid #F59E0B; border-radius:6px; padding:10px 14px; min-width:200px; max-width:280px; box-shadow:0 8px 32px rgba(0,0,0,0.5); animation:annFadeIn 0.15s ease; z-index:40; pointer-events:all; }}
  #viewer3d-{block_id} .ann-popover-title {{ font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700; color:#F59E0B; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px; }}
  #viewer3d-{block_id} .ann-popover-body {{ font-size:12px; color:#8AAAC0; line-height:1.55; }}
  #viewer3d-{block_id} .ann-popover-close {{ position:absolute; top:6px; right:8px; background:none; border:none; color:#3A5A7A; font-size:12px; cursor:pointer; padding:2px 4px; }}
  #viewer3d-{block_id} .part-label {{ position:absolute; transform:translate(-50%,calc(-100% - 10px)); background:rgba(13,16,23,0.92); color:#F59E0B; border:1px solid rgba(245,158,11,0.6); border-radius:5px; padding:3px 9px; font-family:'IBM Plex Mono',monospace; font-size:10px; font-weight:600; letter-spacing:0.03em; white-space:nowrap; pointer-events:none; z-index:30; box-shadow:0 2px 10px rgba(0,0,0,0.4); }}
  #viewer3d-{block_id} .part-dot {{ position:absolute; width:9px; height:9px; border-radius:50%; transform:translate(-50%,-50%); background:#F59E0B; border:2px solid rgba(255,255,255,0.9); box-shadow:0 0 0 3px rgba(245,158,11,0.25),0 2px 6px rgba(0,0,0,0.45); pointer-events:none; z-index:31; }}
  #viewer3d-{block_id} .part-leader {{ position:absolute; width:2px; height:10px; transform:translateX(-50%); background:#F59E0B; pointer-events:none; z-index:29; }}
  @media (prefers-reduced-motion: reduce) {{ .cf-spin3d, #viewer3d-{block_id} .ann-dot, #viewer3d-{block_id} .ann-popover {{ animation: none !important; transition: none !important; }} }}
</style>
<script>
(function() {{
  // Local-first (bundled under assets/three for fully-offline packages) with a
  // CDN fallback so formats that don't bundle still work online.
  var THREE_LOCAL='assets/three/three.min.js',  THREE_CDN='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var GLTF_LOCAL ='assets/three/GLTFLoader.js', GLTF_CDN ='https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
  var DRACO_LOCAL='assets/three/DRACOLoader.js',DRACO_CDN='https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js';
  var RGBE_LOCAL ='assets/three/RGBELoader.js', RGBE_CDN ='https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/RGBELoader.js';
  var DRACO_DECODER = 'assets/three/draco/';  // -> gstatic if we fell back to CDN scripts
  var ANNOTATIONS = {ann_json};
  var PARTS_CFG = {parts_json}, PART_HL = {part_hl_js};   // per-mesh part highlighting config
  var ENV_NAME = '{env_name}', HDRI_SRC = '{hdri_src}';   // 'studio' procedural | 'day'/'night' HDRI | 'none'
  var AUTO_ROTATE = {auto_rotate_js};
  var REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function loadScript(local, cdn, cb) {{
    if (document.querySelector('script[src="' + local + '"]') || document.querySelector('script[src="' + cdn + '"]')) {{ cb(); return; }}
    var s = document.createElement('script'); s.src = local; s.onload = cb;
    s.onerror = function() {{
      DRACO_DECODER = 'https://www.gstatic.com/draco/v1/decoders/';   // local missing -> use CDN decoder too
      var c = document.createElement('script'); c.src = cdn; c.onload = cb; c.onerror = cb; document.head.appendChild(c);
    }};
    document.head.appendChild(s);
  }}
  loadScript(THREE_LOCAL, THREE_CDN, function() {{ loadScript(GLTF_LOCAL, GLTF_CDN, function() {{ loadScript(DRACO_LOCAL, DRACO_CDN, function() {{
    var go = function() {{ init3DViewer('{block_id}', '{model_src}', '{bg_color}', {height}, ANNOTATIONS, ENV_NAME, {env_int}, HDRI_SRC); }};
    if (HDRI_SRC) {{ loadScript(RGBE_LOCAL, RGBE_CDN, go); }} else {{ go(); }}
  }}); }}); }});

  function init3DViewer(blockId, modelSrc, bgColor, height, annotations, envName, envIntensity, hdriSrc) {{
    var envOn = envName !== 'none';
    var rotating = AUTO_ROTATE && !REDUCE_MOTION;   // toggled by the Pause/Resume control
    var THREE = window.THREE;
    var canvas = document.getElementById('canvas3d-' + blockId);
    var loading = document.getElementById('loading3d-' + blockId);
    var overlay = document.getElementById('annoverlay-' + blockId);
    var activePopover = null;
    if (!canvas || !THREE) return;
    var w = canvas.clientWidth || 800;
    var renderer = new THREE.WebGLRenderer({{ canvas: canvas, antialias: true }});
    renderer.setSize(w, height); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    var scene = new THREE.Scene(); scene.background = new THREE.Color(bgColor);
    var camera = new THREE.PerspectiveCamera(45, w / height, 0.01, 1000);
    // Image-based lighting for reflective/metallic surfaces. 'day'/'night' load a
    // bundled equirectangular .hdr; 'studio' builds a procedural light box (no
    // file). scene.environment makes standard materials reflect it.
    function buildStudioEnv() {{ try {{
      var _pm = new THREE.PMREMGenerator(renderer);
      var _es = new THREE.Scene();
      _es.add(new THREE.Mesh(new THREE.BoxGeometry(12,12,12), new THREE.MeshStandardMaterial({{ side: THREE.BackSide, color: 0x767676, roughness: 1, metalness: 0 }})));
      var _panel = function(hex,x,y,z,sx,sy,sz,it) {{ var m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), new THREE.MeshStandardMaterial({{ color:0x000000, emissive:new THREE.Color(hex), emissiveIntensity:it }})); m.position.set(x,y,z); _es.add(m); }};
      _panel(0xffffff,0,5.5,0,8,0.2,8,1.4); _panel(0xbcd4ff,-5.5,0,1,0.2,7,7,0.7); _panel(0xffe2b0,5.5,0,-1,0.2,7,7,0.6);
      scene.environment = _pm.fromScene(_es, 0.04).texture;
      _es.traverse(function(o){{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); }});
      _pm.dispose();
    }} catch(e) {{ try {{ console.warn('[Forge3D] environment build failed', e); }} catch(_e) {{}} }} }}
    if (envOn) {{
      if (hdriSrc && THREE.RGBELoader) {{
        try {{
          new THREE.RGBELoader().load(hdriSrc, function(hdr) {{
            try {{ var _pm = new THREE.PMREMGenerator(renderer); scene.environment = _pm.fromEquirectangular(hdr).texture; hdr.dispose(); _pm.dispose(); }}
            catch(e) {{ buildStudioEnv(); }}
          }}, undefined, function() {{ buildStudioEnv(); }});   // HDRI fetch failed -> procedural fallback
        }} catch(e) {{ buildStudioEnv(); }}
      }} else {{ buildStudioEnv(); }}
    }}
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(5, 8, 5); scene.add(key);
    var fill = new THREE.DirectionalLight(0x8AAAC8, 0.4); fill.position.set(-5, 2, -5); scene.add(fill);
    var orbit = {{ dragging:false, lastX:0, lastY:0, theta:0, phi:Math.PI/4, radius:3, minRadius:0.5, maxRadius:20, minPhi:0.1, maxPhi:Math.PI-0.1 }};
    function updateCamera() {{
      camera.position.set(orbit.radius*Math.sin(orbit.phi)*Math.sin(orbit.theta), orbit.radius*Math.cos(orbit.phi), orbit.radius*Math.sin(orbit.phi)*Math.cos(orbit.theta));
      camera.lookAt(0,0,0);
    }}
    updateCamera();

    var dotEls = [];
    (annotations || []).forEach(function(ann) {{
      var dot = document.createElement('div');
      dot.className = 'ann-dot'; dot.tabIndex = 0; dot.style.display = 'none';
      dot.setAttribute('role', 'button');
      dot.setAttribute('aria-label', ann.label + ' — press Enter for details');
      dot.setAttribute('aria-haspopup', 'true');
      var pop = document.createElement('div');
      pop.className = 'ann-popover'; pop.style.display = 'none'; pop.setAttribute('role', 'tooltip');
      pop.innerHTML = '<button class="ann-popover-close" aria-label="Close">✕</button><div class="ann-popover-title"></div>' + (ann.description ? '<div class="ann-popover-body"></div>' : '');
      pop.querySelector('.ann-popover-title').textContent = ann.label;
      if (ann.description) pop.querySelector('.ann-popover-body').textContent = ann.description;
      function closePop() {{ pop.style.display = 'none'; if (activePopover === pop) activePopover = null; }}
      function openPop() {{ if (activePopover && activePopover !== pop) activePopover.style.display = 'none'; pop.style.display = 'block'; activePopover = pop; }}
      pop.querySelector('.ann-popover-close').addEventListener('click', function(e) {{ e.stopPropagation(); closePop(); }});
      dot.addEventListener('click', function(e) {{ e.stopPropagation(); if (pop.style.display === 'block') closePop(); else openPop(); }});
      dot.addEventListener('keydown', function(e) {{ if (e.key === 'Enter' || e.key === ' ') {{ e.preventDefault(); openPop(); }} if (e.key === 'Escape') closePop(); }});
      dot.appendChild(pop); if (overlay) overlay.appendChild(dot);
      dotEls.push({{ dot: dot, pop: pop, ann: ann }});
    }});

    var _v3 = new THREE.Vector3();
    var loadedModel = null, _ray = new THREE.Raycaster();

    // ── Part highlighting (per-mesh hover/click + centroid-anchored label) ──
    var parts = [], hoverKey = null, selKey = null, partLabelEl = null, partDotEl = null, partLeaderEl = null, _pray = new THREE.Raycaster();
    if (PART_HL && overlay) {{
      partLeaderEl = document.createElement('div');
      partLeaderEl.className = 'part-leader'; partLeaderEl.style.display = 'none';
      partDotEl = document.createElement('div');
      partDotEl.className = 'part-dot'; partDotEl.style.display = 'none';
      partLabelEl = document.createElement('div');
      partLabelEl.className = 'part-label'; partLabelEl.style.display = 'none';
      overlay.appendChild(partLeaderEl); overlay.appendChild(partDotEl); overlay.appendChild(partLabelEl);
    }}
    function findPart(key) {{ for (var i = 0; i < parts.length; i++) {{ if (parts[i].key === key) return parts[i]; }} return null; }}
    function setPartLevel(entry, level) {{
      if (entry.level === level) return;
      entry.level = level;
      for (var i = 0; i < entry.meshes.length; i++) {{
        var mesh = entry.meshes[i], orig = entry.origMats[i];
        if (level === 0) {{
          mesh.material = orig;
          var cl = entry.clones[i];
          if (cl) {{ (Array.isArray(cl) ? cl : [cl]).forEach(function(m) {{ if (m.dispose) m.dispose(); }}); entry.clones[i] = null; }}
          continue;
        }}
        // Cup & saucer can share one material, so highlight via a per-mesh clone
        // (tinting the shared material would light up both).
        if (!entry.clones[i]) entry.clones[i] = Array.isArray(orig) ? orig.map(function(m) {{ return m.clone(); }}) : orig.clone();
        var inten = level === 2 ? 0.7 : 0.28, c2 = entry.clones[i];
        (Array.isArray(c2) ? c2 : [c2]).forEach(function(m) {{ if ('emissive' in m) {{ m.emissive = new THREE.Color(0xF59E0B); m.emissiveIntensity = inten; m.needsUpdate = true; }} }});
        mesh.material = c2;
      }}
    }}
    function applyPartLevels() {{
      for (var i = 0; i < parts.length; i++) {{
        var e = parts[i];
        setPartLevel(e, e.key === selKey ? 2 : (e.key === hoverKey ? 1 : 0));
      }}
    }}
    function pickPart(clientX, clientY) {{
      if (!loadedModel || !parts.length) return null;
      var rect = canvas.getBoundingClientRect();
      var x = ((clientX - rect.left) / rect.width) * 2 - 1, y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _pray.setFromCamera({{ x: x, y: y }}, camera);
      var hits = _pray.intersectObject(loadedModel, true);
      if (!hits.length) return null;
      for (var i = 0; i < parts.length; i++) {{ if (parts[i].meshes.indexOf(hits[0].object) !== -1) return parts[i]; }}
      return null;
    }}
    function projectPartLabel() {{
      if (!partLabelEl) return;
      var key = selKey || hoverKey, entry = key && findPart(key);
      var hide = function() {{ partLabelEl.style.display = 'none'; if (partDotEl) partDotEl.style.display = 'none'; if (partLeaderEl) partLeaderEl.style.display = 'none'; }};
      if (!entry) {{ hide(); return; }}
      var ndc = entry.centroid.clone().project(camera);
      if (ndc.z >= 1 || ndc.x < -1 || ndc.x > 1 || ndc.y < -1 || ndc.y > 1) {{ hide(); return; }}
      var cw = canvas.clientWidth, ch = canvas.clientHeight, cfg = PARTS_CFG[key] || {{}};
      var px = (ndc.x * 0.5 + 0.5) * cw, py = (-ndc.y * 0.5 + 0.5) * ch;
      partLabelEl.textContent = cfg.label || key;
      partLabelEl.style.display = 'block';
      partLabelEl.style.left = px + 'px';
      partLabelEl.style.top = py + 'px';
      // dot anchored on the part centroid + a leader line up to the label pill
      if (partDotEl) {{ partDotEl.style.display = 'block'; partDotEl.style.left = px + 'px'; partDotEl.style.top = py + 'px'; }}
      if (partLeaderEl) {{ partLeaderEl.style.display = 'block'; partLeaderEl.style.left = px + 'px'; partLeaderEl.style.top = (py - 10) + 'px'; }}
    }}

    function projectDots() {{
      if (!overlay) return;
      var cw = canvas.clientWidth, ch = canvas.clientHeight;
      dotEls.forEach(function(it) {{
        _v3.set(it.ann.position.x, it.ann.position.y, it.ann.position.z);
        var ndc = _v3.clone().project(camera);
        // Hide behind-camera OR off-canvas dots — zooming in pushes dots past the
        // viewport edge, where they'd otherwise overflow the SCO iframe.
        if (ndc.z >= 1.0 || ndc.x < -1 || ndc.x > 1 || ndc.y < -1 || ndc.y > 1) {{ it.dot.style.display = 'none'; return; }}
        // Occlusion: hide a dot when the model sits between it and the camera.
        if (loadedModel) {{
          var _d = _v3.clone().sub(camera.position); var _dist = _d.length();
          _ray.set(camera.position, _d.normalize()); _ray.far = _dist;
          var _h = _ray.intersectObject(loadedModel, true);
          if (_h.length > 0 && _h[0].distance < _dist - Math.max(0.01, _dist * 0.02)) {{ it.dot.style.display = 'none'; return; }}
        }}
        var sx = (ndc.x * 0.5 + 0.5) * cw, sy = (-ndc.y * 0.5 + 0.5) * ch;
        it.dot.style.display = 'block'; it.dot.style.left = sx + 'px'; it.dot.style.top = sy + 'px';
        it.pop.style.left = sx > cw * 0.6 ? 'auto' : '18px';
        it.pop.style.right = sx > cw * 0.6 ? '18px' : 'auto';
      }});
    }}

    var _gltf = new THREE.GLTFLoader();
    if (THREE.DRACOLoader) {{ var _dl = new THREE.DRACOLoader(); _dl.setDecoderPath(DRACO_DECODER); _gltf.setDRACOLoader(_dl); }}
    _gltf.load(modelSrc, function(gltf) {{
      var model = gltf.scene;
      var box = new THREE.Box3().setFromObject(model);
      var center = box.getCenter(new THREE.Vector3());
      var size = box.getSize(new THREE.Vector3());
      var scale = 2.0 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale); model.position.sub(center.multiplyScalar(scale));
      scene.add(model); loadedModel = model;
      if (envOn) model.traverse(function(o){{ if(o.material){{ var ms=Array.isArray(o.material)?o.material:[o.material]; ms.forEach(function(mt){{ if('envMapIntensity' in mt){{ mt.envMapIntensity=envIntensity; }} }}); }} }});
      // Group meshes by name into parts; centroid (world space) anchors the label.
      if (PART_HL) {{
        model.updateMatrixWorld(true);
        var byKey = {{}}, order = [];
        model.traverse(function(o) {{
          if (!o.isMesh) return;
          var k = o.name || ('Part ' + (order.length + 1));
          if (!byKey[k]) {{ byKey[k] = {{ key:k, meshes:[], origMats:[], clones:[], level:0, box:new THREE.Box3() }}; order.push(k); }}
          var e = byKey[k]; e.meshes.push(o); e.origMats.push(o.material); e.clones.push(null); e.box.expandByObject(o);
        }});
        parts = order.map(function(k) {{ var e = byKey[k]; e.centroid = e.box.getCenter(new THREE.Vector3()); return e; }});
      }}
      if (loading) loading.style.display = 'none';
    }}, undefined, function() {{
      if (loading) loading.innerHTML = '<span style="color:#E87070;font-size:13px">Failed to load model</span>';
    }});
    (function animate() {{ requestAnimationFrame(animate);
      if (rotating && !orbit.dragging) {{ orbit.theta += 0.005; updateCamera(); }}
      renderer.render(scene, camera); projectDots(); if (PART_HL) projectPartLabel(); }})();
    var rotBtn = document.getElementById('rotbtn-' + blockId);
    if (rotBtn) {{
      var paintRot = function() {{
        rotBtn.textContent = rotating ? 'Pause spin' : 'Resume spin';
        rotBtn.setAttribute('aria-pressed', String(rotating));
        rotBtn.setAttribute('aria-label', rotating ? 'Pause auto-rotation' : 'Resume auto-rotation');
      }};
      rotBtn.addEventListener('click', function() {{ rotating = !rotating; paintRot(); }});
      paintRot();
    }}
    var ro = new ResizeObserver(function() {{ var w2 = canvas.clientWidth || w; renderer.setSize(w2, height); camera.aspect = w2/height; camera.updateProjectionMatrix(); }});
    ro.observe(canvas);
    canvas.addEventListener('pointerdown', function(e) {{ if (e.button !== 0) return; orbit.dragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY; canvas.setPointerCapture(e.pointerId); }});
    canvas.addEventListener('pointermove', function(e) {{ if (!orbit.dragging) return; orbit.theta -= (e.clientX-orbit.lastX)*0.01; orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi - (e.clientY-orbit.lastY)*0.01)); orbit.lastX = e.clientX; orbit.lastY = e.clientY; updateCamera(); }});
    canvas.addEventListener('pointerup', function(e) {{ orbit.dragging = false; try {{ canvas.releasePointerCapture(e.pointerId); }} catch(x) {{}} }});
    canvas.addEventListener('wheel', function(e) {{ e.preventDefault(); orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius + e.deltaY*0.01)); updateCamera(); }}, {{ passive:false }});
    if (PART_HL) {{
      var _pdx = 0, _pdy = 0;
      canvas.addEventListener('pointerdown', function(e) {{ if (e.button === 0) {{ _pdx = e.clientX; _pdy = e.clientY; }} }});
      canvas.addEventListener('pointermove', function(e) {{
        if (orbit.dragging) return;
        var entry = pickPart(e.clientX, e.clientY), k = entry ? entry.key : null;
        if (k !== hoverKey) {{ hoverKey = k; applyPartLevels(); canvas.style.cursor = k ? 'pointer' : 'grab'; }}
      }});
      canvas.addEventListener('pointerup', function(e) {{
        if (e.button !== 0) return;
        if (Math.abs(e.clientX - _pdx) > 6 || Math.abs(e.clientY - _pdy) > 6) return;   // dragged, not a click
        var entry = pickPart(e.clientX, e.clientY), k = entry ? entry.key : null;
        selKey = (selKey === k) ? null : k; applyPartLevels();
      }});
      canvas.addEventListener('pointerleave', function() {{ if (hoverKey) {{ hoverKey = null; applyPartLevels(); }} }});
    }}
    canvas.addEventListener('keydown', function(e) {{
      var step = 0.05;
      if (e.key === 'ArrowLeft') orbit.theta -= step;
      else if (e.key === 'ArrowRight') orbit.theta += step;
      else if (e.key === 'ArrowUp') orbit.phi = Math.min(orbit.maxPhi, orbit.phi + step);
      else if (e.key === 'ArrowDown') orbit.phi = Math.max(orbit.minPhi, orbit.phi - step);
      else if (e.key === '+' || e.key === '=') orbit.radius = Math.max(orbit.minRadius, orbit.radius - 0.2);
      else if (e.key === '-') orbit.radius = Math.min(orbit.maxRadius, orbit.radius + 0.2);
      else if (e.key === 'r' || e.key === 'R') {{ orbit.theta = 0; orbit.phi = Math.PI/4; orbit.radius = 3; }}
      else if (e.key === 'Escape') {{ if (activePopover) {{ activePopover.style.display = 'none'; activePopover = null; }} if (PART_HL && selKey) {{ selKey = null; applyPartLevels(); }} return; }}
      else return;
      e.preventDefault(); updateCamera();
    }});
  }}
}})();
</script>''')

        # Custom-bounds (GUI shell): wrap this block as an absolute box positioned
        # in content-area pixels inside #fgui-content.
        b = data.get('bounds')
        if shelled and isinstance(b, dict) and len(parts) > start:
            _shelled_has_bounds = True
            x = max(0, int(b.get('x') or 0)); y = max(0, int(b.get('y') or 0))
            w = max(1, int(b.get('width') or 0)); h = max(1, int(b.get('height') or 0))
            seg = '\n'.join(parts[start:]); del parts[start:]
            fit = 'cover' if data.get('fit') == 'cover' else 'contain'
            # #fgui-content carries 12px padding; offset by it so the box anchors to
            # the content-area top-left (matching the unpadded editor preview).
            parts.append(
                f'<div class="cf-bounds cf-fit-{fit}" style="position:absolute;left:{x - 12}px;top:{y - 12}px;'
                f'width:{w}px;height:{h}px;overflow:hidden;z-index:1">{seg}</div>'
            )

    # Layout preset (parity with FramePreview.jsx). In the normal flow render (NOT
    # the GUI-shell injection, which positions blocks via bounds), reflow the flow
    # blocks per frame.content.layout. Feeds both /preview-html and the published SCO.
    #   full        single column; media full-bleed, text 40px padding.
    #   text-left   50/50 split — text left, media right (both 40px padding).
    #   text-right  50/50 split — media left, text right (both 40px padding).
    if shelled and block_tags and not _shelled_has_bounds:
        # Shelled injection has no layout zones: blocks flow straight into
        # #fgui-content (which carries 12px padding, set in _patch_shell). Per spec,
        # the TEXT block must sit 40px from the top of the content area, while media
        # stays full-bleed (no top padding). #fgui-content's 12px top padding already
        # accounts for 12 of those px, so a text block needs +28px to net 40px from
        # the content-area top. Wrap each text segment; leave media/other untouched.
        segs = []  # (kind, html) per block, in flow order
        for i, (kind, s) in enumerate(block_tags):
            e = block_tags[i + 1][1] if i + 1 < len(block_tags) else len(parts)
            segs.append((kind, '\n'.join(parts[s:e])))
        wrapped = []
        text_seen = False
        for kind, seg in segs:
            if kind == 'text' and not text_seen:
                # Only the FIRST text block gets the 40px-from-top offset; later
                # text blocks flow naturally beneath preceding content.
                text_seen = True
                wrapped.append(f'<div class="cf-shelled-text-top" style="padding-top:28px">{seg}</div>')
            else:
                wrapped.append(seg)
        out = '\n'.join(wrapped)
    elif not shelled and block_tags:
        lay = layout if layout in ('full', 'text-left', 'text-right') else 'text-left'
        segs = []  # (kind, html) per block, in flow order
        for i, (kind, s) in enumerate(block_tags):
            e = block_tags[i + 1][1] if i + 1 < len(block_tags) else len(parts)
            segs.append((kind, '\n'.join(parts[s:e])))
        if lay == 'full':
            wrapped = [
                f'<div style="padding:{"40px" if kind == "text" else "0"}">{seg}</div>'
                for kind, seg in segs
            ]
            out = f'<div class="cf-layout-full">{chr(10).join(wrapped)}</div>'
        else:
            text_html  = [seg for kind, seg in segs if kind == 'text']
            other_html = [seg for kind, seg in segs if kind != 'text']
            col = 'flex:1 1 0;min-width:0;box-sizing:border-box;padding:40px'
            text_zone  = f'<div class="cf-zone-text" style="{col}">{chr(10).join(text_html)}</div>'
            media_zone = f'<div class="cf-zone-media" style="{col}">{chr(10).join(other_html)}</div>'
            zones = (media_zone + text_zone) if lay == 'text-right' else (text_zone + media_zone)
            out = (
                f'<div class="cf-two-zone" style="display:flex;flex-wrap:wrap;align-items:flex-start">'
                f'{zones}</div>'
            )
    else:
        out = '\n'.join(parts)
    # Wire every branded audio bar with one self-contained controller (emitted
    # once per rendered block list).
    if 'data-cf-audio' in out:
        out += '\n' + _cf_audio_script()
    return out


def _build_gui_frame(frame, frame_idx, total_frames, lesson_name, section_name,
                     frame_map, cf_version, disp_index=None, disp_total=None, asset_map=None,
                     hotspot_cfg=None):
    """
    Build a GUI-shell SCO frame: the ForgeGUI gui_shell.html becomes the SCO
    page. Returns (patched_html, gui_asset_id) or (None, None).

    The shell's relative `assets/...` refs are namespaced to
    `gui_assets/<asset_id>/...` (avoids collisions between multiple shells),
    and a CourseForge runtime is injected that:
      - injects the frame's non-GUI blocks into #fgui-content
      - populates the shell text zones
      - maps NEXT/PREV/SUBMIT/MENU to the real frame filenames (frame_map)
      - reports SCORM completion on the last frame
    """
    gui_block = _get_gui_block(frame)
    if not gui_block:
        return None, None
    asset_id = gui_block.get('data', {}).get('gui_asset_id', '')
    if not asset_id:
        return None, None

    asset = MediaAsset.query.get(asset_id)
    if not asset or not asset.stored_path:
        return None, None

    gui_dir   = Path(asset.stored_path)
    html_file = (asset.companion_files or {}).get('html_file', '')
    html_path = gui_dir / html_file
    if not html_path.exists():
        candidates = list(gui_dir.glob('*.html'))
        if not candidates:
            return None, None
        html_path = candidates[0]

    injected_html = _render_blocks([b for b in (frame.content or {}).get('blocks', [])
                                    if b.get('type') != 'gui'], asset_map=asset_map, hotspot_cfg=hotspot_cfg, shelled=True)
    html = _patch_shell(html_path.read_text(encoding='utf-8'), asset_id, injected_html,
                        frame, frame_idx, total_frames, lesson_name, section_name, frame_map, cf_version,
                        disp_index, disp_total)
    return html, asset_id


def _build_project_shell_frame(shell, frame, frame_idx, total_frames, lesson_name,
                               section_name, frame_map, cf_version, disp_index=None, disp_total=None,
                               asset_map=None, hotspot_cfg=None, preview=False):
    """Per-project GuiShell -> SCO page (ALL frame blocks injected).

    preview: forwarded to _render_blocks so the live shell preview resolves media
    via serve_url (the published packager leaves this False)."""
    sdir = Path(shell.stored_path)
    html_path = sdir / (shell.html_file or '')
    if not html_path.exists():
        cands = list(sdir.glob('*.html'))
        if not cands:
            return None, None
        html_path = cands[0]
    injected_html = _render_blocks((frame.content or {}).get('blocks', []), asset_map=asset_map,
                                   hotspot_cfg=hotspot_cfg, shelled=True, preview=preview)
    html = _patch_shell(_read_text_cached(str(html_path)), shell.id, injected_html,
                        frame, frame_idx, total_frames, lesson_name, section_name, frame_map, cf_version,
                        disp_index, disp_total)
    return html, shell.id


def _patch_shell(shell_html, ns_id, injected_html, frame, frame_idx, total_frames,
                 lesson_name, section_name, frame_map, cf_version, disp_index=None, disp_total=None):
    """Namespace a shell's assets to gui_assets/<ns_id>/ and inject the
    CourseForge runtime (content injection + zones + nav + completion).

    The visible frame counter uses disp_index/disp_total (required frames only,
    excluding optional); navigation + completion still use the real positions.
    """
    # Namespace asset references so multiple shells never collide in the ZIP.
    shell_html = shell_html.replace('assets/', f'gui_assets/{ns_id}/')

    is_first  = frame_idx == 0
    is_last   = frame_idx == total_frames - 1
    prev_href = frame_map.get(frame_idx - 1, '')
    next_href = frame_map.get(frame_idx + 1, '')
    counter_index = disp_index if disp_index is not None else (frame_idx + 1)
    counter_total = disp_total if disp_total is not None else total_frames

    # Escape '</' so an embedded </script> can't close the runtime's own tag.
    frame_html_js = json.dumps(injected_html).replace('</', '<\\/')

    # Prompt zone: per-frame prompt (authored in the Frame section, stored in
    # content.prompt), falling back to the frame title when empty.
    frame_prompt = (frame.content or {}).get('prompt') or frame.name or ''

    cf_runtime = f"""
<script>
// CourseForge GUI Runtime — injected by CourseForge v{cf_version} at publish time
(function() {{
  // FRAME_HTML has its close-tag sequences backslash-escaped server-side so an
  // inline script inside a block (3D viewer, OAM player) can't terminate this
  // runtime tag early. The escaping is invisible once the JS string is parsed.
  var FRAME_HTML = {frame_html_js};
  var FRAME_DATA = {{
    frameIndex:   {counter_index},
    totalFrames:  {counter_total},
    lessonTitle:  {json.dumps(lesson_name or '')},
    sectionTitle: {json.dumps(section_name or '')},
    frameTitle:   {json.dumps(frame.name or '')},
    prompt:       {json.dumps(frame_prompt)},
    isFirst:      {'true' if is_first else 'false'},
    isLast:       {'true' if is_last else 'false'}
  }};
  var NEXT_HREF = {json.dumps(next_href)};
  var PREV_HREF = {json.dumps(prev_href)};

  function reportComplete() {{
    try {{
      if (window.API) {{
        window.API.LMSSetValue('cmi.core.lesson_status', 'completed');
        window.API.LMSSetValue('cmi.core.score.raw', '100');
        window.API.LMSCommit('');
      }}
      if (window.API_1484_11) {{
        window.API_1484_11.SetValue('cmi.completion_status', 'completed');
        window.API_1484_11.SetValue('cmi.success_status', 'passed');
        window.API_1484_11.Commit('');
      }}
    }} catch(e) {{}}
  }}

  // innerHTML (used by fgui.injectContent) parses script tags but never
  // executes them, so re-create each one to run interactive blocks
  // (3D viewer, OAM player, interactive video) after injection.
  function runInjectedScripts() {{
    var ca = document.getElementById('fgui-content');
    if (!ca) return;
    var scripts = ca.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {{
      var old = scripts[i];
      var s = document.createElement('script');
      for (var a = 0; a < old.attributes.length; a++) {{
        s.setAttribute(old.attributes[a].name, old.attributes[a].value);
      }}
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    }}
  }}

  function inject() {{
    if (!window.fgui) {{ setTimeout(inject, 100); return; }}
    window.fgui.injectContent(FRAME_HTML);
    runInjectedScripts();
    window.fgui.setFrameData(FRAME_DATA);
    // Shells built before the setFrameData key-map fix read state.currentFrame,
    // which their old setFrameData never set (it merged 'frameIndex' verbatim) —
    // so the counter stuck at "1 / total". Route the same payload through the
    // postMessage bridge those shells DO map correctly, so the pager is right
    // regardless of when the shell was authored. Idempotent on fixed shells.
    try {{ window.postMessage(Object.assign({{ type: 'fgui_frame_data' }}, FRAME_DATA), '*'); }} catch(e) {{}}
    // Version-INDEPENDENT counter: write the frame_counter zone text directly from
    // FRAME_DATA, bypassing the shell's baked runtime entirely. The two paths above
    // both depend on the stored shell's runtime (its setFrameData key-map and/or its
    // async fgui_frame_data handler + updateZones); when the demo's shell was baked
    // by an older shell_builder, OR when the postMessage race loses, the zone showed
    // "1 / 1" or "13 / " (empty total). Every shell_builder version tags the counter
    // zone div with data-zone-type="frame_counter", so we can populate it ourselves.
    // Re-assert on a tick so we win against the async postMessage handler's
    // updateZones() (which may run later with stale state on a buggy shell).
    function paintCounter() {{
      var nodes = document.querySelectorAll('[data-zone-type="frame_counter"]');
      for (var i = 0; i < nodes.length; i++) {{
        nodes[i].textContent = FRAME_DATA.frameIndex + ' / ' + FRAME_DATA.totalFrames;
      }}
    }}
    paintCounter();
    requestAnimationFrame(paintCounter);
    setTimeout(paintCounter, 50);
    setTimeout(paintCounter, 200);
    window.fgui.onAction = function(action) {{
      // Bubble to a host that drives navigation itself (the course-preview
      // wrapper). Harmless in a published SCO — the LMS ignores it and the
      // window.location.href navigation below still runs.
      try {{ if (window.parent && window.parent !== window) window.parent.postMessage({{ type: 'fgui_action', action: action }}, '*'); }} catch(e) {{}}
      switch(action) {{
        case 'NEXT':
        case 'CONTINUE':
          if (FRAME_DATA.isLast) {{ reportComplete(); }}
          else if (NEXT_HREF) {{ window.location.href = NEXT_HREF; }}
          break;
        case 'PREVIOUS':
          if (!FRAME_DATA.isFirst && PREV_HREF) {{ window.location.href = PREV_HREF; }}
          break;
        case 'SUBMIT':
          reportComplete();
          if (!FRAME_DATA.isLast && NEXT_HREF) {{ window.location.href = NEXT_HREF; }}
          break;
        case 'MENU':
          window.location.href = {json.dumps(frame_map.get(0, ''))};
          break;
        case 'REPLAY':
          window.location.reload();
          break;
      }}
    }};
  }}

  // Style the injected CourseForge content inside the shell content area.
  var style = document.createElement('style');
  style.textContent =
    '#fgui-content{{font-family:\\'IBM Plex Mono\\',\\'Inter\\',system-ui,sans-serif;' +
    'font-size:14px;color:#C8D8E8;line-height:1.6;padding:12px;box-sizing:border-box;' +
    'overflow-y:auto;height:100%}}' +
    '#fgui-content h1,#fgui-content h2,#fgui-content h3{{color:#F59E0B;margin-bottom:12px}}' +
    '#fgui-content p{{margin-bottom:10px}}#fgui-content ul{{margin:8px 0 10px 20px}}' +
    '#fgui-content li{{margin-bottom:4px}}#fgui-content img{{max-width:100%;height:auto}}' +
    '.cf-bounds{{margin:0}}.cf-bounds video,.cf-bounds img{{width:100%;height:100%;object-fit:contain;border-radius:0}}' +
    '.cf-fit-cover video,.cf-fit-cover img{{object-fit:cover}}';
  document.head.appendChild(style);

  window.addEventListener('load', inject);
  if (document.readyState === 'complete') inject();
}})();
</script>
"""

    if '</body>' in shell_html:
        shell_html = shell_html.replace('</body>', cf_runtime + '\n</body>')
    else:
        shell_html += cf_runtime

    return shell_html


def build_scorm12_package(project_id: str) -> tuple[BytesIO, str]:
    """
    Build a SCORM 1.2 ZIP package for the given project.
    Returns (BytesIO zip buffer, suggested filename).
    Must be called within Flask app context.
    """
    project = project_full_query().get_or_404(project_id)
    tokens  = resolve_theme(project)
    css     = tokens_to_css(tokens)
    hotspot_cfg = _project_hotspot_cfg(project)

    # Collect all frames in order
    all_frames = []   # list of (frame, lesson, course)
    for course in sorted(project.courses, key=lambda c: c.order_index):
        for mod in sorted(course.modules, key=lambda m: m.order_index):
            for lesson in sorted(mod.lessons, key=lambda l: l.order_index):
                for frame in sorted(lesson.frames, key=lambda f: f.order_index):
                    all_frames.append((frame, lesson, course))

    total = len(all_frames)
    manifest_id = f"cf_{project_id.replace('-','')}"
    org_id      = f"org_{manifest_id}"

    # Build frame filename map {index: filename}
    frame_map  = {}
    items      = []
    resources  = []

    for idx, (frame, lesson, course) in enumerate(all_frames):
        fname = f"frame_{idx:04d}_{frame.id[:8]}.html"
        frame_map[idx] = fname
        res_id = f"res_{idx:04d}"
        items.append({
            'item_id': f"item_{idx:04d}",
            'res_id':  res_id,
            'title':   frame.name,
        })
        resources.append({
            'res_id':       res_id,
            'href':         fname,
            'dependencies': [],
        })

    # Render imsmanifest
    manifest_xml = render_template(
        'imsmanifest.xml',
        manifest_id=manifest_id,
        org_id=org_id,
        project_name=project.name,
        items=items,
        resources=resources,
        cf_version=VERSION,
        publish_date=datetime.utcnow().strftime('%Y-%m-%d'),
    )

    # Build ZIP in memory
    buf = BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:

        # imsmanifest.xml
        zf.writestr('imsmanifest.xml', manifest_xml)

        # SCO HTML files
        comment = (
            f"<!-- CourseForge v{VERSION} | schema {SCHEMA_VERSION} | "
            f"published {datetime.utcnow().strftime('%Y-%m-%d')} -->\n"
        )
        bundled_shell_ids = set()

        def _bundle_shell_assets(stored_path, ns_id):
            if not stored_path or ns_id in bundled_shell_ids:
                return
            adir = Path(stored_path) / 'assets'
            if adir.exists():
                for af in adir.iterdir():
                    if af.is_file():
                        zf.write(str(af), f'gui_assets/{ns_id}/{af.name}')
            bundled_shell_ids.add(ns_id)

        # Per-project shell (applied to every frame that has no per-frame GUI block).
        project_shell = None
        if project.gui_shell_id:
            from ..models.gui_shell import GuiShell
            project_shell = GuiShell.query.get(project.gui_shell_id)

        # Frame counter excludes optional frames: required total + per-frame
        # running required index (optional frames hold the previous value).
        req_total = sum(1 for (fr, _, _) in all_frames if not getattr(fr, 'optional', False)) or total
        req_index = {}
        _run = 0
        for _i, (fr, _, _) in enumerate(all_frames):
            if not getattr(fr, 'optional', False):
                _run += 1
            req_index[_i] = _run or 1

        # One query for the project's media; threaded into block rendering so
        # ivideo/model3d resolve their assets via dict lookup instead of a SELECT
        # per block, and reused for the media-bundling pass below.
        project_assets = MediaAsset.query.filter_by(project_id=project_id).all()
        asset_by_id = {a.id: a for a in project_assets}

        for idx, (frame, lesson, course) in enumerate(all_frames):
            fname = frame_map[idx]

            # 1) Per-frame GUI block override — the ForgeGUI shell IS the SCO page.
            if _frame_has_gui(frame):
                gui_html, gui_aid = _build_gui_frame(
                    frame, idx, total, lesson.name, course.name, frame_map, VERSION,
                    req_index[idx], req_total, asset_map=asset_by_id, hotspot_cfg=hotspot_cfg,
                )
                if gui_html:
                    zf.writestr(fname, comment + gui_html)
                    gasset = asset_by_id.get(gui_aid) or MediaAsset.query.get(gui_aid)
                    _bundle_shell_assets(gasset.stored_path if gasset else None, gui_aid)
                    continue
                # else fall through

            # 2) Per-project shell — wrap the whole frame in the chosen shell.
            if project_shell and project_shell.stored_path:
                ph, sid = _build_project_shell_frame(
                    project_shell, frame, idx, total, lesson.name, course.name, frame_map, VERSION,
                    req_index[idx], req_total, asset_map=asset_by_id, hotspot_cfg=hotspot_cfg,
                )
                if ph:
                    zf.writestr(fname, comment + ph)
                    _bundle_shell_assets(project_shell.stored_path, sid)
                    continue

            html  = build_frame_html(
                frame=frame,
                lesson=lesson,
                frame_index=idx,
                total_frames=total,
                frame_map=frame_map,
                theme_css=css,
                scorm_bridge=_has_oam_with_scorm(frame),
                disp_index=req_index[idx],
                disp_total=req_total,
                asset_map=asset_by_id,
                hotspot_cfg=hotspot_cfg,
            )
            zf.writestr(fname, comment + html)

        # ── Bundle Video.js (vendored, offline — security review H4) ──
        _bundle_videojs_assets(zf)

        # ── Bundle three.js + loaders + Draco (only if a 3D block exists) ──
        _model_frames = [f for (f, _l, _c) in all_frames]
        if _frames_have_model3d(_model_frames):
            _bundle_three_assets(zf)
            _bundle_hdri_assets(zf, _model3d_hdri_names(_model_frames))

        # ── Bundle video + companion media (webm/vtt/poster) ───────
        _bundled_media = set()

        def _bundle_media(stored_path, arc_path):
            if arc_path in _bundled_media:
                return
            if stored_path and Path(stored_path).exists():
                zf.write(stored_path, arc_path)
                _bundled_media.add(arc_path)

        # project_assets / asset_by_id were built once above (reused here);
        # companions resolved via the dict (no per-companion SELECT).
        for asset in project_assets:
            companions = asset.companion_files or {}
            if asset.kind == 'video':
                vext = asset.original_name.rsplit('.', 1)[-1].lower() if '.' in (asset.original_name or '') else 'mp4'
                _bundle_media(asset.stored_path, f'media/video/{asset.id}.{vext}')
            elif asset.kind == 'image':
                iext = asset.original_name.rsplit('.', 1)[-1].lower() if '.' in (asset.original_name or '') else 'jpg'
                _bundle_media(asset.stored_path, f'media/images/{asset.id}.{iext}')
            elif asset.kind == 'audio':
                aext = asset.original_name.rsplit('.', 1)[-1].lower() if '.' in (asset.original_name or '') else 'mp3'
                _bundle_media(asset.stored_path, f'media/audio/{asset.id}.{aext}')
            elif asset.kind == 'clip':
                if asset.stored_path and Path(asset.stored_path).exists():
                    _bundle_media(asset.stored_path, f'media/clips/{asset.id}.clip.json')
            elif asset.kind == 'model3d':
                if asset.stored_path and Path(asset.stored_path).exists():
                    _bundle_media(asset.stored_path, f'media/models/{asset.id}{Path(asset.stored_path).suffix.lower()}')
            elif asset.kind == 'oam' and asset.oam_asset and asset.oam_asset.extracted_path:
                # Bundle the whole extracted OAM under oam/<media_asset_id>/...
                # (was a second full frame-walk + a per-OAM OamAsset query).
                edir = Path(asset.oam_asset.extracted_path)
                if edir.exists():
                    for oam_file in edir.rglob('*'):
                        if oam_file.is_file():
                            zf.write(str(oam_file), f"oam/{asset.id}/{oam_file.relative_to(edir)}")

            if companions.get('webm_asset_id'):
                webm = asset_by_id.get(companions['webm_asset_id'])
                if webm:
                    _bundle_media(webm.stored_path, f'media/video/{webm.id}.webm')
            if companions.get('vtt_asset_id'):
                vtt = asset_by_id.get(companions['vtt_asset_id'])
                if vtt:
                    _bundle_media(vtt.stored_path, f'media/captions/{vtt.id}.vtt')
            if companions.get('poster_asset_id'):
                poster = asset_by_id.get(companions['poster_asset_id'])
                if poster:
                    pext = poster.original_name.rsplit('.', 1)[-1].lower() if '.' in (poster.original_name or '') else 'jpg'
                    _bundle_media(poster.stored_path, f'media/images/{poster.id}.{pext}')

    buf.seek(0)
    safe_name = project.name.replace(' ', '_').lower()[:40]
    filename  = f"{safe_name}_scorm12_{datetime.utcnow().strftime('%Y%m%d')}.zip"
    return buf, filename


def _has_oam_with_scorm(frame) -> bool:
    for block in frame.content.get('blocks', []):
        if block.get('type') == 'oam' and block.get('data', {}).get('scorm_bridge_enabled'):
            return True
    return False
