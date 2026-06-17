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

    for folder in [
        app.config['UPLOAD_FOLDER'],
        os.path.join(app.config['UPLOAD_FOLDER'], 'videos'),
        # 'clips' no longer used — export streams the .clip.json from memory.
    ]:
        os.makedirs(folder, exist_ok=True)

    from routes.clip  import clip_bp
    from routes.media import media_bp
    app.register_blueprint(clip_bp)
    app.register_blueprint(media_bp)

    @app.route('/api/health')
    def health():
        return jsonify({'status': 'ok', 'service': 'forgeclip', 'version': '1.0.0'})

    @app.route('/')
    def index():
        return app.send_static_file('index.html')

    return app
