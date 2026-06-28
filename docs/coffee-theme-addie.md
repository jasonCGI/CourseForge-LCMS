# CourseForge Demo — Coffee Theme + ADDIE Reference

Status: proposal / working reference. Drives the re-theme of the seed demo
(`server/demo_seed.py`) and any new art. Goal: make the entire demo a single
coherent **coffee micro-course** whose *structure* doubles as a worked example
of ADDIE / sound ISD — so a reviewer sees instructional-design intent, not a
feature dump.

The demo already carries coffee content in places (the kissaten image-swap, the
latte callout frame, the 3D cup, the OAM coffee-cups animation). This reference
unifies the rest behind one premise, palette, voice, and ADDIE overlay.

---

## 1. Premise (the subject)

**"Espresso Craft" — pulling a balanced shot, end to end.** A barista-foundations
micro-course. Concrete, hands-on, sensory. The platform tour still happens (every
block type appears once), but the *example content* is one continuous coffee
course rather than disconnected samples.

Audience: a new café hire / home-machine owner. Single job per frame. Voice is
terse and sensory-accurate, second person for any instruction ("Tamp level, ~30 lb.
Lock in. Brew."). No filler, no em dashes (matches the portfolio voice).

---

## 2. ADDIE overlay (the ISD reinforcement)

Two layers, both worth surfacing:

**A. The demo was *built* with ADDIE.** A one-paragraph framing on the Welcome
frame names the method: "This course was scoped, designed, and built with ADDIE.
Watch for the phase tag in each section." Each lesson carries a small phase tag
(Analysis / Design / Development / Implementation / Evaluation) in its prompt or
author-notes so the method is visible.

**B. Best-fit phase per existing lesson** (no restructuring required):

| Lesson (current) | ADDIE phase it illustrates | Why |
|---|---|---|
| Welcome | **Analysis** | Learner, goal, prerequisites, navigation — define the need before teaching. |
| Content Blocks | **Development** | Building the instructional materials (read/look/listen). |
| Assessment Blocks | **Evaluation** | Check for understanding (quiz / hotspot / branch). |
| Safety Blocks | **Implementation** | Operating safely on the job — the real-world delivery context. |
| Advanced Blocks | **Design** (rich-media design choices) | When richer media earns its cost: 3D, interactive video, animation. |
| Course Summary | **Evaluation** (close the loop) | Reflect, measure, transfer to the learner's own machine. |

If you'd rather the *modules* map 1:1 to A-D-D-I-E in order, we'd reorder lessons;
the table above is the no-reorder version.

---

## 3. Palette (content / art direction)

Coffee-derived, WCAG-AA on the pairings noted. These guide new art and any
content-area theming; they are not the LCMS chrome (the shell keeps its own theme).

| Token | Hex | Use |
|---|---|---|
| Espresso ink | `#2E1B10` | Primary text on cream; darkest roast. |
| Roast brown | `#5C3A21` | Headings, strong UI accents. |
| Crema | `#C89B5C` | Primary accent (caramel/crema); buttons, active states. |
| Crema light | `#E0B97D` | Hover / secondary accent. |
| Latte | `#C9A887` | Muted fills, dividers. |
| Cream | `#F3E9DD` | Content background. |
| Steam | `#FAF6F0` | Lightest surface / cards. |

Contrast guardrails: Espresso ink `#2E1B10` on Cream `#F3E9DD` ≈ 11:1 (AAA).
Crema `#C89B5C` is an ACCENT, not a text-on-light color (fails AA as small text on
cream); use Espresso ink for text, Crema for fills/strokes/large display only.
White text belongs on Roast brown / Espresso ink, never on Crema/Latte.

---

## 4. Type direction

Pairing intent (final faces TBD with the new art):
- **Display:** a face with café-signage character — a warm humanist serif or a
  confident slab — used sparingly for frame titles and the hero.
- **Body:** a clean, highly legible sans for instructional copy.
- **Utility/data:** a mono for measurements (dose, yield, time, ratio) so the
  numbers read as instrument readouts.

Keep the type treatment itself memorable (the numbers-as-readouts move is the
signature), everything else quiet.

---

## 5. Coffee vocabulary bank (for authentic copy)

Use real terms, correctly. Dose, yield, ratio (1:2 typical), extraction time
(~25-30 s), grind size, dial-in, tamp, puck, portafilter, group head, channeling,
crema, microfoam, steam wand, purge, TDS / extraction yield, pre-infusion, basket,
distribution. Brew methods: espresso, pour-over (V60), immersion (French press),
moka. Sensory: bright/acidic, balanced, bitter, sour (under-extracted), ashy
(over-extracted), body, sweetness. Setting register already in use: *kissaten*
(Japanese café), pour-over, milk glass, latte art.

---

## 6. Per-frame content map

Concept per existing frame. ✓ = already coffee, keep/polish. ◆ = re-theme.

| Frame | Coffee concept |
|---|---|
| Course Menu | ✓ TOC styled as a café menu / chalkboard. |
| Welcome to CourseForge | ◆ "Welcome to Espresso Craft" hero + ADDIE framing line. |
| How to Navigate This Course | ◆ Coffee-toned navigation help. |
| Text Block | ◆ "Anatomy of a Shot" — dose / yield / time as instrument readouts. |
| Image Block | ✓ Barista presenting a latte (current). |
| Image Swap | ✓ Kissaten milk-glass cup swap (current — exemplary). |
| Image with Callout Labels | ✓ Latte parts: foam art / ceramic cup / espresso base. |
| Video Block | ◆ A real espresso pull or V60 pour, captioned. |
| Audio Block | ◆ Grinder + steam-wand texturing, or a tasting-note narration. |
| Quiz Block | ◆ "Your shot pulled in 18 s. Most likely cause?" (grind too coarse). |
| Hotspot Block | ◆ Espresso-machine photo: click the portafilter / group head / steam wand. |
| Branch Block | ◆ "Shot ran fast and sour — go finer or coarser?" branch on grind. |
| Warning Block (Inline) | ◆ Steam wand reaches scalding temps — burn risk. |
| Caution Block (Modal) | ◆ Hot group head / pressurized basket caution. |
| Note Block (Inline) | ◆ Purge the steam wand before AND after texturing. |
| 3D Model Block | ✓/◆ 3D cup (current); ideal future art = portafilter or grinder. |
| Interactive Video Block | ◆ iVideo of a pour with hotspots at key moments (re-theme FI_Splash). |
| OAM Block | ✓ Coffee-cups Animate piece (current). |
| Platform Summary | ◆ Recap the espresso fundamentals covered. |
| Next Steps | ◆ "Dial in your own machine" transfer CTA. |

---

## 7. Build order (when ready)

1. Lock palette + faces against the first piece of new art.
2. Re-theme copy in `server/demo_seed.py` frame by frame (table §6), preserving
   the block-type-per-frame tour purpose.
3. Add the ADDIE framing line + per-lesson phase tags (§2).
4. Swap art as it is produced (image / video / iVideo / 3D / OAM).
5. Reseed prod via `GET /api/demo/reset` after demo-seed changes.
