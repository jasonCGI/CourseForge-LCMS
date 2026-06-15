#!/usr/bin/env python3
"""
SCORM Cloud (Rustici) package validator.

Uploads a SCORM package to your SCORM Cloud account via the v2 API, polls the
import job, and reports whether it imported/parsed cleanly (with any parser
warnings/errors). Use it to validate CourseForge SCORM 1.2 / 2004 output
against a real LMS runtime.

Credentials are read from the environment so secrets never live in the repo or
chat history:

    setx RUSTICI_APP_ID     "your-app-id"        # PowerShell: $env:RUSTICI_APP_ID="..."
    setx RUSTICI_SECRET_KEY "your-secret-key"

(SCORM Cloud → Apps / API → your application's App ID + Secret Key.)

Usage:
    # Validate an existing zip on disk:
    python tools/scorm_cloud_validate.py path/to/course_scorm2004.zip

    # Publish from a running CourseForge instance, then validate:
    python tools/scorm_cloud_validate.py --publish <project_id> \
        --format scorm2004 --cf-base https://courseforge-lcms.up.railway.app

Exit code 0 = imported clean; 1 = parser warnings or import error; 2 = setup error.

Docs: https://cloud.scorm.com/docs/v2/reference/api_overview/
"""
import argparse
import io
import os
import sys
import time

import httpx

BASE = os.environ.get("RUSTICI_BASE", "https://cloud.scorm.com/api/v2")


def _auth():
    app_id = os.environ.get("RUSTICI_APP_ID")
    secret = os.environ.get("RUSTICI_SECRET_KEY")
    if not app_id or not secret:
        print("ERROR: set RUSTICI_APP_ID and RUSTICI_SECRET_KEY environment variables.",
              file=sys.stderr)
        sys.exit(2)
    return (app_id, secret)


def _ping(auth):
    r = httpx.get(f"{BASE}/ping", auth=auth, timeout=30)
    if r.status_code == 401:
        print("ERROR: authentication failed (check RUSTICI_APP_ID / RUSTICI_SECRET_KEY).",
              file=sys.stderr)
        sys.exit(2)
    r.raise_for_status()


def _get_zip(args) -> tuple[bytes, str]:
    if args.publish:
        url = f"{args.cf_base.rstrip('/')}/api/publish"
        print(f"→ publishing project {args.publish} ({args.format}) from {args.cf_base}")
        r = httpx.post(url, json={"project_id": args.publish, "format": args.format}, timeout=300)
        r.raise_for_status()
        return r.content, f"{args.publish}_{args.format}.zip"
    with open(args.zip, "rb") as fh:
        return fh.read(), os.path.basename(args.zip)


def main():
    ap = argparse.ArgumentParser(description="Validate a SCORM package against SCORM Cloud.")
    ap.add_argument("zip", nargs="?", help="Path to a SCORM .zip to validate.")
    ap.add_argument("--publish", help="CourseForge project_id to publish & validate instead of a local zip.")
    ap.add_argument("--format", default="scorm2004", choices=["scorm12", "scorm2004"],
                    help="Publish format when using --publish (default scorm2004).")
    ap.add_argument("--cf-base", default="http://localhost:5000",
                    help="CourseForge base URL for --publish (default http://localhost:5000).")
    ap.add_argument("--course-id", help="SCORM Cloud courseId to use (default: generated).")
    ap.add_argument("--poll", type=int, default=60, help="Max seconds to poll the import job.")
    args = ap.parse_args()

    if not args.zip and not args.publish:
        ap.error("provide a zip path or --publish <project_id>")

    auth = _auth()
    _ping(auth)

    data, name = _get_zip(args)
    course_id = args.course_id or f"cf-validate-{int(time.time())}"
    print(f"→ uploading {name} ({len(data)} bytes) as courseId={course_id}")

    # Create an async import job by uploading the zip (multipart).
    r = httpx.post(
        f"{BASE}/courses/importJobs",
        params={"courseId": course_id, "mayCreateNewVersion": "false"},
        files={"file": (name, io.BytesIO(data), "application/zip")},
        auth=auth, timeout=300,
    )
    if r.status_code >= 400:
        print(f"ERROR: import request failed ({r.status_code}): {r.text[:500]}", file=sys.stderr)
        sys.exit(1)
    job_id = r.json().get("result") or course_id
    print(f"→ import job: {job_id}")

    # Poll for completion.
    status, result = None, {}
    deadline = time.time() + args.poll
    while time.time() < deadline:
        s = httpx.get(f"{BASE}/courses/importJobs/{job_id}", auth=auth, timeout=30).json()
        status = s.get("status")
        result = s.get("importResult") or {}
        if status in ("COMPLETE", "ERROR"):
            break
        print(f"   …{status}")
        time.sleep(2)

    print(f"\nstatus: {status}")
    if status == "ERROR":
        print("message:", result.get("message") or "(import failed)")
        sys.exit(1)

    warnings = result.get("parserWarnings") or result.get("warnings") or []
    title = result.get("title") or result.get("course", {}).get("title")
    print("title:", title)
    print("parserWarnings:", len(warnings))
    for w in warnings:
        print("  ⚠", w)
    if status != "COMPLETE":
        print("ERROR: import did not complete within poll window.", file=sys.stderr)
        sys.exit(1)
    print("\n✓ Imported clean." if not warnings else "\n⚠ Imported with warnings.")
    sys.exit(1 if warnings else 0)


if __name__ == "__main__":
    main()
