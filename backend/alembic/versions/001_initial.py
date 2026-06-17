"""initial

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('role', sa.String(32), server_default='viewer'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    op.create_table(
        'accounts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('cf_account_id', sa.String(64), nullable=False),
        sa.Column('api_token_encrypted', sa.String(512), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index('ix_accounts_cf_account_id', 'accounts', ['cf_account_id'], unique=True)

    op.create_table(
        'domains',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('account_id', sa.String(36), sa.ForeignKey('accounts.id'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('zone_id', sa.String(64)),
        sa.Column('status', sa.String(32), server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index('ix_domains_zone_id', 'domains', ['zone_id'], unique=True)

    op.create_table(
        'templates',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(64)),
        sa.Column('dns_records', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb")),
        sa.Column('cache_settings', postgresql.JSONB(), server_default=sa.text("'{}'::jsonb")),
        sa.Column('page_rules', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb")),
        sa.Column('firewall_rules', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        'jobs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('type', sa.String(64), nullable=False),
        sa.Column('status', sa.String(32), server_default='pending'),
        sa.Column('payload', postgresql.JSONB(), server_default=sa.text("'{}'::jsonb")),
        sa.Column('result', postgresql.JSONB()),
        sa.Column('error', sa.Text()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('action', sa.String(64), nullable=False),
        sa.Column('resource', sa.String(64)),
        sa.Column('resource_id', sa.String(64)),
        sa.Column('user_id', sa.String(36)),
        sa.Column('details', postgresql.JSONB()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('audit_logs')
    op.drop_table('jobs')
    op.drop_table('templates')
    op.drop_table('domains')
    op.drop_table('accounts')
    op.drop_table('users')

