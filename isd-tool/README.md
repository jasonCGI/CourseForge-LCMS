# CourseForge ISD Structure Tool

Standalone static site for Instructional Systems Designers to build,
validate, and export course structure before it enters CourseForge.

## What it does

1. Download — pre-formatted Excel template with correct column layout
2. Upload — drag .xlsx file into the tool
3. Validate — errors and warnings on structure
4. Preview — collapsible hierarchy tree
5. Export — CourseForge-compatible JSON for developer handoff

## What it does NOT do

Frame content (narration, media, knowledge check questions, branching logic)
is authored separately inside CourseForge. This tool is structure-only.

## Local testing

Open `index.html` in any modern browser — no server required. Or serve it the
same way it runs in production:

```bash
python3 -m http.server 8000 --directory isd-tool
# then open http://localhost:8000
```

## Deploy to Railway (python http.server)

This tool is deployed as its **own Railway service**, separate from the Flask
app, serving the static `index.html` via Python's built-in HTTP server. There
is no build step and no application code.

1. In the Railway project, **+ New → GitHub Repo** → pick this repo (it can be
   the same repo as the main app).
2. Open the new service → **Settings → Source → Root Directory** = `isd-tool`.
   This makes Railway build/run from this folder only.
3. The included `isd-tool/nixpacks.toml` handles the rest: it provisions
   `python3` and starts:
   ```
   python3 -m http.server $PORT --bind 0.0.0.0
   ```
   serving `index.html` from the service root.
4. Deploy. Railway assigns a public URL — that's your ISD tool URL.
   (Optional: Settings → Networking → set a friendlier subdomain.)

No `DATABASE_URL` or other variables are required — the tool is 100%
client-side; SheetJS loads from CDN.

## Column schema (locked)

| Col | Field        | Required |
|-----|--------------|----------|
| A   | Project Name | Row 2    |
| B   | Course Name  | Yes      |
| C   | Module Name  | Yes      |
| D   | Lesson Name  | Yes      |
| E   | Frame Name   | Yes      |
| F   | Frame Type   | No       |

Frame Type values: content (default) | assessment | branch
