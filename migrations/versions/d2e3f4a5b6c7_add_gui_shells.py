"""add gui_shells library + projects.gui_shell_id

Revision ID: d2e3f4a5b6c7
Revises: c1a2b3d4e5f6
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa


revision = 'd2e3f4a5b6c7'
down_revision = 'c1a2b3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'gui_shells',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=True),
        sa.Column('stored_path', sa.String(length=512), nullable=True),
        sa.Column('html_file', sa.String(length=255), nullable=True),
        sa.Column('json_file', sa.String(length=255), nullable=True),
        sa.Column('stage_width', sa.Integer(), nullable=True),
        sa.Column('stage_height', sa.Integer(), nullable=True),
        sa.Column('button_count', sa.Integer(), nullable=True),
        sa.Column('zone_count', sa.Integer(), nullable=True),
        sa.Column('shell_config', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column('projects', sa.Column('gui_shell_id', sa.String(length=36), nullable=True))


def downgrade():
    op.drop_column('projects', 'gui_shell_id')
    op.drop_table('gui_shells')
