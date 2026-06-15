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
