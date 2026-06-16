"""
CourseForge Demo Seed
=====================
Creates a fully-populated demo project on first launch.
Idempotent — checks for an existing 'CourseForge Demo' before creating.

Called automatically from create_app() (before_request) if the projects
table is empty. Can also be run manually:  python -m server.demo_seed
"""

import uuid
import base64
from .extensions import db
from .models.project import Project, Course, Module, Lesson, Frame


# ── Placeholder SVG generator ──────────────────────────────────────────────────
def _svg_placeholder(label, color, icon, width=800, height=450):
    """Base64-encoded SVG data URI for a placeholder image."""
    svg = f"""<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}"
  xmlns="http://www.w3.org/2000/svg" font-family="Inter, system-ui, sans-serif">
  <rect width="{width}" height="{height}" fill="#0d1017"/>
  <rect x="2" y="2" width="{width-4}" height="{height-4}" rx="8" fill="none"
    stroke="{color}" stroke-width="2" stroke-dasharray="8 4" opacity="0.4"/>
  <text x="{width//2}" y="{height//2 - 24}" text-anchor="middle" font-size="48" opacity="0.5">{icon}</text>
  <text x="{width//2}" y="{height//2 + 20}" text-anchor="middle" font-size="18" font-weight="600"
    fill="{color}" opacity="0.9" letter-spacing="0.05em">{label}</text>
  <text x="{width//2}" y="{height//2 + 48}" text-anchor="middle" font-size="12" fill="#3A5A7A"
    font-family="'JetBrains Mono', Consolas, monospace">{width} &#215; {height} px &#183; placeholder</text>
</svg>"""
    encoded = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
    return f"data:image/svg+xml;base64,{encoded}"


# ── Block factories ────────────────────────────────────────────────────────────
def _text_block(body, narration=None):
    return {'id': str(uuid.uuid4()), 'type': 'text',
            'data': {'body': body, 'narrator_script': narration or ''}}

def _image_block(label='Course Image', caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': {
        'kind': 'image', 'placeholder_label': label, 'caption': caption,
        'asset_id': None, 'serve_url': _svg_placeholder(label, '#185FA5', '🖼'),
        'original_name': f'{label.lower().replace(" ","_")}.jpg', 'alt_text': label}}

def _video_block(label='Course Video', caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': {
        'kind': 'video', 'placeholder_label': label, 'caption': caption,
        'asset_id': None, 'serve_url': _svg_placeholder(label, '#1A7A5E', '🎬'),
        'original_name': f'{label.lower().replace(" ","_")}.mp4', 'use_videojs': True,
        'asset_meta': {'has_captions': False, 'has_webm': False, 'has_poster': False}}}

def _audio_block(label='Course Audio', caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': {
        'kind': 'audio', 'placeholder_label': label, 'caption': caption,
        'asset_id': None, 'original_name': f'{label.lower().replace(" ","_")}.mp3'}}

def _quiz_block(question, choices, correct_index,
                feedback_correct='Correct! Well done.',
                feedback_incorrect='Not quite — review the material and try again.'):
    return {'id': str(uuid.uuid4()), 'type': 'quiz', 'data': {
        'question': question, 'choices': choices, 'correct_index': correct_index,
        'feedback_correct': feedback_correct, 'feedback_incorrect': feedback_incorrect,
        'attempts_allowed': 2}}

def _hotspot_block(regions=None):
    default_regions = regions or [
        {'id': str(uuid.uuid4()), 'x': 20, 'y': 25, 'w': 18, 'h': 22, 'label': 'Region A', 'description': 'Click to learn about Region A.'},
        {'id': str(uuid.uuid4()), 'x': 55, 'y': 40, 'w': 20, 'h': 18, 'label': 'Region B', 'description': 'Click to learn about Region B.'},
        {'id': str(uuid.uuid4()), 'x': 70, 'y': 15, 'w': 16, 'h': 20, 'label': 'Region C', 'description': 'Click to learn about Region C.'},
    ]
    return {'id': str(uuid.uuid4()), 'type': 'hotspot', 'data': {
        'background_asset_id': None, 'image_id': None,
        'background_url': _svg_placeholder('Hotspot Image', '#7A3A9A', '⊕'),
        'regions': default_regions}}

def _branch_block(condition, true_label='Yes', false_label='No', true_frame_id=None, false_frame_id=None):
    return {'id': str(uuid.uuid4()), 'type': 'branch', 'data': {
        'condition': condition, 'true_label': true_label, 'false_label': false_label,
        'true_frame_id': true_frame_id or '', 'false_frame_id': false_frame_id or ''}}

def _wcn_block(wcn_type, title, text, modal=False, ack_label='I understand — proceed'):
    return {'id': str(uuid.uuid4()), 'type': 'wcn', 'data': {
        'wcn_type': wcn_type, 'title': title, 'text': text, 'modal': modal, 'ack_label': ack_label}}

def _oam_block(label='OAM Animation'):
    return {'id': str(uuid.uuid4()), 'type': 'oam', 'data': {
        'oam_asset_id': None, 'width': 800, 'height': 600, 'responsive': False,
        'scorm_bridge_enabled': False, 'caption': f'{label} — upload .oam file to activate',
        'entry_point': 'index.html'}}

def _ivideo_block(label='Interactive Video'):
    return {'id': str(uuid.uuid4()), 'type': 'ivideo', 'data': {
        'video_asset_id': None, 'clip_json': None,
        'caption': f'{label} — upload .mp4 + .clip.json to activate',
        'width': 800, 'height': 450}}


# ── Frame definitions ──────────────────────────────────────────────────────────
DEMO_FRAMES = [
    {'name': 'Introduction to CourseForge', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text_block(
            body='<h2>Welcome to CourseForge</h2>'
                 '<p>CourseForge is a web-native Learning Content Management System (LCMS) for modern '
                 'courseware production — from structure planning through SCORM-compliant publishing.</p>'
                 '<p>This demo course walks through each available block type. Replace placeholder '
                 'content with your own media and text to build a real course.</p>'
                 '<ul><li>Text blocks support rich formatting and narrator scripts</li>'
                 '<li>Media blocks handle image, video, and audio</li>'
                 '<li>Assessment blocks include quiz, hotspot, and branch interactions</li>'
                 '<li>Safety blocks deliver Warnings, Cautions, and Notes</li></ul>',
            narration='Welcome to CourseForge. This demonstration course introduces each available block type.'),
        _image_block('Course Overview Diagram', 'CourseForge block type overview — replace with course graphic'),
    ]},
    {'name': 'Working with Text Blocks', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text_block(
            body='<h2>Text Block</h2>'
                 '<p>The Text block is the foundation of any frame. It supports rich text formatting '
                 'including headings, paragraphs, lists, and inline emphasis.</p>'
                 '<p>Each Text block also has a <strong>Narrator Script</strong> — a plain-text version '
                 'read aloud by a narrator or TTS engine, separate from the visual HTML body.</p>',
            narration='Text blocks support rich HTML for display, plus a separate narrator script for audio.'),
    ]},
    {'name': 'Working with Image Blocks', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text_block('<h2>Image Block</h2><p>Upload an image to replace this placeholder. Process images with '
                    'ForgePack before uploading for optimal web delivery.</p>',
                    'The Image block displays a single image with an optional caption.'),
        _image_block('Sample Course Image', 'Replace with your own image — processed via ForgePack'),
    ]},
    {'name': 'Working with Video Blocks', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text_block('<h2>Video Block</h2><p>Upload a processed video to replace this placeholder. Use ForgePack '
                    'to convert source video to MP4 + WebM + VTT before uploading.</p>',
                    'The Video block uses Video.js for accessible, cross-browser playback.'),
        _video_block('Sample Course Video', 'Replace with ForgePack-processed video — MP4 + WebM + VTT'),
    ]},
    {'name': 'Working with Audio Blocks', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text_block('<h2>Audio Block</h2><p>Upload processed narration to replace this placeholder. Use ForgePack '
                    'to normalize loudness to -16 LUFS and export MP3 + OGG + M4A.</p>',
                    'The Audio block plays narration or ambient audio.'),
        _audio_block('Sample Narration Audio', 'Replace with ForgePack-processed audio — MP3 + OGG + M4A at -16 LUFS'),
    ]},
    {'name': 'Knowledge Check — Quiz', 'frame_type': 'assessment', 'lesson': 'Assessment Blocks', 'blocks': [
        _text_block('<h2>Quiz Block</h2><p>Select the best answer below. You have two attempts.</p>',
                    'Test your understanding with this knowledge check.'),
        _quiz_block(
            question='Which ForgePack module normalizes audio loudness before importing into CourseForge?',
            choices=['The Video module — it handles all media types',
                     'The Audio module — it normalizes to -16 LUFS',
                     'The Image module — it processes all file formats',
                     'No processing needed — upload directly'],
            correct_index=1,
            feedback_correct='Correct! The ForgePack Audio module normalizes to -16 LUFS (EBU R128) and outputs MP3, OGG, and M4A.',
            feedback_incorrect='Not quite. The ForgePack Audio module handles audio normalization specifically.'),
    ]},
    {'name': 'Hotspot Interaction', 'frame_type': 'assessment', 'lesson': 'Assessment Blocks', 'blocks': [
        _text_block('<h2>Hotspot Block</h2><p>Click each highlighted region to reveal more information.</p>',
                    'This hotspot interaction lets learners explore an image by clicking labeled regions.'),
        _hotspot_block(),
    ]},
    {'name': 'Branch Decision Point', 'frame_type': 'branch', 'lesson': 'Assessment Blocks', 'blocks': [
        _text_block('<h2>Branch Block</h2><p>Based on the scenario, select the appropriate path.</p>',
                    'Branch blocks route learners to different frames based on their response.'),
        _branch_block(
            condition='A learner uploaded a raw 4K .mov directly to CourseForge without processing. What should they do?',
            true_label='Process with ForgePack first', false_label='Upload directly — it will work'),
    ]},
    {'name': 'Warning Block (Inline)', 'frame_type': 'content', 'lesson': 'Safety & Notices', 'blocks': [
        _text_block('<h2>Warning Block — Inline Mode</h2><p>Warnings alert learners to conditions that may result in '
                    'serious consequences. Inline mode requires acknowledgment before continuing.</p>',
                    'Warning blocks communicate critical safety information.'),
        _wcn_block('warning', 'Critical Safety Requirement',
                   'Always verify system status before performing any procedure. Failure to confirm system state '
                   'may result in data loss, equipment damage, or personal injury. This step cannot be skipped.',
                   modal=False, ack_label='I understand — proceed'),
    ]},
    {'name': 'Caution Block (Modal)', 'frame_type': 'content', 'lesson': 'Safety & Notices', 'blocks': [
        _text_block('<h2>Caution Block — Modal Mode</h2><p>Cautions alert learners to conditions that may result in '
                    'equipment damage. Modal mode interrupts the frame and must be acknowledged.</p>',
                    'Caution blocks in modal mode interrupt the flow and require explicit acknowledgment.'),
        _wcn_block('caution', 'Handle With Care',
                   'This procedure involves sensitive configuration settings. Incorrect values may require a full '
                   'system reset. Verify all entries against the reference document before confirming.',
                   modal=True, ack_label='I have reviewed the requirements — continue'),
    ]},
    {'name': 'Note Block (Inline)', 'frame_type': 'content', 'lesson': 'Safety & Notices', 'blocks': [
        _text_block('<h2>Note Block — Inline Mode</h2><p>Notes provide supplementary information, tips, or '
                    'clarifications without interrupting the flow.</p>',
                    'Note blocks communicate helpful supplementary information.'),
        _wcn_block('note', 'Keyboard Shortcut',
                   'Press Space to play or pause the video player. Use the left and right arrow keys to seek. '
                   'These shortcuts work in all CourseForge-published video frames.',
                   modal=False, ack_label='Got it — continue'),
    ]},
    {'name': 'OAM — Adobe Animate Canvas', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'blocks': [
        _text_block('<h2>OAM Block</h2><p>The OAM block embeds Adobe Animate Canvas (HTML5) animations. Upload a '
                    '.oam file exported from Adobe Animate to activate this block.</p>',
                    'OAM blocks embed Adobe Animate HTML5 animations with automatic SCORM bridge integration.'),
        _oam_block('Adobe Animate Animation'),
    ]},
    {'name': 'Interactive Video', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'blocks': [
        _text_block('<h2>Interactive Video Block</h2><p>Plays a processed video with embedded interactions — '
                    'hotspots, quizzes, branches, and WCN overlays — triggered at timecodes. Author in ForgeClip, '
                    'export the .clip.json, and upload it here alongside the video.</p>',
                    'Interactive Video blocks combine video playback with timecode-triggered interactions from ForgeClip.'),
        _ivideo_block('ForgeClip Interactive Video'),
    ]},
]

LESSON_NAMES = ['Content Blocks', 'Assessment Blocks', 'Safety & Notices', 'Advanced Blocks']


def seed_demo():
    """Create the demo project if it doesn't already exist. Returns its id."""
    existing = Project.query.filter_by(name='CourseForge Demo').first()
    if existing:
        print(f'[demo_seed] Demo project already exists: {existing.id}')
        return existing.id

    print('[demo_seed] Creating demo project…')
    project = Project(name='CourseForge Demo',
                      description='Built-in demonstration course covering all CourseForge block types.')
    db.session.add(project); db.session.flush()

    course = Course(project_id=project.id, name='Introduction to CourseForge', order_index=0)
    db.session.add(course); db.session.flush()

    module = Module(course_id=course.id, name='Block Types Overview', order_index=0)
    db.session.add(module); db.session.flush()

    lessons = {}
    for idx, name in enumerate(LESSON_NAMES):
        lesson = Lesson(module_id=module.id, name=name, order_index=idx)
        db.session.add(lesson); db.session.flush()
        lessons[name] = lesson

    counters = {name: 0 for name in LESSON_NAMES}
    for fd in DEMO_FRAMES:
        lesson = lessons.get(fd['lesson'])
        if not lesson:
            continue
        order = counters[fd['lesson']]; counters[fd['lesson']] += 1
        db.session.add(Frame(lesson_id=lesson.id, name=fd['name'],
                             frame_type=fd.get('frame_type', 'content'),
                             order_index=order, content={'blocks': fd['blocks']}))

    db.session.commit()
    print(f'[demo_seed] Demo project created: {project.id} ({len(DEMO_FRAMES)} frames, {len(LESSON_NAMES)} lessons)')
    return project.id


if __name__ == '__main__':
    from server.app import create_app
    app = create_app()
    with app.app_context():
        seed_demo()
