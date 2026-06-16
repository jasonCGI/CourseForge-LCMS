from pathlib import Path
from flask import Blueprint, request, jsonify, send_file, current_app
from ..models.project import Project, Course, Module, Lesson, Frame
from ..models.publish_job import PublishJob
from ..extensions import db
from ..services.scorm12 import build_scorm12_package
from ..services.scorm2004 import build_scorm2004_package
from ..services.web_export import build_web_bundle
from ..version import VERSION
from datetime import datetime

publish_bp = Blueprint('publish', __name__)

FORMAT_LABEL = {'scorm12': 'SCORM 1.2', 'scorm2004': 'SCORM 2004', 'web': 'Web Bundle'}


def _frame_count(project_id):
    return (db.session.query(Frame).join(Lesson).join(Module).join(Course)
            .filter(Course.project_id == project_id).count())


def _exports_dir():
    d = Path(current_app.config['UPLOAD_FOLDER']) / 'exports'
    d.mkdir(parents=True, exist_ok=True)
    return d


@publish_bp.post('/api/publish')
def publish():
    """
    Build a publish package, persist it for re-download, and stream it back.
    Body: { "project_id": "...", "format": "scorm12" | "scorm2004" | "web" }
    """
    data       = request.get_json()
    project_id = data.get('project_id')
    fmt        = data.get('format', 'scorm12')

    if not project_id:
        return jsonify({'error': 'project_id required'}), 400

    project = Project.query.get_or_404(project_id)
    job = PublishJob(project_id=project_id, format=fmt, status='running')
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

        # Persist the package so it can be re-downloaded from history.
        out_path = _exports_dir() / f'{job.id}.zip'
        payload = buf.getvalue()
        out_path.write_bytes(payload)

        job.status       = 'complete'
        job.completed_at = datetime.utcnow()
        job.output_path  = str(out_path)
        job.cf_version   = VERSION
        job.frame_count  = _frame_count(project_id)
        job.file_size    = len(payload)
        job.publish_name = (f"{project.name} — {FORMAT_LABEL.get(fmt, fmt)} — "
                            f"{datetime.utcnow().strftime('%Y-%m-%d %H:%M')}")
        db.session.commit()

        buf.seek(0)
        return send_file(buf, mimetype='application/zip', as_attachment=True, download_name=filename)

    except Exception as e:
        job.status = 'failed'
        job.error  = str(e)
        db.session.commit()
        return jsonify({'error': str(e)}), 500


@publish_bp.get('/api/projects/<project_id>/publishes')
def list_publishes(project_id):
    jobs = (PublishJob.query.filter_by(project_id=project_id)
            .order_by(PublishJob.created_at.desc()).limit(50).all())
    return jsonify([{
        'id': j.id, 'format': j.format, 'status': j.status,
        'publish_name': j.publish_name, 'cf_version': j.cf_version,
        'frame_count': j.frame_count, 'file_size': j.file_size,
        'created_at': j.created_at.isoformat() if j.created_at else None,
        'can_download': bool(j.status == 'complete' and j.output_path and Path(j.output_path).exists()),
    } for j in jobs])


@publish_bp.get('/api/publish/<job_id>/download')
def download_publish(job_id):
    job = PublishJob.query.get_or_404(job_id)
    if not job.output_path or not Path(job.output_path).exists():
        return jsonify({'error': 'Package file no longer available.'}), 404
    name = f"{(job.publish_name or 'package').split(' — ')[0]}_{job.format}.zip".replace(' ', '_')
    return send_file(job.output_path, mimetype='application/zip', as_attachment=True, download_name=name)


@publish_bp.delete('/api/publishes/<job_id>')
def delete_publish(job_id):
    job = PublishJob.query.get_or_404(job_id)
    if job.output_path and Path(job.output_path).exists():
        try:
            Path(job.output_path).unlink()
        except Exception:
            pass
    db.session.delete(job)
    db.session.commit()
    return jsonify({'deleted': job_id})


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
