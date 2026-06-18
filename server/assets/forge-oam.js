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
  function postState() {
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
    post({ type: 'forge:command', n: n, parity: (n % 2 === 1 ? 'stop' : 'start'),
           frame: frame, index: (index == null ? -1 : index) });
  }

  function resolveRoot() {
    if (root) return root;
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
      if (!root) root = this;                       // first forgeStop = root timeline
      var fr = this.currentFrame || 0;
      if (discovered.indexOf(fr) === -1) discovered.push(fr);
      var idx = stopIndexAtFrame(fr);
      postState();
      postCommand(idx >= 0 ? 2 * idx + 1 : 1, fr, idx);  // odd = stop
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
    if (e.source !== window.parent) return;   // only accept commands from our host
    var d = e.data || {}, r;
    switch (d.type) {
      case 'oam:getState':
        postState(); break;
      case 'oam:play':
        r = resolveRoot();
        if (r) {
          var i = stopIndexAtFrame(curFrame());
          lastCmdKey = null;                   // allow the next organic stop to post
          r.play();
          postCommand(i >= 0 ? 2 * i + 2 : 0, curFrame(), i);  // even = start
        }
        try { createjs.Ticker.paused = false; } catch (e2) {}
        postState(); break;
      case 'oam:pause':
        r = resolveRoot(); if (r) r.stop(); postState(); break;
      case 'oam:seek':
        r = resolveRoot();
        if (r) { lastCmdKey = null; r.gotoAndStop(Math.max(0, Math.round((d.t || 0) * fps()))); }
        postState(); break;
      case 'oam:nextStop':
        r = resolveRoot();
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
    // While playing, push state so the bar tracks the playhead.
    forge._pump = setInterval(function () { if (root && playing()) postState(); }, 250);
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
