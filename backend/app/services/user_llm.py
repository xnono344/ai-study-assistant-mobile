"""User-scoped LLM service.

When a user has connected Google, we use their OAuth access_token to call
the Gemini API directly. The user pays Google; we pay nothing.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.providers.gemini import GeminiProvider
from app.providers.base import Message, ProviderError
from app.schemas.user import UserModel, OAuthTokenModel
from app.services.token_store import (
    get_token_store, is_expired, refresh_google_token, TokenStore,
)

logger = logging.getLogger(__name__)


async def get_user_gemini_client(
    session: AsyncSession,
    user: UserModel,
) -> Optional[GeminiProvider]:
    """Get a Gemini client using the user's Google OAuth token.

    Returns None if user has no Google connection.
    """
    if user.google_user_id is None:
        return None

    token_row = (await session.execute(
        select(OAuthTokenModel).where(
            OAuthTokenModel.user_id == user.id,
            OAuthTokenModel.provider == "google",
        )
    )).scalar_one_or_none()

    if token_row is None:
        return None

    store = get_token_store()
    try:
        tokens = store.decrypt(token_row.encrypted_blob)
    except Exception as e:
        logger.error("token_decrypt_failed user_id=%s error=%s", user.id, e)
        return None

    # Refresh if expired
    if is_expired(tokens):
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            logger.warning("no_refresh_token user_id=%s", user.id)
            return None
        try:
            refreshed = await refresh_google_token(
                refresh_token, tokens.get("oauth_client_id")
            )
            # Google's refresh response normally omits the refresh token.
            # Preserve it and the client identity for the next refresh.
            tokens = {**tokens, **refreshed, "refresh_token": refresh_token}
            # Re-encrypt and store
            new_encrypted = store.encrypt(tokens)
            token_row.encrypted_blob = new_encrypted
            await session.flush()
            logger.info("token_refreshed user_id=%s", user.id)
        except Exception as e:
            logger.warning("token_refresh_failed user_id=%s error=%s", user.id, e)
            return None

    access_token = tokens.get("access_token")
    if not access_token:
        return None

    # Create Gemini provider using OAuth access_token
    # Note: Google Gemini API supports OAuth Bearer tokens
    return GeminiProvider(access_token=access_token)


async def get_user_or_default_provider(
    session: AsyncSession,
    x_session_id: Optional[str],
) -> GeminiProvider:
    """Resolve the Gemini provider for a request.

    Priority:
    1. User's own Google OAuth token (if connected)
    2. Server's GOOGLE_API_KEY fallback (for demo, rate-limited)
    """
    from app.core.config import get_settings
    from app.providers.gemini import GeminiProvider

    # Try user token first
    if x_session_id:
        try:
            sid_bytes = UUID(x_session_id).bytes if len(x_session_id) == 36 else x_session_id.encode()
        except (ValueError, AttributeError):
            sid_bytes = x_session_id.encode() if isinstance(x_session_id, str) else None

        if sid_bytes:
            user = (await session.execute(
                select(UserModel).where(UserModel.session_id == sid_bytes)
            )).scalar_one_or_none()

            if user is not None:
                client = await get_user_gemini_client(session, user)
                if client is not None:
                    return client

    # Fallback to server key (demo)
    settings = get_settings()
    if settings.GOOGLE_API_KEY:
        return GeminiProvider(api_key=settings.GOOGLE_API_KEY)

    raise ProviderError(
        "No LLM provider available. Connect Google or configure GOOGLE_API_KEY."
    )
