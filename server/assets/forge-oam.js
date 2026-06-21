/*!
 * forge-oam.js — CourseForge OAM runtime bridge (v1)
 *
 * Injected into every imported OAM so the CourseForge media bar can drive a
 * stock Adobe Animate (CreateJS) export, which does NOT speak our protocol on
 * its own. Runs INSIDE the OAM iframe. Bridges:
 *   parent -> iframe : oam:getState | oam:play | oam:pause | oam:seek{t} | oam:nextStop
 *   iframe -> parent : oam:state{t,duration,stops,playing}
 *                      forge:command{n,parity,frame}   (n%2: odd=stop, even=start)
 *                      forge:end{frame}                 (reached the final frame)
 *                      forge:hello                      (handshake)
 *
 * Authoring API (in the Animate file's frame scripts):
 *   this.forgeStop()          replaces this.stop() — halts + self-registers a stop
 *   this.forgeEnd()           marks the terminal frame explicitly (optional)
 *   window.forgeStops = [..]  declare stop FRAMES up-front (markers before playback)
 *
 * Stops are reported to the bar in seconds (frame / fps). Command numbers are
 * DERIVED from the stop index (stop i -> 2i+1, resume-from-i -> 2i+2) so they
 * survive scrubbing.
 */
(function () {
  'use strict';
  if (window.__forgeOAM) return;
  var forge = (window.__forgeOAM = { version: 1 });

  var root = null;         // root MovieClip (the main timeline)
  var stage = null;        // CreateJS stage
  var discovered = [];     // stop frames discovered via forgeStop()
  var lastCmdKey = null;   // dedupe consecutive identical (command, frame)
  var hotspots = [];       // live hotspot overlay elements
  var hsMem = {};          // stopFrame -> [{clip,opts}], so replay/step can restore hotspots
  var endedPosted = false; // forge:end emitted once per arrival at the final frame
  var lastPlaying = false;  // last reported play state (to detect stop transitions)
  var pausedByUser = false; // distinguish a bar pause/seek from a native content stop
  var hostDetected = false; // a CourseForge host answered the handshake (oam:getState/forge:config)

  // Hotspot style tokens — defaults, overridden by FORGE_CONFIG.hotspot (baked
  // at publish) or a forge:config message (preview live-update).
  // strokeColor is the SINGLE SOURCE. Every other color (resting border, hover,
  // fill, glow, pulse, focus) DERIVES from it unless explicitly set in
  // FORGE_CONFIG.hotspot or per-instance opts. So "set strokeColor" is all you need.
  var HS = {
    strokeColor: '#F59E0B', strokeWidth: 3,
    radius: 6, shape: 'rounded', cursor: 'pointer',
    hitPadding: 0, pulse: true, hideClip: true,
    // null => derive from strokeColor (see hsStyle); set any one to override it.
    outColor: null, overColor: null, fill: null, shadow: null,
    pulseColor: null, focusOutline: null
  };
  var HS_KEYS = ['strokeColor', 'strokeWidth', 'fill', 'radius', 'shape', 'shadow', 'overColor',
                'outColor', 'cursor', 'hitPadding', 'pulse', 'pulseColor', 'focusOutline', 'hideClip'];
  // #rgb / #rrggbb / rgb()/rgba() -> {r,g,b}; null if unparseable (e.g. named colors).
  function parseRGB(c) {
    if (!c) return null; c = ('' + c).trim();
    if (c.charAt(0) === '#') {
      var h = c.slice(1);
      if (h.length === 3) h = h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2);
      if (h.length < 6) return null;
      return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
    }
    var m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) { var p = m[1].split(','); return { r:+p[0]||0, g:+p[1]||0, b:+p[2]||0 }; }
    return null;
  }
  function rgbaOf(o, a) { return 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + a + ')'; }
  function lightenOf(o, amt) {
    return 'rgb(' + Math.round(o.r+(255-o.r)*amt) + ',' + Math.round(o.g+(255-o.g)*amt) + ',' + Math.round(o.b+(255-o.b)*amt) + ')';
  }
  // Resolve the effective style for one hotspot: per-instance opts override the
  // global HS defaults; any color left null derives from strokeColor.
  function hsStyle(opts) {
    var hs = {};
    for (var i = 0; i < HS_KEYS.length; i++) { var k = HS_KEYS[i]; hs[k] = (opts && opts[k] != null) ? opts[k] : HS[k]; }
    var base = parseRGB(hs.strokeColor) || { r:245, g:158, b:11 };                 // strokeColor as RGB (amber fallback)
    if (hs.outColor     == null) hs.outColor     = hs.strokeColor;                 // resting border = strokeColor
    if (hs.overColor    == null) hs.overColor    = lightenOf(base, 0.30);          // hover = brighter strokeColor
    if (hs.fill         == null) hs.fill         = rgbaOf(base, 0.12);             // background tint
    if (hs.shadow       == null) hs.shadow       = '0 0 0 3px ' + rgbaOf(base, 0.25); // resting glow + pulse base
    if (hs.pulseColor   == null) hs.pulseColor   = rgbaOf(base, 0.40);             // pulse peak ring (independent of fill)
    if (hs.focusOutline == null) hs.focusOutline = hs.strokeColor;                 // focus ring
    hs.radiusCss = hs.shape === 'circle' ? '50%' : hs.shape === 'square' ? '0'
                 : ((parseFloat(hs.radius) || 0) + 'px');   // 'rounded'/default -> radius px
    return hs;
  }
  function applyConfig(cfg) {
    if (!cfg || !cfg.hotspot) return;
    for (var i = 0; i < HS_KEYS.length; i++) {           // whitelist only (no for..in pollution)
      var k = HS_KEYS[i];
      if (cfg.hotspot[k] != null) HS[k] = cfg.hotspot[k];
    }
  }
  // The author's frame-0 FORGE_CONFIG.hotspot is applied ONCE, and never over a
  // CourseForge forge:config (the project-level override always wins).
  function ensureCfg() {
    if (forge._cfgDone || forge._cfDone) return;
    if (window.FORGE_CONFIG) { applyConfig(window.FORGE_CONFIG); forge._cfgDone = true; }
  }
  ensureCfg();

  // Up-front list of stop FRAMES — from the frame-0 config object
  // (FORGE_CONFIG.stops or .frameTracker) or the legacy window.forgeStops.
  function declared() {
    var cfg = window.FORGE_CONFIG || {};
    var arr = cfg.stops || cfg.frameTracker || window.forgeStops;
    return Array.isArray(arr) ? arr.slice() : null;
  }
  function stopFrames() {
    var d = declared();
    var src = (d && d.length) ? d : discovered;
    return src.slice().filter(function (n) { return typeof n === 'number'; })
              .sort(function (a, b) { return a - b; });
  }
  function fps() {
    try {
      if (window.lib && lib.properties && lib.properties.fps > 0) return lib.properties.fps;
      var T = window.createjs && createjs.Ticker;
      if (T) {
        if (typeof T.framerate === 'number' && T.framerate > 0) return T.framerate;
        if (T.getFPS) { var f = T.getFPS(); if (f > 0) return f; }
      }
    } catch (e) {}
    return 24;
  }
  function totalFrames() {
    if (!root) return 0;
    if (root.totalFrames) return root.totalFrames;
    if (root.timeline && root.timeline.duration) return root.timeline.duration;
    return 0;
  }
  function curFrame() { return (root && root.currentFrame) || 0; }
  function duration() { var f = fps(); return f > 0 ? totalFrames() / f : 0; }
  function playing() { try { return !!root && root.paused === false; } catch (e) { return false; } }
  function stopSeconds() { var f = fps(); return stopFrames().map(function (fr) { return fr / f; }); }

  function stopIndexAtFrame(fr) {
    // Closest stop within a 1-frame tolerance (gotoAndStop rounding) — return
    // the NEAREST, so two adjacent stops resolve to distinct indices.
    var s = stopFrames(), best = -1, bestD = 2;
    for (var i = 0; i < s.length; i++) {
      var d = Math.abs(s[i] - fr);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function post(msg) { try { parent.postMessage(msg, '*'); } catch (e) {} }

  // ForgeEventSystem — when running OUTSIDE CourseForge (standalone, e.g. an
  // Animate preview), log the event stream to the console so the author can
  // verify it. Events are numbered from the first stop: stop=1, its start=2,
  // next stop=3, … (the same `n` the engine receives). Silent inside CourseForge.
  var STANDALONE = true;
  try { STANDALONE = (window.parent === window); } catch (e) { STANDALONE = true; }
  function logEvent(text) {
    if (!STANDALONE) return;
    try { console.log('%c[ForgeEventSystem] ' + text, 'color:#F59E0B;font-weight:600'); } catch (e) {}
  }
  function postState() {
    resolveRoot();   // resolve up-front so duration is known before the first play
    post({ type: 'oam:state', t: curFrame() / fps(), duration: duration(),
           stops: stopSeconds(), playing: playing(), fps: fps() });
  }
  function postCommand(n, frame, index) {
    var key = n + '@' + frame;
    if (key === lastCmdKey) return;  // dedupe a re-fired frame action at the same frame
    lastCmdKey = key;
    // index = resolved stop index (-1 if the stop isn't a known stop) so the
    // consumer maps prompts by index directly instead of decoding it from n
    // (an unresolved stop must NOT fall back to prompt 0).
    var parity = (n % 2 === 1 ? 'stop' : 'start');
    post({ type: 'forge:command', n: n, parity: parity,
           frame: frame, index: (index == null ? -1 : index) });
    logEvent('event ' + n + ' — ' + parity.toUpperCase() + ' @frame ' + frame +
             (index >= 0 ? ' · prompt#' + index : ''));
  }

  function resolveRoot() {
    if (root) return root;
    // Adobe Animate ("AdobeAn") exports use global `stage`/`exportRoot` and create
    // the stage via lib.Stage (not createjs.Stage), so the constructor wrap/hook
    // misses it — read the globals directly.
    try { if (!stage && window.stage) stage = window.stage; } catch (e) {}
    try {
      var er = window.exportRoot;
      if (er && ((er.totalFrames) || (er.timeline && er.timeline.duration))) { root = er; return root; }
    } catch (e) {}
    try {
      if (stage && stage.numChildren) {
        // The main timeline is the child with the most frames (overlays/bg have 0).
        var best = null, bestF = -1;
        for (var i = 0; i < stage.numChildren; i++) {
          var c = stage.getChildAt(i), tf = (c && c.totalFrames) || 0;
          if (tf > bestF) { bestF = tf; best = c; }
        }
        root = best || (stage.getChildAt ? stage.getChildAt(0) : null);
      }
    } catch (e) {}
    return root;
  }

  // ---- capture the CreateJS stage -----------------------------------------
  // Two ways, for robustness across Animate output variants:
  //  (a) wrap the Stage constructor (earliest capture), and
  //  (b) hook Stage.prototype.update so the REAL instance records itself on its
  //      first tick — survives the lib aliasing `var S = createjs.Stage` before
  //      forge loaded.
  function wrapStage(name) {
    if (!window.createjs || !createjs[name] || createjs[name].__forgeWrapped) return;
    var Orig = createjs[name];
    function Wrapped() { Orig.apply(this, arguments); try { if (!stage) stage = this; } catch (e) {} return this; }
    Wrapped.prototype = Orig.prototype;
    Wrapped.__forgeWrapped = true;
    createjs[name] = Wrapped;
  }
  function hookStageUpdate(name) {
    var S = window.createjs && createjs[name];
    if (!S || !S.prototype || S.prototype.__forgeUpd) return;
    var up = S.prototype.update;
    S.prototype.update = function () { if (!stage) { try { stage = this; } catch (e) {} } return up.apply(this, arguments); };
    S.prototype.__forgeUpd = true;
  }

  // ---- MovieClip authoring API --------------------------------------------
  function installProto() {
    var MC = window.createjs && createjs.MovieClip;
    if (!MC || MC.prototype.forgeStop) return;

    MC.prototype.forgeStop = function () {
      this.stop();
      ensureCfg();                                  // apply frame-0 FORGE_CONFIG before stops/hotspots
      if (!root) root = this;                       // first forgeStop = root timeline
      clearHotspots();                              // a new stop clears the prior stop's hotspots
      var fr = this.currentFrame || 0;
      if (discovered.indexOf(fr) === -1) discovered.push(fr);
      var idx = stopIndexAtFrame(fr);
      postState();
      postCommand(idx >= 0 ? 2 * idx + 1 : 1, fr, idx);  // odd = stop
      // Completion inferred from the frame tracker: reaching the LAST declared
      // stop means the guided content is done -> forge:end (releases the NEXT
      // gate / drives completion), as well as the natural final-frame end.
      var stops = stopFrames();
      var atLastStop = stops.length && idx >= 0 && idx === stops.length - 1;
      if ((atLastStop || fr >= totalFrames() - 1) && !endedPosted) {
        endedPosted = true; post({ type: 'forge:end', frame: fr });
        logEvent('content complete (forge:end) @frame ' + fr);
      }
    };
    MC.prototype.forgeEnd = function () {
      this.stop();
      if (!root) root = this;
      postState();
      if (!endedPosted) { endedPosted = true; post({ type: 'forge:end', frame: this.currentFrame || 0 });
        logEvent('content complete (forge:end) @frame ' + (this.currentFrame || 0)); }
    };
    // Report completion / score to the LMS (through the parent SCO page, since
    // the OAM iframe is sandboxed and can't reach window.API directly).
    MC.prototype.forgeComplete = function (score) {
      post({ type: 'forge:complete', score: (score == null ? null : score) });
      logEvent('LMS completion' + (score != null ? ' · score ' + score : ''));
    };
    MC.prototype.forgeScore = function (score) {
      if (score == null) return;                  // never report an empty score
      post({ type: 'forge:score', score: score });
      logEvent('LMS score ' + score);
    };
    // forgeHotspot is fleshed out in task 4; reserve it so frame scripts don't throw.
    if (!MC.prototype.forgeHotspot) {
      MC.prototype.forgeHotspot = function (opts) { drawHotspot(this, opts || {}); };
    }
  }

  // ---- hotspots: project a MovieClip's bounds to a DOM overlay --------------
  function clearHotspots() {
    for (var i = 0; i < hotspots.length; i++) {
      var el = hotspots[i].el;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    hotspots = [];
  }

  // Compute the clip's on-screen (viewport) rect. position:fixed coords, so it's
  // immune to body margin/scroll. Re-runnable on resize for responsive canvases.
  function hotspotRect(clip, hs) {
    var canvas = stage && stage.canvas;
    if (!canvas || !clip || !clip.localToGlobal) return null;
    var b = clip.nominalBounds || (clip.getBounds && clip.getBounds());
    if (!b) { b = { x: 0, y: 0, width: 80, height: 60 }; try { console.warn('[ForgeJS] hotspot clip has no bounds — using a default box; set bounds in Animate.'); } catch (e) {} }
    // Project all four corners so rotation/scale give a correct axis-aligned box.
    var pts = [clip.localToGlobal(b.x, b.y), clip.localToGlobal(b.x + b.width, b.y),
               clip.localToGlobal(b.x, b.y + b.height), clip.localToGlobal(b.x + b.width, b.y + b.height)];
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var gx = Math.min.apply(null, xs), gy = Math.min.apply(null, ys);
    var gw = Math.max.apply(null, xs) - gx, gh = Math.max.apply(null, ys) - gy;
    var rect = canvas.getBoundingClientRect();              // canvas-internal px -> CSS px
    var sx = rect.width / (canvas.width || rect.width), sy = rect.height / (canvas.height || rect.height);
    var pad = (hs && parseFloat(hs.hitPadding)) || 0;
    return { left: rect.left + gx * sx - pad, top: rect.top + gy * sy - pad,
             width: gw * sx + pad * 2, height: gh * sy + pad * 2 };
  }
  function positionHotspot(desc) {
    var r = hotspotRect(desc.clip, desc.hs); if (!r) return;
    var s = desc.el.style;
    s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px';
  }

  function drawHotspot(clip, opts) {
    ensureCfg();                       // honor a frame-0 FORGE_CONFIG.hotspot if not yet applied
    opts = opts || {};
    resolveRoot();
    var hs = hsStyle(opts);            // per-instance opts over global defaults
    var r = hotspotRect(clip, hs); if (!r) return;   // read transformed bounds first
    // The MovieClip is just an invisible proxy for the box/transform — hide its
    // artwork so only the drawn shape shows (localToGlobal still works hidden,
    // so resize-reposition is fine). Opt out with hideClip:false.
    if (hs.hideClip !== false) { try { clip.visible = false; } catch (e) {} }
    var el = document.createElement('div');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    // Student-led "read the prompt, select to continue": no label needed (the
    // shell's prompt zone carries the instruction). id/label are optional and
    // mainly used by 3D-model annotations, not these click-to-continue hotspots.
    el.setAttribute('aria-label', opts.label ? (opts.label + ' — select to continue') : 'Select to continue');
    if (opts.label) el.title = opts.label;
    el.style.cssText = [
      'position:fixed',                                    // viewport coords (no body-margin/scroll offset)
      'left:' + r.left + 'px', 'top:' + r.top + 'px',
      'width:' + r.width + 'px', 'height:' + r.height + 'px',
      'border:' + hs.strokeWidth + 'px solid ' + hs.outColor,
      'border-radius:' + hs.radiusCss,
      'background:' + hs.fill,
      'box-shadow:var(--hs-shadow)',
      'cursor:' + hs.cursor,
      'box-sizing:border-box',
      'z-index:2147483000',
      hs.pulse ? 'animation:forgeHsPulse 1.2s ease-in-out infinite' : ''
    ].join(';');
    // Per-instance vars so the shared keyframe / focus rule pulse in this hotspot's colors.
    el.style.setProperty('--hs-shadow', hs.shadow);
    el.style.setProperty('--hs-pulse-mid', hs.pulseColor);
    el.style.setProperty('--hs-focus', hs.focusOutline);
    el.addEventListener('mouseenter', function () { el.style.borderColor = hs.overColor; });
    el.addEventListener('mouseleave', function () { el.style.borderColor = hs.outColor; });
    var fired = false;
    function activate(ev) {
      if (ev) ev.preventDefault();
      if (fired) return; fired = true;                     // guard double-activation
      var i = stopIndexAtFrame(curFrame());                // the stop this button resumes from
      post({ type: 'forge:hotspot', hotspot: { id: opts.id, label: opts.label, description: opts.description } });
      logEvent('hotspot selected' + (opts.label ? ' — ' + opts.label : '') + ' (resumes stop#' + (i >= 0 ? i : '?') + ')');
      clearHotspots();
      var rr = resolveRoot();
      if (rr) {
        lastCmdKey = null; rr.play(); try { createjs.Ticker.paused = false; } catch (e) {}
        postCommand(i >= 0 ? 2 * i + 2 : 0, curFrame(), i);   // even = start (a button press resumes)
      }
      postState();
    }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') activate(e); });
    document.body.appendChild(el);
    hotspots.push({ el: el, clip: clip, opts: opts, hs: hs });
    // Remember this hotspot for its stop frame: the proxy clip's own frame script
    // does NOT re-fire when the parent timeline replays, so on a rewind/step we
    // restore it from here (see the pump) rather than relying on the clip.
    var sf = curFrame(), mem = hsMem[sf] || (hsMem[sf] = []), known = false;
    for (var mi = 0; mi < mem.length; mi++) { if (mem[mi].clip === clip) { mem[mi].opts = opts; known = true; break; } }
    if (!known) mem.push({ clip: clip, opts: opts });
    if (!document.getElementById('forge-hs-style')) {        // generic, var-driven — built once
      var st = document.createElement('style'); st.id = 'forge-hs-style';
      st.textContent = '@keyframes forgeHsPulse{0%,100%{box-shadow:var(--hs-shadow)}50%{box-shadow:0 0 0 6px var(--hs-pulse-mid)}}' +
        '[role=button]:focus-visible{outline:2px solid var(--hs-focus,' + (HS.focusOutline || HS.strokeColor) + ');outline-offset:2px}';
      document.head.appendChild(st);
    }
  }

  // ---- standalone test panel ------------------------------------------------
  // When no CourseForge host answers the handshake (the artist is testing the
  // published OAM directly, or it's embedded outside CourseForge), inject a
  // self-contained media bar. It drives the SAME oam:* protocol via postMessage
  // and listens to the runtime's own oam:state / forge:command broadcasts, so it
  // exercises the real event pipeline (not a separate code path) and shows, in
  // plain language, exactly which event the playhead is on.
  // Pin the standalone panel to the Animate stage canvas: match the canvas left edge
  // and width, with the bar's top touching the canvas bottom. Falls back to a
  // full-width bar at the viewport bottom if no canvas is found.
  function panelCanvas() {
    try { resolveRoot(); if (stage && stage.canvas) return stage.canvas; } catch (e) {}
    return document.querySelector('canvas');
  }
  function positionPanel() {
    var p = forge._panel; if (!p) return;
    var cv = panelCanvas(), s = p.style;
    var r = (cv && cv.getBoundingClientRect) ? cv.getBoundingClientRect() : null;
    if (r && r.width > 0 && r.height > 0) {
      s.left = Math.round(r.left) + 'px'; s.right = 'auto';
      s.width = Math.round(r.width) + 'px';
      s.top = Math.round(r.bottom) + 'px'; s.bottom = 'auto';
    } else {
      s.left = '0'; s.right = '0'; s.width = 'auto'; s.top = 'auto'; s.bottom = '0';
    }
  }

  // Iconoir glyphs (filled), recolored to currentColor so they inherit the panel text color.
  function ic(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var IC_REWIND = ic('<path fill="currentColor" d="M21.0441 5.70436C21.4402 5.41246 22 5.69531 22 6.1874V17.8126C22 18.3047 21.4402 18.5875 21.0441 18.2956L13.1555 12.483C12.8301 12.2432 12.8301 11.7568 13.1555 11.517L21.0441 5.70436Z"/><path fill="currentColor" d="M10.0441 5.70436C10.4402 5.41246 11 5.69531 11 6.1874V17.8126C11 18.3047 10.4402 18.5875 10.0441 18.2956L2.15555 12.483C1.8301 12.2432 1.8301 11.7568 2.15555 11.517L10.0441 5.70436Z"/>');
  var IC_PREV = ic('<path d="M6 7V17"/><path fill="currentColor" d="M17.0282 5.2672C17.4217 4.95657 18 5.23682 18 5.73813V18.2619C18 18.7632 17.4217 19.0434 17.0282 18.7328L9.09651 12.4709C8.79223 12.2307 8.79223 11.7693 9.09651 11.5291L17.0282 5.2672Z"/>');
  var IC_PLAY = ic('<path fill="currentColor" d="M6.90588 4.53682C6.50592 4.2998 6 4.58808 6 5.05299V18.947C6 19.4119 6.50592 19.7002 6.90588 19.4632L18.629 12.5162C19.0211 12.2838 19.0211 11.7162 18.629 11.4838L6.90588 4.53682Z"/>');
  var IC_PAUSE = ic('<path fill="currentColor" d="M6 18.4V5.6C6 5.26863 6.26863 5 6.6 5H9.4C9.73137 5 10 5.26863 10 5.6V18.4C10 18.7314 9.73137 19 9.4 19H6.6C6.26863 19 6 18.7314 6 18.4Z"/><path fill="currentColor" d="M14 18.4V5.6C14 5.26863 14.2686 5 14.6 5H17.4C17.7314 5 18 5.26863 18 5.6V18.4C18 18.7314 17.7314 19 17.4 19H14.6C14.2686 19 14 18.7314 14 18.4Z"/>');
  var IC_NEXT = ic('<path d="M18 7V17"/><path fill="currentColor" d="M6.97179 5.2672C6.57832 4.95657 6 5.23682 6 5.73813V18.2619C6 18.7632 6.57832 19.0434 6.97179 18.7328L14.9035 12.4709C15.2078 12.2307 15.2078 11.7693 14.9035 11.5291L6.97179 5.2672Z"/>');
  // Theme glyphs: sun / crescent moon / split-disc (contrast).
  var IC_DAY = ic('<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>');
  var IC_NIGHT = ic('<path fill="currentColor" stroke="none" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/>');
  var IC_HC = ic('<circle cx="12" cy="12" r="9"/><path fill="currentColor" stroke="none" d="M12 3a9 9 0 0 1 0 18V3Z"/>');

  function buildStandalonePanel() {
    if (forge._panel || hostDetected || !document.body) return;
    function send(type, extra) { var m = { type: type, __forgeSelf: true }; if (extra) { for (var k in extra) m[k] = extra[k]; } try { window.postMessage(m, '*'); } catch (e) {} }

    var css = document.createElement('style'); css.id = 'forge-panel-style';
    css.textContent =
      '#forge-spanel{position:fixed;left:0;bottom:0;z-index:2147483646;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;gap:8px;padding:10px 16px;' +
      '--bg:#15131f;--fg:#e9e7f2;--muted:#b9b4cc;--event:#fff;--btn-bg:rgba(255,255,255,.06);--btn-bd:rgba(255,255,255,.18);--btn-hover:rgba(255,255,255,.14);' +
      '--bd:rgba(255,255,255,.12);--accent:#5B4FC9;--track:#f6f6f6;--amber:#F59E0B;--thumb:var(--amber);--marker:#ffffff;--marker-edge:rgba(21,19,31,.7);--focus:#9E92FF;--press-fg:#fff;' +
      'background:var(--bg);color:var(--fg);font:600 12px/1.3 ui-sans-serif,system-ui,-apple-system,sans-serif;' +
      // Bar hangs beneath the stage: square top (meets the stage), rounded bottom corners, downward shadow.
      'border:1px solid var(--bd);border-radius:0 0 10px 10px;box-shadow:0 6px 18px rgba(0,0,0,.35);-webkit-font-smoothing:antialiased}' +
      // Day: light surface, darker-violet accent + tinted track so the fill and markers still read.
      '#forge-spanel[data-theme=day]{--bg:#fff;--fg:#1b1830;--muted:#5a5670;--event:#1b1830;--btn-bg:rgba(0,0,0,.05);--btn-bd:rgba(0,0,0,.18);--btn-hover:rgba(0,0,0,.1);--bd:rgba(0,0,0,.14);--accent:#5B4FC9;--track:#e4e0f3;--amber:#B45309;--thumb:var(--amber);--marker:#1b1830;--marker-edge:rgba(255,255,255,.85);--focus:#5B4FC9;--press-fg:#fff;box-shadow:0 6px 18px rgba(0,0,0,.18)}' +
      // High contrast: black/white, yellow accent, black markers ringed in white (pop on white track and yellow fill).
      '#forge-spanel[data-theme=hc]{--bg:#000;--fg:#fff;--muted:#fff;--event:#fff;--btn-bg:#000;--btn-bd:#fff;--btn-hover:#fff;--bd:#fff;--accent:#ffd400;--track:#fff;--amber:#F59E0B;--thumb:#1E5BFF;--marker:#000;--marker-edge:#fff;--focus:#ffd400;--press-fg:#000}' +
      '#forge-spanel .sp-top{display:flex;align-items:center;gap:14px}' +
      '#forge-spanel .sp-bottom{display:flex;align-items:center;height:32px}' +
      // Top row scaled up ~2x for low-vision legibility.
      '#forge-spanel button{flex:0 0 auto;width:56px;height:56px;border:0;background:transparent;' +
      'color:var(--fg);border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}' +
      '#forge-spanel button:hover{color:var(--amber)}' +
      '#forge-spanel button:disabled{opacity:.32;cursor:default;pointer-events:none}' +
      '#forge-spanel button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}' +
      '#forge-spanel button svg{display:block;width:34px;height:34px;pointer-events:none}' +
      '#forge-spanel .sp-event{flex:1 1 0;min-width:0;margin-left:6px;font-size:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--event)}' +
      '#forge-spanel .sp-time{flex:0 0 auto;font-size:28px;font-variant-numeric:tabular-nums;color:var(--muted);white-space:nowrap}' +
      '#forge-spanel .sp-theme{flex:0 0 auto;display:flex;gap:6px;margin-left:6px}' +
      '#forge-spanel .sp-theme button{width:48px;height:48px;border-radius:11px}' +
      '#forge-spanel .sp-theme button svg{width:28px;height:28px}' +
      '#forge-spanel .sp-theme button[aria-pressed=true]{color:var(--amber)}' +
      // Three stacked layers so the amber thumb rides ON TOP of the markers: track (0) < ticks (1) < input/thumb (2).
      '#forge-spanel .sp-scrub{position:relative;flex:1 1 auto;width:100%;height:32px;display:flex;align-items:center}' +
      '#forge-spanel .sp-track{position:absolute;left:12px;right:12px;top:50%;height:8px;margin-top:-4px;border-radius:5px;z-index:0;pointer-events:none;' +
      'background:linear-gradient(to right,var(--accent) 0,var(--accent) var(--sp-fill,0%),var(--track) var(--sp-fill,0%),var(--track) 100%)}' +
      '#forge-spanel .sp-ticks{position:absolute;left:0;right:0;top:50%;height:0;pointer-events:none;z-index:1}' +
      '#forge-spanel .sp-ticks i{position:absolute;width:4px;height:32px;margin-top:-16px;background:var(--marker);opacity:1;border-radius:1px;transform:translateX(-2px);box-shadow:0 0 0 1px var(--marker-edge)}' +
      '#forge-spanel .sp-scrub input{-webkit-appearance:none;appearance:none;width:100%;height:32px;margin:0;cursor:pointer;position:relative;z-index:2;background:transparent}' +
      '#forge-spanel .sp-scrub input::-webkit-slider-runnable-track{height:8px;background:transparent;border-radius:5px}' +
      '#forge-spanel .sp-scrub input::-moz-range-track{height:8px;background:transparent;border-radius:5px}' +
      '#forge-spanel .sp-scrub input::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;margin-top:-8px;border-radius:50%;background:var(--thumb);border:2px solid var(--bg);box-shadow:0 1px 4px rgba(0,0,0,.55);cursor:pointer}' +
      '#forge-spanel .sp-scrub input::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:var(--thumb);border:2px solid var(--bg);box-shadow:0 1px 4px rgba(0,0,0,.55);cursor:pointer}' +
      '#forge-spanel .sp-scrub input:focus-visible::-webkit-slider-thumb{outline:2px solid var(--focus);outline-offset:2px}' +
      '#forge-spanel .sp-scrub input:focus-visible::-moz-range-thumb{outline:2px solid var(--focus);outline-offset:2px}';
    document.head.appendChild(css);

    var bar = document.createElement('div');
    bar.id = 'forge-spanel';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'ForgeJS standalone test controls');
    bar.innerHTML =
      '<div class="sp-top">' +
        '<button data-a="rewind" title="Rewind to start (stays paused)" aria-label="Rewind to start">' + IC_REWIND + '</button>' +
        '<button data-a="prev" title="Previous event" aria-label="Previous event">' + IC_PREV + '</button>' +
        '<button data-a="play" title="Play / Pause" aria-label="Play or pause">' + IC_PLAY + '</button>' +
        '<button data-a="next" title="Next event" aria-label="Next event">' + IC_NEXT + '</button>' +
        '<span class="sp-event" aria-live="polite">ready</span>' +
        '<span class="sp-time">0:00 / 0:00</span>' +
        '<span class="sp-theme" role="group" aria-label="Display theme">' +
          '<button data-theme="day" title="Day (light)" aria-label="Day theme" aria-pressed="false">' + IC_DAY + '</button>' +
          '<button data-theme="night" title="Night (dark)" aria-label="Night theme" aria-pressed="false">' + IC_NIGHT + '</button>' +
          '<button data-theme="hc" title="High contrast" aria-label="High-contrast theme" aria-pressed="false">' + IC_HC + '</button>' +
        '</span>' +
      '</div>' +
      '<div class="sp-bottom">' +
        '<span class="sp-scrub"><span class="sp-track"></span><input type="range" min="0" max="1000" value="0" aria-label="Seek" aria-valuetext="0:00 of 0:00"><span class="sp-ticks"></span></span>' +
      '</div>';
    document.body.appendChild(bar);
    forge._panel = bar;

    var rng = bar.querySelector('input'), elTime = bar.querySelector('.sp-time'),
        elEvt = bar.querySelector('.sp-event'), elPlay = bar.querySelector('[data-a=play]'),
        elTicks = bar.querySelector('.sp-ticks'), elScrub = bar.querySelector('.sp-scrub'),
        elPrev = bar.querySelector('[data-a=prev]'), elNext = bar.querySelector('[data-a=next]'), elRewind = bar.querySelector('[data-a=rewind]');
    var dur = 0, playingNow = false, dragging = false, fpsv = 24, nStops = 0, tot = 0;
    function fmt(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }
    function paintFill() { elScrub.style.setProperty('--sp-fill', (rng.value / 10) + '%'); }   // visited = accent, rest = track
    // Frame 0 is the OAM's setup-only frame: the timeline spans frames 1..tot, so the
    // scrubber's 0..1000 maps onto [1, tot] and can never land back on frame 0.
    function valToTime(v) { return (tot > 1) ? (1 + (v / 1000) * (tot - 1)) / fpsv : dur * (v / 1000); }

    // Day / Night / High-contrast: recolor via a data-theme attribute, remember the choice.
    function setTheme(mode) {
      if (mode !== 'day' && mode !== 'night' && mode !== 'hc') mode = 'night';
      bar.setAttribute('data-theme', mode);
      var tb = bar.querySelectorAll('.sp-theme button');
      for (var i = 0; i < tb.length; i++) { tb[i].setAttribute('aria-pressed', tb[i].getAttribute('data-theme') === mode ? 'true' : 'false'); }
      try { localStorage.setItem('forgeOamTheme', mode); } catch (e) {}
    }

    // Find the nearest <button> by walking up parentNode -- NOT Element.closest(),
    // which is missing on SVG targets in some engines (the click lands on the icon
    // <path>, so closest() there threw and killed every button press).
    function btnFrom(node) {
      while (node && node !== bar) { if (node.nodeName === 'BUTTON') return node; node = node.parentNode; }
      return null;
    }
    bar.addEventListener('click', function (e) {
      var b = btnFrom(e.target); if (!b) return;
      if (b.hasAttribute('data-theme')) { setTheme(b.getAttribute('data-theme')); return; }
      var a = b.getAttribute('data-a'); if (!a) return;
      if (a === 'play') send(playingNow ? 'oam:pause' : 'oam:play');
      else if (a === 'rewind') send('oam:seek', { t: tot > 1 ? 1 / fpsv : 0 });   // rewind to frame 1 (not the setup frame 0), stay paused
      else if (a === 'next') send('oam:nextStop');
      else if (a === 'prev') send('oam:prevStop');
    });
    rng.addEventListener('pointerdown', function () { dragging = true; });
    window.addEventListener('pointerup', function () { dragging = false; });
    rng.addEventListener('input', function () { paintFill(); send('oam:seek', { t: valToTime(rng.value) }); });

    function renderTicks(stops) {
      if (!tot || tot <= 1) { elTicks.innerHTML = ''; return; }
      var h = '';
      for (var i = 0; i < stops.length; i++) {
        var sf = Math.round(stops[i] * fpsv);                  // stop frame
        var v = Math.min(1, Math.max(0, (sf - 1) / (tot - 1))); // map frames [1..tot] -> [0..1] (frame 0 excluded)
        h += '<i style="left:calc(12px + ' + v + ' * (100% - 24px))"></i>';
      }
      elTicks.innerHTML = h;
    }
    function showEvent(d) {            // forge:command -> plain-language "which event"
      var stop = d.parity === 'stop';
      elEvt.style.color = stop ? '#f5c34d' : '#8fd0ff';
      elEvt.textContent = (stop ? '■ Stop ' : '▶ Resume from stop ') +
        (d.index >= 0 ? (d.index + 1) + (nStops ? ' of ' + nStops : '') : '?') +
        '  ·  frame ' + d.frame + (d.index >= 0 ? '  ·  prompt #' + d.index : '') +
        '  ·  event ' + d.n;
    }

    window.addEventListener('message', function (e) {
      var d = e.data || {};
      if (d.type === 'oam:state') {
        playingNow = !!d.playing; dur = d.duration || 0; fpsv = d.fps || fpsv; nStops = (d.stops || []).length;
        elPlay.innerHTML = playingNow ? IC_PAUSE : IC_PLAY;
        elPlay.setAttribute('aria-label', playingNow ? 'Pause' : 'Play');
        tot = Math.round(dur * fpsv); var cf = Math.round((d.t || 0) * fpsv);
        var atEnd = tot > 0 && cf >= tot - 1;            // last frame: fill the bar + thumb hard right
        var atStart = cf <= 1;                            // frame 1 is the start (frame 0 is setup-only)
        if (atEnd) cf = tot;
        elPrev.disabled = atStart; elRewind.disabled = atStart;   // gate back/rewind at the start
        elNext.disabled = atEnd; elPlay.disabled = atEnd;         // gate forward/play at the end
        if (!dragging) { rng.value = (tot > 1) ? (atEnd ? 1000 : Math.max(0, Math.min(1000, Math.round((cf - 1) / (tot - 1) * 1000)))) : 0; paintFill(); }
        elTime.textContent = fmt(atEnd ? dur : d.t) + ' / ' + fmt(dur) + '  ·  f' + Math.max(1, cf) + '/' + tot;
        rng.setAttribute('aria-valuetext', fmt(atEnd ? dur : d.t) + ' of ' + fmt(dur));
        renderTicks(d.stops || []);
        // When parked (not playing), reflect the stop the playhead is on, so stepping
        // (prev/next stop) and seeking update the event readout too.
        if (!playingNow) {
          var rawCf = Math.round((d.t || 0) * fpsv), stps = d.stops || [], si = -1;
          for (var j = 0; j < stps.length; j++) { if (Math.abs(Math.round(stps[j] * fpsv) - rawCf) <= 1) { si = j; break; } }
          if (si >= 0) showEvent({ parity: 'stop', index: si, frame: Math.round(stps[si] * fpsv), n: 2 * si + 1 });
          else if (elEvt.textContent === 'ready') elEvt.textContent = '■ stopped';
        } else if (elEvt.textContent === 'ready') { elEvt.textContent = '▶ playing'; }
      } else if (d.type === 'forge:command') {
        showEvent(d);
      } else if (d.type === 'forge:end') {
        rng.value = 1000; playingNow = false; paintFill();   // fully fill the bar at the end
        elPlay.innerHTML = IC_PLAY; elPlay.setAttribute('aria-label', 'Play');
        elNext.disabled = true; elPlay.disabled = true;      // at the end: no forward, no play
        elPrev.disabled = false; elRewind.disabled = false;
        elEvt.style.color = '#46d39a'; elEvt.textContent = '✓ content complete  ·  frame ' + (d.frame != null ? d.frame : '?');
      } else if (d.type === 'forge:hotspot') {
        elEvt.style.color = '#9E92FF'; elEvt.textContent = '◉ hotspot selected' + (d.hotspot && d.hotspot.label ? '  ·  ' + d.hotspot.label : '');
      }
    });
    // Initial theme: a saved choice if the artist picked one, otherwise default to Night (dark).
    (function () {
      var pick = null; try { pick = localStorage.getItem('forgeOamTheme'); } catch (e) {}
      setTheme(pick || 'night');
    })();

    positionPanel();                  // pin under the Animate stage (top of bar = stage bottom)
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, { passive: true });
    postState();                      // request an initial state for the readout
  }

  // ---- parent -> iframe protocol -------------------------------------------
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;   // only accept commands from our host
    var d = e.data || {}, r;
    if (e.source !== window && (d.type === 'oam:getState' || d.type === 'forge:config') && !hostDetected) {
      hostDetected = true;                     // a real CourseForge host is present -> no standalone panel
      if (forge._panel && forge._panel.parentNode) { forge._panel.parentNode.removeChild(forge._panel); forge._panel = null; }
    }
    switch (d.type) {
      case 'oam:getState':
        postState(); break;
      case 'forge:config':
        forge._cfDone = true;           // project override wins over any frame-0 FORGE_CONFIG
        applyConfig(d.config || d); break;
      case 'oam:play':
        r = resolveRoot();
        if (r) {
          var i = stopIndexAtFrame(curFrame());
          lastCmdKey = null;                   // allow the next organic stop to post
          pausedByUser = false;
          clearHotspots();                     // resuming clears the current stop's hotspots
          var tf = totalFrames();
          if (tf > 0 && curFrame() >= tf - 1) { endedPosted = false; r.gotoAndPlay(0); }  // at the end -> replay
          else r.play();
          postCommand(i >= 0 ? 2 * i + 2 : 0, curFrame(), i);  // even = start
        }
        try { createjs.Ticker.paused = false; } catch (e2) {}
        postState(); break;
      case 'oam:pause':
        r = resolveRoot(); pausedByUser = true; if (r) r.stop(); postState(); break;
      case 'oam:seek':
        r = resolveRoot(); pausedByUser = true;
        if (r) { lastCmdKey = null; var sf = Math.max(0, Math.round((d.t || 0) * fps())); sf = Math.min(sf, Math.max(0, totalFrames() - 1)); if (sf < totalFrames() - 1) endedPosted = false; r.gotoAndStop(sf); }
        postState(); break;
      case 'oam:nextStop':
        r = resolveRoot(); pausedByUser = true;
        if (r) {
          var cur = curFrame(), endF = Math.max(0, totalFrames() - 1);
          var s = stopFrames().slice();
          if (s.indexOf(endF) === -1) s.push(endF);          // the end frame is always a final "next" target
          s.sort(function (a, b) { return a - b; });
          var nx = null;
          for (var k = 0; k < s.length; k++) { if (s[k] > cur + 1) { nx = s[k]; break; } }
          lastCmdKey = null;
          r.gotoAndStop(nx != null ? nx : endF);
        }
        postState(); break;
      case 'oam:prevStop':
        r = resolveRoot(); pausedByUser = true;
        if (r) {
          var curB = curFrame(), startF = totalFrames() > 1 ? 1 : 0;
          var sB = stopFrames().slice();
          if (sB.indexOf(startF) === -1) sB.push(startF);    // the start (frame 1) is always a first "prev" target
          sB.sort(function (a, b) { return a - b; });
          var pv = null;
          for (var kb = sB.length - 1; kb >= 0; kb--) { if (sB[kb] < curB - 1) { pv = sB[kb]; break; } }
          lastCmdKey = null;
          r.gotoAndStop(pv != null ? pv : startF);
        }
        postState(); break;
    }
  });

  // ---- init ----------------------------------------------------------------
  function init() {
    if (forge._inited) return;            // run once
    forge._inited = true;
    wrapStage('Stage'); wrapStage('StageGL');
    hookStageUpdate('Stage'); hookStageUpdate('StageGL');
    installProto();
    // Keep any visible hotspot overlays aligned when the canvas resizes/scales.
    window.addEventListener('resize', function () { for (var i = 0; i < hotspots.length; i++) positionHotspot(hotspots[i]); });
    // While playing, push state so the bar tracks the playhead; and emit
    // forge:end when the timeline naturally reaches the final frame even if the
    // author didn't put forgeStop/forgeEnd there (prevents a gate_next soft-lock).
    forge._pump = setInterval(function () {
      ensureCfg();                         // pick up a frame-0 FORGE_CONFIG (stops + hotspot defaults)
      if (forge._panel) positionPanel();   // keep the standalone bar pinned under the stage as it scales
      if (!root) return;
      var p = playing(), cf = curFrame(), tf = totalFrames();
      if (p !== lastPlaying) {
        // Stopped on its own (not a bar pause/seek) before the end -> a native
        // this.stop() content stop: record it so a marker appears, even with no
        // forgeStop authored.
        if (!p && !pausedByUser && tf > 0 && cf < tf - 1 && discovered.indexOf(cf) === -1) discovered.push(cf);
        postState();                       // push the play<->stop transition (button reflects state)
      } else if (p) {
        postState();                       // track the playhead while playing
      }
      lastPlaying = p;
      // Parked on a stop but its hotspots are gone (after a replay/seek where the
      // proxy clip's frame script didn't re-fire) -> restore them from memory.
      if (!p && hotspots.length === 0 && stopIndexAtFrame(cf) >= 0) {
        var memHs = hsMem[cf];
        if (memHs && memHs.length) { for (var ri = 0; ri < memHs.length; ri++) drawHotspot(memHs[ri].clip, memHs[ri].opts); }
      }
      if (tf > 0 && cf >= tf - 1 && !endedPosted) { endedPosted = true; post({ type: 'forge:end', frame: cf }); }
    }, 250);
    post({ type: 'forge:hello' });
    postState();
    // No CourseForge host answered the handshake within the window -> show the
    // self-contained standalone test panel so artists can drive playback + see events.
    setTimeout(function () { if (!hostDetected) buildStandalonePanel(); }, 1200);
  }

  if (window.createjs) init();
  else {
    var tries = 0, iv = setInterval(function () {
      if (window.createjs) { clearInterval(iv); init(); }
      else if (++tries > 200) clearInterval(iv);   // ~10s give-up
    }, 50);
  }
})();
