import os
from flask import Flask, jsonify
from .config import config
from .extensions import db, migrate, cors

def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    app = Flask(__name__, static_folder='../client/dist', static_url_path='')
    app.config.from_object(config.get(config_name, config['default']))

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

    app.register_blueprint(projects_bp)
    app.register_blueprint(import_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(publish_bp)
    app.register_blueprint(themes_bp)
    app.register_blueprint(gui_block_bp)

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
    @app.route('/api/demo/reset', methods=['GET'])
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

    # Serve React SPA for all non-API routes (production)
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_spa(path):
        dist = app.static_folder
        if path and os.path.exists(os.path.join(dist, path)):
            return app.send_static_file(path)
        index_path = os.path.join(dist, 'index.html')
        if os.path.exists(index_path):
            return app.send_static_file('index.html')
        # client/dist wasn't built — make the cause obvious instead of a bare 404.
        return jsonify({
            'status': 'error',
            'message': 'Frontend not built: client/dist is missing. '
                       'Run `cd client && npm run build`, or ensure the deploy build step produces it.',
            'api_health': '/api/health',
        }), 503

    return app
