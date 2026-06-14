"""
CourseForge Excel → JSON Converter
Usage: python tools/excel_to_json.py input.xlsx output.json

Expected Excel structure (single sheet named "Structure" or first sheet):
  Column A: Project Name    (row 1 only, merged or repeated)
  Column B: Course Name
  Column C: Module Name
  Column D: Lesson Name
  Column E: Frame Name
  Column F: Frame Type      (content | assessment | branch — default: content)
  Column G: Narration
  Column H: Media Kind      (image | video | audio — optional)
  Column I: Media Label     (placeholder label — optional)
  Column J: KC Question     (optional — only for assessment frames)
  Column K: KC Choice 1
  Column L: KC Choice 2
  Column M: KC Choice 3
  Column N: KC Choice 4
  Column O: KC Correct      (1-based index of correct choice)
  Column P: KC Feedback Correct
  Column Q: KC Feedback Incorrect
"""

import sys
import json
import openpyxl
from pathlib import Path


def col(row, idx: int, default=""):
    """Safe column reader — returns stripped string or default."""
    try:
        val = row[idx]
        return str(val).strip() if val is not None else default
    except IndexError:
        return default


def parse_excel(path: Path) -> dict:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(min_row=2, values_only=True))  # skip header row
    if not rows:
        raise ValueError("No data rows found in spreadsheet.")

    # Project name from first data row col A
    project_name = str(rows[0][0]).strip() if rows[0][0] else "Untitled Project"

    hierarchy = {}  # course → module → lesson → [frames]

    for raw_row in rows:
        course_name  = col(raw_row, 1)
        module_name  = col(raw_row, 2)
        lesson_name  = col(raw_row, 3)
        frame_name   = col(raw_row, 4)
        frame_type   = col(raw_row, 5, "content").lower() or "content"
        narration    = col(raw_row, 6) or None
        media_kind   = col(raw_row, 7)
        media_label  = col(raw_row, 8)
        kc_question  = col(raw_row, 9)
        kc_choice1   = col(raw_row, 10)
        kc_choice2   = col(raw_row, 11)
        kc_choice3   = col(raw_row, 12)
        kc_choice4   = col(raw_row, 13)
        kc_correct   = col(raw_row, 14, "1")
        kc_fb_ok     = col(raw_row, 15)
        kc_fb_bad    = col(raw_row, 16)

        if not frame_name:
            continue  # skip empty rows

        # Build frame object
        media = []
        if media_kind and media_label:
            media.append({
                "kind": media_kind,
                "placeholder_label": media_label,
                "caption": ""
            })

        knowledge_check = None
        if frame_type == "assessment" and kc_question:
            choices = [c for c in [kc_choice1, kc_choice2, kc_choice3, kc_choice4] if c]
            try:
                correct_index = int(kc_correct) - 1  # convert 1-based to 0-based
            except ValueError:
                correct_index = 0
            knowledge_check = {
                "question": kc_question,
                "choices": choices,
                "correct_index": correct_index,
                "feedback_correct": kc_fb_ok,
                "feedback_incorrect": kc_fb_bad
            }

        frame = {
            "frame_name": frame_name,
            "frame_type": frame_type,
            "narration": narration,
            "media": media,
            "knowledge_check": knowledge_check,
            "branch": None
        }

        # Build hierarchy dict
        if course_name not in hierarchy:
            hierarchy[course_name] = {}
        if module_name not in hierarchy[course_name]:
            hierarchy[course_name][module_name] = {}
        if lesson_name not in hierarchy[course_name][module_name]:
            hierarchy[course_name][module_name][lesson_name] = []

        hierarchy[course_name][module_name][lesson_name].append(frame)

    # Convert nested dict to canonical JSON structure
    courses = []
    for course_name, modules in hierarchy.items():
        course_obj = {
            "course_name": course_name,
            "modules": []
        }
        for module_name, lessons in modules.items():
            module_obj = {
                "module_name": module_name,
                "lessons": []
            }
            for lesson_name, frames in lessons.items():
                module_obj["lessons"].append({
                    "lesson_name": lesson_name,
                    "frames": frames
                })
            course_obj["modules"].append(module_obj)
        courses.append(course_obj)

    return {
        "schema_version": "1.0",
        "project_name": project_name,
        "project_description": "",
        "courses": courses
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: python tools/excel_to_json.py input.xlsx output.json")
        sys.exit(1)

    input_path  = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    if not input_path.exists():
        print(f"Error: file not found: {input_path}")
        sys.exit(1)

    print(f"Reading: {input_path}")
    data = parse_excel(input_path)

    output_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"Written: {output_path}")

    # Print summary
    courses = len(data['courses'])
    modules = sum(len(c['modules']) for c in data['courses'])
    lessons = sum(len(m['lessons']) for c in data['courses'] for m in c['modules'])
    frames  = sum(len(l['frames']) for c in data['courses'] for m in c['modules'] for l in m['lessons'])
    print(f"Summary: {courses} courses · {modules} modules · {lessons} lessons · {frames} frames")


if __name__ == '__main__':
    main()
