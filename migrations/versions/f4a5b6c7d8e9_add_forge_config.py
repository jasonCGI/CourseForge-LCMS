"""project forge_config (ForgeJS hotspot style)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-06-18

"""
from alembic import op
import sqlalchemy as sa


revision = 'f4a5b6c7d8e9'
down_revision = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('forge_config', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('projects', 'forge_config')
