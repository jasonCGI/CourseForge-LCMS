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

# Supported schema versions for import
# Add older versions here when schema changes — importer.py handles migration
SUPPORTED_SCHEMA_VERSIONS = ["1.0"]

# Minimum compatible schema version
MIN_SCHEMA_VERSION = "1.0"


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
