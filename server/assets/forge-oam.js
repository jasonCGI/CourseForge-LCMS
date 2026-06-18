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
  var lastCmd = null;      // dedupe consecutive identical commands

  function declared() {
    return Array.isArray(window.forgeStops) ? window.forgeStops.slice() : null;
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
    var s = stopFrames();
    for (var i = 0; i < s.length; i++) { if (Math.abs(s[i] - fr) <= 1) return i; }
    return -1;
  }

  function post(msg) { try { parent.postMessage(msg, '*'); } catch (e) {} }
  function postState() {
    post({ type: 'oam:state', t: curFrame() / fps(), duration: duration(),
           stops: stopSeconds(), playing: playing() });
  }
  function postCommand(n, frame) {
    if (n === lastCmd) return;       // dedupe (gotoAndStop can re-fire a frame action)
    lastCmd = n;
    post({ type: 'forge:command', n: n, parity: (n % 2 === 1 ? 'stop' : 'start'), frame: frame });
  }

  function resolveRoot() {
    if (root) return root;
    try { if (stage && stage.getChildAt) { var c = stage.getChildAt(0); if (c) root = c; } } catch (e) {}
    return root;
  }

  // ---- capture the CreateJS stage (root = its first child) -----------------
  function wrapStage(name) {
    if (!window.createjs || !createjs[name] || createjs[name].__forgeWrapped) return;
    var Orig = createjs[name];
    function Wrapped() { Orig.apply(this, arguments); try { stage = this; } catch (e) {} return this; }
    Wrapped.prototype = Orig.prototype;
    Wrapped.__forgeWrapped = true;
    createjs[name] = Wrapped;
  }

  // ---- MovieClip authoring API --------------------------------------------
  function installProto() {
    var MC = window.createjs && createjs.MovieClip;
    if (!MC || MC.prototype.forgeStop) return;

    MC.prototype.forgeStop = function () {
      this.stop();
      if (!root) root = this;                       // first forgeStop = root timeline
      var fr = this.currentFrame || 0;
      if (discovered.indexOf(fr) === -1) discovered.push(fr);
      var idx = stopIndexAtFrame(fr);
      postState();
      postCommand(idx >= 0 ? 2 * idx + 1 : 1, fr);  // odd = stop
      if (fr >= totalFrames() - 1) post({ type: 'forge:end', frame: fr });
    };
    MC.prototype.forgeEnd = function () {
      this.stop();
      if (!root) root = this;
      postState();
      post({ type: 'forge:end', frame: this.currentFrame || 0 });
    };
    // forgeHotspot is fleshed out in task 4; reserve it so frame scripts don't throw.
    if (!MC.prototype.forgeHotspot) {
      MC.prototype.forgeHotspot = function (opts) { post({ type: 'forge:hotspot', hotspot: opts || {} }); };
    }
  }

  // ---- parent -> iframe protocol -------------------------------------------
  window.addEventListener('message', function (e) {
    var d = e.data || {}, r;
    switch (d.type) {
      case 'oam:getState':
        postState(); break;
      case 'oam:play':
        r = resolveRoot();
        if (r) {
          var i = stopIndexAtFrame(curFrame());
          r.play();
          postCommand(i >= 0 ? 2 * i + 2 : 0, curFrame());  // even = start
        }
        try { createjs.Ticker.paused = false; } catch (e2) {}
        postState(); break;
      case 'oam:pause':
        r = resolveRoot(); if (r) r.stop(); postState(); break;
      case 'oam:seek':
        r = resolveRoot();
        if (r) { lastCmd = null; r.gotoAndStop(Math.max(0, Math.round((d.t || 0) * fps()))); }
        postState(); break;
      case 'oam:nextStop':
        r = resolveRoot();
        if (r) {
          var cur = curFrame(), nx = null, s = stopFrames();
          for (var k = 0; k < s.length; k++) { if (s[k] > cur + 1) { nx = s[k]; break; } }
          lastCmd = null;
          r.gotoAndStop(nx != null ? nx : Math.max(0, totalFrames() - 1));
        }
        postState(); break;
    }
  });

  // ---- init ----------------------------------------------------------------
  function init() {
    wrapStage('Stage'); wrapStage('StageGL');
    installProto();
    // While playing, push state so the bar tracks the playhead.
    setInterval(function () { if (root && playing()) postState(); }, 250);
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
