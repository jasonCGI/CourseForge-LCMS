import os
from dotenv import load_dotenv

load_dotenv()

DEFAULT_DATABASE_URI = 'postgresql://localhost/courseforge'


def resolve_database_uri():
    """
    Resolve the SQLAlchemy URI from DATABASE_URL.

    Falls back to a valid default when the env var is missing OR empty (an empty
    string is unparseable and would crash db.init_app at boot). Railway/Heroku
    hand out a 'postgres://' scheme, which SQLAlchemy requires as 'postgresql://'.
    """
    url = (os.environ.get('DATABASE_URL') or '').strip()
    if not url:
        return DEFAULT_DATABASE_URI
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    return url


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-me')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = resolve_database_uri()
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'uploads')
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', 104857600))  # 100MB default
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5173').split(',')

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig,
}
