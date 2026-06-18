# ForgeJS — Adobe Animate Authoring Cheat-Sheet

How to make an Adobe Animate (HTML5 Canvas / OAM) animation **interactive inside
CourseForge** — pauses, hotspots, prompts, and LMS completion.

You do **not** add `forge-oam.js` yourself. CourseForge injects it automatically
when you upload the `.oam`. You just call the `forge*` methods from frame scripts.

---

## The split: what goes where

| Concern | Authored in **Animate** (frame scripts) | Authored in **CourseForge** (OAM block) |
|---|---|---|
| Pause points (stops) | `this.forgeStop()` | — |
| Stop markers up-front | `window.forgeStops = [...]` (optional) | — |
| Hotspots (click-to-continue) | `this.forgeHotspot({...})` on a clip | hotspot **style** (project/frame-0) |
| Prompt **text** at each stop | — | ordered "Stop prompts" list |
| End prompt | — | "End prompt" field |
| Disable NEXT until finished | — | "Disable NEXT…" checkbox |
| LMS completion / score | `this.forgeComplete(score)` | (SCORM bridge toggle) |

**Rule of thumb:** *behaviour* (when to stop, where the hotspots are, when it's
complete) is authored in Animate; *content & styling* (prompt words, colors,
gating) is set on the OAM block in CourseForge.

---

## 1. Pause the timeline (a "stop")

On the timeline frame where you want it to hold, add a frame script:

```js
// Frame script — pause here until the learner continues
if (this.forgeStop) this.forgeStop(); else this.stop();
```

The `if (this.forgeStop) … else this.stop()` guard means it still works when you
test inside Animate (where ForgeJS isn't present) **and** in CourseForge.

- The media bar's **Play** and **⤓ Next stop** move the learner past each stop.
- `this` is the timeline's MovieClip — for the **main** timeline, put the script
  on the main timeline.

### Optional: show the stop markers *before* the first play

Declare your stop frames once (e.g. a frame-1 script or the document script):

```js
window.forgeStops = [48, 96, 144];   // frame numbers of your stops
```

If you omit this, markers simply appear as the learner reaches each stop.

---

## 2. Hotspots (click the artwork to continue)

Make a **MovieClip** the size/shape of the clickable area, place it where the
learner should click, and give **its** frame 1 a script:

```js
// Frame script INSIDE the hotspot MovieClip (this = the hotspot clip)
if (this.forgeHotspot) this.forgeHotspot({
  id: "valve",                      // any unique id
  label: "Open the valve",          // shown on hover / for screen readers
  description: "Turn it clockwise"  // optional
});
```

- Show the hotspot at a stop (e.g. set the clip visible on the frame where you
  `forgeStop()`), and **clicking it plays the timeline on** — it's the "continue"
  affordance.
- CourseForge draws the highlight (stroke, glow, pulse) from the project-level
  hotspot style; you don't style it in Animate.
- The clip needs real bounds — that's automatic if it contains artwork. An empty
  clip falls back to a default box (and logs a warning).

---

## 3. Report completion & score to the LMS

On the final (or a "you passed") frame:

```js
if (this.forgeComplete) this.forgeComplete(85);   // 85 = optional score 0–100
```

- `forgeComplete()` with no number just marks the SCO **completed**.
- Score only, any time: `if (this.forgeScore) this.forgeScore(72);`
- To **block NEXT until the animation finishes**, tick *"Disable NEXT until the
  animation finishes"* on the OAM block in CourseForge — it releases on the last
  frame (or on `forgeComplete`).

---

## 4. Prompts — set the words in CourseForge

The animation only emits *cues*; the prompt **text** lives on the OAM block:

- **Stop prompts** (one per line, in stop order): line 1 → first stop, line 2 →
  second stop, … A blank line keeps the previous prompt showing.
- **End prompt**: shown on the final frame (default *"Press NEXT to continue."*).

In a CourseForge GUI shell these appear in the shell's prompt zone; with no shell
they're logged to the browser console (open DevTools to watch them).

---

## Gotchas

- **Frames, not seconds** — `forgeStops` and stop frames are Animate **frame
  numbers**; ForgeJS converts to time using your timeline's frame rate.
- **`this`** — in a *main timeline* frame script `this` is the root; in a *clip's*
  frame script `this` is that clip. `forgeHotspot` must be called on the clip.
- **Always guard** (`if (this.forgeX) …`) so previews in Animate don't error.
- **Stops/prompts/hotspots are opt-in** — a stock export with none still gets
  full play / pause / seek / scrub in the media bar automatically.
- **Re-uploading** re-injects the current ForgeJS; you never ship `forge-oam.js`.

---

## Minimal end-to-end example (main timeline)

```js
// Frame 1
window.forgeStops = [60, 120];

// Frame 60  — pause; CourseForge shows "Stop prompt" line 1
if (this.forgeStop) this.forgeStop(); else this.stop();

// Frame 120 — pause; shows "Stop prompt" line 2
if (this.forgeStop) this.forgeStop(); else this.stop();

// Last frame — report done (+score) and release NEXT
if (this.forgeComplete) this.forgeComplete(100);
```

Upload the `.oam`, drop it in an OAM block, fill in the Stop prompts, and publish.
