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

Deployed as its **own Railway service**, separate from the Flask app, serving
the static files via Python's built-in HTTP server (`python3 -m http.server`)
in a tiny container.

Because both services share one repo, the isd-tool service sets its **Root
Directory = isd-tool**. Railway then builds from this folder and reads
`isd-tool/railway.toml` (which selects `isd-tool/Dockerfile`), ignoring the
repo-root config (the Flask app's gunicorn / `flask db upgrade` / `/api/health`
healthcheck — none of which apply here).

Setup:

```
railway add --service isd-tool       # create the service (CLI)
# Dashboard: isd-tool service -> Settings -> Root Directory = isd-tool
railway up --service isd-tool        # build + deploy
railway domain --service isd-tool    # generate a public URL
```

The Dockerfile runs `python3 -m http.server $PORT --bind 0.0.0.0`. No
`DATABASE_URL` or other variables are required — the tool is 100% client-side
(SheetJS via CDN).

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
