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

/* ---- 3. Hotspot: "select to continue" -------------------------------------
 * Put on FRAME 1 INSIDE a MovieClip placed over the clickable area. The clip is
 * an invisible PROXY — its artwork is hidden at runtime and ForgeJS draws the
 * shape over its (transformed) bounding box, so a plain rectangle is all you
 * need. For student-led training the call is GENERIC (no args) and inherits the
 * frame-0 hotspot defaults; the shell's prompt zone carries the instruction.
 * Use the SAME symbol for as many instances as you want — clicking any one
 * resumes the timeline. (id/label are optional, mainly for 3D-model annotations;
 * opt out of hiding the clip with hideClip:false.) */
if (this.forgeHotspot) this.forgeHotspot();

/* ---- 3b. Variant symbols (overrides baked into the symbol) ----------------
 * Instances share their symbol's frame script, so per-instance args aren't a
 * thing — instead make a few symbols (hotspot_square, hotspot_circle, …) each
 * with its own override here. Omitted keys still inherit the frame-0 default. */
if (this.forgeHotspot) this.forgeHotspot({ shape: "circle", strokeColor: "#E2473F", fill: "rgba(226,71,63,0.15)" });

/* ---- 4. Report completion + score to the LMS -----------------------------
 * Put on the final (or "you passed") frame. Score is optional, 0–100. */
if (this.forgeComplete) this.forgeComplete(85);

/* Score only, any time (no completion): */
if (this.forgeScore) this.forgeScore(72);

/* ---- 5. Mark the terminal frame explicitly (optional) ---------------------
 * Only needed if your last frame isn't a natural stop and you want the
 * "stream complete" gate to release there. */
if (this.forgeEnd) this.forgeEnd(); else this.stop();
