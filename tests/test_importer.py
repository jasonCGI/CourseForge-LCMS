"""
Tests for `server.services.importer` — the ForgeBlueprint -> CourseForge import.

Covers: the happy path through validation + DB seeding, the by-design branch
frame_id stripping, the schema-version gate inside the import path, and the
content-loss warning guard. These exercise the real SQLAlchemy models against
an in-memory SQLite DB (see conftest), not mocks.
"""

import pytest

from server.services.importer import (
    ImportValidationError,
    build_frame_content,
    import_project,
    validate_import,
)

from .fixtures import (
    assessment_payload,
    branch_payload,
    clone,
    minimal_content_payload,
)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

@pytest.mark.db
def test_minimal_content_payload_imports_into_expected_tree(db_session):
    payload = minimal_content_payload()
    project, warnings = import_project(payload)

    assert project.id is not None
    assert project.name == "Test Project"
    assert warnings == []

    # Full hierarchy was seeded.
    assert len(project.courses) == 1
    course = project.courses[0]
    assert course.name == "Course One"
    module = course.modules[0]
    lesson = module.lessons[0]
    assert len(lesson.frames) == 1

    frame = lesson.frames[0]
    assert frame.name == "Welcome"
    assert frame.frame_type == "content"
    assert frame.order_index == 0

    # Narration becomes a single text block with the narrator script carried.
    blocks = frame.content["blocks"]
    assert len(blocks) == 1
    assert blocks[0]["type"] == "text"
    assert blocks[0]["data"]["narrator_script"] == "Welcome to the course."


@pytest.mark.db
def test_reimport_creates_a_new_distinct_project(db_session):
    # Documented behavior: re-importing the same project_name does NOT overwrite.
    p1, _ = import_project(clone(minimal_content_payload()))
    p2, _ = import_project(clone(minimal_content_payload()))
    assert p1.id != p2.id


# ---------------------------------------------------------------------------
# Branch handling — BY DESIGN, not data loss
# ---------------------------------------------------------------------------

@pytest.mark.db
def test_branch_frame_ids_are_stripped_but_condition_and_labels_preserved(db_session):
    """
    true_frame_id / false_frame_id are intentionally set to None on import
    (importer.py ~184-185) because they are editor-assigned frame UUIDs, not
    Blueprint data. The condition and the two labels MUST survive.

    This test encodes the by-design behavior: a future regression that "fixes"
    it by carrying Blueprint's UUIDs through will fail here.
    """
    project, warnings = import_project(branch_payload())
    frame = project.courses[0].modules[0].lessons[0].frames[0]

    branch_blocks = [b for b in frame.content["blocks"] if b["type"] == "branch"]
    assert len(branch_blocks) == 1
    data = branch_blocks[0]["data"]

    # Stripped by design — even though the payload supplied UUIDs.
    assert data["true_frame_id"] is None
    assert data["false_frame_id"] is None

    # Preserved.
    assert data["condition"] == "score >= 80"
    assert data["true_label"] == "Advance"
    assert data["false_label"] == "Remediate"


def test_build_frame_content_branch_defaults_labels():
    # Unit-level: no app context needed. Defaults Yes/No when labels absent.
    content = build_frame_content({"branch": {"condition": "x > 1"}})
    branch = [b for b in content["blocks"] if b["type"] == "branch"][0]
    assert branch["data"]["true_label"] == "Yes"
    assert branch["data"]["false_label"] == "No"
    assert branch["data"]["true_frame_id"] is None
    assert branch["data"]["false_frame_id"] is None


# ---------------------------------------------------------------------------
# Schema gate inside the import path
# ---------------------------------------------------------------------------

def test_missing_schema_version_is_rejected():
    payload = clone(minimal_content_payload())
    del payload["schema_version"]
    with pytest.raises(ImportValidationError, match="schema_version"):
        validate_import(payload)


def test_wrong_major_schema_version_is_rejected():
    payload = clone(minimal_content_payload())
    payload["schema_version"] = "2.0"
    with pytest.raises(ImportValidationError, match="Unsupported schema_version"):
        validate_import(payload)


@pytest.mark.db
def test_wrong_major_rejected_before_any_db_write(db_session):
    from server.models.project import Project

    payload = clone(minimal_content_payload())
    payload["schema_version"] = "3.1"
    before = Project.query.count()
    with pytest.raises(ImportValidationError):
        import_project(payload)
    # Validation happens first — nothing was seeded.
    assert Project.query.count() == before


def test_malformed_schema_version_is_rejected():
    payload = clone(minimal_content_payload())
    payload["schema_version"] = "not-a-version"
    with pytest.raises(ImportValidationError, match="Unsupported schema_version"):
        validate_import(payload)


# ---------------------------------------------------------------------------
# Structural validation
# ---------------------------------------------------------------------------

def test_empty_project_name_rejected():
    payload = clone(minimal_content_payload())
    payload["project_name"] = "   "
    with pytest.raises(ImportValidationError, match="project_name"):
        validate_import(payload)


def test_empty_courses_rejected():
    payload = clone(minimal_content_payload())
    payload["courses"] = []
    with pytest.raises(ImportValidationError, match="courses"):
        validate_import(payload)


def test_invalid_frame_type_rejected():
    payload = clone(minimal_content_payload())
    payload["courses"][0]["modules"][0]["lessons"][0]["frames"][0]["frame_type"] = "bogus"
    with pytest.raises(ImportValidationError, match="frame_type"):
        validate_import(payload)


# ---------------------------------------------------------------------------
# Content-loss guard (commit 465e673)
# ---------------------------------------------------------------------------

@pytest.mark.db
def test_structure_only_assessment_warns_but_still_imports(db_session):
    """
    The guard added in 465e673: an assessment frame with no knowledge_check
    (a structure-only / hand-edited export) imports successfully but surfaces a
    non-fatal warning instead of silently shipping an empty frame.
    """
    project, warnings = import_project(assessment_payload(with_knowledge_check=False))
    assert project.id is not None
    assert len(warnings) == 1
    assert "assessment" in warnings[0].lower()
    assert "Quiz 1" in warnings[0]


@pytest.mark.db
def test_structure_only_branch_warns(db_session):
    payload = assessment_payload()  # base shape
    # Replace the frame with a branch frame that has NO branch logic.
    payload["courses"][0]["modules"][0]["lessons"][0]["frames"] = [
        {"frame_name": "Empty Branch", "frame_type": "branch"}
    ]
    project, warnings = import_project(payload)
    assert project.id is not None
    assert len(warnings) == 1
    assert "branch" in warnings[0].lower()
    assert "Empty Branch" in warnings[0]


@pytest.mark.db
def test_complete_assessment_produces_no_warning(db_session):
    project, warnings = import_project(assessment_payload(with_knowledge_check=True))
    assert warnings == []
    frame = project.courses[0].modules[0].lessons[0].frames[0]
    quiz = [b for b in frame.content["blocks"] if b["type"] == "quiz"][0]
    assert quiz["data"]["question"] == "What is 2 + 2?"
    assert quiz["data"]["correct_index"] == 1
