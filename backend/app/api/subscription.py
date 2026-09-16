"""Subscription endpoints — RevenueCat sync + webhook handling."""

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.schemas.user import (
    UserModel, SubscriptionEventModel, ProcessedWebhookModel, SubscriptionTier,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscription", tags=["subscription"])


class SubscriptionStatus(BaseModel):
    tier: Literal['free', 'premium']
    is_active: bool
    expires_at: str | None
    grace_period_ends_at: str | None
    will_renew: bool
    family_share: bool


class SyncRequest(BaseModel):
    revenuecat_customer_info: dict


class SyncResponse(BaseModel):
    synced: bool
    tier: str
    expires_at: str | None


class PortalResponse(BaseModel):
    url: str


@router.get("/status", response_model=SubscriptionStatus)
async def get_subscription_status(
    x_session_id: str = Header(..., alias="X-Session-Id"),
    session: AsyncSession = Depends(get_db_session),
) -> SubscriptionStatus:
    """Return current subscription status for the user."""
    sid_bytes = _parse_session_id(x_session_id)
    user = (await session.execute(
        select(UserModel).where(UserModel.session_id == sid_bytes)
    )).scalar_one_or_none()

    if user is None:
        return SubscriptionStatus(
            tier="free", is_active=True, expires_at=None,
            grace_period_ends_at=None, will_renew=False, family_share=False,
        )

    return SubscriptionStatus(
        tier=user.subscription_tier,
        is_active=user.subscription_tier == "premium",
        expires_at=None,  # TODO: track in subscription_events
        grace_period_ends_at=None,
        will_renew=False,
        family_share=False,
    )


@router.post("/sync", response_model=SyncResponse)
async def sync_subscription(
    payload: SyncRequest,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    session: AsyncSession = Depends(get_db_session),
) -> SyncResponse:
    """Mobile calls this after purchase/restore to sync tier immediately.

    The authoritative source is still the RevenueCat webhook below;
    this endpoint is for fast UI feedback.
    """
    sid_bytes = _parse_session_id(x_session_id)
    user = (await session.execute(
        select(UserModel).where(UserModel.session_id == sid_bytes)
    )).scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    customer_info = payload.revenuecat_customer_info
    entitlements = customer_info.get("entitlements", {})
    premium = entitlements.get("premium", {})

    is_premium = premium.get("isActive", False) or premium.get("will_renew", False)
    new_tier = "premium" if is_premium else "free"

    # Record event
    event = SubscriptionEventModel(
        user_id=user.id,
        event_type="sync",
        payload=customer_info,
    )
    session.add(event)

    # Update user tier if changed
    if user.subscription_tier != new_tier:
        user.subscription_tier = new_tier
        if customer_info.get("customerInfo", {}).get("original_app_user_id"):
            user.revenuecat_customer_id = customer_info["customerInfo"]["original_app_user_id"]
        await session.flush()

    await session.commit()

    logger.info("subscription_synced user_id=%s tier=%s", user.id, new_tier)
    return SyncResponse(synced=True, tier=new_tier, expires_at=None)


@router.post("/webhook")
async def revenuecat_webhook(
    request_body: dict,
    x_revenuecat_signature: str = Header(None, alias="X-RevenueCat-Signature"),
    session: AsyncSession = Depends(get_db_session),
):
    """Receive RevenueCat webhook events with signature verification + idempotency.

    Events: INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE, etc.
    """
    settings = get_settings()
    if not settings.REVENUECAT_WEBHOOK_SECRET:
        logger.warning("revenuecat_webhook_no_secret_configured")
        # Still process for dev — but log the risk
    else:
        # Verify signature
        expected = hmac.new(
            settings.REVENUECAT_WEBHOOK_SECRET.encode(),
            json.dumps(request_body, separators=(",", ":")).encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected or "", x_revenuecat_signature or ""):
            raise HTTPException(status_code=401, detail="Invalid signature")

    event = request_body.get("event", {})
    event_id = event.get("id")
    event_type = event.get("type")
    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing event.id or event.type")

    # Idempotency: skip if already processed
    payload_hash = hashlib.sha256(
        json.dumps(request_body, sort_keys=True).encode()
    ).hexdigest()

    existing = (await session.execute(
        select(ProcessedWebhookModel).where(ProcessedWebhookModel.event_id == event_id)
    )).scalar_one_or_none()

    if existing is not None:
        logger.info("revenuecat_webhook_duplicate event_id=%s", event_id)
        return {"status": "already_processed"}

    # Find user by revenuecat_customer_id
    customer_id = event.get("app_user_id")
    if not customer_id:
        logger.warning("revenuecat_webhook_no_user event_id=%s", event_id)
        return {"status": "no_user"}

    user = (await session.execute(
        select(UserModel).where(UserModel.revenuecat_customer_id == customer_id)
    )).scalar_one_or_none()

    if user is None:
        # Try matching by session_id (in case user hasn't been linked yet)
        logger.warning("revenuecat_webhook_user_not_found customer_id=%s", customer_id)
        return {"status": "user_not_found"}

    # Process event
    new_tier = "free"
    if event_type in ("INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"):
        new_tier = "premium"
    elif event_type in ("CANCELLATION", "EXPIRATION", "BILLING_ISSUE"):
        new_tier = "free"
    elif event_type == "PRODUCT_CHANGE":
        new_tier = "premium" if event.get("new_product_id", "").startswith("premium") else "free"

    user.subscription_tier = new_tier

    # Record event
    sub_event = SubscriptionEventModel(
        user_id=user.id,
        event_type=event_type.lower(),
        revenuecat_event_id=event_id,
        payload=request_body,
    )
    session.add(sub_event)

    # Mark webhook as processed
    session.add(ProcessedWebhookModel(
        event_id=event_id,
        source="revenuecat",
        payload_hash=payload_hash,
    ))

    await session.commit()
    logger.info("revenuecat_webhook_processed event_id=%s type=%s user_id=%s",
                event_id, event_type, user.id)
    return {"status": "ok"}


@router.get("/portal", response_model=PortalResponse)
async def get_portal_url() -> PortalResponse:
    """Return RevenueCat customer portal URL for subscription management."""
    return PortalResponse(url="https://nexusstudy.app/account/subscription")


# ── Helpers ──

def _parse_session_id(session_id: str) -> bytes:
    """Convert session_id string to bytes (UUID bytes or raw)."""
    try:
        return UUID(session_id).bytes
    except (ValueError, AttributeError):
        return session_id.encode() if isinstance(session_id, str) else session_id
