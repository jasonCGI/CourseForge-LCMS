/* ============================================================================
 * ForgeJS — copy/paste frame scripts for Adobe Animate (HTML5 Canvas / OAM)
 *
 * Paste these into your timeline frame scripts. Every call is GUARDED
 * (`if (this.forgeX) … else …`) so the file still previews correctly inside
 * Animate, where ForgeJS isn't loaded. CourseForge injects forge-oam.js on
 * upload; for LOCAL testing see README.md ("Local testing in Animate").
 * ==========================================================================*/

/* ---- 1. Frame-0 config (FRAME 0 of the main timeline) ---------------------
 * One object that lists every expected stop up-front (so markers show before
 * first play) AND sets the project-wide hotspot defaults. Frame NUMBERS, not
 * seconds. All hotspot keys are optional — anything omitted uses the built-in
 * brand default; CourseForge's project hotspot config (if set) overrides these.
 * (window.forgeStops still works as a legacy alias for `stops`.) */
window.FORGE_CONFIG = {
  stops: [60, 120, 180],             // every expected stop, up front  (alias: frameTracker)
  hotspot: {
    strokeColor: "#F59E0B",          // border + resting color
    overColor:   "#FFC04D",          // hover color
    fill:        "rgba(245,158,11,0.12)",
    shape:       "rounded",          // "rounded" | "square" | "circle"
    radius:      6,                  // px, when shape is "rounded"
    strokeWidth: 3,
    hitPadding:  0,                  // grow the clickable box beyond the artwork
    pulse:       true
  }
};

/* ---- 2. Pause the timeline at a stop --------------------------------------
 * Put on each frame where playback should hold until the learner continues. */
if (this.forgeStop) this.forgeStop(); else this.stop();

/* ---- 3. Hotspot: click the artwork to continue ----------------------------
 * Put on FRAME 1 INSIDE a MovieClip placed over the clickable area. `this` is
 * the hotspot clip. With just id/label/description it inherits the frame-0
 * hotspot defaults above. */
if (this.forgeHotspot) this.forgeHotspot({
  id: "valve",                       // any unique id
  label: "Open the valve",           // hover text / screen-reader label
  description: "Turn it clockwise"   // optional
});

/* ---- 3b. Per-instance hotspot override (optional) -------------------------
 * Any style key here overrides the frame-0 default for THIS hotspot only;
 * omitted keys still inherit. */
if (this.forgeHotspot) this.forgeHotspot({
  id: "emergency", label: "Emergency stop",
  shape: "circle", strokeColor: "#E2473F", fill: "rgba(226,71,63,0.15)"
});

/* ---- 4. Report completion + score to the LMS -----------------------------
 * Put on the final (or "you passed") frame. Score is optional, 0–100. */
if (this.forgeComplete) this.forgeComplete(85);

/* Score only, any time (no completion): */
if (this.forgeScore) this.forgeScore(72);

/* ---- 5. Mark the terminal frame explicitly (optional) ---------------------
 * Only needed if your last frame isn't a natural stop and you want the
 * "stream complete" gate to release there. */
if (this.forgeEnd) this.forgeEnd(); else this.stop();
