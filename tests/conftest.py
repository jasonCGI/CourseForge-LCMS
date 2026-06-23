"""
Shared pytest fixtures for the CourseForge P1 suite.

The importer's seed path (`seed_project`) writes a full
Project -> Course -> Module -> Lesson -> Frame tree into the DB, so the
importer tests need a real Flask app context with a real schema. We bind the
app to an in-memory SQLite database and `create_all()` the models, which keeps
the suite hermetic (no Postgres, no network) while still exercising the genuine
SQLAlchemy models rather than mocks.

`server.version` is pure and has no app/DB dependency, so its tests import it
directly and don't touch these fixtures.
"""

import os
import sys

import pytest

# Make the repo root importable as `server...` regardless of pytest's rootdir.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Force a hermetic config before anything reads the env / builds the app.
os.environ["FLASK_ENV"] = "development"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def app():
    """A Flask app bound to a single in-memory SQLite DB for the whole session."""
    from server.app import create_app
    from server.extensions import db

    application = create_app("development")
    application.config.update(
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
        TESTING=True,
    )

    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture
def db_session(app):
    """
    Provide the live session inside an app context and clean every table
    after each test so imports don't bleed across tests. The in-memory DB
    persists for the session (single connection), so we truncate rather than
    recreate.
    """
    from server.extensions import db

    with app.app_context():
        yield db.session
        db.session.rollback()
        # Delete children-first to respect FKs.
        for table in reversed(db.metadata.sorted_tables):
            db.session.execute(table.delete())
        db.session.commit()
