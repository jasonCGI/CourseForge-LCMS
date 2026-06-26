"""
Edit-token gate (security review C2).

The API ships with no auth so the open authoring experience stays frictionless.
To protect the PUBLIC demo from vandalism without locking out authors, a small
set of *destructive* / *expensive* operations can be gated behind a shared
edit token:

  * Anything with HTTP method DELETE (delete project/course/module/lesson/frame,
    gui-shell, publish, template, theme).
  * File-accepting upload POSTs (media, oam, model, clip, gui shells).
  * Publish / validate POSTs.
  * The demo reset.

Everything else — all GET reads, the health check, and create/update of content
(POST/PATCH on projects, courses, modules, lessons, frames, themes) — stays open
so authoring still works with no token.

Contract:
  * Owner sets env  CF_EDIT_TOKEN  on the deploy.
  * Gated requests must send header  X-CF-Token  equal to it, else 401.
  * If CF_EDIT_TOKEN is UNSET, every request is allowed (the deploy never hard
    breaks) — a single loud startup warning is logged instead.

To ENABLE protection: set CF_EDIT_TOKEN on the Railway `web` service and set
localStorage.cf_edit_token in the owner's browser (the client attaches it as
X-CF-Token on every request).
"""

import os
from flask import request, jsonify

# Exact paths (no trailing slash) whose POST is gated: file uploads + publish/
# validate + demo reset. DELETE is gated wholesale by method, so DELETE-only
# routes don't need to be listed here.
_GATED_POST_PATHS = frozenset({
    '/api/media',
    '/api/media/oam',
    '/api/media/model',
    '/api/media/clip',
    '/api/media/gui',     # ForgeGUI .zip upload (gui_block_bp)
    '/api/gui-shells',    # GUI shell library upload (gui_shells_bp)
    '/api/publish',
    '/api/validate',
    '/api/demo/reset',
    '/api/forgeagent/generate-frame',  # expensive Claude call — owner-gated
})


def _is_gated(req) -> bool:
    """True when this request touches a destructive or expensive operation."""
    # All DELETEs are destructive.
    if req.method == 'DELETE':
        return True
    # Selected POSTs (uploads / publish / validate / demo reset). Normalize a
    # possible trailing slash so '/api/media/' matches '/api/media'.
    if req.method == 'POST':
        path = req.path.rstrip('/') or '/'
        if path in _GATED_POST_PATHS:
            return True
    return False


def edit_gate():
    """Flask before_request hook. Returns a 401 response to short-circuit a
    gated request that lacks the correct token; returns None to allow."""
    token = os.environ.get('CF_EDIT_TOKEN')
    if not token:
        # Protection disabled — allow everything (warned once at startup).
        return None
    if not _is_gated(request):
        return None
    if request.headers.get('X-CF-Token') == token:
        return None
    return jsonify({'error': 'edit token required'}), 401


def register_edit_gate(app):
    """Wire the gate into the app and log the startup state once."""
    if os.environ.get('CF_EDIT_TOKEN'):
        app.logger.info('[auth] Edit-token protection ENABLED (CF_EDIT_TOKEN set).')
    else:
        app.logger.warning(
            '[auth] CF_EDIT_TOKEN is unset — edit protection is DISABLED; '
            'all destructive/upload/publish requests are open. Set CF_EDIT_TOKEN '
            'on the deploy to protect the public demo.'
        )
    app.before_request(edit_gate)
