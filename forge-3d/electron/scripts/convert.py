"""
Forge3D — Blender Headless Conversion Script
Usage: blender --background --python convert.py -- <fbx_path> <glb_path> [options_json]

Blender API refs:
  bpy.ops.import_scene.fbx  -> https://docs.blender.org/api/current/bpy.ops.import_scene.html
  bpy.ops.export_scene.gltf -> https://docs.blender.org/api/current/bpy.ops.export_scene.html
"""

import bpy, sys, json, os

def log(msg): print(f"[Forge3D] {msg}", flush=True)

def main():
    try:
        sep  = sys.argv.index("--")
        args = sys.argv[sep + 1:]
    except ValueError:
        log("ERROR: Missing '--' separator."); sys.exit(1)

    if len(args) < 2:
        log("ERROR: Usage: convert.py -- <fbx_path> <glb_path> [options_json]"); sys.exit(1)

    fbx_path = args[0]
    glb_path = args[1]
    options  = json.loads(args[2]) if len(args) > 2 else {}

    log(f"Input:   {fbx_path}")
    log(f"Output:  {glb_path}")
    log(f"Options: {options}")

    if not os.path.exists(fbx_path):
        log(f"ERROR: FBX not found: {fbx_path}"); sys.exit(1)

    log("Clearing scene...")
    bpy.ops.wm.read_factory_settings(use_empty=True)

    log("Importing FBX...")
    try:
        bpy.ops.import_scene.fbx(
            filepath=fbx_path,
            use_custom_normals=True,
            use_image_search=True,
            use_anim=options.get('include_animations', True),
            global_scale=options.get('global_scale', 1.0),
            bake_space_transform=options.get('bake_space_transform', False),
            axis_forward=options.get('axis_forward', '-Z'),
            axis_up=options.get('axis_up', 'Y')
        )
    except Exception as e:
        log(f"ERROR: FBX import failed: {e}"); sys.exit(1)

    log(f"Imported {len(bpy.data.objects)} object(s).")

    if options.get('apply_transforms', True):
        log("Applying transforms...")
        bpy.ops.object.select_all(action='SELECT')
        try: bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        except Exception as e: log(f"WARN: Transform apply skipped: {e}")

    mesh_count = sum(1 for o in bpy.data.objects if o.type == 'MESH')
    mat_count  = len(bpy.data.materials)
    arm_count  = sum(1 for o in bpy.data.objects if o.type == 'ARMATURE')
    log(f"Scene: {mesh_count} mesh(es), {mat_count} material(s), {arm_count} armature(s).")

    log("Exporting GLB...")
    os.makedirs(os.path.dirname(glb_path) or '.', exist_ok=True)

    try:
        bpy.ops.export_scene.gltf(
            filepath=glb_path,
            export_format='GLB',
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
