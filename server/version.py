"""
CourseForge version — single source of truth.
Import this anywhere version info is needed.

Keep in sync with client/src/version.js (manual until Sprint 7 build step).

Bump rules:
  MAJOR — JSON schema breaking change, DB migration required
  MINOR — new block type, new export format, new API endpoint
  PATCH — bug fix, UI change, performance improvement
"""

VERSION       = "1.0.0"
SCHEMA_VERSION = "1.0"
BUILD_DATE    = "2026-06-15"

# Supported schema versions for import (display/info only).
# The actual import gate is is_schema_supported() below, which accepts a RANGE
# rather than this exact list — so an additive MINOR bump on either side
# (Blueprint export vs CourseForge import) doesn't reject every file.
SUPPORTED_SCHEMA_VERSIONS = ["1.0"]

# Minimum compatible schema version
MIN_SCHEMA_VERSION = "1.0"


def _parse_schema(v):
    """'1.0' -> (1, 0). Tolerant of a patch suffix; bad input -> None."""
    try:
        parts = str(v).strip().split(".")
        return (int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)
    except (ValueError, IndexError, AttributeError):
        return None


def is_schema_supported(version) -> bool:
    """
    Accept any schema in the CURRENT MAJOR line at or above MIN_SCHEMA_VERSION.

    This hardens against version drift: Blueprint stamps schema_version and
    CourseForge gates on it from two independently-edited constants. Exact-match
    meant the moment either side bumped a minor, 100% of imports 422'd. A minor
    bump is additive/backward-compatible (new block types are stored free-form
    and unknown fields are ignored), so accepting the whole major-and-up range
    is safe; a different MAJOR is a breaking change and is rejected.
    """
    got = _parse_schema(version)
    low = _parse_schema(MIN_SCHEMA_VERSION)
    cur = _parse_schema(SCHEMA_VERSION)
    if got is None or low is None or cur is None:
        return False
    return got[0] == cur[0] and got >= low


def version_info() -> dict:
    return {
        "app":            "CourseForge",
        "version":        VERSION,
        "schema":         SCHEMA_VERSION,
        "build":          BUILD_DATE,
        "scorm12":        "1.2",
        "scorm2004":      "2004 3rd Edition",
        "supported_schemas": SUPPORTED_SCHEMA_VERSIONS,
    }
