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
app, serving the static `index.html` via Python's built-in HTTP server
(`python3 -m http.server`) in a tiny container.

Because both services live in one repo, the isd-tool service uses a dedicated
`isd-tool/Dockerfile` instead of the repo-root nixpacks build (which is the
Flask app). The service variable `RAILWAY_DOCKERFILE_PATH=isd-tool/Dockerfile`
tells Railway to build with it; the Dockerfile copies only `isd-tool/` and runs
`python3 -m http.server $PORT --bind 0.0.0.0`.

Set up (already scripted via the Railway CLI):

```
railway add --service isd-tool
railway variables --set "RAILWAY_DOCKERFILE_PATH=isd-tool/Dockerfile" --service isd-tool
railway up --service isd-tool        # builds with the Dockerfile, deploys
railway domain --service isd-tool    # generate a public URL
```

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
