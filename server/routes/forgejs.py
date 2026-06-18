"""ForgeJS authoring kit — expose the OAM runtime + authoring docs to Animate
authors as individual files and as a single downloadable zip.

The runtime served here is the SAME canonical `server/assets/forge-oam.js` that
the importer injects on upload, read live each request, so the kit never drifts
from what actually runs.
"""
import io
import re
import zipfile
from pathlib import Path

from flask import Blueprint, Response, send_file, jsonify

forgejs_bp = Blueprint('forgejs', __name__, url_prefix='/api/forgejs')

_ASSETS = Path(__file__).resolve().parent.parent / 'assets'
_KIT = _ASSETS / 'forgejs-kit'
_DOCS = Path(__file__).resolve().parent.parent.parent / 'docs'


def _runtime_src() -> str:
    return (_ASSETS / 'forge-oam.js').read_text(encoding='utf-8')


def _runtime_version() -> str:
    """Pull the runtime version from the file header (`version = (window... { version: 1 }`)."""
    try:
        m = re.search(r'version:\s*(\d+)', _runtime_src())
        if m:
            return m.group(1)
    except Exception:
        pass
    return '1'


def _read(path: Path, default: str = '') -> str:
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return default


def _build_readme() -> str:
    """Compose the kit README from the single-source authoring cheat-sheet plus
    the kit-specific local-testing section, so the authoring content lives in one
    place (docs/forgejs-authoring.md)."""
    version = _runtime_version()
    header = (
        f'# ForgeJS Authoring Kit (runtime v{version})\n\n'
        'Everything you need to make an Adobe Animate (HTML5 Canvas / OAM) animation '
        'interactive inside CourseForge, plus a harness to test it locally first.\n\n'
        'See the sections below for the authoring API; jump to **Local testing in '
        'Animate** to verify your work before uploading.\n\n---\n\n'
    )
    cheatsheet = _read(_DOCS / 'forgejs-authoring.md',
                       '(authoring cheat-sheet unavailable — see CourseForge docs)')
    local = _read(_KIT / 'local-testing.md', '')
    return header + cheatsheet + '\n\n' + local


@forgejs_bp.route('/forge-oam.js')
def forge_runtime():
    """Serve the canonical runtime as a downloadable .js."""
    return Response(
        _runtime_src(),
        mimetype='application/javascript',
        headers={'Content-Disposition': 'attachment; filename="forge-oam.js"'},
    )


@forgejs_bp.route('/manifest')
def manifest():
    """Lightweight metadata for the UI (version + what's in the kit)."""
    return jsonify({
        'version': _runtime_version(),
        'files': ['forge-oam.js', 'frame-scripts.js', 'test-harness.html', 'README.md'],
        'kit_url': '/api/forgejs/authoring-kit.zip',
        'runtime_url': '/api/forgejs/forge-oam.js',
    })


@forgejs_bp.route('/authoring-kit.zip')
def authoring_kit():
    """Bundle the runtime + snippets + harness + README into one zip."""
    version = _runtime_version()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('forge-oam.js', _runtime_src())
        z.writestr('frame-scripts.js', _read(_KIT / 'frame-scripts.js'))
        z.writestr('test-harness.html', _read(_KIT / 'test-harness.html'))
        z.writestr('README.md', _build_readme())
    buf.seek(0)
    return send_file(
        buf, mimetype='application/zip', as_attachment=True,
        download_name=f'forgejs-authoring-kit-v{version}.zip',
    )
