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
from ..version import SCHEMA_VERSION, MIN_SCHEMA_VERSION, is_schema_supported

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
            f"This CourseForge speaks schema {SCHEMA_VERSION}."
        )

    if not is_schema_supported(version):
        raise ImportValidationError(
            f"Unsupported schema_version '{version}'. This CourseForge speaks "
            f"schema {SCHEMA_VERSION} and accepts {MIN_SCHEMA_VERSION}+ within the "
            f"same major version. Re-export from ForgeBlueprint, or update "
            f"CourseForge for a newer major schema."
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


def _collect_warnings(data: dict) -> list:
    """
    Non-fatal advisories surfaced after a successful seed. Catches the common
    ForgeBlueprint footgun: a structure-only export (or a hand-edited file) where
    an assessment/branch frame arrives with no content, so it imports empty.
    """
    warnings = []
    for course in data.get("courses", []):
        for module in course.get("modules", []):
            for lesson in module.get("lessons", []):
                for frame in lesson.get("frames", []):
                    name = (frame.get("frame_name") or "frame").strip()
                    ftype = frame.get("frame_type", "content")
                    if ftype == "assessment" and not frame.get("knowledge_check"):
                        warnings.append(
                            f"Frame '{name}' is an assessment but has no knowledge "
                            f"check — it imported empty. (Exported structure-only "
                            f"instead of Enriched JSON?)")
                    elif ftype == "branch" and not frame.get("branch"):
                        warnings.append(
                            f"Frame '{name}' is a branch but has no branching logic "
                            f"— it imported empty. (Exported structure-only instead "
                            f"of Enriched JSON?)")
    return warnings


def import_project(data: dict) -> tuple[Project, list]:
    """
    Main entry point. Validates then seeds.
    Returns (project, warnings_list).
    Raises ImportValidationError on validation failure.
    """
    validate_import(data)
    warnings = _collect_warnings(data)
    project = seed_project(data)
    return project, warnings


# ---------------------------------------------------------------------------
# Lossless round-trip restore — the /api/projects/<id>/export.json shape
# (project_schema.dump). Unlike the ForgeBlueprint import above, this preserves
# every frame's `content` EXACTLY (callouts, hotspots, layout, custom bounds,
# swap/links, OAM/3D/iVideo — all of it).
# ---------------------------------------------------------------------------

def is_roundtrip_export(data: dict) -> bool:
    """True if `data` is a CourseForge project export (lossless round-trip) rather
    than a ForgeBlueprint authoring payload. Prefers the exporter's tag; falls back
    to the field shape (export uses 'name'/'courses[].name' + frame 'content';
    blueprint uses 'project_name'/'course_name' and/or 'schema_version')."""
    if not isinstance(data, dict):
        return False
    if data.get('format') == 'courseforge-project':
        return True
    if data.get('project_name') or data.get('schema_version'):
        return False
    return bool(str(data.get('name') or '').strip() and isinstance(data.get('courses'), list))


def restore_project(data: dict) -> tuple[Project, list]:
    """Recreate a project from its lossless export, preserving frame content
    exactly. Regenerates every id (so a restore can't collide with the source) and
    remaps internal frame-id references — branch targets, inline data-cf-frame
    links, menu targets — to the new ids via a whole-content string replace of
    old→new UUIDs (fixed-length + random, so no false substring hits). Media
    asset_ids are kept verbatim (they reference this environment's media library)."""
    import json as _json
    if not isinstance(data, dict) or not str(data.get('name') or '').strip():
        raise ImportValidationError("Export must be a JSON object with a 'name'.")

    # Pass 1: old id -> fresh uuid for every entity in the tree.
    idmap = {}
    def remember(node):
        old = node.get('id')
        if old and old not in idmap:
            idmap[old] = str(uuid.uuid4())
    remember(data)
    for c in data.get('courses') or []:
        remember(c)
        for m in c.get('modules') or []:
            remember(m)
            for l in m.get('lessons') or []:
                remember(l)
                for f in l.get('frames') or []:
                    remember(f)

    def remap_content(content):
        if not isinstance(content, dict):
            return {"blocks": []}
        s = _json.dumps(content)
        for old, new in idmap.items():
            if old in s:
                s = s.replace(old, new)
        try:
            return _json.loads(s)
        except (ValueError, TypeError):
            return content

    tm = data.get('text_mode')
    # theme_id is a real FK to gui_themes — a cross-env import won't have that
    # theme, so keep it only if it resolves (else fall back to the default theme,
    # like a missing gui_shell). theme_overrides/forge_config are plain JSON.
    theme_id = data.get('theme_id') or None
    if theme_id:
        from ..models.theme import GUITheme
        if not GUITheme.query.get(theme_id):
            theme_id = None
    project = Project(
        id=idmap.get(data.get('id')) or str(uuid.uuid4()),
        name=str(data['name']).strip(),
        description=str(data.get('description') or '').strip(),
        gui_shell_id=(data.get('gui_shell_id') or None),
        text_mode=(tm if tm in ('auto', 'light', 'dark') else 'auto'),
        theme_id=theme_id,
        theme_overrides=(data.get('theme_overrides') if isinstance(data.get('theme_overrides'), dict) else {}),
        forge_config=(data.get('forge_config') if isinstance(data.get('forge_config'), dict) else {}),
    )
    db.session.add(project)
    for ci, c in enumerate(data.get('courses') or []):
        course = Course(id=idmap.get(c.get('id')) or str(uuid.uuid4()),
                        name=str(c.get('name') or 'Course'),
                        order_index=c.get('order_index', ci), project=project)
        db.session.add(course)
        for mi, m in enumerate(c.get('modules') or []):
            module = Module(id=idmap.get(m.get('id')) or str(uuid.uuid4()),
                            name=str(m.get('name') or 'Module'),
                            order_index=m.get('order_index', mi), course=course)
            db.session.add(module)
            for li, l in enumerate(m.get('lessons') or []):
                lesson = Lesson(id=idmap.get(l.get('id')) or str(uuid.uuid4()),
                                name=str(l.get('name') or 'Lesson'),
                                order_index=l.get('order_index', li), module=module)
                db.session.add(lesson)
                for fi, f in enumerate(l.get('frames') or []):
                    frame = Frame(id=idmap.get(f.get('id')) or str(uuid.uuid4()),
                                  name=str(f.get('name') or 'Frame'),
                                  frame_type=str(f.get('frame_type') or 'content'),
                                  order_index=f.get('order_index', fi),
                                  content=remap_content(f.get('content')),
                                  notes=str(f.get('notes') or ''),
                                  optional=bool(f.get('optional', False)),
                                  lesson=lesson)
                    db.session.add(frame)
    db.session.commit()

    warnings = []
    if not (data.get('courses') or []):
        warnings.append("Imported project has no courses.")
    return project, warnings
