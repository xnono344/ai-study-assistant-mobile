"""Google OAuth + anonymous session endpoints for mobile."""

import logging
import secrets
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.user import (
    UserModel, OAuthTokenModel, UserConsentModel, SubscriptionTier,
)
from app.services.token_store import (
    TokenStore, exchange_code_for_tokens, fetch_google_user_info,
    refresh_google_token, revoke_google_token, is_expired,
)
from app.core.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
_token_store: TokenStore | None = None


def get_token_store() -> TokenStore:
    global _token_store
    if _token_store is None:
        _token_store = TokenStore()
    return _token_store


# ── Pydantic models ──

class ExchangeCodeRequest(BaseModel):
    code: str
    redirect_uri: str
    state: str | None = None
    code_verifier: str | None = None
    client_id: str | None = None


class ExchangeCodeResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    user: dict


class RefreshTokenRequest(BaseModel):
    refresh_token: str
    client_id: str | None = None


class RefreshTokenResponse(BaseModel):
    access_token: str
    expires_in: int


class DisconnectRequest(BaseModel):
    pass


# ── Helpers ──

async def get_or_create_user(
    session: AsyncSession,
    session_id: str,
    google_user_id: str | None = None,
    email: str | None = None,
    name: str | None = None,
    avatar_url: str | None = None,
) -> UserModel:
    """Find existing user by session_id, or create new."""
    sid_bytes = UUID(session_id).bytes if isinstance(session_id, str) and len(session_id) == 36 else session_id.encode() if isinstance(session_id, str) else session_id

    stmt = select(UserModel).where(UserModel.session_id == sid_bytes)
    user = (await session.execute(stmt)).scalar_one_or_none()

    if user is None:
        user = UserModel(
            session_id=sid_bytes,
            google_user_id=google_user_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
            subscription_tier=SubscriptionTier.FREE.value,
            is_anonymous=google_user_id is None,
        )
        session.add(user)
        await session.flush()
    elif google_user_id:
        # Upgrade anonymous user to Google account
        user.google_user_id = google_user_id
        user.email = email or user.email
        user.name = name or user.name
        user.avatar_url = avatar_url or user.avatar_url
        user.is_anonymous = False
        await session.flush()
    return user


def user_to_dict(user: UserModel) -> dict:
    return {
        "id": str(UUID(bytes=user.id)),
        "email": user.email,
        "name": user.name,
        "avatarUrl": user.avatar_url,
        "googleConnected": user.google_user_id is not None,
        "subscriptionTier": user.subscription_tier,
        "isAnonymous": user.is_anonymous,
    }


# ── Endpoints ──

@router.post("/google/exchange", response_model=ExchangeCodeResponse, status_code=200)
async def exchange_google_code(
    payload: ExchangeCodeRequest,
    request: Request,
    x_session_id: str = Header(..., alias="X-Session-Id"),
    session: AsyncSession = Depends(get_db_session),
) -> ExchangeCodeResponse:
    """Exchange Google authorization code for OAuth tokens.

    Mobile flow:
    1. Mobile opens Google OAuth in browser, gets `code` + `state`
    2. Mobile POSTs to this endpoint with code, redirect_uri, state
    3. Backend exchanges code → tokens (via Google token endpoint)
    4. Backend fetches Google user profile
    5. Backend creates/links User, encrypts + stores tokens
    6. Backend returns access_token + refresh_token to mobile
    7. Mobile stores in Keychain/Keystore via expo-secure-store
    """
    # Validate state (CSRF protection)
    # In production, store the expected state in Redis with TTL and compare here.
    # For now, require it to be present and non-trivial.
    if not payload.state or len(payload.state) < 16:
        raise HTTPException(status_code=400, detail="Invalid state parameter (CSRF)")

    # Exchange code with Google
    try:
        tokens = await exchange_code_for_tokens(
            payload.code, payload.redirect_uri, payload.code_verifier, payload.client_id
        )
    except ValueError as e:
        logger.warning("google_exchange_failed error=%s", e)
        raise HTTPException(status_code=400, detail=f"Google exchange failed: {e}")

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")  # may not be present on refresh
    if not access_token:
        raise HTTPException(status_code=400, detail="No access_token in Google response")

    # Fetch user profile
    try:
        profile = await fetch_google_user_info(access_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch Google profile: {e}")

    google_user_id = profile.get("sub")
    email = profile.get("email")
    name = profile.get("name")
    avatar_url = profile.get("picture")

    if not google_user_id:
        raise HTTPException(status_code=400, detail="No user ID in Google response")

    # Find or create user
    user = await get_or_create_user(
        session,
        session_id=x_session_id,
        google_user_id=google_user_id,
        email=email,
        name=name,
        avatar_url=avatar_url,
    )

    # Encrypt and store tokens
    store = get_token_store()
    encrypted = store.encrypt(tokens)
    scopes = tokens.get("scope", "").split() or ["openid", "email", "profile"]

    # Upsert OAuthToken row
    from sqlalchemy import delete
    await session.execute(
        delete(OAuthTokenModel).where(
            OAuthTokenModel.user_id == user.id,
            OAuthTokenModel.provider == "google",
        )
    )
    oauth_token = OAuthTokenModel(
        user_id=user.id,
        provider="google",
        encrypted_blob=encrypted,
        scopes=scopes,
        expires_at=None,  # Stored inside encrypted blob as ISO string
    )
    session.add(oauth_token)

    # Record consent for OAuth data usage
    consent = UserConsentModel(
        user_id=user.id,
        document_type="google_oauth",
        version="1.0",
        accepted_at=__import__("datetime").datetime.utcnow(),
    )
    session.add(consent)

    await session.flush()

    expires_in = int(tokens.get("expires_in", 3600))

    logger.info("google_oauth_success user_id=%s google_user_id=%s", user.id, google_user_id)

    return ExchangeCodeResponse(
        access_token=access_token,
        refresh_token=refresh_token or "",
        expires_in=expires_in,
        user=user_to_dict(user),
    )


@router.post("/google/refresh", response_model=RefreshTokenResponse)
async def refresh_google(
    payload: RefreshTokenRequest,
    session: AsyncSession = Depends(get_db_session),
) -> RefreshTokenResponse:
    """Refresh an expired Google access token.

    Used internally by the backend when calling Gemini for a user.
    NOT typically called directly by mobile (mobile stores refresh_token).
    """
    try:
        tokens = await refresh_google_token(payload.refresh_token, payload.client_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Refresh failed: {e}")

    return RefreshTokenResponse(
        access_token=tokens["access_token"],
        expires_in=int(tokens.get("expires_in", 3600)),
    )


@router.post("/google/disconnect", status_code=204)
async def disconnect_google(
    x_session_id: str = Header(..., alias="X-Session-Id"),
    session: AsyncSession = Depends(get_db_session),
):
    """Disconnect Google account from user.

    Revokes tokens with Google, removes encrypted token row.
    User data (lessons, progress) is preserved.
    """
    sid_bytes = UUID(x_session_id).bytes if len(x_session_id) == 36 else x_session_id.encode()
    user = (await session.execute(
        select(UserModel).where(UserModel.session_id == sid_bytes)
    )).scalar_one_or_none()

    if user is None or user.google_user_id is None:
        raise HTTPException(status_code=404, detail="No Google connection found")

    # Revoke tokens with Google (best effort)
    from sqlalchemy import delete
    token_rows = (await session.execute(
        select(OAuthTokenModel).where(OAuthTokenModel.user_id == user.id)
    )).scalars().all()

    for row in token_rows:
        try:
            tokens = get_token_store().decrypt(row.encrypted_blob)
            if tokens.get("access_token"):
                await revoke_google_token(tokens["access_token"])
        except Exception as e:
            logger.warning("google_revoke_failed user_id=%s error=%s", user.id, e)

    # Delete token rows
    await session.execute(
        delete(OAuthTokenModel).where(OAuthTokenModel.user_id == user.id)
    )

    # Clear user fields
    user.google_user_id = None
    user.is_anonymous = True
    await session.flush()

    logger.info("google_disconnected user_id=%s", user.id)
