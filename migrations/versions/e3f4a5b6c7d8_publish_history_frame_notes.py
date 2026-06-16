"""publish history fields + frame notes/optional

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa


revision = 'e3f4a5b6c7d8'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('publish_jobs', sa.Column('cf_version', sa.String(length=20), nullable=True))
    op.add_column('publish_jobs', sa.Column('frame_count', sa.Integer(), nullable=True))
    op.add_column('publish_jobs', sa.Column('file_size', sa.BigInteger(), nullable=True))
    op.add_column('publish_jobs', sa.Column('publish_name', sa.String(length=200), nullable=True))
    op.add_column('frames', sa.Column('notes', sa.Text(), nullable=True))
    op.add_column('frames', sa.Column('optional', sa.Boolean(), nullable=True))


def downgrade():
    op.drop_column('frames', 'optional')
    op.drop_column('frames', 'notes')
    op.drop_column('publish_jobs', 'publish_name')
    op.drop_column('publish_jobs', 'file_size')
    op.drop_column('publish_jobs', 'frame_count')
    op.drop_column('publish_jobs', 'cf_version')
