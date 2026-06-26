"""
ForgeAgent — Stage 1 server-side handler.

Turns a natural-language prompt into a VALIDATED CourseForge frame JSON via a
single forced Anthropic tool call (`emit_frame`), with one repair round-trip if
validation fails. No UI in this stage — exercise via:

    POST /api/forgeagent/generate-frame
    { "prompt": "<nl description>", "layout": "full|text-left|text-right" }

The Anthropic client is constructed LAZILY inside the handler so the app imports
and boots without ANTHROPIC_API_KEY; the endpoint returns 503 when unconfigured.

Env:
    ANTHROPIC_API_KEY   — required at request time (503 if missing)
    FORGEAGENT_MODEL    — model id (default 'claude-sonnet-4-6')
"""

import os
import json
import uuid
import functools

from flask import Blueprint, request, jsonify

from ..services.forgeagent_validate import validate_frame

forgeagent_bp = Blueprint('forgeagent', __name__)

DEFAULT_MODEL = 'claude-sonnet-4-6'
MAX_TOKENS = 8000


# ── Schema-doc loader (cached once) ───────────────────────────────────────────

@functools.lru_cache(maxsize=1)
def _load_schema_doc():
    """Load docs/courseforge-schema.md once and cache the string. It is injected
    as system context so the model authors against the live contract."""
    here = os.path.dirname(os.path.abspath(__file__))
    # server/routes/ -> repo root is two levels up.
    root = os.path.abspath(os.path.join(here, '..', '..'))
    path = os.path.join(root, 'docs', 'courseforge-schema.md')
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


# ── emit_frame tool schema (the frame ENVELOPE; data is permissive) ───────────
# The tool input IS the frame JSON. Per-type required fields are enforced by the
# validator, NOT the JSON schema — `data` is a permissive object here.

EMIT_FRAME_TOOL = {
    'name': 'emit_frame',
    'description': (
        'Emit exactly ONE CourseForge frame. The tool input IS the frame JSON '
        '(envelope). Per-block-type required fields are validated downstream.'
    ),
    'input_schema': {
        'type': 'object',
        'properties': {
            'name': {'type': 'string', 'minLength': 1,
                     'description': 'Frame title (non-empty).'},
            'frame_type': {'type': 'string', 'enum': ['content', 'menu']},
            'lesson': {'type': 'string',
                       'description': 'Readable lesson name for authoring placement.'},
            'content': {
                'type': 'object',
                'properties': {
                    'layout': {'type': 'string',
                               'enum': ['full', 'text-left', 'text-right']},
                    'blocks': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'id': {'type': 'string'},
                                'type': {
                                    'type': 'string',
                                    'enum': ['text', 'media', 'quiz', 'hotspot',
                                             'branch', 'wcn', 'oam', 'ivideo',
                                             'model3d', 'callout'],
                                },
                                'data': {'type': 'object'},
                            },
                            'required': ['type', 'data'],
                        },
                    },
                    'menu': {
                        'type': 'object',
                        'description': 'For menu frames: { title, items[] }.',
                    },
                },
                'required': ['layout'],
            },
        },
        'required': ['name', 'frame_type', 'content'],
    },
}


SYSTEM_INSTRUCTION = (
    "You are ForgeAgent, a CourseForge content authoring agent.\n"
    "Above is the CourseForge Schema Document v0.1.0 — it is the CONTRACT for your "
    "output and you must satisfy every rule in it.\n\n"
    "Emit EXACTLY ONE frame by calling the `emit_frame` tool. Rules:\n"
    "- frame_type is 'content' or 'menu' ONLY.\n"
    "- For asset id and target id fields (asset_id, image_id, oam_asset_id, "
    "model_asset_id, video_asset_id, clip_asset_id, branch *_frame_id, menu "
    "target_id), emit null — these are wired by the author later. Use a "
    "`__SWAP_n__`-style placeholder (e.g. __SWAP_A__) ONLY for inline image-swap "
    "text anchors inside a text body.\n"
    "- Respect the layout exclusivity caps (§3.3): 'full' => at most ONE zone-filler "
    "(one text/quiz OR one media-group block); 'text-left'/'text-right' => at most "
    "ONE text/quiz AND at most ONE media-group block. Auxiliary blocks "
    "(wcn/hotspot/branch/audio/callout) are unlimited.\n"
    "- ALWAYS set human-meaningful fields: alt_text (required for images), caption, "
    "quiz question/choices/feedback, wcn text, callout text, hotspot region "
    "labels, menu labels/title, branch condition/labels.\n"
    "- emit bounds: null; do not bake in a literal body-text color for shelled output.\n"
    "- Do NOT emit 'gui' blocks (project-level)."
)


def _build_request(prompt, layout):
    """Construct the well-formed Anthropic request kwargs (forced single tool)."""
    schema_doc = _load_schema_doc()
    system = (
        schema_doc
        + "\n\n---\n\n"
        + SYSTEM_INSTRUCTION
    )
    user = prompt
    if layout:
        user = f"{prompt}\n\n(Preferred layout: {layout})"
    return {
        'model': os.environ.get('FORGEAGENT_MODEL', DEFAULT_MODEL),
        'max_tokens': MAX_TOKENS,
        'system': system,
        'tools': [EMIT_FRAME_TOOL],
        'tool_choice': {'type': 'tool', 'name': 'emit_frame'},
        'messages': [{'role': 'user', 'content': user}],
    }


def _extract_frame(message):
    """Pull the emit_frame tool input (the frame dict) out of an Anthropic
    response message."""
    for block in message.content:
        if getattr(block, 'type', None) == 'tool_use' and block.name == 'emit_frame':
            return dict(block.input)
    return None


def _ensure_block_ids(frame):
    """Post-process: every block gets a UUIDv4 id (fill any missing). Frame id /
    order_index / lesson_id are NOT assigned here (Stage 2 ingest does that).
    Returns the number of ids filled in."""
    filled = 0
    content = frame.get('content')
    if isinstance(content, dict):
        for block in (content.get('blocks') or []):
            if isinstance(block, dict) and not block.get('id'):
                block['id'] = str(uuid.uuid4())
                filled += 1
        # Menu item ids too (they are crypto.randomUUID() in the editor).
        menu = content.get('menu')
        if isinstance(menu, dict):
            for item in (menu.get('items') or []):
                if isinstance(item, dict) and not item.get('id'):
                    item['id'] = str(uuid.uuid4())
                    filled += 1
    return filled


def _collect_warnings(frame):
    """Non-fatal notes for the author (e.g. unfilled asset slots)."""
    warnings = []
    placeholders = 0
    nulls = 0
    content = frame.get('content') or {}
    asset_fields = (
        'asset_id', 'image_id', 'oam_asset_id', 'model_asset_id',
        'video_asset_id', 'clip_asset_id',
    )
    for block in (content.get('blocks') or []):
        data = (block or {}).get('data') or {}
        for f in asset_fields:
            if f in data:
                v = data[f]
                if v is None:
                    nulls += 1
                elif isinstance(v, str) and v.startswith('__') and v.endswith('__'):
                    placeholders += 1
    if nulls:
        warnings.append(f"{nulls} asset id field(s) are null — author must upload/wire assets.")
    if placeholders:
        warnings.append(f"{placeholders} placeholder asset id(s) to fill before publishing.")
    # Menu target wiring.
    menu = content.get('menu') or {}
    unwired = sum(
        1 for it in (menu.get('items') or [])
        if not (it or {}).get('target_id')
    )
    if unwired:
        warnings.append(f"{unwired} menu item target(s) unwired — author must pick targets.")
    return warnings


@forgeagent_bp.post('/api/forgeagent/generate-frame')
def generate_frame():
    body = request.get_json(silent=True) or {}
    prompt = body.get('prompt')
    layout = body.get('layout')

    if not isinstance(prompt, str) or prompt.strip() == '':
        return jsonify({'error': "Request body requires a non-empty 'prompt' string."}), 400
    if layout is not None and layout not in ('full', 'text-left', 'text-right'):
        return jsonify({'error': "Optional 'layout' must be full|text-left|text-right."}), 400

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({
            'error': 'ForgeAgent is not configured: ANTHROPIC_API_KEY is not set on '
                     'this server.',
        }), 503

    # Lazy import + client construction (so the app boots without the SDK/key).
    try:
        import anthropic
    except ImportError:
        return jsonify({
            'error': "ForgeAgent dependency 'anthropic' is not installed.",
        }), 503

    client = anthropic.Anthropic(api_key=api_key)
    req = _build_request(prompt, layout)

    try:
        message = client.messages.create(**req)
    except Exception as e:  # noqa: BLE001 — surface any SDK/transport error cleanly
        return jsonify({'error': f'Claude API call failed: {e}'}), 502

    frame = _extract_frame(message)
    if frame is None:
        return jsonify({'error': 'Model did not emit a frame via emit_frame.'}), 502

    errors = validate_frame(frame)

    # ── One repair round-trip if invalid ──────────────────────────────────────
    if errors:
        repair_messages = [
            {'role': 'user', 'content': req['messages'][0]['content']},
            {'role': 'assistant', 'content': message.content},
            {'role': 'user', 'content': (
                "The frame you emitted failed validation against the schema. "
                "Fix ALL of these problems and call `emit_frame` again with a "
                "corrected frame:\n\n- " + "\n- ".join(errors)
            )},
        ]
        repair_req = dict(req)
        repair_req['messages'] = repair_messages
        try:
            message2 = client.messages.create(**repair_req)
        except Exception as e:  # noqa: BLE001
            return jsonify({'error': f'Claude repair call failed: {e}'}), 502

        frame2 = _extract_frame(message2)
        if frame2 is not None:
            frame = frame2
            errors = validate_frame(frame)

    if errors:
        # Still invalid after one repair — 422 with the errors + last attempt.
        _ensure_block_ids(frame)  # best-effort id fill on the returned attempt
        return jsonify({'errors': errors, 'attempt': frame}), 422

    # ── Success ───────────────────────────────────────────────────────────────
    _ensure_block_ids(frame)
    warnings = _collect_warnings(frame)
    return jsonify({'frame': frame, 'warnings': warnings}), 200
