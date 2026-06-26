"""project text_mode (shelled body-text override: auto|light|dark)

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-06-26

"""
from alembic import op
import sqlalchemy as sa


revision = 'a5b6c7d8e9f0'
down_revision = 'f4a5b6c7d8e9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('text_mode', sa.String(length=8), nullable=True))


def downgrade():
    op.drop_column('projects', 'text_mode')
