"""Add users, oauth_tokens, subscription_events, processed_webhooks, user_consents.

Revision ID: 2026_09_03_add_users_oauth
Revises: a95b1bb45125
Create Date: 2026-09-03

Zero-downtime migration:
1. CREATE new tables (additive, no impact on existing data)
2. Add user_id columns (nullable) to existing tables for backfill
3. Backfill user_id from session_id in a later migration
4. Make user_id NOT NULL after verification
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "2026_09_03_add_users_oauth"
down_revision: Union[str, None] = "a95b1bb45125"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        "users",
        sa.Column("session_id", sa.BLOB(), nullable=False),
        sa.Column("google_user_id", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("subscription_tier", sa.String(length=20), nullable=False, server_default="free"),
        sa.Column("revenuecat_customer_id", sa.String(length=255), nullable=True),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("locale", sa.String(length=10), nullable=True, server_default="en"),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.BLOB(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("session_id"),
        sa.UniqueConstraint("google_user_id"),
        sa.UniqueConstraint("revenuecat_customer_id"),
    )
    op.create_index(op.f("ix_users_session_id"), "users", ["session_id"], unique=False)
    op.create_index(op.f("ix_users_google_user_id"), "users", ["google_user_id"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)
    op.create_index(op.f("ix_users_subscription_tier"), "users", ["subscription_tier"], unique=False)

    # 2. oauth_tokens table
    op.create_table(
        "oauth_tokens",
        sa.Column("user_id", sa.BLOB(length=16), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False, server_default="google"),
        sa.Column("encrypted_blob", sa.Text(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.BLOB(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_oauth_tokens_user_id"), "oauth_tokens", ["user_id"], unique=False)

    # 3. subscription_events table
    op.create_table(
        "subscription_events",
        sa.Column("user_id", sa.BLOB(length=16), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("revenuecat_event_id", sa.String(length=255), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("id", sa.BLOB(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("revenuecat_event_id"),
    )
    op.create_index(op.f("ix_subscription_events_user_id"), "subscription_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_subscription_events_event_type"), "subscription_events", ["event_type"], unique=False)

    # 4. processed_webhooks table (idempotency)
    op.create_table(
        "processed_webhooks",
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="revenuecat"),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("id", sa.BLOB(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    op.create_index(op.f("ix_processed_webhooks_event_id"), "processed_webhooks", ["event_id"], unique=False)

    # 5. user_consents table
    op.create_table(
        "user_consents",
        sa.Column("user_id", sa.BLOB(length=16), nullable=False),
        sa.Column("document_type", sa.String(length=50), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.BLOB(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_consents_user_id"), "user_consents", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_table("user_consents")
    op.drop_table("processed_webhooks")
    op.drop_table("subscription_events")
    op.drop_table("oauth_tokens")
    op.drop_table("users")
