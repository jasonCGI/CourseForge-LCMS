import os
from flask import Flask, jsonify
from flask_cors import CORS
from config import config

def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'development')

    app = Flask(__name__, static_folder='static', static_url_path='/static')
    app.config.from_object(config.get(config_name, config['default']))

    CORS(app)

    # Ensure upload dirs exist
    for folder in [
        app.config['UPLOAD_FOLDER'],
        os.path.join(app.config['UPLOAD_FOLDER'], 'source'),
        app.config['OUTPUT_FOLDER'],
    ]:
        os.makedirs(folder, exist_ok=True)

    # Routes
    from routes.video import video_bp
    app.register_blueprint(video_bp)

    # Health
    @app.route('/api/health')
    def health():
        return jsonify({'status': 'ok', 'service': 'forgepack', 'module': 'video'})

    # Version
    from version import version_info

    @app.route('/api/version')
    def version():
        info = version_info()
        info['environment'] = os.environ.get('FLASK_ENV', 'production')
        return jsonify(info)

    # Serve SPA
    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    return app
