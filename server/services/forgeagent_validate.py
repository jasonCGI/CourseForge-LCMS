"""
ForgeAgent — server-side frame validator (Stage 1).

Validates a single ForgeAgent-generated frame dict against the CourseForge Schema
Document v0.1.0 (docs/courseforge-schema.md). Returns a list of human-readable
error strings; an empty list means the frame is valid.

This is a faithful Python port of the client-side exclusivity rules in
`client/src/store/editorStore.js` (`PRIMARY_TYPES` / `MEDIA_TYPES` /
`AUXILIARY_TYPES` / `isZoneMedia` / `resolveExclusivity`) plus the per-type
required-field rules derived from §4 (block catalog) of the schema doc.

Asset/target id fields are allowed to be null or a `__UPPER__`-style placeholder
token (§5) — the validator only checks that human-meaningful fields and structural
shapes are present, NOT that real asset ids exist.
"""

# ── Content groups (PORT of editorStore.js §3.1) ──────────────────────────────
PRIMARY_TYPES = ('text', 'quiz')
MEDIA_TYPES = ('media', 'model3d', 'oam', 'ivideo')
AUXILIARY_TYPES = ('wcn', 'hotspot', 'branch', 'audio', 'gui', 'callout')

# The 10 distinct STORED block-type values (§4). `audio` is a palette label that
# stores as `media` with kind='audio'; `gui` is project-level and not agent-emitted.
KNOWN_BLOCK_TYPES = (
    'text', 'media', 'quiz', 'hotspot', 'branch',
    'wcn', 'oam', 'ivideo', 'model3d', 'callout', 'gui',
)

FRAME_TYPES = ('content', 'menu')
LAYOUTS = ('full', 'text-left', 'text-right')
MEDIA_KINDS = ('image', 'video', 'audio', 'oam')
WCN_TYPES = ('warning', 'caution', 'note')
TARGET_KINDS = ('frame', 'lesson', 'module')


def _is_placeholder(val):
    """A __UPPER__-style placeholder token (e.g. __SWAP_A__) — an acceptable
    stand-in for an unfilled asset/target id (§5)."""
    return (
        isinstance(val, str)
        and len(val) >= 4
        and val.startswith('__')
        and val.endswith('__')
    )


def _asset_ok(val):
    """Asset id field may be None or a placeholder token (never required to be a
    real id at generation time)."""
    return val is None or _is_placeholder(val) or (isinstance(val, str) and val != '')


def is_zone_media(block):
    """PORT of editorStore.js `isZoneMedia`: does this block occupy the media zone?
    A `media` block with kind='audio' docks as a bar (auxiliary), not a zone filler.
    """
    if not isinstance(block, dict):
        return False
    btype = block.get('type')
    if btype == 'media':
        kind = (block.get('data') or {}).get('kind') or 'image'
        return kind != 'audio'
    return btype in MEDIA_TYPES


def _validate_block_data(btype, data, idx, errors):
    """Per-type REQUIRED-field checks derived from §4 of the schema doc.

    Asset/target id fields are intentionally NOT required (they may be null /
    placeholder). We check the human-meaningful + structural fields.
    """
    where = f'blocks[{idx}] (type={btype})'

    if btype == 'text':
        if not isinstance(data.get('body'), str) or data.get('body', '') == '':
            errors.append(f"{where}: text block requires a non-empty 'body'.")

    elif btype == 'media':
        kind = data.get('kind')
        if kind not in MEDIA_KINDS:
            errors.append(
                f"{where}: media 'kind' must be one of {list(MEDIA_KINDS)} (got {kind!r})."
            )
        # 508: image media must carry meaningful alt_text (§7.1).
        if kind == 'image':
            if not isinstance(data.get('alt_text'), str) or data.get('alt_text', '').strip() == '':
                errors.append(
                    f"{where}: image media requires non-empty 'alt_text' (508/WCAG)."
                )

    elif btype == 'quiz':
        if not isinstance(data.get('question'), str) or data.get('question', '') == '':
            errors.append(f"{where}: quiz requires a non-empty 'question'.")
        choices = data.get('choices')
        if not isinstance(choices, list) or len(choices) < 2:
            errors.append(f"{where}: quiz 'choices' must be a list with at least 2 options.")
        else:
            ci = data.get('correct_index')
            if not isinstance(ci, int) or isinstance(ci, bool) or ci < 0 or ci >= len(choices):
                errors.append(
                    f"{where}: quiz 'correct_index' must be an int in range [0, {len(choices) - 1}]."
                )

    elif btype == 'wcn':
        if data.get('wcn_type') not in WCN_TYPES:
            errors.append(
                f"{where}: wcn 'wcn_type' must be one of {list(WCN_TYPES)} (got {data.get('wcn_type')!r})."
            )
        if not isinstance(data.get('text'), str) or data.get('text', '') == '':
            errors.append(f"{where}: wcn requires a non-empty 'text'.")

    elif btype == 'callout':
        if not isinstance(data.get('text'), str) or data.get('text', '') == '':
            errors.append(f"{where}: callout requires a non-empty 'text'.")
        for pt in ('box', 'target'):
            obj = data.get(pt)
            if not isinstance(obj, dict) or not _is_number(obj.get('x')) or not _is_number(obj.get('y')):
                errors.append(f"{where}: callout '{pt}' must be an object with numeric x and y.")

    elif btype == 'hotspot':
        if not _asset_ok(data.get('image_id')):
            errors.append(f"{where}: hotspot 'image_id' must be null, a placeholder, or an id.")
        regions = data.get('regions')
        if not isinstance(regions, list):
            errors.append(f"{where}: hotspot 'regions' must be a list.")
        else:
            for ri, reg in enumerate(regions):
                if not isinstance(reg, dict):
                    errors.append(f"{where}: regions[{ri}] must be an object.")
                    continue
                for coord in ('x', 'y', 'w', 'h'):
                    if not _is_number(reg.get(coord)):
                        errors.append(f"{where}: regions[{ri}] requires numeric '{coord}'.")

    elif btype == 'branch':
        if not isinstance(data.get('condition'), str) or data.get('condition', '') == '':
            errors.append(f"{where}: branch requires a non-empty 'condition'.")
        for tf in ('true_frame_id', 'false_frame_id'):
            if not _asset_ok(data.get(tf)):
                errors.append(f"{where}: branch '{tf}' must be null, a placeholder, or an id.")

    elif btype == 'oam':
        if not _asset_ok(data.get('oam_asset_id')):
            errors.append(f"{where}: oam 'oam_asset_id' must be null, a placeholder, or an id.")

    elif btype == 'ivideo':
        for af in ('video_asset_id', 'clip_asset_id'):
            if not _asset_ok(data.get(af)):
                errors.append(f"{where}: ivideo '{af}' must be null, a placeholder, or an id.")

    elif btype == 'model3d':
        if not _asset_ok(data.get('model_asset_id')):
            errors.append(f"{where}: model3d 'model_asset_id' must be null, a placeholder, or an id.")
        # 508: substantive 3D models need a caption text alternative unless decorative (§7.2).
        if not data.get('decorative'):
            if not isinstance(data.get('caption'), str) or data.get('caption', '').strip() == '':
                errors.append(
                    f"{where}: model3d requires a 'caption' text alternative (508/WCAG) "
                    f"unless 'decorative' is true."
                )

    elif btype == 'gui':
        # Agents should not emit gui blocks (§4.11) — flag it.
        errors.append(f"{where}: 'gui' blocks are project-level and must not be agent-emitted.")


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _validate_exclusivity(layout, blocks, errors):
    """PORT of editorStore.js `resolveExclusivity`.

    - full           → at most ONE zone-filler total (a PRIMARY or a zone-MEDIA).
    - text-left/right→ at most ONE PRIMARY AND at most ONE MEDIA.
    AUXILIARY blocks are never counted.
    """
    primaries = [b for b in blocks if isinstance(b, dict) and b.get('type') in PRIMARY_TYPES]
    zone_medias = [b for b in blocks if is_zone_media(b)]

    if layout == 'full':
        total = len(primaries) + len(zone_medias)
        if total > 1:
            errors.append(
                f"exclusivity: 'full' layout allows only ONE zone-filler "
                f"(a text/quiz OR a media-group block); found {total}."
            )
    else:  # text-left / text-right
        if len(primaries) > 1:
            errors.append(
                f"exclusivity: '{layout}' layout allows at most ONE PRIMARY "
                f"(text/quiz) block; found {len(primaries)}."
            )
        if len(zone_medias) > 1:
            errors.append(
                f"exclusivity: '{layout}' layout allows at most ONE MEDIA "
                f"zone-filler block; found {len(zone_medias)}."
            )


def validate_frame(frame):
    """Validate a ForgeAgent frame dict. Returns a list of error strings
    (empty = valid)."""
    errors = []

    if not isinstance(frame, dict):
        return ["frame must be a JSON object."]

    # name — required, non-empty (§2, §8.1).
    name = frame.get('name')
    if not isinstance(name, str) or name.strip() == '':
        errors.append("frame 'name' is required and must be a non-empty string.")

    # frame_type — content | menu (§12 v1 decision).
    ftype = frame.get('frame_type')
    if ftype not in FRAME_TYPES:
        errors.append(
            f"frame 'frame_type' must be one of {list(FRAME_TYPES)} (got {ftype!r})."
        )

    content = frame.get('content')
    if not isinstance(content, dict):
        errors.append("frame 'content' must be an object.")
        return errors

    if ftype == 'menu':
        _validate_menu(content, errors)
    else:
        # Treat anything non-menu (incl. an invalid frame_type) as a content frame
        # for structural checks so the author gets all the errors at once.
        _validate_content(content, errors)

    return errors


def _validate_content(content, errors):
    layout = content.get('layout', 'text-left')
    if layout not in LAYOUTS:
        errors.append(
            f"content 'layout' must be one of {list(LAYOUTS)} (got {layout!r})."
        )

    blocks = content.get('blocks')
    if not isinstance(blocks, list):
        errors.append("content 'blocks' must be a list.")
        return

    for idx, block in enumerate(blocks):
        if not isinstance(block, dict):
            errors.append(f"blocks[{idx}] must be an object.")
            continue
        btype = block.get('type')
        if btype not in KNOWN_BLOCK_TYPES:
            errors.append(
                f"blocks[{idx}]: unknown block 'type' {btype!r} "
                f"(expected one of {list(KNOWN_BLOCK_TYPES)})."
            )
            continue
        data = block.get('data')
        if not isinstance(data, dict):
            errors.append(f"blocks[{idx}] (type={btype}): 'data' must be an object.")
            continue
        _validate_block_data(btype, data, idx, errors)

    # Exclusivity only meaningful with a valid layout + list of blocks.
    if layout in LAYOUTS:
        _validate_exclusivity(layout, blocks, errors)


def _validate_menu(content, errors):
    menu = content.get('menu')
    if not isinstance(menu, dict):
        errors.append("menu frame: content 'menu' must be an object.")
        return
    items = menu.get('items')
    if not isinstance(items, list):
        errors.append("menu frame: content.menu 'items' must be a list.")
        return
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"menu items[{idx}] must be an object.")
            continue
        if not isinstance(item.get('label'), str) or item.get('label', '').strip() == '':
            errors.append(f"menu items[{idx}] requires a non-empty 'label'.")
        tk = item.get('target_kind')
        if tk not in TARGET_KINDS:
            errors.append(
                f"menu items[{idx}] 'target_kind' must be one of "
                f"{list(TARGET_KINDS)} (got {tk!r})."
            )
        # target_id may be empty/placeholder (author wires it later) — no check.
