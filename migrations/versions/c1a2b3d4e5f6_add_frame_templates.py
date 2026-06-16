"""add frame_templates

Revision ID: c1a2b3d4e5f6
Revises: 44fb3a6b254f
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa


revision = 'c1a2b3d4e5f6'
down_revision = '44fb3a6b254f'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'frame_templates',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.String(length=500), nullable=True),
        sa.Column('frame_type', sa.String(length=50), nullable=True),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('is_builtin', sa.Boolean(), nullable=True),
        sa.Column('icon', sa.String(length=10), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('frame_templates')
