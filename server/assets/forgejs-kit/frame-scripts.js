/* ============================================================================
 * ForgeJS — copy/paste frame scripts for Adobe Animate (HTML5 Canvas / OAM)
 *
 * Paste these into your timeline frame scripts. Every call is GUARDED
 * (`if (this.forgeX) … else …`) so the file still previews correctly inside
 * Animate, where ForgeJS isn't loaded. CourseForge injects forge-oam.js on
 * upload; for LOCAL testing see README.md ("Local testing in Animate").
 * ==========================================================================*/

/* ---- 1. Declare your stops up-front (optional) ----------------------------
 * Put on frame 1 (or the document script). Lets the media bar show stop
 * markers BEFORE the first play. Frame NUMBERS, not seconds. */
window.forgeStops = [60, 120, 180];

/* ---- 2. Pause the timeline at a stop --------------------------------------
 * Put on each frame where playback should hold until the learner continues. */
if (this.forgeStop) this.forgeStop(); else this.stop();

/* ---- 3. Hotspot: click the artwork to continue ----------------------------
 * Put on FRAME 1 INSIDE a MovieClip placed over the clickable area. `this` is
 * the hotspot clip. CourseForge draws the highlight from the project hotspot
 * style — don't style it here. */
if (this.forgeHotspot) this.forgeHotspot({
  id: "valve",                       // any unique id
  label: "Open the valve",           // hover text / screen-reader label
  description: "Turn it clockwise"   // optional
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
