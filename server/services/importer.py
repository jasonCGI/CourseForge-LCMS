"""
CourseForge JSON Import Service
Validates incoming JSON and seeds Project → Course → Module → Lesson → Frame
into PostgreSQL. Idempotent on project name: re-importing the same project_name
creates a NEW project (does not overwrite). Caller can handle dedup if needed.
"""

import uuid
from datetime import datetime
from ..extensions import db
from ..models.project import Project, Course, Module, Lesson, Frame
from ..version import SUPPORTED_SCHEMA_VERSIONS, MIN_SCHEMA_VERSION

SUPPORTED_SCHEMA_VERSION = "1.0"

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class ImportValidationError(Exception):
    """Raised when the incoming JSON fails schema validation."""
    pass


def validate_import(data: dict) -> None:
    """
    Validate the top-level import payload.
    Raises ImportValidationError with a descriptive message on failure.
    """
    if not isinstance(data, dict):
        raise ImportValidationError("Payload must be a JSON object.")

    version = data.get("schema_version")

    if not version:
        raise ImportValidationError(
            "'schema_version' is required. "
            f"Expected one of: {SUPPORTED_SCHEMA_VERSIONS}"
        )

    if version not in SUPPORTED_SCHEMA_VERSIONS:
        raise ImportValidationError(
            f"Unsupported schema_version '{version}'. "
            f"Supported versions: {SUPPORTED_SCHEMA_VERSIONS}. "
            f"Please export from ForgeBlueprint v{MIN_SCHEMA_VERSION}+ "
            f"or update your CourseForge instance."
        )

    # Future: migration handlers per version
    # if version == "1.1":
    #     data = _migrate_1_1_to_1_0(data)

    if not (data.get("project_name") or "").strip():
        raise ImportValidationError("'project_name' is required and cannot be empty.")

    courses = data.get("courses")
    if not isinstance(courses, list) or len(courses) == 0:
        raise ImportValidationError("'courses' must be a non-empty array.")

    for ci, course in enumerate(courses):
        _validate_course(course, ci)


def _validate_course(course: dict, ci: int) -> None:
    prefix = f"courses[{ci}]"
    if not (course.get("course_name") or "").strip():
        raise ImportValidationError(f"{prefix}: 'course_name' is required.")

    modules = course.get("modules")
    if not isinstance(modules, list) or len(modules) == 0:
        raise ImportValidationError(f"{prefix}: 'modules' must be a non-empty array.")

    for mi, module in enumerate(modules):
        _validate_module(module, ci, mi)


def _validate_module(module: dict, ci: int, mi: int) -> None:
    prefix = f"courses[{ci}].modules[{mi}]"
    if not (module.get("module_name") or "").strip():
        raise ImportValidationError(f"{prefix}: 'module_name' is required.")

    lessons = module.get("lessons")
    if not isinstance(lessons, list) or len(lessons) == 0:
        raise ImportValidationError(f"{prefix}: 'lessons' must be a non-empty array.")

    for li, lesson in enumerate(lessons):
        _validate_lesson(lesson, ci, mi, li)


def _validate_lesson(lesson: dict, ci: int, mi: int, li: int) -> None:
    prefix = f"courses[{ci}].modules[{mi}].lessons[{li}]"
    if not (lesson.get("lesson_name") or "").strip():
        raise ImportValidationError(f"{prefix}: 'lesson_name' is required.")

    frames = lesson.get("frames")
    if not isinstance(frames, list) or len(frames) == 0:
        raise ImportValidationError(f"{prefix}: 'frames' must be a non-empty array.")

    for fi, frame in enumerate(frames):
        _validate_frame(frame, ci, mi, li, fi)


def _validate_frame(frame: dict, ci: int, mi: int, li: int, fi: int) -> None:
    prefix = f"courses[{ci}].modules[{mi}].lessons[{li}].frames[{fi}]"
    if not (frame.get("frame_name") or "").strip():
        raise ImportValidationError(f"{prefix}: 'frame_name' is required.")

    valid_types = {"content", "assessment", "branch"}
    frame_type = frame.get("frame_type", "content")
    if frame_type not in valid_types:
        raise ImportValidationError(
            f"{prefix}: 'frame_type' must be one of {valid_types}, got '{frame_type}'."
        )

    if frame_type == "assessment" and frame.get("knowledge_check") is not None:
        kc = frame["knowledge_check"]
        required_kc_keys = {"question", "choices", "correct_index", "feedback_correct", "feedback_incorrect"}
        missing = required_kc_keys - set(kc.keys())
        if missing:
            raise ImportValidationError(f"{prefix}.knowledge_check: missing keys {missing}.")
        if not isinstance(kc.get("choices"), list) or len(kc["choices"]) < 2:
            raise ImportValidationError(f"{prefix}.knowledge_check: 'choices' must have at least 2 items.")


# ---------------------------------------------------------------------------
# DB seeding
# ---------------------------------------------------------------------------

def build_frame_content(frame_data: dict) -> dict:
    """
    Convert raw JSON frame data into the JSONB block structure
    used by the frame editor.
    """
    blocks = []

    # Text / narration block
    narration = frame_data.get("narration")
    if narration:
        blocks.append({
            "id": str(uuid.uuid4()),
            "type": "text",
            "data": {
                "body": "",
                "narrator_script": narration
            }
        })

    # Media placeholder blocks
    for media_item in (frame_data.get("media") or []):
        blocks.append({
            "id": str(uuid.uuid4()),
            "type": "media",
            "data": {
                "kind": media_item.get("kind", "image"),
                "placeholder_label": media_item.get("placeholder_label", ""),
                "asset_id": None,   # populated when media is uploaded
                "caption": media_item.get("caption", "")
            }
        })

    # Knowledge check block
    kc = frame_data.get("knowledge_check")
    if kc:
        blocks.append({
            "id": str(uuid.uuid4()),
            "type": "quiz",
            "data": {
                "question": kc.get("question", ""),
                "choices": kc.get("choices", []),
                "correct_index": kc.get("correct_index", 0),
                "feedback_correct": kc.get("feedback_correct", ""),
                "feedback_incorrect": kc.get("feedback_incorrect", "")
            }
        })

    # Branch block
    branch = frame_data.get("branch")
    if branch:
        blocks.append({
            "id": str(uuid.uuid4()),
            "type": "branch",
            "data": {
                "condition": branch.get("condition", ""),
                "true_frame_id": None,
                "false_frame_id": None,
                "true_label": branch.get("true_label", "Yes"),
                "false_label": branch.get("false_label", "No")
            }
        })

    # WCN blocks (Warning / Caution / Note) — from ForgeBlueprint enriched JSON
    for wcn_item in (frame_data.get("wcn") or []):
        blocks.append({
            "id": str(uuid.uuid4()),
            "type": "wcn",
            "data": {
                "wcn_type":  wcn_item.get("type", "note"),
                "title":     wcn_item.get("title", ""),
                "text":      wcn_item.get("text", ""),
                "modal":     wcn_item.get("modal", False),
                "ack_label": wcn_item.get("ack_label", "I understand — proceed"),
            }
        })

    return {"blocks": blocks}


def seed_project(data: dict) -> Project:
    """
    Seed the full hierarchy into PostgreSQL.
    Returns the created Project instance.
    Must be called within a Flask app context.
    """
    project = Project(
        name=data["project_name"].strip(),
        description=(data.get("project_description") or "").strip()
    )
    db.session.add(project)
    db.session.flush()  # get project.id before children

    for ci, course_data in enumerate(data["courses"]):
        course = Course(
            project_id=project.id,
            name=course_data["course_name"].strip(),
            order_index=ci
        )
        db.session.add(course)
        db.session.flush()

        for mi, module_data in enumerate(course_data["modules"]):
            module = Module(
                course_id=course.id,
                name=module_data["module_name"].strip(),
                order_index=mi
            )
            db.session.add(module)
            db.session.flush()

            for li, lesson_data in enumerate(module_data["lessons"]):
                lesson = Lesson(
                    module_id=module.id,
                    name=lesson_data["lesson_name"].strip(),
                    order_index=li
                )
                db.session.add(lesson)
                db.session.flush()

                for fi, frame_data in enumerate(lesson_data["frames"]):
                    frame = Frame(
                        lesson_id=lesson.id,
                        name=frame_data["frame_name"].strip(),
                        frame_type=frame_data.get("frame_type", "content"),
                        order_index=fi,
                        content=build_frame_content(frame_data)
                    )
                    db.session.add(frame)

    db.session.commit()
    return project


def import_project(data: dict) -> tuple[Project, list]:
    """
    Main entry point. Validates then seeds.
    Returns (project, warnings_list).
    Raises ImportValidationError on validation failure.
    """
    warnings = []
    validate_import(data)
    project = seed_project(data)
    return project, warnings
