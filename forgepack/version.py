"""
ForgePack version — single source of truth.

Bump rules:
  MAJOR — output format change breaking CourseForge companion pairing
  MINOR — new processing module (audio, image), new preset
  PATCH — encoding tweak, UI fix, performance improvement
"""

VERSION    = "1.2.0"
BUILD_DATE = "2026-06-15"

# Processing modules available in this version
MODULES = ["video", "audio"]  # image — future

def version_info() -> dict:
    return {
        "app":       "ForgePack",
        "version":   VERSION,
        "build":     BUILD_DATE,
        "modules":   MODULES,
    }
