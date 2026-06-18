"""
CourseForge OAM Ingest Service

Accepts a .oam file (which is a ZIP archive), extracts it, reads its metadata,
scans for SCORM API calls, and returns a metadata dict suitable for creating an
OamAsset DB record.

OAM format reference:
  - Root usually contains OAMManifest.xml
  - Entry point is usually index.html
  - Assets include JS, images, sounds
  - May contain internal SCORM API calls (LMSInitialize etc)

Manifest-less archives: some Adobe Animate exports (and hand-zipped HTML5 Canvas
output) ship WITHOUT an OAMManifest.xml. The manifest only carries 5 values
(entry point, width, height, responsive, version) — all of which we can recover
from the package's own index.html / JS. When the manifest is missing we derive
those values and write a generated OAMManifest.xml so the stored package is
self-describing.
"""

import os
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


SCORM_PATTERN = re.compile(
    r'(LMSInitialize|LMSSetValue|LMSGetValue|LMSCommit|LMSFinish'
    r'|Initialize|SetValue|GetValue|Commit|Terminate'
    r'|SCORM_CallLMSInitialize)',
    re.IGNORECASE
)

AUDIO_EXTENSIONS = {'.mp3', '.ogg', '.wav', '.m4a', '.aac'}

# Adobe Animate / CreateJS dimension sources.
_LIBPROP_RE = re.compile(
    r'\bproperties\s*=\s*\{[^}]*?\bwidth\s*:\s*(\d+)[^}]*?\bheight\s*:\s*(\d+)',
    re.IGNORECASE | re.DOTALL,
)
_CANVAS_TAG_RE = re.compile(r'<canvas\b[^>]*>', re.IGNORECASE)
_ATTR_W_RE = re.compile(r'\bwidth\s*=\s*["\']?(\d+)', re.IGNORECASE)
_ATTR_H_RE = re.compile(r'\bheight\s*=\s*["\']?(\d+)', re.IGNORECASE)
_RESPONSIVE_RE = re.compile(r'makeResponsive\s*\(\s*(true|false)', re.IGNORECASE)


class OAMIngestError(Exception):
    """Raised when OAM file cannot be parsed or is malformed."""
    pass


def ingest_oam(file_path: Path, asset_id: str, upload_root: Path) -> dict:
    """
    Main entry point. Unzips OAM, reads/derives metadata, scans for SCORM calls.

    Args:
        file_path:   Path to the uploaded .oam file
        asset_id:    UUID string for this asset (used for directory naming)
        upload_root: Base upload directory (e.g. Path('uploads'))

    Returns:
        dict with keys matching OamAsset model columns

    Raises:
        OAMIngestError on malformed or unreadable OAM files
    """
    # ── Validate file ──────────────────────────────────────────
    if not file_path.exists():
        raise OAMIngestError(f"File not found: {file_path}")

    if not zipfile.is_zipfile(file_path):
        raise OAMIngestError("File is not a valid OAM/ZIP archive.")

    # ── Set up extraction directory ────────────────────────────
    extract_dir = upload_root / 'oam' / asset_id / 'extracted'
    extract_dir.mkdir(parents=True, exist_ok=True)
    extract_root = extract_dir.resolve()

    # ── Extract (with traversal guard) ─────────────────────────
    try:
        with zipfile.ZipFile(file_path, 'r') as zf:
            for member in zf.namelist():
                dest = (extract_dir / member).resolve()
                try:
                    dest.relative_to(extract_root)   # separator-safe, no prefix bypass
                except ValueError:
                    raise OAMIngestError(f"Unsafe path in archive: {member}")
            zf.extractall(extract_dir)
    except zipfile.BadZipFile as e:
        raise OAMIngestError(f"Could not extract OAM: {e}")

    # ── Metadata: from OAMManifest.xml if present, else synthesized ──
    file_tree = _build_file_tree(extract_dir)
    manifest_path = _find_manifest(extract_dir)
    if manifest_path is not None:
        meta = _parse_manifest(manifest_path)
    else:
        meta = _synthesize_manifest(extract_dir, file_tree)
        file_tree = _build_file_tree(extract_dir)  # include the generated manifest

    entry_point      = meta['entry_point']
    manifest_version = meta['manifest_version']
    responsive       = meta['responsive']
    width            = meta['width']
    height           = meta['height']

    # ── Inject the ForgeJS bridge so the media bar can drive stock CreateJS
    #    OAMs (which don't speak our protocol on their own) ──────
    _inject_forge_runtime(extract_dir, entry_point)
    file_tree = _build_file_tree(extract_dir)   # include forge-oam.js

    # ── Detect audio ──────────────────────────────────────────
    has_audio = any(Path(f).suffix.lower() in AUDIO_EXTENSIONS for f in file_tree)

    # ── Scan for SCORM API calls ───────────────────────────────
    has_scorm_calls = False
    for js_rel in (f for f in file_tree if f.endswith('.js')):
        try:
            if SCORM_PATTERN.search((extract_dir / js_rel).read_text(encoding='utf-8', errors='ignore')):
                has_scorm_calls = True
                break
        except OSError:
            continue

    # Also check entry point HTML for inline SCORM calls
    if not has_scorm_calls:
        html_path = extract_dir / entry_point
        if html_path.exists():
            try:
                if SCORM_PATTERN.search(html_path.read_text(encoding='utf-8', errors='ignore')):
                    has_scorm_calls = True
            except OSError:
                pass

    return {
        'manifest_version':  manifest_version,
        'entry_point':       entry_point,
        'width':             width,
        'height':            height,
        'responsive':        responsive,
        'has_audio':         has_audio,
        'has_scorm_calls':   has_scorm_calls,
        'asset_file_tree':   file_tree,
        'extracted_path':    str(extract_dir),
    }


# ── Helpers ────────────────────────────────────────────────────

def _build_file_tree(extract_dir: Path) -> list:
    """Sorted, forward-slash relative paths of every extracted file."""
    return sorted(
        str(f.relative_to(extract_dir)).replace(os.sep, '/')
        for f in extract_dir.rglob('*') if f.is_file()
    )


def _find_manifest(extract_dir: Path):
    """Return the OAMManifest.xml path, or None if the archive has no manifest."""
    direct = extract_dir / 'OAMManifest.xml'
    if direct.exists():
        return direct
    # Case-insensitive / alternately-named manifest, anywhere in the tree.
    for cand in extract_dir.rglob('*'):
        if cand.is_file() and 'manifest' in cand.name.lower() and cand.suffix.lower() == '.xml':
            return cand
    return None


def _parse_manifest(manifest_path: Path) -> dict:
    """Parse an existing OAMManifest.xml into the metadata dict."""
    try:
        root = ET.parse(manifest_path).getroot()
    except ET.ParseError as e:
        raise OAMIngestError(f"Could not parse OAMManifest.xml: {e}")

    def tag(el):
        return el.tag.split('}')[-1] if '}' in el.tag else el.tag

    def find_text(*tags, default=''):
        for t in tags:
            el = root.find(f'.//{t}')
            if el is None:
                for child in root.iter():
                    if tag(child) == t:
                        el = child
                        break
            if el is not None and el.text:
                return el.text.strip()
        return default

    try:
        width = int(find_text('width', 'Width', default='800'))
    except ValueError:
        width = 800
    try:
        height = int(find_text('height', 'Height', default='600'))
    except ValueError:
        height = 600

    return {
        'entry_point':      find_text('src', 'entryPoint', 'entry', default='index.html'),
        'manifest_version': find_text('version', 'manifestVersion', default=''),
        'responsive':       find_text('responsive', default='false').lower() in ('true', '1', 'yes'),
        'width':            width,
        'height':           height,
    }


def _synthesize_manifest(extract_dir: Path, file_tree: list) -> dict:
    """Derive OAM metadata for an archive that has no OAMManifest.xml, and write
    a generated manifest so the stored package is self-describing."""
    entry = _find_entry_html(extract_dir, file_tree)
    if not entry:
        raise OAMIngestError(
            "No OAMManifest.xml and no HTML entry point found in the archive — "
            "this doesn't look like an OAM/HTML5 Canvas package."
        )
    width, height = _parse_dimensions(extract_dir, entry, file_tree)
    responsive = _detect_responsive(extract_dir, entry, file_tree)

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<!-- Generated by CourseForge: source archive had no OAMManifest.xml -->\n'
        '<OAMManifest>\n'
        f'  <src>{entry}</src>\n'
        f'  <width>{width}</width>\n'
        f'  <height>{height}</height>\n'
        f'  <responsive>{"true" if responsive else "false"}</responsive>\n'
        '</OAMManifest>\n'
    )
    try:
        (extract_dir / 'OAMManifest.xml').write_text(xml, encoding='utf-8')
    except OSError:
        pass  # non-fatal — metadata is already derived

    return {'entry_point': entry, 'manifest_version': '', 'responsive': responsive,
            'width': width, 'height': height}


def _find_entry_html(extract_dir: Path, file_tree: list):
    """Pick the entry HTML: prefer index.html, then an Animate/Canvas page,
    shallowest first."""
    htmls = [f for f in file_tree if f.lower().endswith(('.html', '.htm'))]
    if not htmls:
        return None
    htmls.sort(key=lambda f: (f.count('/'), len(f)))  # shallowest, then shortest
    for f in htmls:
        if Path(f).name.lower() == 'index.html':
            return f
    for f in htmls:
        try:
            low = (extract_dir / f).read_text(encoding='utf-8', errors='ignore').lower()
        except OSError:
            continue
        if 'createjs' in low or '<canvas' in low:
            return f
    return htmls[0]


def _parse_dimensions(extract_dir: Path, entry_point: str, file_tree: list):
    """Recover stage width/height from the canvas tag or CreateJS lib.properties."""
    sources = ([entry_point] if entry_point else []) + [f for f in file_tree if f.lower().endswith('.js')]
    for rel in sources:
        try:
            txt = (extract_dir / rel).read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        # <canvas width=.. height=..> — attributes in any order
        ctag = _CANVAS_TAG_RE.search(txt)
        if ctag:
            wm = _ATTR_W_RE.search(ctag.group(0))
            hm = _ATTR_H_RE.search(ctag.group(0))
            if wm and hm and int(wm.group(1)) > 0 and int(hm.group(1)) > 0:
                return int(wm.group(1)), int(hm.group(1))
        # CreateJS: lib.properties = { width: W, height: H, ... }
        m = _LIBPROP_RE.search(txt)
        if m and int(m.group(1)) > 0 and int(m.group(2)) > 0:
            return int(m.group(1)), int(m.group(2))
    return 800, 600


def _forge_runtime_src() -> str:
    """Read the canonical forge-oam.js bundled with the server."""
    p = Path(__file__).resolve().parent.parent / 'assets' / 'forge-oam.js'
    return p.read_text(encoding='utf-8')


def _inject_forge_runtime(extract_dir: Path, entry_point: str) -> None:
    """Drop forge-oam.js into the package root and reference it from the entry
    HTML (after the CreateJS script so it can wrap the stage before init).
    Idempotent and best-effort — a failure must not abort the import."""
    try:
        # Always (re)write our canonical copy at the package root.
        (extract_dir / 'forge-oam.js').write_text(_forge_runtime_src(), encoding='utf-8')

        entry_path = extract_dir / entry_point
        if not entry_path.exists():
            return
        html = entry_path.read_text(encoding='utf-8', errors='ignore')

        # Relative path from the entry HTML's dir back to the package root.
        depth = entry_point.replace('\\', '/').count('/')
        rel = ('../' * depth) + 'forge-oam.js'
        tag = f'<script src="{rel}"></script>'

        if re.search(r'<script[^>]*forge-oam\.js', html, re.IGNORECASE):
            return  # already injected (match the actual tag, not a stray mention)

        # Prefer: right after the CreateJS script (forge must load before init()).
        m = re.search(r'<script[^>]*createjs[^>]*</script>', html, re.IGNORECASE)
        if m:
            html = html[:m.end()] + '\n' + tag + html[m.end():]
        elif '</head>' in html.lower():
            idx = html.lower().index('</head>')
            html = html[:idx] + tag + '\n' + html[idx:]
        elif '<body' in html.lower():
            idx = html.lower().index('<body')
            end = html.index('>', idx) + 1
            html = html[:end] + '\n' + tag + html[end:]
        else:
            html = tag + '\n' + html

        entry_path.write_text(html, encoding='utf-8')
    except OSError:
        pass


def _detect_responsive(extract_dir: Path, entry_point: str, file_tree: list) -> bool:
    """Adobe Animate emits AdobeAn.makeResponsive(<bool>, ...)."""
    sources = ([entry_point] if entry_point else []) + \
              [f for f in file_tree if f.lower().endswith(('.js', '.html', '.htm'))]
    for rel in sources[:12]:
        try:
            txt = (extract_dir / rel).read_text(encoding='utf-8', errors='ignore')
        except OSError:
            continue
        m = _RESPONSIVE_RE.search(txt)
        if m:
            return m.group(1).lower() == 'true'
    return False
