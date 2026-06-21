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
  var endedPosted = false; // forge:end emitted once per arrival at the final frame
  var lastPlaying = false;  // last reported play state (to detect stop transitions)
  var pausedByUser = false; // distinguish a bar pause/seek from a native content stop

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
           stops: stopSeconds(), playing: playing() });
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
    if (!document.getElementById('forge-hs-style')) {        // generic, var-driven — built once
      var st = document.createElement('style'); st.id = 'forge-hs-style';
      st.textContent = '@keyframes forgeHsPulse{0%,100%{box-shadow:var(--hs-shadow)}50%{box-shadow:0 0 0 6px var(--hs-pulse-mid)}}' +
        '[role=button]:focus-visible{outline:2px solid var(--hs-focus,' + (HS.focusOutline || HS.strokeColor) + ');outline-offset:2px}';
      document.head.appendChild(st);
    }
  }

  // ---- parent -> iframe protocol -------------------------------------------
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;   // only accept commands from our host
    var d = e.data || {}, r;
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
        if (r) { lastCmdKey = null; var sf = Math.max(0, Math.round((d.t || 0) * fps())); if (sf < totalFrames() - 1) endedPosted = false; r.gotoAndStop(sf); }
        postState(); break;
      case 'oam:nextStop':
        r = resolveRoot(); pausedByUser = true;
        if (r) {
          var cur = curFrame(), nx = null, s = stopFrames();
          for (var k = 0; k < s.length; k++) { if (s[k] > cur + 1) { nx = s[k]; break; } }
          lastCmdKey = null;
          r.gotoAndStop(nx != null ? nx : Math.max(0, totalFrames() - 1));
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
      if (tf > 0 && cf >= tf - 1 && !endedPosted) { endedPosted = true; post({ type: 'forge:end', frame: cf }); }
    }, 250);
    post({ type: 'forge:hello' });
    postState();
  }

  if (window.createjs) init();
  else {
    var tries = 0, iv = setInterval(function () {
      if (window.createjs) { clearInterval(iv); init(); }
      else if (++tries > 200) clearInterval(iv);   // ~10s give-up
    }, 50);
  }
})();
