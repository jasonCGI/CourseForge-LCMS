"""
Newer-minor (1.1) schema behavior the range gate now permits.

Commit ee9fb9b widened the import gate from exact-match to a same-major range,
so a `1.1` payload is now ACCEPTED. The audit flagged the trade-off: unknown
fields introduced by a newer minor are silently ignored (there is no migration
handler — the placeholder at importer.py ~49-51 is commented out).

These tests:
  1. Pin the *current* behavior (1.1 imports, known fields work), so a
     regression that re-tightens the gate to exact-match is caught.
  2. Document, via xfail, the desired-but-unimplemented behavior: a newer-minor
     payload carrying an unknown field should not vanish without a trace.
"""

import pytest

from server.services.importer import import_project, validate_import

from .fixtures import clone, minimal_content_payload


def test_newer_minor_passes_validation():
    # Range gate accepts 1.1 within the same major. (No DB needed — validate only.)
    payload = clone(minimal_content_payload(schema_version="1.1"))
    validate_import(payload)  # must not raise


@pytest.mark.db
def test_newer_minor_imports_known_fields_normally(db_session):
    payload = clone(minimal_content_payload(schema_version="1.1"))
    project, warnings = import_project(payload)
    assert project.id is not None
    frame = project.courses[0].modules[0].lessons[0].frames[0]
    # Known fields still seed correctly under the newer minor.
    assert frame.content["blocks"][0]["data"]["narrator_script"] == "Welcome to the course."


@pytest.mark.db
def test_unknown_minor_field_is_currently_silently_dropped(db_session):
    """
    DOCUMENTED CURRENT BEHAVIOR (not a bug to fix here): a hypothetical 1.1
    field on a frame is ignored by build_frame_content — it produces no block
    and no warning. We assert the silent-drop so the behavior is explicit and
    visible in the suite. The xfail below tracks the desired improvement.
    """
    payload = clone(minimal_content_payload(schema_version="1.1"))
    frame = payload["courses"][0]["modules"][0]["lessons"][0]["frames"][0]
    # A field a future 1.1 might add. build_frame_content only knows narration,
    # media, knowledge_check, branch, wcn — anything else is dropped.
    frame["interactive_sim"] = {"kind": "drag-drop", "items": ["a", "b"]}

    project, warnings = import_project(payload)
    blocks = project.courses[0].modules[0].lessons[0].frames[0].content["blocks"]
    block_types = {b["type"] for b in blocks}

    # The unknown field produced no block and no warning — silently dropped.
    assert "interactive_sim" not in block_types
    assert warnings == []


@pytest.mark.db
@pytest.mark.xfail(
    reason="DESIRED, UNIMPLEMENTED: a newer-minor payload carrying unknown "
    "fields should surface a warning (or be migrated) rather than silently "
    "dropping content. No migration handler exists yet (importer.py ~49-51 is "
    "a commented-out placeholder). Audit-flagged; tracked here, not fixed.",
    strict=True,
)
def test_newer_minor_unknown_field_should_warn(db_session):
    payload = clone(minimal_content_payload(schema_version="1.1"))
    frame = payload["courses"][0]["modules"][0]["lessons"][0]["frames"][0]
    frame["interactive_sim"] = {"kind": "drag-drop", "items": ["a", "b"]}

    _project, warnings = import_project(payload)
    # We WANT some signal that an unrecognized 1.1 field was dropped.
    assert any("interactive_sim" in w or "unknown" in w.lower() for w in warnings)
