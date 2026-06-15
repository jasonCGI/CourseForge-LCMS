import os
from dotenv import load_dotenv
load_dotenv()

class Config:
    SECRET_KEY         = os.environ.get('SECRET_KEY', 'dev')
    MAX_CONTENT_LENGTH = int(os.environ.get('MAX_CONTENT_LENGTH', 524288000))  # 500MB
    UPLOAD_FOLDER      = os.environ.get('UPLOAD_FOLDER', 'uploads')

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'default':     DevelopmentConfig,
}
