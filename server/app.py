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

    app.register_blueprint(projects_bp)
    app.register_blueprint(import_bp)
    app.register_blueprint(media_bp)
    app.register_blueprint(publish_bp)

    # Health check
    @app.route('/api/health')
    def health():
        return jsonify({'status': 'ok', 'service': 'courseforge'})

    # Serve React SPA for all non-API routes (production)
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_spa(path):
        dist = os.path.join(app.static_folder)
        if path and os.path.exists(os.path.join(dist, path)):
            return app.send_static_file(path)
        return app.send_static_file('index.html')

    return app
