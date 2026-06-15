"""
SCORM Cloud (Rustici) validation service.

Uploads a built SCORM package to a SCORM Cloud account via the v2 API, polls the
async import job, reports parse status + warnings, then deletes the temporary
course so validation leaves no artifacts in the account.

Credentials come from the environment (set on the Railway `web` service, or
locally) — never stored in the repo:
    RUSTICI_APP_ID, RUSTICI_SECRET_KEY
"""

import os
import time
from io import BytesIO

import httpx

BASE = os.environ.get("RUSTICI_BASE", "https://cloud.scorm.com/api/v2")


class SCORMCloudNotConfigured(Exception):
    """Raised when RUSTICI credentials are not present in the environment."""


def is_configured() -> bool:
    return bool(os.environ.get("RUSTICI_APP_ID") and os.environ.get("RUSTICI_SECRET_KEY"))


def _auth():
    app_id = os.environ.get("RUSTICI_APP_ID")
    secret = os.environ.get("RUSTICI_SECRET_KEY")
    if not app_id or not secret:
        raise SCORMCloudNotConfigured(
            "RUSTICI_APP_ID / RUSTICI_SECRET_KEY are not set on this server."
        )
    return (app_id, secret)


def validation_course_id() -> str:
    """A single, reusable course slot for validation (overridable via env).

    We import into one fixed courseId with mayCreateNewVersion=true so validation
    never grows the account's course count — important on capped/free tiers, and
    it avoids needing delete permission (which APP_NORMAL apps don't have).
    """
    return os.environ.get("RUSTICI_VALIDATION_COURSE_ID", "courseforge-validation")


def validate_package(zip_bytes: bytes, course_id: str | None = None,
                     poll_seconds: int = 90) -> dict:
    """
    Upload + import a SCORM zip on SCORM Cloud and return:
      { ok, status, title, warnings: [...], message, jobId }
    Imports into a single reusable course slot (new version each time).
    """
    auth = _auth()
    course_id = course_id or validation_course_id()

    r = httpx.post(
        f"{BASE}/courses/importJobs/upload",
        params={"courseId": course_id, "mayCreateNewVersion": "true"},
        files={"file": (f"{course_id}.zip", BytesIO(zip_bytes), "application/zip")},
        auth=auth, timeout=300,
    )
    if r.status_code >= 400:
        return {
            "ok": False, "status": "ERROR", "title": None, "warnings": [],
            "message": f"Import request failed ({r.status_code}): {r.text[:300]}",
            "jobId": None,
        }
    job_id = r.json().get("result") or course_id

    status, result, msg = None, {}, None
    deadline = time.time() + poll_seconds
    while time.time() < deadline:
        s = httpx.get(f"{BASE}/courses/importJobs/{job_id}", auth=auth, timeout=30).json()
        status = s.get("status")
        result = s.get("importResult") or {}
        msg    = s.get("message") or result.get("message")  # error text is top-level
        if status in ("COMPLETE", "ERROR"):
            break
        time.sleep(2)

    warnings = result.get("parserWarnings") or result.get("warnings") or []
    return {
        "ok": status == "COMPLETE",
        "status": status,
        "title": result.get("title"),
        "warnings": warnings,
        "message": msg if status != "COMPLETE" else None,
        "jobId": job_id,
    }
