---

## Local testing in Animate (before you upload)

You normally **never ship `forge-oam.js`** — CourseForge injects it when you
upload the `.oam`. But while authoring it's useful to verify your stops,
hotspots, and completion calls *before* uploading. This kit lets you do that
locally:

1. **Publish** your Animate document as **HTML5 Canvas** (File → Publish) to a
   folder. You'll get an `index.html` plus a `libs/` (CreateJS) folder.
2. Copy **`forge-oam.js`** (in this kit) next to that `index.html`.
3. In `index.html`, add this line **after** the CreateJS `<script>` (the one that
   loads `createjs.min.js` / the CreateJS libs):

   ```html
   <script src="forge-oam.js"></script>
   ```

4. Copy **`test-harness.html`** (in this kit) into the same folder.
5. Serve the folder over **http** (the harness talks to the iframe via
   `postMessage`, which needs a real origin — `file://` won't work):

   ```bash
   python -m http.server 8080
   ```

6. Open `http://localhost:8080/test-harness.html`. It loads your `index.html`,
   gives you Play / Next-stop / scrub, shows the stop **markers**, and logs every
   `forge:*` event (`forge:command`, `forge:end`, `forge:hotspot`,
   `forge:complete`) so you can confirm your frame scripts fire as intended.

> The harness is the same control protocol CourseForge's media bar uses, so
> "works in the harness" ≈ "works once uploaded." Prompt **text**, hotspot
> **styling**, and the NEXT gate are still set on the OAM block in CourseForge —
> the harness only logs the cues.

When it behaves the way you want, **remove the `<script src="forge-oam.js">` line
is not required** — re-uploading the `.oam` re-injects the canonical runtime
regardless. Leaving it in is harmless (the runtime no-ops if loaded twice).

---

## Kit contents

| File | What it is |
|---|---|
| `forge-oam.js` | The canonical CourseForge OAM runtime (same file injected on upload). |
| `frame-scripts.js` | Copy/paste, guarded frame scripts for stops, hotspots, completion. |
| `test-harness.html` | Standalone local player for verifying behavior before upload. |
| `README.md` | This document. |
