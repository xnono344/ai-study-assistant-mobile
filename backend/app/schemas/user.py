"""User and OAuth token models for mobile + Google sign-in."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import String, ForeignKey, Text, JSON, DateTime, Boolean, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, UUIDMixin, TimestampMixin
import enum


class SubscriptionTier(str, enum.Enum):
    FREE = "free"
    PREMIUM = "premium"


class UserModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    session_id: Mapped[bytes] = mapped_column(unique=True, index=True, nullable=False)
    google_user_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subscription_tier: Mapped[str] = mapped_column(String(20), default="free", nullable=False, index=True)
    revenuecat_customer_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    locale: Mapped[Optional[str]] = mapped_column(String(10), default="en", nullable=True)
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    oauth_tokens: Mapped[list["OAuthTokenModel"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    subscription_events: Mapped[list["SubscriptionEventModel"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class OAuthTokenModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "oauth_tokens"

    user_id: Mapped[bytes] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(50), default="google", nullable=False)
    encrypted_blob: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["UserModel"] = relationship(back_populates="oauth_tokens")


class SubscriptionEventModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "subscription_events"

    user_id: Mapped[bytes] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    revenuecat_event_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    user: Mapped["UserModel"] = relationship(back_populates="subscription_events")


class ProcessedWebhookModel(Base, UUIDMixin, TimestampMixin):
    """Idempotency: prevent duplicate webhook processing."""

    __tablename__ = "processed_webhooks"

    event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(50), default="revenuecat", nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class UserConsentModel(Base, UUIDMixin, TimestampMixin):
    """Track user's acceptance of privacy policy / terms."""

    __tablename__ = "user_consents"

    user_id: Mapped[bytes] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type: Mapped[str] = mapped_column(String(50), nullable=False)  # privacy, terms, oauth
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
