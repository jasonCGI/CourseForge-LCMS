"""
CourseForge Demo Seed — Expanded
=================================
Full demo course covering all block types with real example content.
Idempotent — checks for existing demo before creating.
Called automatically on first launch if the DB is empty.

Manual reset:  GET /api/demo/reset
"""

import uuid
import base64
import shutil
from pathlib import Path
from flask import current_app
from .extensions import db


# ── SVG placeholder generators ─────────────────────────────────────────────────

def _svg(label, color, icon, sub='placeholder', w=800, h=450):
    svg = f"""<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}"
  xmlns="http://www.w3.org/2000/svg"
  font-family="'IBM Plex Mono', 'Courier New', monospace">
  <rect width="{w}" height="{h}" fill="#060810"/>
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="{color}" stroke-width="0.3" opacity="0.08"/>
    </pattern>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#grid)"/>
  <rect x="2" y="2" width="{w-4}" height="{h-4}" rx="6" fill="none" stroke="{color}" stroke-width="1.5" stroke-dasharray="8 4" opacity="0.25"/>
  <rect x="0" y="0" width="{w}" height="4" fill="{color}" opacity="0.6"/>
  <text x="{w//2}" y="{h//2 - 28}" text-anchor="middle" font-size="52" opacity="0.35">{icon}</text>
  <text x="{w//2}" y="{h//2 + 16}" text-anchor="middle" font-size="20" font-weight="600" fill="{color}" opacity="0.85" letter-spacing="0.04em">{label}</text>
  <text x="{w//2}" y="{h//2 + 42}" text-anchor="middle" font-size="11" fill="#3A5A7A" letter-spacing="0.08em">{sub}</text>
  <text x="{w//2}" y="{h - 16}" text-anchor="middle" font-size="10" fill="#1c2a3a">{w} &#215; {h}</text>
  <path d="M16,16 h20 M16,16 v20" stroke="{color}" stroke-width="2" opacity="0.3" fill="none"/>
  <path d="M{w-16},16 h-20 M{w-16},16 v20" stroke="{color}" stroke-width="2" opacity="0.3" fill="none"/>
  <path d="M16,{h-16} h20 M16,{h-16} v-20" stroke="{color}" stroke-width="2" opacity="0.3" fill="none"/>
  <path d="M{w-16},{h-16} h-20 M{w-16},{h-16} v-20" stroke="{color}" stroke-width="2" opacity="0.3" fill="none"/>
</svg>"""
    enc = base64.b64encode(svg.encode('utf-8')).decode('utf-8')
    return f"data:image/svg+xml;base64,{enc}"


# ── Block factories ─────────────────────────────────────────────────────────────

def _text(body, narration=''):
    return {'id': str(uuid.uuid4()), 'type': 'text',
            'data': {'body': body, 'narrator_script': narration}}

def _image(label='Course Image', caption='', color='#185FA5', icon='🖼'):
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': {
        'kind': 'image', 'placeholder_label': label, 'caption': caption, 'asset_id': None,
        'serve_url': _svg(label, color, icon, sub='replace with actual image'),
        'original_name': label.lower().replace(' ', '_') + '.jpg', 'alt_text': label}}

def _video(label='Course Video', caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': {
        'kind': 'video', 'placeholder_label': label, 'caption': caption, 'asset_id': None,
        'serve_url': _svg(label, '#1A7A5E', '🎬', sub='process with ForgePack first'),
        'original_name': label.lower().replace(' ', '_') + '.mp4', 'use_videojs': True,
        'asset_meta': {'has_captions': False, 'has_webm': False, 'has_poster': False}}}

def _audio(label='Course Audio', caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': {
        'kind': 'audio', 'placeholder_label': label, 'caption': caption, 'asset_id': None,
        'original_name': label.lower().replace(' ', '_') + '.mp3'}}

def _quiz(question, choices, correct_index, feedback_correct='Correct!',
          feedback_incorrect='Not quite — review and try again.'):
    return {'id': str(uuid.uuid4()), 'type': 'quiz', 'data': {
        'question': question, 'choices': choices, 'correct_index': correct_index,
        'feedback_correct': feedback_correct, 'feedback_incorrect': feedback_incorrect,
        'attempts_allowed': 2}}

def _hotspot(regions=None):
    return {'id': str(uuid.uuid4()), 'type': 'hotspot', 'data': {
        'background_asset_id': None, 'image_id': None,
        'background_url': _svg('Hotspot Background', '#7A3A9A', '⊕', sub='upload image — then place hotspot regions'),
        'regions': regions or [
            {'id': str(uuid.uuid4()), 'x': 18, 'y': 22, 'w': 20, 'h': 24, 'label': 'Region A', 'description': 'Click to reveal information about Region A.'},
            {'id': str(uuid.uuid4()), 'x': 52, 'y': 35, 'w': 22, 'h': 20, 'label': 'Region B', 'description': 'Click to reveal information about Region B.'},
            {'id': str(uuid.uuid4()), 'x': 70, 'y': 18, 'w': 18, 'h': 22, 'label': 'Region C', 'description': 'Click to reveal information about Region C.'},
        ]}}

def _branch(condition, true_label='Yes', false_label='No'):
    return {'id': str(uuid.uuid4()), 'type': 'branch', 'data': {
        'condition': condition, 'true_label': true_label, 'false_label': false_label,
        'true_frame_id': '', 'false_frame_id': ''}}

def _wcn(wcn_type, title, text, modal=False, ack_label='I understand — proceed'):
    return {'id': str(uuid.uuid4()), 'type': 'wcn', 'data': {
        'wcn_type': wcn_type, 'title': title, 'text': text, 'modal': modal, 'ack_label': ack_label}}

def _model3d(caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'model3d', 'data': {
        'model_asset_id': None, 'model_filename': None, 'model_serve_url': None, 'file_size_mb': None,
        'viewer_height': 380, 'bg_color': '#060810',
        'caption': caption or '3D model placeholder — upload .glb exported from 3ds Max or Blender',
        'annotations': [
            {'id': str(uuid.uuid4()), 'label': 'Example annotation A',
             'description': 'Click pins on the model to reveal part labels and descriptions. '
                            'Place pins in the editor by enabling preview then clicking the Place pin button.',
             'position': {'x': 0.5, 'y': 0.8, 'z': 0.0}, 'color': '#F59E0B'},
            {'id': str(uuid.uuid4()), 'label': 'Example annotation B',
             'description': 'Pins track the model as learners orbit and zoom. '
                            'Pins behind the model are hidden automatically.',
             'position': {'x': -0.5, 'y': 0.3, 'z': 0.4}, 'color': '#F59E0B'},
        ]}}

def _ivideo(caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'ivideo', 'data': {
        'video_asset_id': None, 'clip_asset_id': None, 'video_filename': None, 'video_serve_url': None,
        'interaction_count': None, 'video_duration': None,
        'caption': caption or 'Interactive video placeholder — process video in ForgePack → '
                              'author interactions in ForgeClip → export mediaPackage → '
                              'upload _baked.mp4 + _baked.clip.json here'}}

def _oam(caption=''):
    return {'id': str(uuid.uuid4()), 'type': 'oam', 'data': {
        'oam_asset_id': None, 'width': 800, 'height': 500, 'responsive': False,
        'scorm_bridge_enabled': False, 'entry_point': 'index.html',
        'caption': caption or 'Adobe Animate Canvas placeholder — export animation as .oam '
                              'from Adobe Animate CC then upload here'}}


# ── Frame definitions ───────────────────────────────────────────────────────────

DEMO_FRAMES = [
    # ── Welcome ──
    {'name': 'Welcome to CourseForge', 'frame_type': 'content', 'lesson': 'Welcome', 'blocks': [
        _text(
            body='''<h2>CourseForge Platform Overview</h2>
<p>This demonstration course walks through every block type available in CourseForge — the
web-native LCMS built for DoD training and simulation courseware production.</p>
<p>Each frame demonstrates one block type with example content. Replace placeholders with your
own media, questions, and 3D assets to build a real course.</p>
<h3>What you'll see in this course:</h3>
<ul>
  <li><strong>Content blocks</strong> — Text, Image, Video, Audio</li>
  <li><strong>Assessment blocks</strong> — Quiz, Hotspot, Branch</li>
  <li><strong>Safety blocks</strong> — Warning, Caution, Note</li>
  <li><strong>Advanced blocks</strong> — 3D Model, Interactive Video, OAM</li>
</ul>''',
            narration='Welcome to the CourseForge Platform Overview. This course demonstrates each '
                      'available block type with example content. Navigate using the content tree in the sidebar.'),
        _image(label='CourseForge Platform Overview',
               caption='CourseForge — web-native LCMS for DoD training production', color='#185FA5', icon='⚙'),
    ]},
    {'name': 'How to Navigate This Course', 'frame_type': 'content', 'lesson': 'Welcome', 'blocks': [
        _text(
            body='''<h2>Navigation</h2>
<p>Use the <strong>content tree</strong> in the left sidebar to jump to any lesson or frame.</p>
<p>To preview any frame as a learner would see it, click <strong>▶ Preview</strong> in the frame
editor toolbar. The preview renders all block interactions — quiz answers, hotspot clicks, WCN
acknowledgments.</p>
<p>When ready, click <strong>⬇ Publish</strong> to package the course as SCORM 1.2, SCORM 2004,
or a Web Bundle.</p>
<h3>Demo course notes:</h3>
<ul>
  <li>Media blocks show placeholder images until real assets are uploaded</li>
  <li>3D model and interactive video blocks require uploaded files to activate</li>
  <li>All text, quiz, and WCN blocks are fully functional as-is</li>
</ul>''',
            narration='Use the content tree on the left to navigate. Click Preview to see any frame '
                      'as a learner would. Click Publish when ready to package the course for your LMS.'),
    ]},

    # ── Content Blocks ──
    {'name': 'Text Block', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text(
            body='''<h2>Text Block</h2>
<p>The Text block is the foundation of any CourseForge frame. It supports full rich text formatting
including headings, paragraphs, lists, bold, italic, and inline code.</p>
<p>Each Text block has two fields:</p>
<ul>
  <li><strong>Body</strong> — the HTML content displayed on screen</li>
  <li><strong>Narrator script</strong> — plain text read aloud, kept separate from the visual layout</li>
</ul>
<p>Best practices:</p>
<ul>
  <li>Keep on-screen text concise — move detail to the narrator script</li>
  <li>Use headings to establish hierarchy within a frame</li>
  <li>Pair long text with a supporting image in the next block</li>
</ul>''',
            narration='The Text block supports rich HTML formatting for on-screen display, plus a '
                      'separate narrator script for audio narration. Keep on-screen text concise.'),
    ]},
    {'name': 'Image Block', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text(body='<h2>Image Block</h2><p>The Image block displays a single image with an optional caption '
                   'and alt text. Process images through ForgePack first — it outputs WebP, PNG, retina, '
                   'thumbnail, and OG variants with EXIF stripped.</p>',
              narration='The Image block displays a single optimized image. Process images through '
                        'ForgePack first to generate WebP and PNG variants and strip EXIF metadata.'),
        _image(label='Example Course Image',
               caption='Replace this placeholder — process your image with ForgePack and upload the WebP output',
               color='#185FA5', icon='🖼'),
    ]},
    {'name': 'Video Block', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text(body='<h2>Video Block</h2><p>The Video block uses the Video.js player for accessible, '
                   'cross-browser delivery. Process source video through ForgePack to generate MP4, WebM '
                   'fallback, poster, and VTT caption file — auto-paired by base name on upload.</p>',
              narration='The Video block uses Video.js for accessible delivery. Process your source video '
                        'through ForgePack to generate the MP4, WebM, poster, and caption file.'),
        _video(label='Example Course Video',
               caption='Replace this placeholder — use the ForgePack Video module first'),
    ]},
    {'name': 'Audio Block', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text(body='<h2>Audio Block</h2><p>The Audio block plays narration or ambient audio. Process source '
                   'WAV/AIFF through ForgePack Audio to normalize loudness to the DoD standard (−16 LUFS, '
                   'EBU R128) and output MP3, OGG, and M4A — auto-paired in CourseForge.</p>',
              narration='The Audio block plays processed narration. Use ForgePack Audio to normalize to '
                        'negative sixteen LUFS and generate MP3, OGG, and M4A before uploading.'),
        _audio(label='Example Narration Audio',
               caption='Replace this placeholder — process with ForgePack Audio for −16 LUFS normalization'),
    ]},

    # ── Assessment Blocks ──
    {'name': 'Quiz Block', 'frame_type': 'assessment', 'lesson': 'Assessment Blocks', 'blocks': [
        _text(body='<h2>Quiz Block</h2><p>Test your understanding of the CourseForge workflow. Select the '
                   'best answer and click Submit. You have two attempts.</p>',
              narration='Test your understanding with this knowledge check. Select the best answer and '
                        'click Submit. You have two attempts.'),
        _quiz(
            question='A courseware developer receives a raw .mov file from a video producer. What should '
                     'they do before uploading it to a CourseForge Video block?',
            choices=[
                'Upload it directly — CourseForge converts formats automatically',
                'Rename the file to .mp4 and upload it',
                'Process it through ForgePack Video to generate MP4, WebM, poster, and caption file',
                'Convert it in QuickTime Player and upload the result',
            ],
            correct_index=2,
            feedback_correct='Correct! ForgePack Video processes the source file and generates all required '
                             'output formats — MP4 (primary), WebM (fallback), poster, and VTT caption file. '
                             'CourseForge auto-pairs them by base name on upload.',
            feedback_incorrect='Not quite. CourseForge does not transcode video internally. Source files '
                               'should be processed through ForgePack Video first, which generates the MP4, '
                               'WebM, poster, and VTT caption file the Video block needs.'),
    ]},
    {'name': 'Hotspot Block', 'frame_type': 'assessment', 'lesson': 'Assessment Blocks', 'blocks': [
        _text(body='<h2>Hotspot Block</h2><p>The Hotspot block overlays clickable regions on an image. '
                   'Learners click each region to reveal information. Upload a background image, then draw '
                   'regions and add labels and descriptions in the editor.</p>'
                   '<p>Click each highlighted region below to explore the interaction.</p>',
              narration='The Hotspot block lets learners explore an image by clicking labeled regions. '
                        'Upload a background image, draw regions, and add a label and description for each.'),
        _hotspot(),
    ]},
    {'name': 'Branch Block', 'frame_type': 'branch', 'lesson': 'Assessment Blocks', 'blocks': [
        _text(body='<h2>Branch Block</h2><p>The Branch block presents a decision point that routes learners '
                   'to different frames based on their response — supporting adaptive learning paths.</p>'
                   '<p>Select an option below to see the branch interaction.</p>',
              narration='The Branch block routes learners to different frames based on their response. '
                        'Set the target frame for each path in the block editor.'),
        _branch(condition='Has the learner completed the prerequisite ForgePack training before authoring '
                          'video content?',
                true_label='Yes — continue to advanced content',
                false_label='No — review ForgePack first'),
    ]},

    # ── Safety Blocks ──
    {'name': 'Warning Block (Inline)', 'frame_type': 'content', 'lesson': 'Safety Blocks', 'blocks': [
        _text(body='<h2>Warning Block — Inline Mode</h2><p>The Warning block (WCN — Warning, Caution, Note) '
                   'communicates safety-critical information using MIL-SPEC hazard symbol conventions. In '
                   '<strong>inline mode</strong>, it appears within the frame and requires learner '
                   'acknowledgment before they continue.</p>',
              narration='Warning blocks use MIL-SPEC hazard symbols for safety-critical information. In inline '
                        'mode, the warning appears within the frame and requires acknowledgment before proceeding.'),
        _wcn(wcn_type='warning', title='Critical Safety Requirement',
             text='All personnel must verify system power-down and lockout/tagout procedures are complete '
                  'before accessing internal components. Failure to confirm system state prior to any '
                  'maintenance action may result in serious injury or death. This step is mandatory and '
                  'cannot be bypassed.',
             modal=False, ack_label='I understand — proceed'),
    ]},
    {'name': 'Caution Block (Modal)', 'frame_type': 'content', 'lesson': 'Safety Blocks', 'blocks': [
        _text(body='<h2>Caution Block — Modal Mode</h2><p>In <strong>modal mode</strong>, the WCN block '
                   'interrupts the frame entirely — content is hidden behind an overlay until the learner '
                   'explicitly acknowledges. Use modal mode for procedural requirements that must not be '
                   'missed.</p><p>Click the Caution button below to trigger the modal.</p>',
              narration='In modal mode, the caution block interrupts the frame entirely and requires explicit '
                        'acknowledgment before any other content is accessible.'),
        _wcn(wcn_type='caution', title='Torque Specification — Do Not Exceed',
             text='Fasteners on this assembly must be torqued to 35 ft-lbs using a calibrated torque wrench. '
                  'Over-torquing will strip threads in the composite housing and require full panel '
                  'replacement. Verify torque wrench calibration date before beginning. Do not proceed if '
                  'calibration is out of date.',
             modal=True, ack_label='I have verified torque specifications — continue'),
    ]},
    {'name': 'Note Block (Inline)', 'frame_type': 'content', 'lesson': 'Safety Blocks', 'blocks': [
        _text(body='<h2>Note Block — Inline Mode</h2><p>The Note block provides supplementary information, '
                   'tips, or clarifications without interrupting the learning flow. Notes are informational — '
                   'the acknowledge button is present but not required for progression.</p>',
              narration='Note blocks communicate helpful supplementary information. Unlike warnings and '
                        'cautions, notes do not interrupt the learning flow or block progression.'),
        _wcn(wcn_type='note', title='Keyboard Navigation',
             text='CourseForge-published courses are fully keyboard navigable. In the 3D model viewer: arrow '
                  'keys orbit, +/- zoom, R resets the camera. Tab navigates between annotation pins and Enter '
                  'opens the popover. All interactions meet WCAG 2.1 AA and Section 508 requirements.',
             modal=False, ack_label='Got it — continue'),
    ]},

    # ── Advanced Blocks ──
    {'name': '3D Model Block', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'blocks': [
        _text(body='<h2>3D Model Block</h2><p>The 3D Model block renders interactive GLB files using Three.js. '
                   'Learners orbit and zoom to examine the model from any angle. Authors place annotation pins '
                   'on the model surface directly in the editor with the <strong>✦ Place pin</strong> button.</p>'
                   '<p>Export GLB from 3ds Max via <em>File → Export → glTF 2.0</em> with textures embedded. '
                   'Run Reset XForm before export.</p>',
              narration='The 3D Model block renders interactive GLB files. Learners orbit and zoom using mouse '
                        'or keyboard. Authors place annotation pins on the model surface to label parts.'),
        _model3d(caption='Upload a .glb file to activate this block. Export from 3ds Max: '
                         'File → Export → glTF 2.0 · embed textures · Reset XForm first'),
    ]},
    {'name': 'Interactive Video Block', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'blocks': [
        _text(body='<h2>Interactive Video Block</h2><p>The Interactive Video block (ivideo) combines video '
                   'playback with timecode-triggered interactions authored in <strong>ForgeClip</strong> — '
                   'quiz checkpoints, hotspot overlays, branch points, WCN overlays, and annotations.</p>'
                   '<p><strong>Workflow:</strong></p><ol>'
                   '<li>Process source video in ForgePack (Interactive Video preset — CFR 30fps)</li>'
                   '<li>Author interactions in ForgeClip — place markers at timecodes</li>'
                   '<li>Click <strong>🔥 Bake &amp; Export</strong> — inserts 1s hold frames at each marker</li>'
                   '<li>Upload the <code>_baked.mp4</code> and <code>_baked.clip.json</code> here</li></ol>',
              narration='The Interactive Video block plays a processed video with timecode-triggered '
                        'interactions authored in ForgeClip. After authoring, Bake and Export inserts hold '
                        'frames, then upload the baked MP4 and clip JSON here.'),
        _ivideo(caption='Upload _baked.mp4 + _baked.clip.json from the ForgeClip mediaPackage to activate'),
    ]},
    {'name': 'OAM Block — Adobe Animate', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'blocks': [
        _text(body='<h2>OAM Block — Adobe Animate Canvas</h2><p>The OAM block embeds Adobe Animate Canvas '
                   '(HTML5) animations directly in a frame. Export your animation as an OAM package from '
                   'Adobe Animate CC and upload it here — CourseForge extracts all assets automatically.</p>'
                   '<p>Enable the SCORM bridge toggle for animations that report completion or score to the '
                   'LMS via the <code>window.API</code> object.</p>',
              narration='The OAM block embeds Adobe Animate HTML5 animations. Export as an OAM package from '
                        'Adobe Animate CC, upload it here, and CourseForge handles asset extraction. Enable '
                        'the SCORM bridge if the animation reports completion to the LMS.'),
        _oam(caption='Upload .oam exported from Adobe Animate CC to activate. '
                     'File → Publish Settings → OAM package in Animate'),
    ]},

    # ── Summary ──
    {'name': 'Platform Summary', 'frame_type': 'content', 'lesson': 'Course Summary', 'blocks': [
        _text(body='''<h2>CourseForge Platform Summary</h2>
<p>You've seen all available block types in the CourseForge ecosystem. Quick reference:</p>
<h3>Content blocks</h3>
<ul><li><strong>Text</strong> — rich HTML + narrator script</li>
<li><strong>Image</strong> — WebP/PNG via ForgePack Image</li>
<li><strong>Video</strong> — Video.js via ForgePack Video</li>
<li><strong>Audio</strong> — MP3/OGG/M4A via ForgePack Audio</li></ul>
<h3>Assessment blocks</h3>
<ul><li><strong>Quiz</strong> — multiple choice, 2 attempts, feedback</li>
<li><strong>Hotspot</strong> — clickable regions on an image</li>
<li><strong>Branch</strong> — adaptive routing to different frames</li></ul>
<h3>Safety blocks (WCN)</h3>
<ul><li><strong>Warning</strong> — critical safety, MIL-SPEC triangle</li>
<li><strong>Caution</strong> — equipment risk, MIL-SPEC diamond</li>
<li><strong>Note</strong> — supplementary information, circle-i</li></ul>
<h3>Advanced blocks</h3>
<ul><li><strong>3D Model</strong> — GLB viewer with orbit, zoom, annotations</li>
<li><strong>Interactive Video</strong> — ForgeClip baked interactions</li>
<li><strong>OAM</strong> — Adobe Animate Canvas with SCORM bridge</li></ul>''',
              narration='This completes the CourseForge Platform Overview. You have seen all block types '
                        'across content, assessment, safety, and advanced categories. Replace the demo '
                        'content with your own assets and publish to SCORM or Web Bundle format.'),
    ]},
    {'name': 'Next Steps', 'frame_type': 'content', 'lesson': 'Course Summary', 'blocks': [
        _text(body='''<h2>Next Steps</h2>
<p>You're ready to build your first real course. Recommended workflow:</p>
<h3>1. Plan structure in ForgeBlueprint</h3>
<p>Define your hierarchy (Course → Module → Lesson → Frame) and spec narration, media placeholders,
and KC questions per frame. Export the enriched JSON and import it into CourseForge.</p>
<h3>2. Process assets in ForgePack</h3>
<ul><li>Video → MP4 + WebM + VTT + poster</li>
<li>Audio → MP3 + OGG + M4A at −16 LUFS</li>
<li>Image → WebP + PNG + @2x + thumb + OG</li></ul>
<h3>3. Author interactions in ForgeClip</h3>
<p>Upload your processed video, place markers, then Bake &amp; Export the mediaPackage and upload
the baked files to CourseForge.</p>
<h3>4. Publish from CourseForge</h3>
<p>Click ⬇ Publish, run the 508 audit, select your format, and download. Validate in SCORM Cloud
before submitting to your LMS.</p>''',
              narration='You are ready to build your first real course. Plan structure in ForgeBlueprint, '
                        'process assets in ForgePack, author interactions in ForgeClip, then assemble and '
                        'publish in CourseForge. Validate in SCORM Cloud before submitting to your LMS.'),
    ]},
]

LESSON_ORDER = ['Welcome', 'Content Blocks', 'Assessment Blocks', 'Safety Blocks', 'Advanced Blocks', 'Course Summary']


# ── Seeder ───────────────────────────────────────────────────────────────────────

def _wire_demo_assets(project):
    """Register the bundled sample media (server/demo_assets/) as real MediaAssets
    and wire them into the demo's image/video/audio/3D/hotspot blocks, so the demo
    previews + publishes with LIVE media instead of placeholders. Idempotent: the
    demo media dir is cleared first so repeated resets don't orphan files."""
    from sqlalchemy.orm.attributes import flag_modified
    from .models.project import Frame, Lesson, Module, Course
    from .models.media import MediaAsset
    from .routes.media import _serialize_media

    base = Path(__file__).parent / 'demo_assets'
    if not base.is_dir():
        print('[demo_seed] demo_assets/ missing — skipping live-asset wiring')
        return
    media_dir = Path(current_app.config['UPLOAD_FOLDER']) / 'media' / 'demo'
    shutil.rmtree(media_dir, ignore_errors=True)
    media_dir.mkdir(parents=True, exist_ok=True)

    def reg(src_name, kind, mime, companions=None):
        aid = str(uuid.uuid4())
        src = base / src_name
        dest = media_dir / f'{aid}{src.suffix}'
        shutil.copyfile(src, dest)
        a = MediaAsset(id=aid, project_id=project.id, kind=kind, original_name=src_name,
                       stored_path=str(dest), mime_type=mime, file_size=dest.stat().st_size,
                       companion_files=companions or {})
        db.session.add(a)
        return a

    webm   = reg('sample_video.webm', 'video', 'video/webm')
    poster = reg('sample_poster.jpg', 'image', 'image/jpeg')
    vtt    = reg('sample_captions.vtt', 'caption', 'text/vtt')
    db.session.flush()
    mp4 = reg('sample_video.mp4', 'video', 'video/mp4', companions={
        'webm_asset_id': webm.id, 'poster_asset_id': poster.id,
        'vtt_asset_id': vtt.id, 'has_audio': True})
    img = reg('sample_image.jpg', 'image', 'image/jpeg')
    aud = reg('sample_audio.mp3', 'audio', 'audio/mpeg')
    glb = reg('sample_model.glb', 'model3d', 'model/gltf-binary')
    hb  = reg('hotspot_bg.jpg',  'image', 'image/jpeg')
    db.session.flush()

    mp4_meta = _serialize_media(mp4)

    frames = (Frame.query.join(Lesson, Frame.lesson_id == Lesson.id)
              .join(Module, Lesson.module_id == Module.id)
              .join(Course, Module.course_id == Course.id)
              .filter(Course.project_id == project.id).all())
    for fr in frames:
        blocks = (fr.content or {}).get('blocks', [])
        changed = False
        for b in blocks:
            d = b.get('data', {}); t = b.get('type')
            if fr.name == 'Image Block' and t == 'media' and d.get('kind') == 'image':
                d.update(asset_id=img.id, serve_url=f'/api/media/serve/{img.id}',
                         original_name='sample_image.jpg', asset_meta=_serialize_media(img)); changed = True
            elif fr.name == 'Video Block' and t == 'media' and d.get('kind') == 'video':
                d.update(asset_id=mp4.id, serve_url=f'/api/media/serve/{mp4.id}',
                         original_name='sample_video.mp4', use_videojs=True, asset_meta=mp4_meta); changed = True
            elif fr.name == 'Audio Block' and t == 'media' and d.get('kind') == 'audio':
                d.update(asset_id=aud.id, serve_url=f'/api/media/serve/{aud.id}',
                         original_name='sample_audio.mp3', asset_meta=_serialize_media(aud)); changed = True
            elif fr.name == '3D Model Block' and t == 'model3d':
                d.update(model_asset_id=glb.id, model_serve_url=f'/api/media/serve/{glb.id}',
                         model_filename='sample_model.glb'); changed = True
            elif fr.name == 'Hotspot Block' and t == 'hotspot':
                d.update(background_asset_id=hb.id, background_url=f'/api/media/serve/{hb.id}'); changed = True
        if changed:
            # in-place JSON mutation isn't auto-detected — force the column dirty.
            flag_modified(fr, 'content')
    db.session.commit()
    print('[demo_seed] Wired live demo assets (image/video/audio/3D/hotspot)')


def seed_demo(app=None):
    """Seed the expanded demo project. Idempotent — returns existing id if present."""
    from .models.project import Project, Course, Module, Lesson, Frame

    existing = Project.query.filter_by(name='CourseForge Demo').first()
    if existing:
        print(f'[demo_seed] Demo already exists: {existing.id}')
        return existing.id

    print('[demo_seed] Creating expanded demo project…')
    project = Project(id=str(uuid.uuid4()), name='CourseForge Demo',
                      description='Built-in demonstration course covering all CourseForge block types.')
    db.session.add(project); db.session.flush()

    course = Course(id=str(uuid.uuid4()), project_id=project.id,
                    name='CourseForge Platform Overview', order_index=0)
    db.session.add(course); db.session.flush()

    module = Module(id=str(uuid.uuid4()), course_id=course.id, name='Authoring Blocks', order_index=0)
    db.session.add(module); db.session.flush()

    lessons = {}
    for idx, name in enumerate(LESSON_ORDER):
        lesson = Lesson(id=str(uuid.uuid4()), module_id=module.id, name=name, order_index=idx)
        db.session.add(lesson); db.session.flush()
        lessons[name] = lesson

    counters = {name: 0 for name in LESSON_ORDER}
    for fd in DEMO_FRAMES:
        lesson = lessons.get(fd['lesson'])
        if not lesson:
            continue
        order = counters[fd['lesson']]; counters[fd['lesson']] += 1
        db.session.add(Frame(id=str(uuid.uuid4()), lesson_id=lesson.id, name=fd['name'],
                             frame_type=fd.get('frame_type', 'content'), order_index=order,
                             content={'blocks': fd['blocks']}))

    db.session.commit()
    total = sum(counters.values())
    print(f'[demo_seed] Created {total} frames across {len(LESSON_ORDER)} lessons')
    try:
        _wire_demo_assets(project)
    except Exception as e:
        db.session.rollback()
        print(f'[demo_seed] live-asset wiring skipped: {e}')
    return project.id


def reset_demo():
    """Delete and re-create the demo project (GET /api/demo/reset)."""
    from .models.project import Project
    existing = Project.query.filter_by(name='CourseForge Demo').first()
    if existing:
        # Cleanup of rows that reference the project but aren't in the
        # courses->frames ORM cascade (media uploads, publish jobs).
        # MediaAssets go through the ORM so their OamAsset children cascade.
        from .models.media import MediaAsset
        from .models.publish_job import PublishJob
        for asset in MediaAsset.query.filter_by(project_id=existing.id).all():
            db.session.delete(asset)
        PublishJob.query.filter_by(project_id=existing.id).delete()
        # courses -> modules -> lessons -> frames cascade via 'all, delete-orphan'.
        db.session.delete(existing)
        db.session.commit()
        print('[demo_seed] Deleted existing demo project')
    return seed_demo()


if __name__ == '__main__':
    from server.app import create_app
    app = create_app()
    with app.app_context():
        seed_demo()
