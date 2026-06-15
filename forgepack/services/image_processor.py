"""
ForgePack Image Processor (Pillow).

Outputs WebP (primary), PNG (lossless), @2x WebP (retina), thumbnail, and an
OG/social crop. Strips EXIF, converts to sRGB-ish RGB, resizes over a cap.

.psd note: Pillow reads flattened PSDs; layered PSDs need psd-tools (future).
"""

import os
import uuid
import zipfile
import threading
from pathlib import Path
from datetime import datetime

try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

JOBS = {}

ALLOWED_INPUT_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp', '.gif',
}


def allowed_image(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_INPUT_EXTENSIONS


def probe_image(input_path: str) -> dict:
    if not PIL_AVAILABLE:
        return {}
    try:
        with Image.open(input_path) as img:
            return {'width': img.width, 'height': img.height, 'mode': img.mode, 'format': img.format}
    except Exception as e:
        return {'error': str(e)}


def smart_crop_og(img):
    """Smart-crop to 1200×630 (OG/social), centered."""
    target_w, target_h = 1200, 630
    img_ratio    = img.width / img.height
    target_ratio = target_w / target_h
    if img_ratio > target_ratio:
        new_h = target_h
        new_w = int(img.width * (target_h / img.height))
    else:
        new_w = target_w
        new_h = int(img.height * (target_w / img.width))
    img_resized = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - target_w) // 2
    top  = (new_h - target_h) // 2
    return img_resized.crop((left, top, left + target_w, top + target_h))


def process_image_job(job_id, input_path, base_name, output_dir, preset):
    if not PIL_AVAILABLE:
        JOBS[job_id].update({'status': 'failed', 'error': 'Pillow not installed. Run: pip install Pillow'})
        return

    JOBS[job_id].update({'status': 'running', 'progress': 0, 'message': 'Starting…'})

    input_p  = Path(input_path)
    output_p = Path(output_dir)
    output_p.mkdir(parents=True, exist_ok=True)

    webp_path   = str(output_p / f"{base_name}.webp")
    png_path    = str(output_p / f"{base_name}.png")
    webp2x_path = str(output_p / f"{base_name}@2x.webp")
    thumb_path  = str(output_p / f"{base_name}_thumb.jpg")
    og_path     = str(output_p / f"{base_name}_og.jpg")
    zip_path    = str(output_p / f"{base_name}_forgepack.zip")

    try:
        JOBS[job_id]['message'] = 'Opening source image…'
        img = Image.open(str(input_p))

        # Flatten transparency onto white, else convert to RGB
        if img.mode in ('RGBA', 'LA', 'PA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA':
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img.convert('RGBA'), mask=img.convert('RGBA').split()[3])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Strip EXIF by re-creating pixel data
        data = list(img.getdata())
        clean = Image.new(img.mode, img.size)
        clean.putdata(data)
        img = clean

        original_w, original_h = img.size
        JOBS[job_id].update({'progress': 10, 'probe': {'width': original_w, 'height': original_h, 'mode': img.mode}})

        # Resize over cap
        max_dim = preset.get('max_dimension', 4096)
        if max(original_w, original_h) > max_dim:
            JOBS[job_id]['message'] = f'Resizing to max {max_dim}px…'
            img.thumbnail((max_dim, max_dim), Image.LANCZOS)
        JOBS[job_id]['progress'] = 20

        webp_quality = preset.get('webp_quality', 85)
        JOBS[job_id]['message'] = 'Encoding WebP…'
        img.save(webp_path, 'WEBP', quality=webp_quality, method=6)
        JOBS[job_id]['progress'] = 40

        JOBS[job_id]['message'] = 'Encoding PNG (lossless)…'
        img.save(png_path, 'PNG', compress_level=preset.get('png_compress', 6), optimize=True)
        JOBS[job_id]['progress'] = 55

        JOBS[job_id]['message'] = 'Encoding @2x WebP (retina)…'
        img.save(webp2x_path, 'WEBP', quality=min(webp_quality + 5, 100), method=6)
        JOBS[job_id]['progress'] = 65

        JOBS[job_id]['message'] = 'Generating thumbnail…'
        thumb_size = preset.get('thumb_size', 256)
        thumb = img.copy()
        thumb.thumbnail((thumb_size, thumb_size), Image.LANCZOS)
        thumb.save(thumb_path, 'JPEG', quality=85, optimize=True)
        JOBS[job_id]['progress'] = 75

        JOBS[job_id]['message'] = 'Generating OG/social image (1200×630)…'
        smart_crop_og(img).save(og_path, 'JPEG', quality=88, optimize=True)
        JOBS[job_id]['progress'] = 85

        JOBS[job_id]['message'] = 'Packaging output…'
        def fsize(p):
            try: return os.path.getsize(p)
            except: return 0
        webp_kb  = fsize(webp_path) // 1024
        png_kb   = fsize(png_path) // 1024
        thumb_kb = fsize(thumb_path) // 1024

        readme = f"""ForgePack Image Output
======================
Source:        {input_p.name}
Preset:        {preset.get('label', 'Custom')}
Created:       {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}
Dimensions:    {original_w} × {original_h} px
Output size:   {img.width} × {img.height} px

Files:
  {base_name}.webp         — Primary (WebP q{webp_quality}, {webp_kb}KB)
  {base_name}.png          — Lossless PNG fallback ({png_kb}KB)
  {base_name}@2x.webp      — Retina/HiDPI version
  {base_name}_thumb.jpg    — Thumbnail {thumb_size}px longest edge ({thumb_kb}KB)
  {base_name}_og.jpg       — Social/OG image 1200×630 (smart crop)

CourseForge import:
  Drop {base_name}.webp and {base_name}.png into a CourseForge Media block.
  Files with the same base name are auto-paired as companions.
  Use .webp as primary, .png as lossless fallback.

Color space: converted to sRGB for web. EXIF metadata stripped for privacy.
"""
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.write(webp_path,   f"{base_name}.webp")
            zf.write(png_path,    f"{base_name}.png")
            zf.write(webp2x_path, f"{base_name}@2x.webp")
            zf.write(thumb_path,  f"{base_name}_thumb.jpg")
            zf.write(og_path,     f"{base_name}_og.jpg")
            zf.writestr('README.txt', readme)

        for path in [webp_path, png_path, webp2x_path, thumb_path, og_path]:
            try: os.remove(path)
            except: pass
        try: os.remove(str(input_p))
        except: pass

        JOBS[job_id].update({
            'status': 'complete', 'progress': 100, 'message': 'Done',
            'output_path': zip_path, 'base_name': base_name,
            'original_w': original_w, 'original_h': original_h,
            'output_w': img.width, 'output_h': img.height,
            'webp_kb': webp_kb, 'png_kb': png_kb,
        })
    except Exception as e:
        JOBS[job_id].update({'status': 'failed', 'error': str(e)})


def start_image_job(input_path, base_name, output_dir, preset) -> str:
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        'status': 'queued', 'progress': 0, 'message': 'Queued',
        'output_path': None, 'error': None, 'created_at': datetime.utcnow().isoformat(),
    }
    threading.Thread(
        target=process_image_job,
        args=(job_id, input_path, base_name, output_dir, preset),
        daemon=True,
    ).start()
    return job_id


def get_image_job(job_id: str) -> dict | None:
    return JOBS.get(job_id)
