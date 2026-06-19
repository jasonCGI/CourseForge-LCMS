import os
from dotenv import load_dotenv
load_dotenv()


class Config:
    SECRET_KEY         = os.environ.get('SECRET_KEY', 'dev')
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', 52428800))  # 50MB
    UPLOAD_FOLDER      = os.environ.get('UPLOAD_FOLDER', 'uploads')
    # CourseForge LCMS base URL — target of "Send to CourseForge" (server-to-
    # server POST to /api/gui-shells). Set to the CourseForge domain in prod.
    COURSEFORGE_URL    = os.environ.get('COURSEFORGE_URL', 'http://localhost:5000')


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config = {
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'default':     DevelopmentConfig,
}
