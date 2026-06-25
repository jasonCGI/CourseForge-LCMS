"""Built-in frame templates — seeded once (idempotent)."""

import uuid as _uuid

BUILTIN_TEMPLATES = [
    {'name': 'Text + Image', 'description': 'Rich text block with supporting image below',
     'frame_type': 'content', 'icon': '📝', 'tags': ['content', 'common'],
     'content': {'blocks': [
         {'type': 'text', 'data': {'body': '<h2>Frame Title</h2><p>Enter your content here. Keep on-screen text concise — move detail to the narrator script.</p>', 'narrator_script': 'Enter the narrator script here.'}},
         {'type': 'media', 'data': {'kind': 'image', 'placeholder_label': 'Supporting image', 'caption': '', 'asset_id': None, 'alt_text': ''}},
     ]}},
    {'name': 'Text Only', 'description': 'Single rich text block with narrator script',
     'frame_type': 'content', 'icon': '¶', 'tags': ['content', 'simple'],
     'content': {'blocks': [
         {'type': 'text', 'data': {'body': '<h2>Frame Title</h2><p>Enter content here.</p>', 'narrator_script': 'Enter narrator script here.'}},
     ]}},
    {'name': 'Video + Text', 'description': 'Video block with supporting text below',
     'frame_type': 'content', 'icon': '🎬', 'tags': ['content', 'media'],
     'content': {'blocks': [
         {'type': 'media', 'data': {'kind': 'video', 'placeholder_label': 'Course video', 'caption': '', 'asset_id': None, 'use_videojs': True}},
         {'type': 'text', 'data': {'body': '<p>Enter supporting text or key takeaways here.</p>', 'narrator_script': ''}},
     ]}},
    {'name': 'Multiple Choice Quiz', 'description': 'Quiz block with text intro',
     'frame_type': 'assessment', 'icon': '?', 'tags': ['assessment', 'quiz'],
     'content': {'blocks': [
         {'type': 'text', 'data': {'body': '<h2>Knowledge Check</h2><p>Select the best answer below.</p>', 'narrator_script': 'Test your understanding with this knowledge check.'}},
         {'type': 'quiz', 'data': {'question': 'Enter your question here.', 'choices': ['Choice A', 'Choice B', 'Choice C', 'Choice D'], 'correct_index': 0, 'feedback_correct': 'Correct! Well done.', 'feedback_incorrect': 'Not quite — review the material.', 'attempts_allowed': 2}},
     ]}},
    {'name': 'Warning + Content', 'description': 'Safety warning followed by instructional content',
     'frame_type': 'content', 'icon': '⚠', 'tags': ['safety', 'wcn'],
     'content': {'blocks': [
         {'type': 'wcn', 'data': {'wcn_type': 'warning', 'title': 'Safety Requirement', 'text': 'Enter safety warning text here.', 'modal': False, 'ack_label': 'I understand — proceed'}},
         {'type': 'text', 'data': {'body': '<h2>Procedure</h2><p>Enter procedure content here.</p>', 'narrator_script': ''}},
     ]}},
    {'name': 'Hotspot Interaction', 'description': 'Image with clickable regions',
     'frame_type': 'assessment', 'icon': '⊕', 'tags': ['assessment', 'interactive'],
     'content': {'blocks': [
         {'type': 'text', 'data': {'body': '<h2>Identify the Components</h2><p>Click each highlighted region to learn about that area.</p>', 'narrator_script': 'Click each highlighted region to reveal information.'}},
         {'type': 'hotspot', 'data': {'background_asset_id': None, 'image_id': None, 'regions': [
             {'id': '', 'x': 20, 'y': 25, 'w': 18, 'h': 22, 'label': 'Region A', 'description': 'Description for Region A.'},
             {'id': '', 'x': 55, 'y': 40, 'w': 20, 'h': 18, 'label': 'Region B', 'description': 'Description for Region B.'},
         ]}},
     ]}},
    {'name': 'Branch Decision', 'description': 'Decision point that routes to different frames',
     'frame_type': 'branch', 'icon': '⋔', 'tags': ['assessment', 'adaptive'],
     'content': {'blocks': [
         {'type': 'text', 'data': {'body': '<h2>Decision Point</h2><p>Based on the scenario, select the appropriate path.</p>', 'narrator_script': 'Select the appropriate path based on the scenario.'}},
         {'type': 'branch', 'data': {'condition': 'Enter the decision question here.', 'true_label': 'Yes', 'false_label': 'No', 'true_frame_id': '', 'false_frame_id': ''}},
     ]}},
    {'name': 'Caution Modal + Procedure', 'description': 'Modal caution interrupt before procedure content',
     'frame_type': 'content', 'icon': '◆', 'tags': ['safety', 'wcn', 'modal'],
     'content': {'blocks': [
         {'type': 'wcn', 'data': {'wcn_type': 'caution', 'title': 'Caution', 'text': 'Enter caution text here. This will interrupt the frame until acknowledged.', 'modal': True, 'ack_label': 'I understand — continue'}},
         {'type': 'text', 'data': {'body': '<h2>Procedure Steps</h2><p>Enter procedure content here.</p>', 'narrator_script': ''}},
     ]}},
    {'name': '3D Model', 'description': 'Interactive 3D GLB model with annotations',
     'frame_type': 'content', 'icon': '⬡', 'tags': ['advanced', '3d'],
     'content': {'blocks': [
         {'type': 'text', 'data': {'body': '<h2>3D Model</h2><p>Orbit and zoom to explore the model. Click annotation pins to learn about each component.</p>', 'narrator_script': 'Use the mouse or arrow keys to orbit and zoom the model.'}},
         {'type': 'model3d', 'data': {'model_asset_id': None, 'viewer_height': 400, 'bg_color': '#060810', 'caption': '', 'annotations': []}},
     ]}},
    {'name': 'Menu Frame', 'description': 'Navigation frame — a list of buttons that jump to frames or topics',
     'frame_type': 'menu', 'icon': '☰', 'tags': ['content', 'navigation'],
     'content': {'menu': {'title': 'Menu', 'items': []}}},
    {'name': 'Blank Frame', 'description': 'Empty frame — start from scratch',
     'frame_type': 'content', 'icon': '○', 'tags': ['blank'],
     'content': {'blocks': []}},
]


def seed_builtin_templates(app=None):
    """Seed built-in templates if none exist yet. Idempotent."""
    from .extensions import db
    from .models.template import FrameTemplate
    try:
        if FrameTemplate.query.filter_by(is_builtin=True).count() > 0:
            return
        for t in BUILTIN_TEMPLATES:
            # Preserve non-block content keys (e.g. a menu frame's `menu`), then
            # rebuild blocks with fresh ids below.
            content = {k: v for k, v in t['content'].items() if k != 'blocks'}
            content['blocks'] = []
            for blk in t['content'].get('blocks', []):
                nb = dict(blk)
                nb['id'] = str(_uuid.uuid4())
                # give hotspot regions fresh ids too
                if nb.get('type') == 'hotspot':
                    nb['data'] = dict(nb['data'])
                    nb['data']['regions'] = [
                        {**r, 'id': str(_uuid.uuid4())} for r in nb['data'].get('regions', [])
                    ]
                content['blocks'].append(nb)
            db.session.add(FrameTemplate(
                id=str(_uuid.uuid4()), name=t['name'], description=t['description'],
                frame_type=t['frame_type'], icon=t['icon'], tags=t['tags'],
                content=content, is_builtin=True,
            ))
        db.session.commit()
        print(f'[template_seed] Seeded {len(BUILTIN_TEMPLATES)} built-in templates')
    except Exception as e:
        db.session.rollback()
        print(f'[template_seed] Skipped (table not ready?): {e}')
