"""
ForgeGUI Shell Builder
Generates the self-contained gui_shell.html SCO page.

Architecture:
  - Shell is the SCORM SCO page
  - Background image fills the stage
  - Content area div receives injected CourseForge content
  - Buttons handle NEXT/PREV/SUBMIT via JS
  - Text zones display dynamic data from CourseForge
  - postMessage API bridges shell <-> content
  - CSS namespaced under .fgui- to prevent collisions

Note: this is a STANDALONE published artifact — it does NOT load
forge-tokens.css, so brand amber is the concrete dark-mode value
#F59E0B (not var(--forge-amber)), matching the SCORM output convention.
"""

import json
import re
from html import escape


# Concrete brand amber for standalone output (dark forge amber).
AMBER = '#F59E0B'

_ID_SAFE = re.compile(r'[^A-Za-z0-9_-]')


def _safe_id(raw, fallback):
    """Sanitize an author-supplied id to a safe CSS/HTML identifier (it is
    interpolated into both `#id {}` selectors and id="" attributes). Prevents
    attribute breakout like  id="x" onmouseover="..."  and CSS rule injection."""
    cleaned = _ID_SAFE.sub('', str(raw or ''))
    return cleaned or fallback


def _css_val(raw, default=''):
    """Strip characters that could break out of a CSS value inside a <style>
    block ('</style>' escape, rule/selector injection)."""
    s = str(raw if raw is not None else default)
    return s.translate({ord(c): None for c in '<>{};'})


def build_shell_html(gui: dict, upload_folder: str) -> str:
    stage        = gui.get('stage', {})
    content_area = gui.get('content_area', {})
    buttons      = gui.get('buttons', [])
    zones        = gui.get('zones', [])

    stage_w = stage.get('width',  1024)
    stage_h = stage.get('height', 768)

    bg_file  = stage.get('background_file', '')
    bg_src   = f'assets/{bg_file}' if bg_file else ''
    ca_x     = content_area.get('x',      200)
    ca_y     = content_area.get('y',      80)
    ca_w     = content_area.get('width',  600)
    ca_h     = content_area.get('height', 500)
    ca_bg    = content_area.get('bg_color', 'transparent')
    ca_over  = content_area.get('overflow', 'hidden')

    # -- CSS for buttons --------------------------------------------
    btn_css = []
    for i, btn in enumerate(buttons):
        bid    = _safe_id(btn.get('id'), f'fgui-btn-{i}')
        bx     = btn.get('x', 0)
        by     = btn.get('y', 0)
        bw     = btn.get('width', 120)
        bh     = btn.get('height', 44)
        mode   = btn.get('asset_mode', 'individual')

        if mode == 'spritesheet':
            sf   = btn.get('sprite_file', '')
            sw   = btn.get('sprite_w', bw)
            sh   = btn.get('sprite_h', bh)
            states = btn.get('states', {})

            def sprite_css(state_key, default_col=0, default_row=0):
                s   = states.get(state_key, {})
                row = s.get('row', default_row)
                col = s.get('col', default_col)
                ox  = -(col * sw)
                oy  = -(row * sh)
                return (
                    f'background-image:url("assets/{sf}");'
                    f'background-position:{ox}px {oy}px;'
                    f'background-repeat:no-repeat;'
                    f'background-size:auto;'
                )

            btn_css.append(f"""
  #{bid} {{
    position:absolute;
    left:{bx}px; top:{by}px;
    width:{bw}px; height:{bh}px;
    border:none; padding:0; margin:0;
    cursor:pointer; outline:none;
    {sprite_css('normal')}
  }}
  #{bid}:hover    {{ {sprite_css('hover')} }}
  #{bid}:active   {{ {sprite_css('active')} }}
  #{bid}:disabled {{ {sprite_css('disabled')} cursor:not-allowed; }}
  #{bid}:focus-visible {{
    outline: 2px solid {AMBER};
    outline-offset: 2px;
  }}""")

        else:  # individual PNGs
            files = btn.get('files', {})

            def img_css(state_key):
                info = files.get(state_key, {})
                fname = info.get('filename', '')
                if not fname:
                    return ''
                return (
                    f'background-image:url("assets/{fname}");'
                    f'background-repeat:no-repeat;'
                    f'background-size:{bw}px {bh}px;'
                )

            btn_css.append(f"""
  #{bid} {{
    position:absolute;
    left:{bx}px; top:{by}px;
    width:{bw}px; height:{bh}px;
    border:none; padding:0; margin:0;
    cursor:pointer; outline:none;
    {img_css('normal')}
  }}
  #{bid}:hover    {{ {img_css('hover')} }}
  #{bid}:active   {{ {img_css('active')} }}
  #{bid}:disabled {{ {img_css('disabled')} cursor:not-allowed; }}
  #{bid}:focus-visible {{
    outline: 2px solid {AMBER};
    outline-offset: 2px;
  }}""")

    # -- CSS for zones ----------------------------------------------
    zone_css = []
    for i, zone in enumerate(zones):
        zid = _safe_id(zone.get('id'), f'fgui-zone-{i}')
        zone_css.append(f"""
  #{zid} {{
    position: absolute;
    left:   {int(zone.get('x',0) or 0)}px;
    top:    {int(zone.get('y',0) or 0)}px;
    width:  {int(zone.get('width',200) or 0)}px;
    height: {int(zone.get('height',30) or 0)}px;
    font-family: {_css_val(zone.get('font_family','IBM Plex Mono,monospace'))};
    font-size:   {_css_val(zone.get('font_size',13))}px;
    font-weight: {_css_val(zone.get('font_weight',400))};
    color:       {_css_val(zone.get('color','#C8D8E8'))};
    background:  {_css_val(zone.get('bg_color','transparent'))};
    text-align:  {_css_val(zone.get('align','left'))};
    padding:     {_css_val(zone.get('padding','4px 8px'))};
    overflow:    {_css_val(zone.get('overflow','hidden'))};
    white-space: pre-wrap;
    word-break:  break-word;
    box-sizing:  border-box;
    {'text-transform:' + _css_val(zone.get('text_transform','none')) + ';'
     if zone.get('text_transform') else ''}
    {'letter-spacing:' + _css_val(zone.get('letter_spacing','normal')) + ';'
     if zone.get('letter_spacing') else ''}
    {'border-radius:' + str(int(zone.get('border_radius',0) or 0)) + 'px;'
     if zone.get('border_radius') else ''}
  }}""")

    # -- Button HTML ------------------------------------------------
    btn_html = []
    for i, btn in enumerate(buttons):
        bid    = _safe_id(btn.get('id'), f'fgui-btn-{i}')
        action = escape(str(btn.get('action', 'NEXT')), quote=True)
        label  = escape(str(btn.get('label', btn.get('action', 'NEXT'))), quote=True)
        ti     = int(btn.get('tab_index', 0) or 0)
        btn_html.append(
            f'  <button id="{bid}" data-action="{action}" '
            f'tabindex="{ti}" aria-label="{label}">'
            f'</button>'
        )

    # -- Zone HTML --------------------------------------------------
    zone_html = []
    for i, zone in enumerate(zones):
        zid   = _safe_id(zone.get('id'), f'fgui-zone-{i}')
        ztype = escape(str(zone.get('type', 'prompt')), quote=True)
        zone_html.append(
            f'  <div id="{zid}" class="fgui-zone" data-zone-type="{ztype}" '
            f'role="status" aria-live="polite" aria-atomic="true"></div>'
        )

    # -- Button action JS (keys must match the sanitized HTML ids) --
    # .replace('</','<\\/') so an author value containing </script> can't close
    # the embedding <script> tag (json.dumps leaves '/' unescaped).
    btn_actions_js = json.dumps({
        _safe_id(btn.get('id'), f'fgui-btn-{i}'): btn.get('action', 'NEXT')
        for i, btn in enumerate(buttons)
    }).replace('</', '<\\/')

    # -- Zone config JS ---------------------------------------------
    zone_config_js = json.dumps({
        _safe_id(zone.get('id'), f'fgui-zone-{i}'): {
            'type':            zone.get('type'),
            'format':          zone.get('format', ''),
            'color_correct':   zone.get('color_correct', '#4CAF50'),
            'color_incorrect': zone.get('color_incorrect', '#E87070'),
            'color_normal':    zone.get('color_normal', zone.get('color', '#C8D8E8')),
        }
        for i, zone in enumerate(zones)
    }).replace('</', '<\\/')

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="ForgeGUI v1.0.0">
  <title>{escape(str(gui.get('name', 'ForgeGUI Shell')), quote=True)}</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}

    html, body {{
      width:  100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }}

    /* -- Stage -- */
    #fgui-stage {{
      position:   relative;
      width:      {stage_w}px;
      height:     {stage_h}px;
      overflow:   hidden;
      /* Scale to fit viewport */
      transform-origin: top left;
    }}

    /* -- Background -- */
    #fgui-bg {{
      position: absolute;
      inset:    0;
      width:    100%;
      height:   100%;
      {f'background-image: url("{bg_src}");' if bg_src else ''}
      background-size:   cover;
      background-position: center;
      background-repeat: no-repeat;
      z-index:  0;
    }}

    /* -- Content area -- */
    #fgui-content {{
      position:   absolute;
      left:       {ca_x}px;
      top:        {ca_y}px;
      width:      {ca_w}px;
      height:     {ca_h}px;
      background: {ca_bg};
      overflow:   {ca_over};
      z-index:    10;
    }}

    /* -- Button layer -- */
    #fgui-buttons {{
      position: absolute;
      inset:    0;
      z-index:  20;
      pointer-events: none;
    }}
    #fgui-buttons button {{
      pointer-events: all;
    }}

    /* -- Zone layer -- */
    #fgui-zones {{
      position: absolute;
      inset:    0;
      z-index:  15;
      pointer-events: none;
    }}

    /* -- Feedback overlay (top z) -- */
    #fgui-feedback-overlay {{
      display:  none;
      position: absolute;
      inset:    0;
      z-index:  50;
      pointer-events: none;
    }}

    {''.join(btn_css)}
    {''.join(zone_css)}

    /* 508 focus styles */
    :focus-visible {{
      outline: 2px solid {AMBER};
      outline-offset: 2px;
    }}

    /* Screen reader only */
    .sr-only {{
      position: absolute;
      width: 1px; height: 1px;
      padding: 0; margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap; border: 0;
    }}

    @media (prefers-reduced-motion: reduce) {{
      * {{ animation: none !important; transition: none !important; }}
    }}
  </style>
</head>
<body>

<div id="fgui-stage" role="main" aria-label="{escape(str(gui.get('name', 'Course shell')), quote=True)}">

  <!-- Background -->
  <div id="fgui-bg" aria-hidden="true"></div>

  <!-- Content area — CourseForge injects frame content here -->
  <div id="fgui-content"
    role="region"
    aria-label="Frame content"
    aria-live="polite">
  </div>

  <!-- Text zones -->
  <div id="fgui-zones" aria-hidden="false">
{chr(10).join(zone_html)}
  </div>

  <!-- Button layer -->
  <div id="fgui-buttons">
{chr(10).join(btn_html)}
  </div>

  <!-- Screen reader announcements -->
  <div class="sr-only" aria-live="assertive" id="fgui-sr-announce"></div>

</div>

<script>
// -- ForgeGUI Shell Runtime ------------------------------------
(function() {{

  var STAGE_W       = {stage_w};
  var STAGE_H       = {stage_h};
  var BTN_ACTIONS   = {btn_actions_js};
  var ZONE_CONFIG   = {zone_config_js};

  // Shell state
  var state = {{
    currentFrame: 1,
    totalFrames:  1,
    lessonTitle:  '',
    sectionTitle: '',
    frameTitle:   '',
    prompt:       '',
    feedback:     '',
    feedbackType: 'normal',  // 'normal' | 'correct' | 'incorrect'
    isFirstFrame: true,
    isLastFrame:  false,
  }};

  // -- Stage scaling --------------------------------------------
  function scaleStage() {{
    var stage   = document.getElementById('fgui-stage');
    var scaleX  = window.innerWidth  / STAGE_W;
    var scaleY  = window.innerHeight / STAGE_H;
    var scale   = Math.min(scaleX, scaleY);
    var offsetX = (window.innerWidth  - STAGE_W * scale) / 2;
    var offsetY = (window.innerHeight - STAGE_H * scale) / 2;
    stage.style.transform =
      'translate(' + offsetX + 'px,' + offsetY + 'px) scale(' + scale + ')';
  }}

  scaleStage();
  window.addEventListener('resize', scaleStage);

  // -- SCORM API ------------------------------------------------
  var API = null;

  function findSCORMAPI(win) {{
    var attempts = 0;
    while (win && attempts < 10) {{
      if (win.API)          {{ return win.API; }}
      if (win.API_1484_11)  {{ return win.API_1484_11; }}
      win = win.parent;
      attempts++;
    }}
    return null;
  }}

  function initSCORM() {{
    API = findSCORMAPI(window);
    if (API) {{
      try {{
        // SCORM 1.2
        if (API.LMSInitialize) API.LMSInitialize('');
        // SCORM 2004
        if (API.Initialize)   API.Initialize('');
      }} catch(e) {{}}
    }}
  }}

  function scormSetValue(key, val) {{
    if (!API) return;
    try {{
      if (API.LMSSetValue) API.LMSSetValue(key, val);
      if (API.SetValue)    API.SetValue(key, val);
    }} catch(e) {{}}
  }}

  function scormCommit() {{
    if (!API) return;
    try {{
      if (API.LMSCommit) API.LMSCommit('');
      if (API.Commit)    API.Commit('');
    }} catch(e) {{}}
  }}

  function scormFinish() {{
    if (!API) return;
    try {{
      if (API.LMSFinish)  API.LMSFinish('');
      if (API.Terminate)  API.Terminate('');
    }} catch(e) {{}}
  }}

  // -- Zone rendering -------------------------------------------
  function updateZones() {{
    Object.keys(ZONE_CONFIG).forEach(function(zoneId) {{
      var cfg = ZONE_CONFIG[zoneId];
      var el  = document.getElementById(zoneId);
      if (!el) return;

      switch(cfg.type) {{
        case 'prompt':
          el.textContent = state.prompt;
          break;

        case 'feedback':
          el.textContent = state.feedback;
          var color = cfg.color_normal;
          if (state.feedbackType === 'correct')
            color = cfg.color_correct;
          else if (state.feedbackType === 'incorrect')
            color = cfg.color_incorrect;
          el.style.color = color;
          break;

        case 'frame_counter':
          var fmt = cfg.format || '{{current}} / {{total}}';
          el.textContent = fmt
            .replace('{{current}}', state.currentFrame)
            .replace('{{total}}',   state.totalFrames);
          break;

        case 'lesson_title':
          el.textContent = state.lessonTitle;
          break;

        case 'section_title':
          el.textContent = state.sectionTitle;
          break;

        case 'frame_title':
          el.textContent = state.frameTitle;
          break;
      }}
    }});
  }}

  // -- Button state management ----------------------------------
  function updateButtons() {{
    Object.keys(BTN_ACTIONS).forEach(function(btnId) {{
      var action = BTN_ACTIONS[btnId];
      var btn    = document.getElementById(btnId);
      if (!btn) return;

      switch(action) {{
        case 'PREVIOUS':
          btn.disabled = state.isFirstFrame;
          break;
        case 'NEXT':
        case 'CONTINUE':
          btn.disabled = state.isLastFrame;
          break;
        default:
          btn.disabled = false;
      }}
    }});
  }}

  // -- Button click handler -------------------------------------
  document.getElementById('fgui-buttons')
    .addEventListener('click', function(e) {{
      var btn = e.target.closest('button[data-action]');
      if (!btn || btn.disabled) return;

      var action = btn.dataset.action;

      // Announce to screen reader
      var sr = document.getElementById('fgui-sr-announce');
      if (sr) sr.textContent = action.charAt(0) + action.slice(1).toLowerCase();

      // Notify CourseForge content
      window.fgui.onAction(action);
    }});

  // -- postMessage bridge ---------------------------------------
  window.addEventListener('message', function(e) {{
    var msg = e.data;
    if (!msg || !msg.type) return;

    switch(msg.type) {{

      // CourseForge sends frame metadata
      case 'fgui_frame_data':
        state.currentFrame = msg.frameIndex  || 1;
        state.totalFrames  = msg.totalFrames || 1;
        state.lessonTitle  = msg.lessonTitle  || '';
        state.sectionTitle = msg.sectionTitle || '';
        state.frameTitle   = msg.frameTitle   || '';
        state.prompt       = msg.prompt       || '';
        state.feedback     = '';
        state.feedbackType = 'normal';
        state.isFirstFrame = msg.isFirst || false;
        state.isLastFrame  = msg.isLast  || false;
        updateZones();
        updateButtons();
        break;

      // CourseForge sends quiz result
      case 'fgui_quiz_result':
        state.feedback     = msg.feedback     || '';
        state.feedbackType = msg.correct ? 'correct' : 'incorrect';
        updateZones();
        if (msg.correct) {{
          scormSetValue('cmi.core.score.raw', '100');
          scormCommit();
        }}
        break;

      // CourseForge signals completion
      case 'fgui_complete':
        scormSetValue('cmi.core.lesson_status', 'completed');
        scormSetValue('cmi.core.score.raw', String(msg.score || 100));
        scormCommit();
        break;

      // CourseForge sends custom feedback text
      case 'fgui_feedback':
        state.feedback     = msg.text || '';
        state.feedbackType = msg.feedbackType || 'normal';
        updateZones();
        break;
    }}
  }});

  // -- Public API — CourseForge calls these ---------------------
  window.fgui = {{

    // Called when a button is clicked — override in CourseForge integration
    onAction: function(action) {{
      // Default: postMessage to parent or CourseForge iframe
      window.parent.postMessage({{ type: 'fgui_action', action: action }}, '*');
    }},

    // Update state directly (for non-postMessage integration)
    setFrameData: function(data) {{
      Object.assign(state, data);
      updateZones();
      updateButtons();
    }},

    setFeedback: function(text, type) {{
      state.feedback     = text;
      state.feedbackType = type || 'normal';
      updateZones();
    }},

    clearFeedback: function() {{
      state.feedback     = '';
      state.feedbackType = 'normal';
      updateZones();
    }},

    // Inject content HTML directly into content area
    injectContent: function(html) {{
      var ca = document.getElementById('fgui-content');
      if (ca) ca.innerHTML = html;
    }},
  }};

  // -- Init -----------------------------------------------------
  initSCORM();
  updateZones();
  updateButtons();

  console.log('[ForgeGUI] Shell initialized — stage ' +
    STAGE_W + 'x' + STAGE_H);

}})();
</script>

</body>
</html>"""

    return html
