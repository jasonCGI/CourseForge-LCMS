"""
SCORM 1.2 Package Builder
Produces a ZIP file containing:
  - imsmanifest.xml
  - One SCO HTML file per frame
  - Shared assets (CSS tokens baked in)
"""

import os
import uuid
import zipfile
import json
from io import BytesIO
from pathlib import Path
from datetime import datetime
from functools import lru_cache
from flask import current_app, render_template

import urllib.request
from ..models.project import Project, Frame, project_full_query


@lru_cache(maxsize=32)
def _read_text_cached(path):
    """Read a (static, immutable) shell HTML file once per publish process —
    the per-project shell is otherwise re-read from disk for every frame."""
    return Path(path).read_text(encoding='utf-8')
from ..models.media import MediaAsset
from ..services.theme_resolver import resolve_theme, tokens_to_css
from ..version import VERSION, SCHEMA_VERSION


def build_frame_html(frame, lesson, frame_index, total_frames,
                     frame_map, theme_css, scorm_bridge=False,
                     disp_index=None, disp_total=None, asset_map=None):
    """Render a single SCO HTML page for one frame.

    The visible counter + progress bar use disp_index/disp_total (required
    frames only, excluding optional); navigation still uses the real
    frame_index/total_frames positions.
    """

    blocks_html = _render_blocks(frame.content.get('blocks', []), scorm_bridge, asset_map)

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


_OAM_PLAYER_TPL = """
<div id="oamwrap-__BID__" style="margin-bottom:20px;width:100%">
  <div id="oamstage-__BID__" style="position:relative;width:100%;overflow:hidden;background:#0d1117;border-radius:6px 6px 0 0">
    <iframe id="oam-__BID__" src="__SRC__" width="__W__" height="__H__" scrolling="no" allowfullscreen
      title="Interactive animation" sandbox="allow-scripts allow-same-origin"
      style="position:absolute;top:0;left:0;border:0;transform-origin:top left;display:block;background:#0d1117"></iframe>
  </div>
  <div id="oambar-__BID__" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1117;border:1px solid #1c2a3a;border-top:none;border-radius:0 0 6px 6px">
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
  var lastW=-1;
  function fit(){
    if(!stage||!SW||!SH) return;
    var cw=stage.clientWidth||SW;
    if(cw===lastW) return;   // guard the ResizeObserver against its own height write
    lastW=cw;
    var s=cw/SW;
    var sc=document.getElementById('fgui-content');
    if(sc && sc.contains(wrap)){
      var availH=sc.clientHeight-(bar?bar.offsetHeight:36)-16;
      if(availH>0) s=Math.min(s, availH/SH);   // letterbox inside the content box
    } else {
      s=Math.min(s,1);                          // flowing layout: don't upscale past native
    }
    if(!(s>0)) s=1;
    f.style.transform='scale('+s+')';
    f.style.left=Math.max(0,(cw-SW*s)/2)+'px';
    stage.style.height=(SH*s)+'px';
  }
  fit();
  if(window.ResizeObserver){ try{ new ResizeObserver(fit).observe(stage); }catch(e){} }
  window.addEventListener('resize', function(){ lastW=-1; fit(); });
  // -- media bar protocol --
  var dur=0, supported=false;
  function send(m){ try{ f.contentWindow.postMessage(m,'*'); }catch(e){} }
  window.addEventListener('message', function(e){
    if(e.source!==f.contentWindow) return; var d=e.data||{}; if(d.type!=='oam:state') return;
    supported=true; dur=d.duration||0;
    fill.style.width=(dur?(d.t/dur*100):0)+'%';
    play.innerHTML=d.playing?'&#9208;':'&#9658;'; play.setAttribute('data-playing', d.playing?'1':'');
    tm.textContent=(d.t||0).toFixed(1)+'/'+dur.toFixed(0)+'s';
    if(!marks.getAttribute('data-done') && d.stops){ marks.setAttribute('data-done','1'); d.stops.forEach(function(s){ var k=document.createElement('div'); k.style.cssText='position:absolute;left:'+(dur?s/dur*100:0)+'%;top:-3px;width:2px;height:14px;background:#7EB8F0;transform:translateX(-50%)'; marks.appendChild(k); }); }
  });
  f.addEventListener('load', function(){ send({type:'oam:getState'}); });
  setTimeout(function(){ send({type:'oam:getState'}); }, 500);
  play.onclick=function(){ if(!supported) return; send({type: play.getAttribute('data-playing')?'oam:pause':'oam:play'}); };
  nextb.onclick=function(){ if(!supported) return; send({type:'oam:nextStop'}); };
  track.onclick=function(ev){ if(!supported||!dur) return; var r=track.getBoundingClientRect(); send({type:'oam:seek', t:Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*dur}); };
})();
</script>
"""


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


def _render_blocks(blocks, scorm_bridge=False, asset_map=None):
    """Convert block list to HTML string.

    asset_map: optional {asset_id: MediaAsset} for the whole project so media
    blocks resolve via dict lookup instead of one DB query per block.
    """
    parts = []
    for block in blocks:
        btype = block.get('type')
        data  = block.get('data', {})
        bid   = block.get('id', str(uuid.uuid4()))

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
            html = f'<div class="cf-text">{data.get("body","")}</div>'
            if data.get('narrator_script'):
                html += f'<div class="cf-narration">🎙 {data["narrator_script"]}</div>'
            parts.append(html)

        elif btype == 'media' and data.get('kind') == 'video' and data.get('asset_id'):
            asset_id   = data['asset_id']
            use_vjs    = data.get('use_videojs', True)
            companions = data.get('asset_meta', {}).get('companion_files', {}) or {}
            webm_id    = companions.get('webm_asset_id')
            vtt_id     = companions.get('vtt_asset_id')
            poster_id  = companions.get('poster_asset_id')
            title      = data.get('original_name', 'Video')
            caption    = data.get('caption', '')

            mp4_src    = f'media/video/{asset_id}.mp4'
            webm_src   = f'media/video/{webm_id}.webm'   if webm_id   else None
            vtt_src    = f'media/captions/{vtt_id}.vtt'   if vtt_id    else None
            poster_src = f'media/images/{poster_id}.jpg'  if poster_id else None

            sources = ''
            if webm_src:
                sources += f'<source src="{webm_src}" type="video/webm">'
            sources += f'<source src="{mp4_src}" type="video/mp4">'
            track = f'<track kind="captions" src="{vtt_src}" srclang="en" label="English" default>' if vtt_src else ''
            poster_attr = f'poster="{poster_src}"' if poster_src else ''
            cap_html = f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>' if caption else ''

            if use_vjs:
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
                    f'<video controls {poster_attr} style="width:100%;border-radius:6px;margin-bottom:20px" '
                    f'aria-label="{title}">{sources}{track}'
                    f'<p>Your browser does not support HTML5 video.</p></video>{cap_html}'
                )

        elif btype == 'media' and data.get('kind') == 'image' and data.get('asset_id'):
            asset_id = data['asset_id']
            name     = data.get('original_name') or ''
            ext      = name.rsplit('.', 1)[-1].lower() if '.' in name else 'jpg'
            alt      = data.get('placeholder_label') or name or 'Image'
            caption  = data.get('caption', '')
            cap_html = (f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>'
                        if caption else '')
            parts.append(
                f'<div style="margin-bottom:20px">'
                f'<img src="media/images/{asset_id}.{ext}" alt="{alt}" '
                f'style="max-width:100%;height:auto;border-radius:6px">'
                f'{cap_html}</div>'
            )

        elif btype == 'media' and data.get('kind') == 'audio' and data.get('asset_id'):
            asset_id = data['asset_id']
            name     = data.get('original_name') or ''
            ext      = name.rsplit('.', 1)[-1].lower() if '.' in name else 'mp3'
            caption  = data.get('caption', '')
            cap_html = (f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>'
                        if caption else '')
            parts.append(
                f'<div style="margin-bottom:20px">'
                f'<audio controls src="media/audio/{asset_id}.{ext}" style="width:100%">'
                f'Your browser does not support audio playback.</audio>'
                f'{cap_html}</div>'
            )

        elif btype == 'media':
            kind  = data.get('kind', 'image')
            label = data.get('placeholder_label', '')
            cap   = data.get('caption', '')
            icons = {'image':'🖼','video':'🎬','audio':'🎙','oam':'⚙'}
            icon  = icons.get(kind, '📎')
            parts.append(
                f'<div class="cf-media">'
                f'{icon} [{kind}: {label}]'
                f'{"<br><small>" + cap + "</small>" if cap else ""}'
                f'</div>'
            )

        elif btype == 'quiz':
            choices_html = ''
            for i, choice in enumerate(data.get('choices', [])):
                choices_html += (
                    f'<button class="cf-choice" data-index="{i}" '
                    f'onclick="cfSelectChoice(\'{bid}\', this)">'
                    f'{choice}</button>'
                )
            fb_correct   = data.get('feedback_correct',   'Correct!')
            fb_incorrect = data.get('feedback_incorrect', 'Incorrect — please review.')
            correct_idx  = data.get('correct_index', 0)
            parts.append(
                f'<div class="cf-quiz" id="quiz-{bid}">'
                f'<p class="cf-quiz-question">{data.get("question","")}</p>'
                f'{choices_html}'
                f'<button class="cf-submit" '
                f'onclick="cfSubmitQuiz(\'{bid}\', {correct_idx})">Submit</button>'
                f'<div class="cf-feedback correct" id="feedback-{bid}">{fb_correct}</div>'
                f'<div class="cf-feedback incorrect" id="feedback-{bid}-wrong">{fb_incorrect}</div>'
                f'</div>'
            )

        elif btype == 'hotspot':
            regions_html = ''
            for r in data.get('regions', []):
                regions_html += (
                    f'<div class="cf-hotspot-region" '
                    f'style="left:{r["x"]}%;top:{r["y"]}%;'
                    f'width:{r["w"]}%;height:{r["h"]}%">'
                    f'<span class="cf-hotspot-label">{r.get("label","")}</span>'
                    f'</div>'
                )
            parts.append(
                f'<div class="cf-hotspot-wrap">{regions_html}</div>'
            )

        elif btype == 'branch':
            true_label  = data.get('true_label',  'Yes')
            false_label = data.get('false_label', 'No')
            true_frame  = data.get('true_frame_id',  '')
            false_frame = data.get('false_frame_id', '')
            parts.append(
                f'<div class="cf-branch">'
                f'<p class="cf-branch-condition">{data.get("condition","")}</p>'
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
            wcn_type  = data.get('wcn_type', 'note')
            title     = data.get('title', '')
            text      = data.get('text', '')
            modal     = data.get('modal', False)
            ack_label = data.get('ack_label', 'I understand — proceed')
            block_id  = block.get('id', str(uuid.uuid4()))[:8]
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
            width    = data.get('width',  800)
            height   = data.get('height', 600)
            entry    = data.get('entry_point', 'index.html')
            if not asset_id:
                parts.append('<div class="cf-media">&#9881; [OAM — no animation linked]</div>')
            else:
                # OAM files are bundled at oam/{asset_id}/{entry}; the media bar
                # drives the animation via the oam:* postMessage protocol.
                src = f"oam/{asset_id}/{entry}"
                parts.append(
                    _OAM_PLAYER_TPL.replace('__BID__', bid[:8]).replace('__SRC__', src)
                                   .replace('__W__', str(width)).replace('__H__', str(height))
                )

        elif btype == 'ivideo':
            video_id = data.get('video_asset_id', '')
            clip_id  = data.get('clip_asset_id', '')
            caption  = data.get('caption', '')
            block_id = bid[:8]

            if not video_id:
                parts.append('<div class="cf-media">▶⊕ [Interactive Video — no video linked]</div>')
            else:
                vext = 'mp4'
                v_asset = _get_asset(video_id, asset_map)
                if v_asset and v_asset.original_name and '.' in v_asset.original_name:
                    vext = v_asset.original_name.rsplit('.', 1)[-1].lower()
                video_src = f'media/video/{video_id}.{vext}'

                # Inline the clip interactions — robust across LMS that block fetch()
                clip_json = '{"interactions":[]}'
                if clip_id:
                    c_asset = _get_asset(clip_id, asset_map)
                    if c_asset and c_asset.stored_path and Path(c_asset.stored_path).exists():
                        clip_json = _read_clip_cached(c_asset.stored_path, os.path.getmtime(c_asset.stored_path))
                clip_json = clip_json.replace('</', '<\\/')  # don't break the <script> tag

                cap_html = f'<p style="font-size:13px;color:#888;margin-top:6px">{caption}</p>' if caption else ''
                parts.append(f'''
<div id="ivideo-{block_id}" style="position:relative;width:100%;margin-bottom:20px">
  <video controls style="width:100%;border-radius:6px;display:block" aria-label="Interactive video">
    <source src="{video_src}" type="video/{vext}">
    <p>Your browser does not support HTML5 video.</p>
  </video>
  <div class="ivideo-overlay" style="position:absolute;inset:0;pointer-events:none"></div>
  {cap_html}
</div>
<script>
(function() {{
  var clipData = {clip_json};
  if (window.iVideoInit) iVideoInit("ivideo-{block_id}", (clipData && clipData.interactions) || [], {{}});
}})();
</script>''')

        elif btype == 'model3d':
            model_id = data.get('model_asset_id', '')
            caption  = data.get('caption', '')
            height   = data.get('viewer_height', 400)
            bg_color = data.get('bg_color', '#0d1017')
            block_id = bid[:8]
            annotations = data.get('annotations', [])
            ann_json = json.dumps(annotations).replace('</', '<\\/')

            if not model_id:
                parts.append('<div style="padding:32px;text-align:center;color:#2A5A8A;font-size:13px">⬡ 3D Model — no model linked</div>')
            else:
                m_ext = '.glb'
                m_asset = _get_asset(model_id, asset_map)
                if m_asset and m_asset.stored_path:
                    m_ext = Path(m_asset.stored_path).suffix.lower()
                model_src = f'media/models/{model_id}{m_ext}'
                cap_html = f'<p style="font-size:12px;color:#888;margin-top:6px">{caption}</p>' if caption else ''
                aria = caption or '3D model viewer — use arrow keys to rotate, plus/minus to zoom, R to reset'
                parts.append(f'''
<div id="viewer3d-{block_id}" style="position:relative;width:100%;margin-bottom:20px">
  <canvas id="canvas3d-{block_id}" tabindex="0" role="img" aria-label="{aria}"
    style="width:100%;height:{height}px;display:block;border-radius:8px;cursor:grab;outline:none;touch-action:none"></canvas>
  <div id="annoverlay-{block_id}" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:8px"></div>
  <div id="loading3d-{block_id}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:{bg_color};border-radius:8px">
    <div style="text-align:center">
      <div class="cf-spin3d" style="width:28px;height:28px;border-radius:50%;border:3px solid #1c2a3a;border-top-color:#F59E0B;animation:spin3d 0.8s linear infinite;margin:0 auto 8px"></div>
      <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#3A5A7A;letter-spacing:0.08em">Loading model…</span>
    </div>
  </div>
  <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.5);color:#3A5A7A;font-family:'IBM Plex Mono',monospace;font-size:9px;padding:3px 8px;border-radius:4px;letter-spacing:0.06em" aria-hidden="true">
    arrows orbit · +/- zoom · R reset
  </div>
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
  @media (prefers-reduced-motion: reduce) {{ .cf-spin3d, #viewer3d-{block_id} .ann-dot, #viewer3d-{block_id} .ann-popover {{ animation: none !important; transition: none !important; }} }}
</style>
<script>
(function() {{
  var THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var GLTF_CDN  = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
  var ANNOTATIONS = {ann_json};
  function loadScript(src, cb) {{
    if (document.querySelector('script[src="' + src + '"]')) {{ cb(); return; }}
    var s = document.createElement('script'); s.src = src; s.onload = cb; document.head.appendChild(s);
  }}
  loadScript(THREE_CDN, function() {{ loadScript(GLTF_CDN, function() {{
    init3DViewer('{block_id}', '{model_src}', '{bg_color}', {height}, ANNOTATIONS);
  }}); }});

  function init3DViewer(blockId, modelSrc, bgColor, height, annotations) {{
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
    function projectDots() {{
      if (!overlay) return;
      var cw = canvas.clientWidth, ch = canvas.clientHeight;
      dotEls.forEach(function(it) {{
        _v3.set(it.ann.position.x, it.ann.position.y, it.ann.position.z);
        var ndc = _v3.clone().project(camera);
        if (ndc.z >= 1.0) {{ it.dot.style.display = 'none'; return; }}
        var sx = (ndc.x * 0.5 + 0.5) * cw, sy = (-ndc.y * 0.5 + 0.5) * ch;
        it.dot.style.display = 'block'; it.dot.style.left = sx + 'px'; it.dot.style.top = sy + 'px';
        it.pop.style.left = sx > cw * 0.6 ? 'auto' : '18px';
        it.pop.style.right = sx > cw * 0.6 ? '18px' : 'auto';
      }});
    }}

    new THREE.GLTFLoader().load(modelSrc, function(gltf) {{
      var model = gltf.scene;
      var box = new THREE.Box3().setFromObject(model);
      var center = box.getCenter(new THREE.Vector3());
      var size = box.getSize(new THREE.Vector3());
      var scale = 2.0 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(scale); model.position.sub(center.multiplyScalar(scale));
      scene.add(model); if (loading) loading.style.display = 'none';
    }}, undefined, function() {{
      if (loading) loading.innerHTML = '<span style="color:#E87070;font-size:13px">Failed to load model</span>';
    }});
    (function animate() {{ requestAnimationFrame(animate); renderer.render(scene, camera); projectDots(); }})();
    var ro = new ResizeObserver(function() {{ var w2 = canvas.clientWidth || w; renderer.setSize(w2, height); camera.aspect = w2/height; camera.updateProjectionMatrix(); }});
    ro.observe(canvas);
    canvas.addEventListener('pointerdown', function(e) {{ if (e.button !== 0) return; orbit.dragging = true; orbit.lastX = e.clientX; orbit.lastY = e.clientY; canvas.setPointerCapture(e.pointerId); }});
    canvas.addEventListener('pointermove', function(e) {{ if (!orbit.dragging) return; orbit.theta -= (e.clientX-orbit.lastX)*0.01; orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi + (e.clientY-orbit.lastY)*0.01)); orbit.lastX = e.clientX; orbit.lastY = e.clientY; updateCamera(); }});
    canvas.addEventListener('pointerup', function(e) {{ orbit.dragging = false; try {{ canvas.releasePointerCapture(e.pointerId); }} catch(x) {{}} }});
    canvas.addEventListener('wheel', function(e) {{ e.preventDefault(); orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius + e.deltaY*0.01)); updateCamera(); }}, {{ passive:false }});
    canvas.addEventListener('keydown', function(e) {{
      var step = 0.05;
      if (e.key === 'ArrowLeft') orbit.theta -= step;
      else if (e.key === 'ArrowRight') orbit.theta += step;
      else if (e.key === 'ArrowUp') orbit.phi = Math.max(orbit.minPhi, orbit.phi - step);
      else if (e.key === 'ArrowDown') orbit.phi = Math.min(orbit.maxPhi, orbit.phi + step);
      else if (e.key === '+' || e.key === '=') orbit.radius = Math.max(orbit.minRadius, orbit.radius - 0.2);
      else if (e.key === '-') orbit.radius = Math.min(orbit.maxRadius, orbit.radius + 0.2);
      else if (e.key === 'r' || e.key === 'R') {{ orbit.theta = 0; orbit.phi = Math.PI/4; orbit.radius = 3; }}
      else if (e.key === 'Escape') {{ if (activePopover) {{ activePopover.style.display = 'none'; activePopover = null; }} return; }}
      else return;
      e.preventDefault(); updateCamera();
    }});
  }}
}})();
</script>''')

    return '\n'.join(parts)


def _build_gui_frame(frame, frame_idx, total_frames, lesson_name, section_name,
                     frame_map, cf_version, disp_index=None, disp_total=None, asset_map=None):
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
                                    if b.get('type') != 'gui'], asset_map=asset_map)
    html = _patch_shell(html_path.read_text(encoding='utf-8'), asset_id, injected_html,
                        frame, frame_idx, total_frames, lesson_name, section_name, frame_map, cf_version,
                        disp_index, disp_total)
    return html, asset_id


def _build_project_shell_frame(shell, frame, frame_idx, total_frames, lesson_name,
                               section_name, frame_map, cf_version, disp_index=None, disp_total=None,
                               asset_map=None):
    """Per-project GuiShell -> SCO page (ALL frame blocks injected)."""
    sdir = Path(shell.stored_path)
    html_path = sdir / (shell.html_file or '')
    if not html_path.exists():
        cands = list(sdir.glob('*.html'))
        if not cands:
            return None, None
        html_path = cands[0]
    injected_html = _render_blocks((frame.content or {}).get('blocks', []), asset_map=asset_map)
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
    prompt:       {json.dumps(frame.name or '')},
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
    window.fgui.onAction = function(action) {{
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
    '#fgui-content li{{margin-bottom:4px}}#fgui-content img{{max-width:100%;height:auto;border-radius:4px}}';
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
                    req_index[idx], req_total, asset_map=asset_by_id,
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
                    req_index[idx], req_total, asset_map=asset_by_id,
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
            )
            zf.writestr(fname, comment + html)

        # ── Bundle Video.js (cached) ───────────────────────────────
        try:
            cache_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'cache' / 'videojs'
            cache_dir.mkdir(parents=True, exist_ok=True)
            videojs_cdn = {
                'assets/video-js/video.min.js':     'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video.min.js',
                'assets/video-js/video-js.min.css': 'https://cdnjs.cloudflare.com/ajax/libs/video.js/8.6.1/video-js.min.css',
            }
            for arc_path, url in videojs_cdn.items():
                cached = cache_dir / arc_path.split('/')[-1]
                if not cached.exists():
                    urllib.request.urlretrieve(url, str(cached))
                zf.write(str(cached), arc_path)
        except Exception:
            # Network egress unavailable — omit player JS; publish still succeeds.
            pass

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
