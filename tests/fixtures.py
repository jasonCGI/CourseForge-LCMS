"""
Small, realistic ForgeBlueprint-shaped payloads for the importer tests.

These mirror the JSON ForgeBlueprint emits ("Export Enriched JSON") and that
`server.services.importer.import_project` consumes. They are intentionally
minimal but structurally complete so the tests exercise real validation and
seeding rather than over-mocked stubs.
"""

import copy


def _wrap_frames(frames, schema_version="1.0", project_name="Test Project"):
    """Wrap a list of frame dicts in the minimal valid course/module/lesson tree."""
    return {
        "schema_version": schema_version,
        "project_name": project_name,
        "project_description": "Imported by the P1 test suite.",
        "courses": [
            {
                "course_name": "Course One",
                "modules": [
                    {
                        "module_name": "Module One",
                        "lessons": [
                            {
                                "lesson_name": "Lesson One",
                                "frames": frames,
                            }
                        ],
                    }
                ],
            }
        ],
    }


def minimal_content_payload(schema_version="1.0"):
    """A valid payload with a single content frame carrying narration."""
    return _wrap_frames(
        [
            {
                "frame_name": "Welcome",
                "frame_type": "content",
                "narration": "Welcome to the course.",
            }
        ],
        schema_version=schema_version,
    )


def branch_payload(schema_version="1.0"):
    """A valid payload whose single frame is a branch with full branching logic."""
    return _wrap_frames(
        [
            {
                "frame_name": "Decision Point",
                "frame_type": "branch",
                "branch": {
                    "condition": "score >= 80",
                    "true_label": "Advance",
                    "false_label": "Remediate",
                    # ForgeBlueprint sometimes stamps these; the importer must
                    # discard them (editor-assigned UUIDs) — see the test.
                    "true_frame_id": "blueprint-uuid-true",
                    "false_frame_id": "blueprint-uuid-false",
                },
            }
        ],
        schema_version=schema_version,
    )


def assessment_payload(with_knowledge_check=True, schema_version="1.0"):
    """A valid payload with an assessment frame.

    When `with_knowledge_check` is False the frame is structure-only — the
    content-loss footgun the importer's warning guard is meant to catch.
    """
    frame = {
        "frame_name": "Quiz 1",
        "frame_type": "assessment",
    }
    if with_knowledge_check:
        frame["knowledge_check"] = {
            "question": "What is 2 + 2?",
            "choices": ["3", "4", "5"],
            "correct_index": 1,
            "feedback_correct": "Correct!",
            "feedback_incorrect": "Try again.",
        }
    return _wrap_frames([frame], schema_version=schema_version)


def clone(payload):
    """Deep-copy a payload so a test can mutate it without affecting others."""
    return copy.deepcopy(payload)
