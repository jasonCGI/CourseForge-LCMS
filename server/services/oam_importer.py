"""
CourseForge OAM Ingest Service

Accepts a .oam file (which is a ZIP archive), extracts it,
parses OAMManifest.xml, scans for SCORM API calls, and returns
a metadata dict suitable for creating an OamAsset DB record.

OAM format reference:
  - Root contains OAMManifest.xml
  - Entry point is usually index.html
  - Assets include JS, images, sounds
  - May contain internal SCORM API calls (LMSInitialize etc)
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


class OAMIngestError(Exception):
    """Raised when OAM file cannot be parsed or is malformed."""
    pass


def ingest_oam(file_path: Path, asset_id: str, upload_root: Path) -> dict:
    """
    Main entry point. Unzips OAM, parses manifest, scans for SCORM calls.

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
    original_dir = upload_root / 'oam' / asset_id

    extract_dir.mkdir(parents=True, exist_ok=True)

    # ── Extract ────────────────────────────────────────────────
    try:
        with zipfile.ZipFile(file_path, 'r') as zf:
            # Security check — no path traversal
            for member in zf.namelist():
                member_path = extract_dir / member
                if not str(member_path.resolve()).startswith(str(extract_dir.resolve())):
                    raise OAMIngestError(f"Unsafe path in archive: {member}")
            zf.extractall(extract_dir)
    except zipfile.BadZipFile as e:
        raise OAMIngestError(f"Could not extract OAM: {e}")

    # ── Parse manifest ─────────────────────────────────────────
    manifest_path = extract_dir / 'OAMManifest.xml'
    if not manifest_path.exists():
        # Try case-insensitive search
        candidates = list(extract_dir.glob('*manifest*'))
        if candidates:
            manifest_path = candidates[0]
        else:
            raise OAMIngestError("OAMManifest.xml not found in archive.")

    try:
        tree = ET.parse(manifest_path)
        root = tree.getroot()
    except ET.ParseError as e:
        raise OAMIngestError(f"Could not parse OAMManifest.xml: {e}")

    # Strip namespace if present
    def tag(el):
        return el.tag.split('}')[-1] if '}' in el.tag else el.tag

    def find_text(root, *tags, default=''):
        for t in tags:
            el = root.find(f'.//{t}')
            if el is None:
                # Try without namespace
                for child in root.iter():
                    if tag(child) == t:
                        el = child
                        break
            if el is not None and el.text:
                return el.text.strip()
        return default

    entry_point       = find_text(root, 'src', 'entryPoint', 'entry', default='index.html')
    manifest_version  = find_text(root, 'version', 'manifestVersion', default='')
    responsive_str    = find_text(root, 'responsive', default='false')
    responsive        = responsive_str.lower() in ('true', '1', 'yes')

    # Width/height — try common tag names
    try:
        width = int(find_text(root, 'width', 'Width', default='800'))
    except ValueError:
        width = 800

    try:
        height = int(find_text(root, 'height', 'Height', default='600'))
    except ValueError:
        height = 600

    # ── Build file tree ────────────────────────────────────────
    file_tree = sorted([
        str(f.relative_to(extract_dir))
        for f in extract_dir.rglob('*')
        if f.is_file()
    ])

    # ── Detect audio ──────────────────────────────────────────
    has_audio = any(
        Path(f).suffix.lower() in AUDIO_EXTENSIONS
        for f in file_tree
    )

    # ── Scan for SCORM API calls ───────────────────────────────
    has_scorm_calls = False
    js_files = [f for f in file_tree if f.endswith('.js')]

    for js_rel in js_files:
        js_path = extract_dir / js_rel
        try:
            content = js_path.read_text(encoding='utf-8', errors='ignore')
            if SCORM_PATTERN.search(content):
                has_scorm_calls = True
                break
        except OSError:
            continue

    # Also check entry point HTML for inline SCORM calls
    if not has_scorm_calls:
        html_path = extract_dir / entry_point
        if html_path.exists():
            try:
                content = html_path.read_text(encoding='utf-8', errors='ignore')
                if SCORM_PATTERN.search(content):
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
