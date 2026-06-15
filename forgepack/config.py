import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY            = os.environ.get('SECRET_KEY', 'dev')
    MAX_CONTENT_LENGTH    = int(os.environ.get('MAX_CONTENT_LENGTH', 2147483648))
    UPLOAD_FOLDER         = os.environ.get('UPLOAD_FOLDER', 'uploads')
    OUTPUT_FOLDER         = os.environ.get('OUTPUT_FOLDER', 'uploads/output')

    # FFmpeg quality presets
    PRESETS = {
        'training_standard': {
            'label':       'Training Standard',
            'description': '1080p · ~2Mbps MP4 · ~1.5Mbps WebM · Best balance',
            'mp4': {
                'vf':       'scale=-2:1080',
                'vcodec':   'libx264',
                'crf':      '23',
                'preset':   'slow',
                'acodec':   'aac',
                'ab':       '128k',
                'movflags': '+faststart',
            },
            'webm': {
                'vf':     'scale=-2:1080',
                'vcodec': 'libvpx-vp9',
                'crf':    '33',
                'b:v':    '0',
                'acodec': 'libopus',
                'ab':     '96k',
            },
        },
        'low_bandwidth': {
            'label':       'Low Bandwidth',
            'description': '720p · ~800Kbps MP4 · ~600Kbps WebM · For restricted networks',
            'mp4': {
                'vf':       'scale=-2:720',
                'vcodec':   'libx264',
                'crf':      '28',
                'preset':   'slow',
                'acodec':   'aac',
                'ab':       '96k',
                'movflags': '+faststart',
            },
            'webm': {
                'vf':     'scale=-2:720',
                'vcodec': 'libvpx-vp9',
                'crf':    '38',
                'b:v':    '0',
                'acodec': 'libopus',
                'ab':     '64k',
            },
        },
        'high_fidelity': {
            'label':       'High Fidelity',
            'description': '1080p · ~4Mbps MP4 · ~3Mbps WebM · Maximum quality',
            'mp4': {
                'vf':       'scale=-2:1080',
                'vcodec':   'libx264',
                'crf':      '18',
                'preset':   'slow',
                'acodec':   'aac',
                'ab':       '192k',
                'movflags': '+faststart',
            },
            'webm': {
                'vf':     'scale=-2:1080',
                'vcodec': 'libvpx-vp9',
                'crf':    '28',
                'b:v':    '0',
                'acodec': 'libopus',
                'ab':     '128k',
            },
        },
    }

    # Audio loudness presets (EBU R128)
    AUDIO_PRESETS = {
        'training_standard': {
            'label':'Training Standard','description':'-16 LUFS · 128kbps MP3 · DoD narration standard',
            'target_lufs':-16,'true_peak':-1.5,'lra':11,'mp3_bitrate':'128k','ogg_quality':'4','m4a_bitrate':'128k',
        },
        'low_bandwidth': {
            'label':'Low Bandwidth','description':'-18 LUFS · 96kbps MP3 · Restricted networks',
            'target_lufs':-18,'true_peak':-2.0,'lra':11,'mp3_bitrate':'96k','ogg_quality':'3','m4a_bitrate':'96k',
        },
        'high_quality': {
            'label':'High Quality','description':'-14 LUFS · 192kbps MP3 · Maximum fidelity',
            'target_lufs':-14,'true_peak':-1.0,'lra':13,'mp3_bitrate':'192k','ogg_quality':'6','m4a_bitrate':'192k',
        },
    }

class DevelopmentConfig(Config):
    DEBUG = True

class ProductionConfig(Config):
    DEBUG = False

config = {
    'development': DevelopmentConfig,
    'production':  ProductionConfig,
    'default':     DevelopmentConfig,
}
