import json
from flask import Blueprint, request, jsonify
from ..services.importer import import_project, ImportValidationError
from ..schemas.project_schemas import ProjectSchema

import_bp = Blueprint('import_', __name__)
project_schema = ProjectSchema()


@import_bp.post('/api/import')
def import_json():
    """
    Accept a JSON file upload or raw JSON body.
    Validates structure, seeds DB, returns created project.

    Accepts:
      - multipart/form-data with field 'file' (.json file)
      - application/json body directly
    """
    data = None

    # File upload path
    if 'file' in request.files:
        f = request.files['file']
        if not f.filename.endswith('.json'):
            return jsonify({'error': 'File must be a .json file.'}), 400
        try:
            data = json.loads(f.read().decode('utf-8'))
        except json.JSONDecodeError as e:
            return jsonify({'error': f'Invalid JSON: {str(e)}'}), 400

    # Raw JSON body path
    elif request.is_json:
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({'error': 'Could not parse JSON body.'}), 400

    else:
        return jsonify({'error': 'Send a .json file (multipart) or a JSON body.'}), 400

    try:
        project, warnings = import_project(data)
    except ImportValidationError as e:
        return jsonify({'error': str(e)}), 422
    except Exception as e:
        return jsonify({'error': f'Import failed: {str(e)}'}), 500

    response = {
        'project': project_schema.dump(project),
        'warnings': warnings
    }
    return jsonify(response), 201
