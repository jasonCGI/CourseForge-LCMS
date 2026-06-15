from flask import Blueprint, request, jsonify, send_file
from ..models.project import Project
from ..models.publish_job import PublishJob
from ..extensions import db
from ..services.scorm12 import build_scorm12_package
from ..services.scorm2004 import build_scorm2004_package
from ..services.web_export import build_web_bundle
from datetime import datetime

publish_bp = Blueprint('publish', __name__)


@publish_bp.post('/api/publish')
def publish():
    """
    Build and return a publish package.
    Body: { "project_id": "...", "format": "scorm12" | "web" }
    Returns the ZIP file as a download.
    """
    data       = request.get_json()
    project_id = data.get('project_id')
    fmt        = data.get('format', 'scorm12')

    if not project_id:
        return jsonify({'error': 'project_id required'}), 400

    # Log publish job
    # TODO Sprint 7: add cf_version column to publish_jobs to track which
    # version of CourseForge produced each package (needs a schema migration).
    # cf_version = db.Column(db.String(20))
    job = PublishJob(
        project_id=project_id,
        format=fmt,
        status='running',
    )
    db.session.add(job)
    db.session.commit()

    try:
        if fmt == 'scorm12':
            buf, filename = build_scorm12_package(project_id)
        elif fmt == 'scorm2004':
            buf, filename = build_scorm2004_package(project_id)
        elif fmt == 'web':
            buf, filename = build_web_bundle(project_id)
        else:
            return jsonify({'error': f'Unknown format: {fmt}'}), 400

        job.status       = 'complete'
        job.completed_at = datetime.utcnow()
        db.session.commit()

        return send_file(
            buf,
            mimetype='application/zip',
            as_attachment=True,
            download_name=filename,
        )

    except Exception as e:
        job.status = 'failed'
        job.error  = str(e)
        db.session.commit()
        return jsonify({'error': str(e)}), 500


@publish_bp.post('/api/validate')
def validate_on_scorm_cloud():
    """
    Build a SCORM package and validate it against SCORM Cloud (Rustici).
    Body: { "project_id": "...", "format": "scorm12" | "scorm2004" }
    Returns the import result (status, parser warnings) or 503 if the server
    has no SCORM Cloud credentials configured.
    """
    from ..services.scorm_cloud import (
        validate_package, is_configured, SCORMCloudNotConfigured,
    )

    data       = request.get_json() or {}
    project_id = data.get('project_id')
    fmt        = data.get('format', 'scorm2004')

    if not project_id:
        return jsonify({'error': 'project_id required'}), 400
    if fmt not in ('scorm12', 'scorm2004'):
        return jsonify({'error': 'Validation supports scorm12 or scorm2004 only.'}), 400
    if not is_configured():
        return jsonify({
            'configured': False,
            'error': 'SCORM Cloud is not configured on this server. '
                     'Set RUSTICI_APP_ID and RUSTICI_SECRET_KEY.',
        }), 503

    try:
        if fmt == 'scorm12':
            buf, _ = build_scorm12_package(project_id)
        else:
            buf, _ = build_scorm2004_package(project_id)

        # Imports into a single reusable validation course slot (see service).
        result = validate_package(buf.getvalue())
        result['format'] = fmt
        return jsonify(result)
    except SCORMCloudNotConfigured as e:
        return jsonify({'configured': False, 'error': str(e)}), 503
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@publish_bp.get('/api/publish/jobs/<project_id>')
def list_jobs(project_id):
    """List publish history for a project."""
    jobs = PublishJob.query.filter_by(project_id=project_id)\
        .order_by(PublishJob.created_at.desc()).limit(10).all()
    return jsonify([{
        'id':           j.id,
        'format':       j.format,
        'status':       j.status,
        'created_at':   j.created_at.isoformat(),
        'completed_at': j.completed_at.isoformat() if j.completed_at else None,
        'error':        j.error,
    } for j in jobs])
