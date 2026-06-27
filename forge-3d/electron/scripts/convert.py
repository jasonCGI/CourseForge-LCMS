"""
Forge3D — Blender Headless Conversion Script
Usage: blender --background --python convert.py -- <input_path> <glb_path> [options_json]

Accepts FBX and glTF/GLB inputs and always re-exports a clean, self-contained
GLB (metallic-roughness materials, embedded textures). Re-exporting glTF through
Blender bakes the deprecated KHR_materials_pbrSpecularGlossiness material model
into modern metallic-roughness, which is required for the model to render with
its texture maps in newer three.js (the Forge3D viewer is on three 0.165, where
spec-gloss support was removed).

(OBJ is intentionally not accepted: its .mtl carries no PBR/spec-gloss texture
maps, so the real authoring path is Max → assign materials/textures → FBX →
this pipeline.)

Blender API refs:
  bpy.ops.import_scene.fbx  -> https://docs.blender.org/api/current/bpy.ops.import_scene.html
  bpy.ops.import_scene.gltf -> https://docs.blender.org/api/current/bpy.ops.import_scene.html
  bpy.ops.export_scene.gltf -> https://docs.blender.org/api/current/bpy.ops.export_scene.html
"""

import bpy, sys, json, os, re

def log(msg): print(f"[Forge3D] {msg}", flush=True)

# Input formats Forge3D can ingest -> all normalize to GLB on the way out.
SUPPORTED_EXTS = {'.fbx': 'fbx', '.glb': 'gltf', '.gltf': 'gltf'}

def detect_format(path):
    """Pick an importer from the file extension; None if unsupported."""
    return SUPPORTED_EXTS.get(os.path.splitext(path)[1].lower())

def op_retry(op, **kw):
    """Call a bpy operator, dropping any kwargs this Blender version rejects.

    Blender's FBX-import / glTF-export signatures changed across 3.6 LTS, 4.x
    and 5.x (e.g. export_colors was removed in 4.0). Rather than pin to one
    version, retry the call, stripping each unsupported keyword the error names.
    bpy.ops reports unknown kwargs as either a Python TypeError ("unexpected
    keyword argument 'x'") or a Blender RuntimeError/TypeError
    ('keyword "x" unrecognized') — handle both.
    """
    while True:
        try:
            return op(**kw)
        except (TypeError, RuntimeError) as e:
            msg = str(e)
            m = (re.search(r"unexpected keyword argument '(\w+)'", msg) or
                 re.search(r'keyword "(\w+)" unrecognized', msg))
            if m and m.group(1) in kw:
                log(f"WARN: '{m.group(1)}' unsupported by this Blender version — dropping it.")
                kw.pop(m.group(1))
                continue
            raise


METAL_WORDS = ('metal', 'gold', 'chrome', 'steel', 'brass', 'silver', 'iron',
               'alumin', 'copper', 'bronze', 'nickel', 'titanium', 'platinum',
               'gunmetal', 'pewter', 'metallic')


def apply_pbr(options):
    """FBX often loses PBR metalness on import (3ds Max Physical/Standard material
    metalness doesn't map into Blender's Principled BSDF), so a 'Metal' material
    exports with metallicFactor=0 and renders flat. Recover it:
      - force_metallic: set every material to metalness 1.0
      - metalness / roughness: explicit overrides (0..1)
      - otherwise auto-detect: a material whose NAME looks metallic but imported
        with metalness 0 is bumped to 1.0 (and shininess if very rough).
    """
    force  = bool(options.get('force_metallic', False))
    auto   = options.get('auto_metal_from_name', True)
    set_m  = options.get('metalness', None)
    set_r  = options.get('roughness', None)
    for mat in bpy.data.materials:
        try:
            if not mat.use_nodes:
                mat.use_nodes = True
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf:
                continue
            m_in = bsdf.inputs.get('Metallic')
            r_in = bsdf.inputs.get('Roughness')
            name = (mat.name or '').lower()
            if set_m is not None and m_in:
                m_in.default_value = max(0.0, min(1.0, float(set_m)))
            elif force and m_in:
                m_in.default_value = 1.0
                log(f"Forced metallic on '{mat.name}'.")
            elif auto and m_in and m_in.default_value == 0.0 and any(w in name for w in METAL_WORDS):
                m_in.default_value = 1.0
                if r_in and r_in.default_value > 0.5:
                    r_in.default_value = 0.3
                log(f"Auto-metal: '{mat.name}' looks metallic -> metalness=1.0.")
            if set_r is not None and r_in:
                r_in.default_value = max(0.0, min(1.0, float(set_r)))
        except Exception as e:
            log(f"WARN: PBR fixup skipped for a material ({e}).")


def apply_decimate(ratio):
    """Add a Collapse Decimate modifier to every mesh (applied on export via
    export_apply=True). Reduces poly count for the web-protected export so a
    scraped copy isn't the full-resolution, sellable original."""
    if not ratio:
        return
    try:
        r = max(0.01, min(0.999, float(ratio)))
    except (ValueError, TypeError):
        return
    n = 0
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        try:
            mod = obj.modifiers.new(name='ForgeWebDecimate', type='DECIMATE')
            mod.decimate_type = 'COLLAPSE'
            mod.ratio = r
            n += 1
        except Exception as e:
            log(f"WARN: decimate skipped on '{obj.name}' ({e}).")
    if n:
        log(f"Web-protect: decimate ratio {r:.2f} on {n} mesh(es).")


def downscale_textures(max_size):
    """Shrink every image to <= max_size px on its long edge (in place, so the
    GLB embeds the smaller texture). Cuts the texture value of a scraped copy."""
    if not max_size:
        return
    try:
        m = int(max_size)
    except (ValueError, TypeError):
        return
    if m <= 0:
        return
    n = 0
    for img in bpy.data.images:
        try:
            w, h = img.size[0], img.size[1]
            if w == 0 or h == 0 or max(w, h) <= m:
                continue
            s = m / float(max(w, h))
            img.scale(max(1, int(w * s)), max(1, int(h * s)))
            n += 1
        except Exception as e:
            log(f"WARN: couldn't downscale '{img.name}' ({e}).")
    if n:
        log(f"Web-protect: downscaled {n} texture(s) to <= {m}px.")


def patch_fbx_light_bug():
    """Blender 5.1's bundled FBX importer crashes on any FBX containing a light
    (blen_read_light does `lamp.cycles.cast_shadow = ...`, an attribute removed
    from CyclesLightSettings in 5.x). Wrap that reader so a light it can't build
    is skipped instead of aborting the whole import. No-op on versions that work.
    """
    try:
        import io_scene_fbx.import_fbx as _imp
    except Exception:
        return
    orig = getattr(_imp, 'blen_read_light', None)
    if orig is None or getattr(orig, '_forge3d_wrapped', False):
        return

    def safe_blen_read_light(*a, **k):
        try:
            return orig(*a, **k)
        except AttributeError as e:
            log(f"WARN: skipped a light the importer couldn't build ({e}).")
            return None

    safe_blen_read_light._forge3d_wrapped = True
    _imp.blen_read_light = safe_blen_read_light


IMG_EXTS = ('.png', '.jpg', '.jpeg', '.tga', '.bmp', '.tif', '.tiff',
            '.webp', '.exr', '.hdr', '.dds', '.gif', '.ktx2')


def _norm_stem(name):
    """Lowercase basename with all trailing image extensions stripped.
    'Tex_A.tga.png' -> 'tex_a' ; 'Tex_A.tga' (the FBX's stale ref) -> 'tex_a'.
    Lets a renamed map match its original reference."""
    b = os.path.basename(name).lower()
    while True:
        stem, ext = os.path.splitext(b)
        if ext in IMG_EXTS and stem:
            b = stem
        else:
            return b


def reconnect_textures(search_dir):
    """Relink any image that failed to load to the best filename match in
    search_dir (the flat staging dir). Salvages the common Sketchfab case where
    a TGA reference was re-saved as '<name>.tga.png', so Blender's basename
    image-search misses it and the map imports as missing/pink."""
    if not search_dir or not os.path.isdir(search_dir):
        return
    index = {}
    for f in os.listdir(search_dir):
        full = os.path.join(search_dir, f)
        if os.path.isfile(full) and os.path.splitext(f)[1].lower() in IMG_EXTS:
            index.setdefault(_norm_stem(f), full)   # first match wins
    if not index:
        return

    reconnected = 0
    for img in bpy.data.images:
        if img.source == 'FILE' and img.has_data and img.size[0] > 0:
            continue   # already resolved on import
        want = _norm_stem(img.name) or _norm_stem(img.filepath or '')
        match = index.get(want) or index.get(_norm_stem(img.filepath_raw or ''))
        if not match:
            continue
        try:
            img.filepath = match
            img.source = 'FILE'
            img.reload()
            reconnected += 1
            log(f"Reconnected texture: '{img.name}' -> {os.path.basename(match)}")
        except Exception as e:
            log(f"WARN: couldn't reconnect '{img.name}' ({e}).")
    if reconnected:
        log(f"Reconnected {reconnected} texture(s) from the staging folder.")


def import_model(fmt, path, options):
    """Import the source into the (empty) scene using the right Blender importer.
    op_retry drops any kwarg this Blender version doesn't accept."""
    if fmt == 'fbx':
        patch_fbx_light_bug()
        op_retry(
            bpy.ops.import_scene.fbx,
            filepath=path,
            use_custom_normals=True,
            use_image_search=True,
            use_anim=options.get('include_animations', True),
            global_scale=options.get('global_scale', 1.0),
            bake_space_transform=options.get('bake_space_transform', False),
            axis_forward=options.get('axis_forward', '-Z'),
            axis_up=options.get('axis_up', 'Y'),
        )
    elif fmt == 'gltf':
        # Blender converts spec-gloss -> Principled BSDF on import; the GLB export
        # below then writes standard metallic-roughness (the bake). GLB embeds its
        # own images; a multi-file .gltf resolves textures relative to the file.
        op_retry(bpy.ops.import_scene.gltf, filepath=path)
    else:
        raise ValueError(f"unsupported format: {fmt}")


def main():
    try:
        sep  = sys.argv.index("--")
        args = sys.argv[sep + 1:]
    except ValueError:
        log("ERROR: Missing '--' separator."); sys.exit(1)

    if len(args) < 2:
        log("ERROR: Usage: convert.py -- <input_path> <glb_path> [options_json]"); sys.exit(1)

    src_path = args[0]
    glb_path = args[1]
    try:
        options = json.loads(args[2]) if len(args) > 2 else {}
        if not isinstance(options, dict):
            raise ValueError("options must be a JSON object")
    except (ValueError, TypeError) as e:
        log(f"ERROR: Invalid options JSON: {e}"); sys.exit(1)

    fmt = detect_format(src_path)
    if fmt is None:
        log(f"ERROR: Unsupported input '{os.path.basename(src_path)}' — "
            f"accepted: {', '.join(sorted(SUPPORTED_EXTS))}."); sys.exit(1)

    # Re-exporting a glTF/GLB through Blender trusts the source's own PBR, so the
    # name-based metal heuristic (meant for FBX, which loses metalness) would only
    # mangle it — default it off for glTF.
    if fmt == 'gltf':
        options.setdefault('auto_metal_from_name', False)

    log(f"Input:   {src_path}  (format: {fmt})")
    log(f"Output:  {glb_path}")
    log(f"Options: {options}")

    if not os.path.exists(src_path):
        log(f"ERROR: Input not found: {src_path}"); sys.exit(1)

    log("Clearing scene...")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    log(f"Importing {fmt.upper()}...")
    try:
        import_model(fmt, src_path, options)
    except Exception as e:
        log(f"ERROR: {fmt.upper()} import failed: {e}"); sys.exit(1)

    obj_count = len(bpy.data.objects)
    mesh_count = len([o for o in bpy.data.objects if o.type == 'MESH'])
    log(f"Imported {obj_count} object(s), {mesh_count} mesh(es).")
    if mesh_count == 0:
        # A silently-empty import would otherwise export a near-empty GLB and
        # report SUCCESS — fail loudly instead.
        log("ERROR: No meshes were imported — the input is empty or unreadable.")
        sys.exit(1)

    # FBX maps live as external files (in the flat staging dir alongside the
    # model); relink any the importer's basename search missed. GLB/glTF embed
    # their own images, so this is a no-op there.
    if fmt == 'fbx':
        reconnect_textures(os.path.dirname(os.path.abspath(src_path)))

    if options.get('apply_transforms', True):
        log("Applying transforms...")
        bpy.ops.object.select_all(action='SELECT')
        try: bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception as e: log(f"WARN: Transform apply skipped: {e}")

    # Recover/override PBR metalness lost on FBX import (see apply_pbr).
    apply_pbr(options)

    # Web-protected export: ship a REDUCED + watermarked asset so a scraped copy
    # isn't the sellable original — decimate geometry, downscale textures, and
    # stamp the glTF asset.copyright. Opt-in; a normal export is untouched.
    if options.get('web_protect'):
        options.setdefault('decimate', 0.5)
        options.setdefault('texture_max', 1024)
        options.setdefault('watermark', 'Protected web export - cardonalab.dev')
    apply_decimate(options.get('decimate'))
    downscale_textures(options.get('texture_max'))

    mesh_count = sum(1 for o in bpy.data.objects if o.type == 'MESH')
    mat_count  = len(bpy.data.materials)
    arm_count  = sum(1 for o in bpy.data.objects if o.type == 'ARMATURE')
    log(f"Scene: {mesh_count} mesh(es), {mat_count} material(s), {arm_count} armature(s).")

    log("Exporting GLB...")
    os.makedirs(os.path.dirname(glb_path) or '.', exist_ok=True)

    try:
        op_retry(
            bpy.ops.export_scene.gltf,
            filepath=glb_path,
            export_format='GLB',
            export_copyright=str(options.get('watermark') or ''),
            export_texcoords=True,
            export_normals=True,
            export_tangents=options.get('export_tangents', False),
            export_materials='EXPORT',
            export_colors=True,
            export_cameras=options.get('export_cameras', False),
            export_apply=True,
            export_yup=True,
            export_animations=options.get('include_animations', True),
            export_frame_range=True,
            export_force_sampling=True,
            export_nla_strips=True,
            export_draco_mesh_compression_enable=options.get('draco', False),
            export_draco_mesh_compression_level=options.get('draco_level', 6)
        )
    except Exception as e:
        log(f"ERROR: GLB export failed: {e}"); sys.exit(1)

    if os.path.exists(glb_path):
        size_mb = os.path.getsize(glb_path) / (1024 * 1024)
        log(f"SUCCESS: {size_mb:.2f} MB written.")
        log(f"OUTPUT_PATH:{glb_path}")
    else:
        log("ERROR: GLB not found after export."); sys.exit(1)

if __name__ == "__main__":
    main()
