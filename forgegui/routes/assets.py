import os
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from werkzeug.utils import secure_filename
from PIL import Image

assets_bp = Blueprint('assets', __name__)

ALLOWED_IMAGE = {'.png', '.jpg', '.jpeg', '.webp', '.gif'}


@assets_bp.post('/api/assets/background')
def upload_background():
    """
    Upload background image — defines stage dimensions.
    Returns: { asset_id, filename, width, height, serve_url }
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    f      = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No file provided.'}), 400
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE:
        return jsonify({'error': 'Image must be PNG, JPG, or WebP.'}), 400

    asset_id  = str(uuid.uuid4())
    safe_name = secure_filename(f.filename)
    bg_dir    = Path(current_app.config['UPLOAD_FOLDER']) / 'backgrounds'
    bg_dir.mkdir(parents=True, exist_ok=True)

    stored_path = str(bg_dir / f"{asset_id}{suffix}")
    f.save(stored_path)

    # Read dimensions
    try:
        with Image.open(stored_path) as img:
            width, height = img.size
    except Exception:
        width, height = 1024, 768

    return jsonify({
        'asset_id':  asset_id,
        'filename':  safe_name,
        'width':     width,
        'height':    height,
        'serve_url': f'/api/assets/background/{asset_id}{suffix}',
    }), 201


@assets_bp.get('/api/assets/background/<path:filename>')
def serve_background(filename):
    bg_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'backgrounds'
    target = (bg_dir / filename).resolve()
    # Traversal guard — relative_to is separator-safe (startswith matched a
    # sibling like backgrounds_evil/).
    try:
        target.relative_to(bg_dir.resolve())
    except ValueError:
        return jsonify({'error': 'Not found.'}), 404
    if not target.exists():
        return jsonify({'error': 'Not found.'}), 404
    return send_file(str(target))


@assets_bp.post('/api/assets/sprite')
def upload_sprite():
    """
    Upload a sprite asset — either a spritesheet or individual button PNG.
    Form fields:
      file        — the image file
      mode        — 'spritesheet' | 'individual'
      button_id   — which button this belongs to (for individual mode)
      state       — 'normal'|'hover'|'active'|'disabled' (individual mode)
      sprite_w    — cell width (spritesheet mode)
      sprite_h    — cell height (spritesheet mode)
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided.'}), 400

    f      = request.files['file']
    if not f.filename:
        return jsonify({'error': 'No file provided.'}), 400
    suffix = Path(f.filename).suffix.lower()
    if suffix not in ALLOWED_IMAGE:
        return jsonify({'error': 'Sprite must be PNG or WebP.'}), 400

    mode      = request.form.get('mode', 'individual')
    button_id = request.form.get('button_id', '')
    state     = request.form.get('state', 'normal')
    sprite_w  = int(request.form.get('sprite_w', 120))
    sprite_h  = int(request.form.get('sprite_h', 44))

    asset_id   = str(uuid.uuid4())
    safe_name  = secure_filename(f.filename)
    sprite_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'sprites'
    sprite_dir.mkdir(parents=True, exist_ok=True)

    stored_path = str(sprite_dir / f"{asset_id}{suffix}")
    f.save(stored_path)

    try:
        with Image.open(stored_path) as img:
            width, height = img.size
    except Exception:
        width, height = 0, 0

    # Calculate grid for spritesheet
    cols = width  // sprite_w if sprite_w > 0 else 1
    rows = height // sprite_h if sprite_h > 0 else 1

    return jsonify({
        'asset_id':  asset_id,
        'filename':  safe_name,
        'mode':      mode,
        'button_id': button_id,
        'state':     state,
        'width':     width,
        'height':    height,
        'sprite_w':  sprite_w,
        'sprite_h':  sprite_h,
        'cols':      cols,
        'rows':      rows,
        'serve_url': f'/api/assets/sprite/{asset_id}{suffix}',
    }), 201


@assets_bp.get('/api/assets/sprite/<path:filename>')
def serve_sprite(filename):
    sprite_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'sprites'
    target     = (sprite_dir / filename).resolve()
    # Traversal guard — relative_to is separator-safe.
    try:
        target.relative_to(sprite_dir.resolve())
    except ValueError:
        return jsonify({'error': 'Not found.'}), 404
    if not target.exists():
        return jsonify({'error': 'Not found.'}), 404
    return send_file(str(target))
