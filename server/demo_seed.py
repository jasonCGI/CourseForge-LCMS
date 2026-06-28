"""
CourseForge Demo Seed — Expanded
=================================
Full demo course covering all block types with real example content.
Idempotent — checks for existing demo before creating.
Called automatically on first launch if the DB is empty.

Manual reset:  POST /api/demo/reset
"""

import uuid
import base64
import shutil
from pathlib import Path
from flask import current_app
from .extensions import db


# ── SVG placeholder generators ─────────────────────────────────────────────────

def _svg(label, color, icon, sub='placeholder', w=800, h=450, plain=False):
    if plain:
        # Text-free image placeholder: a clean diagonal gradient with no labels,
        # dimensions, or dev chrome, so it reads as an actual image filling the frame.
        g = (f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">'
             f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
             f'<stop offset="0" stop-color="{color}"/><stop offset="0.55" stop-color="#0E2A47"/>'
             f'<stop offset="1" stop-color="#060810"/></linearGradient></defs>'
             f'<rect width="{w}" height="{h}" fill="url(#g)"/></svg>')
        return f"data:image/svg+xml;base64,{base64.b64encode(g.encode('utf-8')).decode('utf-8')}"
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

def _image(label='Course Image', caption='', color='#185FA5', icon='🖼', fill=False):
    """fill=True: the image covers its whole content area (objectFit 'cover',
    full-area bounds) — used for the demo Image Block frame where the image fills
    the frame. The placeholder graphic stays text-free; any caption passed in
    rides through to data so it renders as a bottom overlay on the cover image."""
    data = {
        'kind': 'image', 'placeholder_label': label, 'caption': caption,
        'asset_id': None,
        'serve_url': _svg(label, color, icon, sub='replace with actual image'),
        'original_name': label.lower().replace(' ', '_') + '.jpg', 'alt_text': label}
    if fill:
        # Image-only graphic: a text-free 16:9 placeholder that covers the entire
        # content area edge to edge, shown as-sent (no rounding/crop). The caption
        # (if any) renders as a scrim overlay pinned to the bottom of the image.
        data['serve_url'] = _svg(label, color, icon, w=1920, h=1080, plain=True)
        data['fit'] = 'cover'
        data['bounds'] = {'x': 0, 'y': 0, 'width': 1920, 'height': 1080}
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': data}

def _video(label='Course Video', caption='', fill=False, dock='inline'):
    """fill=True: the video covers its whole content area (objectFit 'cover',
    full-area bounds) — used for the demo Video Block frame where the clip fills
    the frame. The placeholder graphic stays text-free; any caption passed in
    rides through to data so it renders as a bottom overlay on the cover video,
    mirroring the Image Block's cover+caption treatment.

    dock: 'inline' (default — playbar flows underneath the video) | 'bottom'
    (full-bleed: the playbar snaps flush to the bottom of the content area).
    Mirrors the audio block's dock toggle; only meaningful for cover/full videos."""
    # A <video> can't render an SVG as its source (an <img> can — that's why the
    # image demo works), so the SVG rides as the *poster* and the player shows it.
    svg = _svg(label, '#1A7A5E', '🎬', sub='process with ForgePack first')
    data = {
        'kind': 'video', 'placeholder_label': label, 'caption': caption, 'asset_id': None,
        'serve_url': svg, 'poster_url': svg, 'dock': dock,
        'original_name': label.lower().replace(' ', '_') + '.mp4', 'use_videojs': True,
        'asset_meta': {'has_captions': False, 'has_webm': False, 'has_poster': False}}
    if fill:
        # Video-only media: a text-free 16:9 placeholder poster that covers the
        # entire content area edge to edge, shown as-sent (no rounding/letterbox).
        # The caption (if any) renders as a scrim overlay pinned to the bottom of
        # the video — identical to the cover Image Block. The poster is the visible
        # frame so the <video controls poster=...> shows a real player, not a blank.
        plain = _svg(label, '#1A7A5E', '🎬', w=1920, h=1080, plain=True)
        data['serve_url'] = plain
        data['poster_url'] = plain
        data['fit'] = 'cover'
        data['bounds'] = {'x': 0, 'y': 0, 'width': 1920, 'height': 1080}
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': data}

def _silent_wav_datauri(seconds=8, sr=8000):
    """A small valid silent WAV data-URI so the demo Audio Block plays in the
    branded bar (real duration + scrubbing) without bundling a media file."""
    import struct
    n = sr * seconds
    body = bytes([128]) * n   # 8-bit unsigned silence (midpoint)
    hdr = (b'RIFF' + struct.pack('<I', 36 + n) + b'WAVE' + b'fmt '
           + struct.pack('<IHHIIHH', 16, 1, 1, sr, sr, 1, 8)
           + b'data' + struct.pack('<I', n))
    return 'data:audio/wav;base64,' + base64.b64encode(hdr + body).decode()

def _audio(label='Course Audio', caption='', dock='inline'):
    # dock: 'inline' (renders in flow) | 'bottom' (pinned to the content area).
    # serve_url carries a silent WAV so the branded bar is interactive in the demo.
    return {'id': str(uuid.uuid4()), 'type': 'media', 'data': {
        'kind': 'audio', 'placeholder_label': label, 'caption': caption, 'asset_id': None,
        'dock': dock, 'serve_url': _silent_wav_datauri(),
        'original_name': label.lower().replace(' ', '_') + '.mp3'}}

def _callout(text='Callout', box=None, target=None, padding=10, anchor='auto'):
    # Free-floating annotation overlay: rounded box (center text, uniform padding,
    # auto-width) + a connector line to a target point. box/target are normalized
    # 0-100 (% of the content area); box is the CONNECTION POINT (the center of the
    # box edge that faces the target). `anchor` ('auto'|'top'|'bottom'|'left'|'right')
    # picks that edge; 'auto' = the edge facing the target. Auxiliary — it overlays
    # the content area and never consumes a layout zone.
    return {'id': str(uuid.uuid4()), 'type': 'callout', 'data': {
        'text': text, 'box': box or {'x': 55, 'y': 60},
        'target': target or {'x': 32, 'y': 32}, 'padding': padding, 'anchor': anchor}}

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
            {'id': str(uuid.uuid4()), 'x': 17, 'y': 7,  'w': 24, 'h': 42, 'label': 'Dose — fresh beans', 'description': 'Freshly roasted beans in the dosing cup. Grind just before brewing and weigh out about 18 g for a double shot.'},
            {'id': str(uuid.uuid4()), 'x': 9,  'y': 55, 'w': 13, 'h': 33, 'label': 'Tamp — the tamper', 'description': 'A calibrated tamper compresses the grounds flat and level so water cannot channel around the puck.'},
            {'id': str(uuid.uuid4()), 'x': 28, 'y': 49, 'w': 22, 'h': 35, 'label': 'The portafilter', 'description': '18 g dosed and tamped into the portafilter basket, ready to lock into the group head.'},
            {'id': str(uuid.uuid4()), 'x': 52, 'y': 37, 'w': 22, 'h': 45, 'label': 'The finished drink', 'description': 'A balanced shot pulled in 25–30 seconds, topped with steamed milk for a cappuccino.'},
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
        'environment': 'studio', 'env_intensity': 1.4,
        'caption': caption or '3D model placeholder — upload .glb exported from 3ds Max or Blender',
        'annotations': [
            {'id': str(uuid.uuid4()), 'label': 'Crema & latte art',
             'description': 'The espresso crema and poured microfoam sit on top. Click pins on the model to '
                            'reveal part labels — place your own in the editor by enabling Preview, then '
                            'clicking the Place pin button.',
             'position': {'x': 0.5, 'y': 0.8, 'z': 0.0}, 'color': '#F59E0B'},
            {'id': str(uuid.uuid4()), 'label': 'Mug handle',
             'description': 'Pins track the model as learners orbit and zoom; pins behind the mug are hidden '
                            'automatically so the callouts never overlap.',
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
    {'name': 'Image Block', 'frame_type': 'content', 'lesson': 'Content Blocks', 'layout': 'full', 'blocks': [
        # Image fills the entire content area (cover fit), shown as-sent-in (no
        # engine rounding or crop). The caption rides over the bottom of the image
        # as a scrim overlay (white text, readable over any image) — it never
        # pushes content below the fold.
        _image(label='Barista presenting a latte', color='#185FA5', icon='🖼', fill=True,
               caption='Live example: cropped to a 16:9 content fit, optimized and EXIF-stripped'),
    ]},
    {'name': 'Image Swap (click to change)', 'frame_type': 'content', 'lesson': 'Content Blocks',
     'layout': 'text-left', 'blocks': [
        # Half-layout (text left, image right). The text carries inline image-swap
        # triggers: <a data-cf-swap="<assetId>">term</a>. Clicking a term swaps the
        # image on the right (the first cf-swap-target <img>) to that asset; clicking
        # the active term again reverts to the default. The default image is cf1; the
        # two terms below are PLACEHOLDERS (__SWAP_B__/__SWAP_C__) that
        # _wire_demo_assets() rewrites to the OTHER two demo image asset ids (cf2/cf3)
        # once registered — so the demo works after a reset with zero manual uploads.
        _text(body=(
            '<h2>Milk glass in a Japanese café</h2>'
            '<p>In a quiet kissaten, the same pour-over arrives in whatever cup the '
            'house favours that morning. This one is patterned milk glass on its '
            'matching saucer. Swap it for a '
            '<a data-cf-swap="__SWAP_B__">frosted milk-glass cup</a> or a '
            '<a data-cf-swap="__SWAP_C__">blue floral cup&nbsp;and&nbsp;saucer</a>. '
            'Click a cup to change the photo in place; click the active term again to '
            'return to the first. The same markup drives the live preview and the '
            'published SCO.</p>'
        )),
        _image(label='Patterned milk-glass coffee, Japanese café', color='#185FA5', icon='☕',
               caption='Click a term on the left to swap this cup'),
    ]},
    {'name': 'Image with Callout Labels', 'frame_type': 'content', 'lesson': 'Content Blocks',
     'optional': True, 'layout': 'full', 'blocks': [
        # A still image fills the content area; callout overlays annotate parts of it.
        # Callouts are AUXILIARY (they never consume a layout zone), so they coexist
        # with the full-bleed image. Position/aim them by dragging in the live
        # preview; the panel sets only text + uniform padding. _wire_demo_assets()
        # swaps the placeholder graphic for the real bundled demo image after a reset.
        _image(label='Latte with foam art', color='#185FA5', icon='🖼', fill=True,
               caption='Drag each callout box and its round target handle to annotate the image'),
        # box = the CONNECTION POINT (facing edge-center); 'auto' resolves the edge.
        # Each box extends AWAY from its target and stays fully on-frame:
        #   Foam art    -> left edge connects, box extends RIGHT  (sits top-right)
        #   Ceramic cup -> right edge connects, box extends LEFT  (sits mid-left)
        #   Espresso    -> left edge connects, box extends RIGHT  (sits bottom-right)
        _callout(text='Foam art',      box={'x': 76, 'y': 30}, target={'x': 50, 'y': 40}),
        _callout(text='Ceramic cup',   box={'x': 27, 'y': 66}, target={'x': 47, 'y': 62}),
        _callout(text='Espresso base', box={'x': 74, 'y': 82}, target={'x': 54, 'y': 74}),
    ]},
    {'name': 'Video Block', 'frame_type': 'content', 'lesson': 'Content Blocks', 'layout': 'full', 'blocks': [
        # Video fills the entire content area (cover fit), shown as-sent-in (no
        # engine rounding or letterbox) and played seamlessly (muted/looped/
        # autoplay). The caption rides over the bottom of the video as a scrim
        # overlay (white text, readable over any frame) — it never pushes content
        # below the fold. Mirrors the cover Image Block above.
        _video(label='Sample Clip', fill=True, dock='bottom',
               caption='Live example: muted, looped, and compressed for fast load'),
    ]},
    {'name': 'Audio Block', 'frame_type': 'content', 'lesson': 'Content Blocks', 'blocks': [
        _text(body='<h2>Audio Block</h2><p>The Audio block plays narration or ambient audio in a branded, '
                   'on-brand slim player — navy bar, amber controls, mono time readout, and the same playback '
                   'speeds as the video player. Authors choose its placement per block: <strong>inline</strong> '
                   '(in the content flow) or <strong>docked</strong> (pinned to the bottom of the content area, '
                   'so narration stays reachable while the learner reads). This live example is normalized to the '
                   'DoD broadcast standard (−16 LUFS, EBU R128). Process source WAV/AIFF through ForgePack Audio '
                   'to normalize loudness and output MP3, OGG, and M4A — auto-paired in CourseForge.</p>',
              narration='The Audio block plays processed narration or ambient audio in a branded slim player. '
                        'Authors place it inline or docked to the bottom of the content area. This cue is '
                        'normalized to negative sixteen LUFS.'),
        # Single docked example — pinned full-width to the bottom of the content
        # area (the demo uses only the docked player to avoid two media elements).
        _audio(label='Narration — Lesson Intro',
               caption='Docked placement (this caption is hidden on the docked bar)',
               dock='bottom'),
    ]},

    # ── Assessment Blocks ──
    {'name': 'Quiz Block', 'frame_type': 'assessment', 'lesson': 'Assessment Blocks', 'blocks': [
        _text(body='<h2>Quiz Block</h2><p>Test your understanding of espresso fundamentals. Select the '
                   'best answer and click Submit. You have two attempts.</p>',
              narration='Test your understanding with this knowledge check. Select the best answer and '
                        'click Submit. You have two attempts.'),
        _quiz(
            question='A barista pulls an espresso shot that finishes in about 12 seconds and tastes sharp '
                     'and sour. What is the most reliable fix?',
            choices=[
                'Use a coarser grind so the water flows through faster',
                'Grind finer so the shot slows down and extracts more sweetness',
                'Raise the water temperature to boiling (100 °C)',
                'Pull a much longer shot to dilute the sourness',
            ],
            correct_index=1,
            feedback_correct='Correct! A ~12-second shot is under-extracted — water rushed through the puck. '
                             'A finer grind adds resistance, slowing the flow toward the 25–30 second target so '
                             'the shot develops the sweetness that balances the sourness.',
            feedback_incorrect='Not quite. A fast, sour shot is under-extracted. The fix is a finer grind to '
                               'slow the flow toward 25–30 seconds — hotter water or a longer pull won\'t '
                               'correct a grind that is letting water race through.'),
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
        _branch(condition='Has the barista completed the Espresso Foundations module before moving on to '
                          'milk steaming and latte art?',
                true_label='Yes — continue to milk steaming',
                false_label='No — review Espresso Foundations first'),
    ]},

    # ── Safety Blocks ──
    {'name': 'Warning Block (Inline)', 'frame_type': 'content', 'lesson': 'Safety Blocks', 'blocks': [
        _text(body='<h2>Warning Block — Inline Mode</h2><p>The Warning block (WCN — Warning, Caution, Note) '
                   'communicates safety-critical information using MIL-SPEC hazard symbol conventions. In '
                   '<strong>inline mode</strong>, it appears within the frame and requires learner '
                   'acknowledgment before they continue.</p>',
              narration='Warning blocks use MIL-SPEC hazard symbols for safety-critical information. In inline '
                        'mode, the warning appears within the frame and requires acknowledgment before proceeding.'),
        _wcn(wcn_type='warning', title='Steam Wand Burn Hazard',
             text='The steam wand and its tip exceed 150 °C and stay dangerously hot after use. Never grip the '
                  'wand by the metal tip, always purge and wipe it pointed into the drip tray, and keep hands '
                  'and forearms clear of the steam path. Contact with live steam or the tip can cause severe '
                  'burns. This acknowledgment is required before proceeding.',
             modal=False, ack_label='I understand — proceed'),
    ]},
    {'name': 'Caution Block (Modal)', 'frame_type': 'content', 'lesson': 'Safety Blocks', 'blocks': [
        _text(body='<h2>Caution Block — Modal Mode</h2><p>In <strong>modal mode</strong>, the WCN block '
                   'interrupts the frame entirely — content is hidden behind an overlay until the learner '
                   'explicitly acknowledges. Use modal mode for procedural requirements that must not be '
                   'missed.</p><p>Click the Caution button below to trigger the modal.</p>',
              narration='In modal mode, the caution block interrupts the frame entirely and requires explicit '
                        'acknowledgment before any other content is accessible.'),
        _wcn(wcn_type='caution', title='Lock the Portafilter Before Brewing',
             text='Always seat the portafilter fully and lock it into the group head before starting a shot. '
                  'A loose or partially seated portafilter can release under roughly 9 bar of brewing pressure, '
                  'spraying scalding water and grounds across the workspace. Confirm a snug, square lock and '
                  'clear the area before you press brew.',
             modal=True, ack_label='I have locked the portafilter — continue'),
    ]},
    {'name': 'Note Block (Inline)', 'frame_type': 'content', 'lesson': 'Safety Blocks', 'blocks': [
        _text(body='<h2>Note Block — Inline Mode</h2><p>The Note block provides supplementary information, '
                   'tips, or clarifications without interrupting the learning flow. Notes are informational — '
                   'the acknowledge button is present but not required for progression.</p>',
              narration='Note blocks communicate helpful supplementary information. Unlike warnings and '
                        'cautions, notes do not interrupt the learning flow or block progression.'),
        _wcn(wcn_type='note', title='Milk Steaming Tip',
             text='Steam whole milk to about 60–65 °C — warm to the touch, not scalding — for the sweetest, '
                  'glossiest microfoam. Past roughly 70 °C the milk proteins break down, the foam turns stiff '
                  'and bubbly, and the natural sweetness is lost. Wipe and purge the steam wand after every '
                  'pitcher to keep it clean.',
             modal=False, ack_label='Got it — continue'),
    ]},

    # ── Advanced Blocks ──
    {'name': '3D Model Block', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'layout': 'text-left', 'blocks': [
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
    {'name': 'Interactive Video Block', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'layout': 'full', 'blocks': [
        # Media-only, full screen — this is how an iVideo is used in production.
        _ivideo(caption='Live example — annotation (2-8s) + pause-on-reach hotspot (4-9s), authored in ForgeClip'),
    ]},
    {'name': 'OAM Block — Adobe Animate', 'frame_type': 'content', 'lesson': 'Advanced Blocks', 'layout': 'full', 'blocks': [
        # Media-only, full screen — this is how an OAM is used in production.
        _oam(caption='Upload .oam exported from Adobe Animate CC to activate. '
                     'File → Publish Settings → OAM package in Animate'),
    ]},

    # ── Summary ──
    {'name': 'Platform Summary', 'frame_type': 'content', 'lesson': 'Course Summary', 'layout': 'full', 'blocks': [
        _text(body='''<h2>CourseForge Platform Summary</h2>
<p>You've seen all available block types in the CourseForge ecosystem. Quick reference:</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 48px;text-align:left">
<div><h3>Content blocks</h3>
<ul><li><strong>Text</strong> — rich HTML + narrator script</li>
<li><strong>Image</strong> — WebP/PNG via ForgePack Image</li>
<li><strong>Video</strong> — Video.js via ForgePack Video</li>
<li><strong>Audio</strong> — MP3/OGG/M4A via ForgePack Audio</li></ul>
</div>
<div><h3>Assessment blocks</h3>
<ul><li><strong>Quiz</strong> — multiple choice, 2 attempts, feedback</li>
<li><strong>Hotspot</strong> — clickable regions on an image</li>
<li><strong>Branch</strong> — adaptive routing to different frames</li></ul>
</div>
<div><h3>Safety blocks (WCN)</h3>
<ul><li><strong>Warning</strong> — critical safety, MIL-SPEC triangle</li>
<li><strong>Caution</strong> — equipment risk, MIL-SPEC diamond</li>
<li><strong>Note</strong> — supplementary information, circle-i</li></ul>
</div>
<div><h3>Advanced blocks</h3>
<ul><li><strong>3D Model</strong> — GLB viewer with orbit, zoom, annotations</li>
<li><strong>Interactive Video</strong> — ForgeClip baked interactions</li>
<li><strong>OAM</strong> — Adobe Animate Canvas with SCORM bridge</li></ul></div></div>''',
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
    import json as _json
    from sqlalchemy.orm.attributes import flag_modified
    from .models.project import Frame, Lesson, Module, Course
    from .models.media import MediaAsset, OamAsset
    from .routes.media import _serialize_media
    from .services.oam_importer import ingest_oam

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
        'vtt_asset_id': vtt.id, 'has_audio': False})
    img = reg('sample_image.jpg', 'image', 'image/jpeg')
    aud = reg('beneath-the-still-water.mp3', 'audio', 'audio/mpeg')
    glb = reg('coffee_cup.glb', 'model3d', 'model/gltf-binary')
    hb  = reg('hotspot_bg.jpg',  'image', 'image/jpeg')
    # Image-swap demo views (Firefly coffee-cup renders): cf1 = default, cf2/cf3 = the
    # two swap targets the inline terms switch to.
    cf1 = reg('firefly_coffee_1.jpg', 'image', 'image/jpeg')
    cf2 = reg('firefly_coffee_2.jpg', 'image', 'image/jpeg')
    cf3 = reg('firefly_coffee_3.jpg', 'image', 'image/jpeg')
    db.session.flush()

    mp4_meta = _serialize_media(mp4)

    # iVideo: a dedicated video asset + the ForgeClip clip.json (bidirectionally linked).
    iv_video = reg('sample_video.mp4', 'video', 'video/mp4')
    db.session.flush()
    clip_aid  = str(uuid.uuid4())
    clip_dest = media_dir / f'{clip_aid}.clip.json'
    shutil.copyfile(base / 'sample_clip.clip.json', clip_dest)
    db.session.add(MediaAsset(id=clip_aid, project_id=project.id, kind='clip',
                              original_name='sample_clip.clip.json', stored_path=str(clip_dest),
                              mime_type='application/json', file_size=clip_dest.stat().st_size,
                              companion_files={'video_asset_id': iv_video.id}))
    iv_video.companion_files = {'clip_asset_id': clip_aid}
    clip_doc = _json.loads((base / 'sample_clip.clip.json').read_text(encoding='utf-8'))

    # OAM: copy + ingest through the real importer (extract + manifest parse).
    up = Path(current_app.config['UPLOAD_FOLDER'])
    oam_aid  = str(uuid.uuid4())
    oam_dir  = up / 'oam' / oam_aid
    oam_dir.mkdir(parents=True, exist_ok=True)
    oam_orig = oam_dir / 'original.oam'
    shutil.copyfile(base / 'ForgeJS_Demo.oam', oam_orig)
    oam_meta = ingest_oam(oam_orig, oam_aid, up)
    db.session.add(MediaAsset(id=oam_aid, project_id=project.id, kind='oam',
                              original_name='ForgeJS_Demo.oam', stored_path=str(oam_orig),
                              file_size=oam_orig.stat().st_size,
                              mime_type='application/vnd.adobe.oam+zip'))
    db.session.flush()
    db.session.add(OamAsset(media_asset_id=oam_aid, **oam_meta))
    db.session.flush()

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
            elif fr.name == 'Image with Callout Labels' and t == 'media' and d.get('kind') == 'image':
                # The annotated still — the same bundled latte image the Image Block
                # uses; the callout overlays self-position over it.
                d.update(asset_id=img.id, serve_url=f'/api/media/serve/{img.id}',
                         original_name='sample_image.jpg', asset_meta=_serialize_media(img)); changed = True
            elif fr.name.startswith('Image Swap') and t == 'media' and d.get('kind') == 'image':
                # Default image shown before any swap (the cf-swap-target surface).
                d.update(asset_id=cf1.id, serve_url=f'/api/media/serve/{cf1.id}',
                         original_name='firefly_coffee_1.jpg', asset_meta=_serialize_media(cf1)); changed = True
            elif fr.name.startswith('Image Swap') and t == 'text':
                # Rewrite the two placeholder swap ids to the OTHER two bundled coffee
                # renders (cf2/cf3) so each term swaps the default (cf1) to a real,
                # visibly-different cup in both the live preview and the published SCO.
                body = d.get('body', '') or ''
                body = (body.replace('__SWAP_B__', cf2.id)
                            .replace('__SWAP_C__', cf3.id))
                if body != d.get('body'):
                    d['body'] = body; changed = True
            elif fr.name == 'Video Block' and t == 'media' and d.get('kind') == 'video':
                # dock='bottom' keeps the playbar snapped to the content-area
                # bottom once the real cover clip replaces the placeholder.
                d.update(asset_id=mp4.id, serve_url=f'/api/media/serve/{mp4.id}',
                         original_name='sample_video.mp4', use_videojs=True,
                         dock='bottom', asset_meta=mp4_meta); changed = True
            elif fr.name == 'Audio Block' and t == 'media' and d.get('kind') == 'audio':
                d.update(asset_id=aud.id, serve_url=f'/api/media/serve/{aud.id}',
                         original_name='beneath-the-still-water.mp3', asset_meta=_serialize_media(aud)); changed = True
            elif fr.name == '3D Model Block' and t == 'model3d':
                d.update(model_asset_id=glb.id, model_serve_url=f'/api/media/serve/{glb.id}',
                         model_filename='coffee_cup.glb',
                         caption='Coffee latte in a mug with saucer.',
                         attribution='“Coffee Latte In Mug With Saucer” by HQ3DMOD (CC BY)'); changed = True
            elif fr.name == 'Hotspot Block' and t == 'hotspot':
                d.update(background_asset_id=hb.id, background_url=f'/api/media/serve/{hb.id}'); changed = True
            elif fr.name == 'Interactive Video Block' and t == 'ivideo':
                d.update(video_asset_id=iv_video.id, clip_asset_id=clip_aid,
                         video_serve_url=f'/api/media/serve/{iv_video.id}',
                         video_filename='sample_video.mp4',
                         interaction_count=len(clip_doc.get('interactions', [])),
                         video_duration=clip_doc.get('video', {}).get('duration', 0)); changed = True
            elif fr.name.startswith('OAM Block') and t == 'oam':
                d.update(oam_asset_id=oam_aid, entry_point=oam_meta.get('entry_point', 'index.html'),
                         width=oam_meta.get('width', 800), height=oam_meta.get('height', 500),
                         scorm_bridge_enabled=bool(oam_meta.get('has_scorm_calls'))); changed = True
        if changed:
            # in-place JSON mutation isn't auto-detected — force the column dirty.
            flag_modified(fr, 'content')
    db.session.commit()
    print('[demo_seed] Wired live demo assets (image/video/audio/3D/hotspot/iVideo/OAM)')


def seed_demo(app=None):
    """Seed the expanded demo project. Idempotent — returns existing id if present."""
    from .models.project import Project, Course, Module, Lesson, Frame

    existing = Project.query.filter_by(name='CourseForge Demo').first()
    if existing:
        print(f'[demo_seed] Demo already exists: {existing.id}')
        return existing.id

    print('[demo_seed] Creating expanded demo project…')
    project = Project(id=str(uuid.uuid4()), name='CourseForge Demo',
                      description='Built-in demonstration course covering all CourseForge block types.',
                      # The demo's user-applied shell is transparent over a LIGHT
                      # background image, so content_bg auto-derivation returns None
                      # and 'auto' would keep the washed-out light+halo text. Set the
                      # PROJECT-level override to 'dark' so shelled frames render crisp
                      # navy (#042C53) body text over the light art (WCAG-AA readable).
                      text_mode='dark')
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
    frame_ids = {}
    for fd in DEMO_FRAMES:
        lesson = lessons.get(fd['lesson'])
        if not lesson:
            continue
        order = counters[fd['lesson']]; counters[fd['lesson']] += 1
        fid = str(uuid.uuid4())
        frame_ids[fd['name']] = fid
        content = {'blocks': fd['blocks']}
        if fd.get('layout'):
            content['layout'] = fd['layout']
        db.session.add(Frame(id=fid, lesson_id=lesson.id, name=fd['name'],
                             frame_type=fd.get('frame_type', 'content'), order_index=order,
                             optional=fd.get('optional', False), content=content))

    # Wire the demo Branch block's targets to real frames so it's clickable out of
    # the box: Yes -> Video Block, No -> Welcome (review). The branch dict is the
    # same object referenced by its frame's content, so patching it before commit
    # persists into the stored JSON.
    for fd in DEMO_FRAMES:
        for blk in fd.get('blocks', []):
            if blk.get('type') == 'branch':
                blk['data']['true_frame_id']  = frame_ids.get('Video Block', '')
                blk['data']['false_frame_id'] = frame_ids.get('Welcome to CourseForge', '')

    # ── Menu Frame demo ──
    # A navigation frame near the very start (Welcome, order_index -1 so it sorts
    # first). Each item targets a LESSON (topic) — at render time a topic resolves
    # to that lesson's first frame. Built here, after lessons exist, so the items
    # carry real lesson ids.
    welcome = lessons.get('Welcome')
    if welcome:
        def _topic(label, lesson_name):
            les = lessons.get(lesson_name)
            return {'id': str(uuid.uuid4()), 'label': label,
                    'target_kind': 'lesson', 'target_id': les.id if les else ''}
        menu_content = {'menu': {
            'title': 'Course Menu',
            'items': [
                _topic('Content Blocks', 'Content Blocks'),
                _topic('Assessment Blocks', 'Assessment Blocks'),
                _topic('Safety Blocks', 'Safety Blocks'),
                _topic('Advanced Blocks', 'Advanced Blocks'),
                _topic('Course Summary', 'Course Summary'),
            ],
        }}
        db.session.add(Frame(id=str(uuid.uuid4()), lesson_id=welcome.id,
                             name='Course Menu', frame_type='menu', order_index=-1,
                             content=menu_content))

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
    """Delete and re-create the demo project (POST /api/demo/reset)."""
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
