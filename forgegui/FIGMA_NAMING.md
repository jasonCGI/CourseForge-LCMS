# ForgeGUI — Figma Naming Guide (for artists)

ForgeGUI builds an interactive course **shell** from a Figma frame by reading
**layer names**. Name your layers with the prefixes below and the importer wires
up buttons and dynamic-text zones automatically. Matching is forgiving — case,
spaces, and `-` vs `_` don't matter, and a name only has to *contain* the
keyword (e.g. `zone-lesson-name`, `Zone Lesson Title`, and `zone_lesson` all
become a Lesson-title zone).

## 1. The stage frame
Name the top-level frame you want imported **`stage`**, **`gui`**, or **`shell`**.
(If none is named that, the importer takes the first frame with layers.)

## 2. Buttons — `btn-<ACTION>`
A layer named `btn-<ACTION>` becomes a clickable button wired to that action.

| Name | Action |
|------|--------|
| `btn-next` | NEXT |
| `btn-previous` / `btn-prev` | PREVIOUS |
| `btn-submit` | SUBMIT |
| `btn-continue` | CONTINUE |
| `btn-replay` | REPLAY |
| `btn-menu` | MENU |
| `btn-help` | HELP |
| `btn-check` | CHECK |
| `btn-try-again` | TRY AGAIN |
| `btn-yes` / `btn-no` / `btn-confirm` / `btn-cancel` | YES / NO / CONFIRM / CANCEL |

For sprite/state buttons, group the states under the `btn-…` layer.

## 3. Dynamic-text zones — `zone-<keyword>`
A layer named `zone-<keyword>` becomes a text zone that the player fills at
runtime. The importer picks the **closest** type from the keyword in the name:

| If the name contains… | Zone type | Shows at runtime |
|---|---|---|
| `lesson` | Lesson title | the lesson name |
| `frame` or `title` | Frame title | the frame name |
| `section` or `module` | Section title | the course/section name |
| `count` | Frame counter | e.g. `3 / 17` |
| `prompt` | Prompt | the on-screen instruction |
| `feedback` | Feedback | quiz correct/incorrect text |
| *(anything else)* | Prompt | (fallback) |

**Recommended exact names** (clearest, future-proof):
`zone-lesson-name` · `zone-frame-name` · `zone-section-name` ·
`zone-frame-counter` · `zone-prompt` · `zone-feedback`

Example for the standard title stack:
- top line of text → **`zone-lesson-name`** → shows the Lesson (e.g. "Welcome")
- second line → **`zone-frame-name`** → shows the Frame (e.g. "Welcome to CourseForge")

Tips:
- Use a Figma **text** layer for zones — its font size, alignment, and color are
  carried into the shell.
- Two zones must not share the same purpose — give each its own keyword.
- In the ForgeGUI editor you can always override a zone's **Type** by hand; the
  selected zone shows a high-contrast marching-ants outline on the stage so you
  can tell which one you're editing.
