import os
from flask import Flask, jsonify, request
from flask_compress import Compress
from .config import config
from .extensions import db, migrate, cors

def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'production')

    app = Flask(__name__, static_folder='../client/dist', static_url_path='')
    app.config.from_object(config.get(config_name, config['default']))

    # Response compression (brotli, gzip fallback) for text payloads: the served
    # JS/CSS bundles + API JSON + the preview-html / SCO HTML. The built assets ship
    # ~1.6MB uncompressed; brotli cuts that to ~340KB over the wire. Static files are
    # served via send_static_file (direct_passthrough), which Flask-Compress skips —
    # serve_spa clears that flag for text assets so they get compressed too.
    app.config.setdefault('COMPRESS_MIMETYPES', [
        'text/html', 'text/css', 'text/javascript', 'application/javascript',
        'application/json', 'image/svg+xml', 'application/manifest+json',
    ])
    app.config.setdefault('COMPRESS_MIN_SIZE', 1024)
    Compress(app)

    # Cache content-hashed build assets hard. /assets/<name>-<hash>.<ext> is served
    # by Flask's built-in static route (static_url_path=''), which defaults to
    # no-cache — so the browser re-downloads immutable bundles every visit. The
    # hash changes on every deploy, so caching for a year is safe. Applied as an
    # after_request so it covers BOTH the static route and the serve_spa fallback.
    @app.after_request
    def _immutable_asset_cache(resp):
        if (request.path or '').startswith('/assets/'):
            resp.cache_control.no_cache = False
            resp.cache_control.public = True
            resp.cache_control.max_age = 31536000
            resp.cache_control.immutable = True
        return resp

    # Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r'/api/*': {'origins': app.config['CORS_ORIGINS']}})

    # Ensure upload folder exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'oam'), exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'media'), exist_ok=True)
    os.makedirs(os.path.join(app.config['UPLOAD_FOLDER'], 'exports'), exist_ok=True)

    # Register blueprints
    from .routes.projects import projects_bp
    from .routes.import_ import import_bp
    from .routes.media import media_bp
    from .routes.publish import publish_bp
    from .routes.themes import themes_bp
    from .routes.gui_block import gui_block_bp
    from .routes.templates import templates_bp
    from .routes.gui_shells import gui_shells_bp
    from .routes.search import search_bp
    from .routes.forgejs import forgejs_bp
    from .routes.forgeagent import forgeagent_bp

    app.register_blueprint(projects_bp)
    app.register_blueprint(import_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(publish_bp)
    app.register_blueprint(themes_bp)
    app.register_blueprint(gui_block_bp)
    app.register_blueprint(templates_bp)
    app.register_blueprint(gui_shells_bp)
    app.register_blueprint(search_bp)
    app.register_blueprint(forgejs_bp)
    app.register_blueprint(forgeagent_bp)

    # Edit-token gate (security review C2): protects destructive/upload/publish
    # routes behind CF_EDIT_TOKEN when set. Registered before the auto-seed hook
    # so a 401 short-circuits cleanly. See server/auth.py for the full contract.
    from .auth import register_edit_gate
    register_edit_gate(app)

    # Health check
    @app.route('/api/health')
    def health():
        return jsonify({'status': 'ok', 'service': 'courseforge'})

    # Version
    from .version import version_info

    @app.route('/api/version')
    def version():
        info = version_info()
        info['environment'] = os.environ.get('FLASK_ENV', 'production')
        return jsonify(info)

    # ── Demo reset — delete and re-create the built-in demo course ──
    # POST-only (security review C3): a GET could be triggered by any link/prefetch
    # and wipe demo edits. Also covered by the edit-token gate.
    @app.route('/api/demo/reset', methods=['POST'])
    def demo_reset():
        try:
            from .demo_seed import reset_demo
            pid = reset_demo()
            return jsonify({'status': 'ok', 'project_id': pid,
                            'message': 'Demo reset to defaults.'})
        except Exception as e:
            print(f'[demo_seed] Reset failed: {e}')
            return jsonify({'status': 'error', 'message': str(e)}), 500

    # ── Auto-seed demo on first launch (only if the DB is empty) ──
    @app.before_request
    def _auto_seed_once():
        if getattr(app, '_demo_seeded', False):
            return
        app._demo_seeded = True  # set immediately to narrow the race window
        try:
            from .models.project import Project
            from .demo_seed import seed_demo
            if Project.query.count() == 0:
                seed_demo()
        except Exception as e:
            print(f'[demo_seed] Warning: seed failed: {e}')
        try:
            from .template_seed import seed_builtin_templates
            seed_builtin_templates()
        except Exception as e:
            print(f'[template_seed] Warning: {e}')

    # Serve React SPA for all non-API routes (production)
    _COMPRESSIBLE = ('.js', '.css', '.html', '.json', '.svg', '.map', '.txt', '.xml', '.webmanifest')

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_spa(path):
        dist = app.static_folder
        if path and os.path.isfile(os.path.join(dist, path)):
            resp = app.send_static_file(path)
            # Vite emits content-hashed assets under /assets/<name>-<hash>.<ext>;
            # they're immutable, so cache them for a year. (index.html below stays
            # no-cache so a new deploy's hashes are always picked up.)
            if path.startswith('assets/'):
                resp.cache_control.public = True
                resp.cache_control.max_age = 31536000
                resp.cache_control.immutable = True
            # Clear direct_passthrough on text assets so Flask-Compress compresses
            # them (binary assets — images/glb/hdr/wasm — stay passthrough).
            if path.endswith(_COMPRESSIBLE):
                resp.direct_passthrough = False
            return resp
        index_path = os.path.join(dist, 'index.html')
        if os.path.isfile(index_path):
            resp = app.send_static_file('index.html')
            resp.direct_passthrough = False      # let Compress gzip/br the shell HTML
            resp.cache_control.no_cache = True    # always revalidate the entry document
            return resp
        # client/dist wasn't built — make the cause obvious instead of a bare 404.
        return jsonify({
            'status': 'error',
            'message': 'Frontend not built: client/dist is missing. '
                       'Run `cd client && npm run build`, or ensure the deploy build step produces it.',
            'api_health': '/api/health',
        }), 503

    return app
