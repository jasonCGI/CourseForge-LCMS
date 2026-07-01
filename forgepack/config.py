import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY            = os.environ.get('SECRET_KEY', 'dev')
    MAX_CONTENT_LENGTH    = int(os.environ.get('MAX_CONTENT_LENGTH', 2147483648))
    UPLOAD_FOLDER         = os.environ.get('UPLOAD_FOLDER', 'uploads')
    OUTPUT_FOLDER         = os.environ.get('OUTPUT_FOLDER', 'uploads/output')

    # ── Two-axis video presets: RESOLUTION × QUALITY (composed at encode time) ──
    # Resolution and quality are independent. The learner picks one of each; the
    # route composes them into the mp4/webm config the processor consumes. This
    # replaces the old single-list PRESETS (which conflated the two and could only
    # ever emit ≤1080p — and would UPSCALE a smaller source).
    #
    # Resolution axis — the scale filter. Fixed heights are DOWNSCALE-ONLY via
    # min(H,ih) so a source shorter than H is never upscaled; 'source' keeps the
    # native resolution (vf None → the processor omits -vf entirely).
    RESOLUTIONS = {
        'source': {'label': 'Source (native)', 'description': 'Keep the input resolution — no rescale', 'vf': None},
        '2160':   {'label': '2160p (4K)',      'description': 'Cap height at 2160p (downscale only)',   'vf': "scale=-2:'min(2160,ih)'"},
        '1080':   {'label': '1080p',           'description': 'Cap height at 1080p (downscale only)',   'vf': "scale=-2:'min(1080,ih)'"},
        '720':    {'label': '720p',            'description': 'Cap height at 720p (downscale only)',    'vf': "scale=-2:'min(720,ih)'"},
    }
    DEFAULT_RESOLUTION = '1080'

    # Quality axis — codec CRF + audio bitrate + x264 speed (resolution-independent).
    QUALITIES = {
        'draft':    {'label': 'Draft',    'description': 'Fast · smaller files (CRF 28 / 38)',        'mp4_crf': '28', 'webm_crf': '38', 'ab_mp4': '96k',  'ab_webm': '64k',  'x264': 'medium'},
        'standard': {'label': 'Standard', 'description': 'Balanced quality/size (CRF 23 / 33)',       'mp4_crf': '23', 'webm_crf': '33', 'ab_mp4': '128k', 'ab_webm': '96k',  'x264': 'slow'},
        'high':     {'label': 'High',     'description': 'Near-lossless · larger files (CRF 18 / 28)', 'mp4_crf': '18', 'webm_crf': '28', 'ab_mp4': '192k', 'ab_webm': '128k', 'x264': 'slow'},
    }
    DEFAULT_QUALITY = 'standard'

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

def compose_preset(resolution_key, quality_key):
    """Compose a RESOLUTION × QUALITY selection into the mp4/webm preset dict the
    video processor consumes. Unknown keys fall back to the defaults. For 'source'
    the vf is omitted (None) so the processor keeps the native resolution."""
    r = Config.RESOLUTIONS.get(resolution_key) or Config.RESOLUTIONS[Config.DEFAULT_RESOLUTION]
    q = Config.QUALITIES.get(quality_key) or Config.QUALITIES[Config.DEFAULT_QUALITY]
    mp4 = {'vcodec': 'libx264', 'crf': q['mp4_crf'], 'preset': q['x264'],
           'acodec': 'aac', 'ab': q['ab_mp4'], 'movflags': '+faststart'}
    webm = {'vcodec': 'libvpx-vp9', 'crf': q['webm_crf'], 'b:v': '0',
            'acodec': 'libopus', 'ab': q['ab_webm']}
    if r['vf']:
        mp4['vf'] = r['vf']
        webm['vf'] = r['vf']
    return {
        'label': r['label'] + ' · ' + q['label'],
        'description': r['description'] + ' · ' + q['description'],
        'resolution': resolution_key, 'quality': quality_key,
        'mp4': mp4, 'webm': webm,
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
