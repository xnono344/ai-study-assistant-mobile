"""Encrypted token store using AES-256-GCM via cryptography.fernet."""

import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from uuid import UUID

from cryptography.fernet import Fernet
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class TokenStore:
    """Encrypts/decrypts OAuth tokens per-user with AES-256-GCM (Fernet)."""

    def __init__(self) -> None:
        self._initialized = True
        encryption_key = get_settings().ENCRYPTION_KEY
        if not encryption_key:
            raise RuntimeError(
                "ENCRYPTION_KEY not set. Generate one with: "
                "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
            )
        # Allow base64 or hex; normalize to 32 url-safe base64 bytes
        try:
            self._fernet = Fernet(encryption_key.encode())
        except Exception:
            try:
                import base64
                normalized = base64.urlsafe_b64encode(bytes.fromhex(encryption_key)).decode()
                self._fernet = Fernet(normalized.encode())
            except Exception as e:
                raise RuntimeError(f"Invalid ENCRYPTION_KEY format: {e}")

    def encrypt(self, data: Dict[str, Any]) -> str:
        raw = json.dumps(data, default=str).encode()
        return self._fernet.encrypt(raw).decode()

    def decrypt(self, ciphertext: str) -> Dict[str, Any]:
        raw = self._fernet.decrypt(ciphertext.encode())
        return json.loads(raw.decode())


# ── Per-user async refresh lock (prevents token-stampede) ──

class _RefreshLockRegistry:
    _locks: dict[str, asyncio.Lock] = {}

    @classmethod
    @asynccontextmanager
    async def lock(cls, user_id: str):
        if user_id not in cls._locks:
            cls._locks[user_id] = asyncio.Lock()
        async with cls._locks[user_id]:
            yield


# ── Google token helpers ──

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_TOKENINFO_URL = "https://www.googleapis.com/oauth2/v3/tokeninfo"


def is_expired(tokens: Dict[str, Any], buffer_seconds: int = 300) -> bool:
    """Check if access token is expired (with safety buffer)."""
    expires_at = tokens.get("expires_at")
    if not expires_at:
        return True
    try:
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= expires_at - timedelta(seconds=buffer_seconds)
    except Exception:
        return True


async def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    code_verifier: Optional[str] = None,
    client_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Exchange authorization code for Google OAuth tokens."""
    settings = get_settings()
    allowed_client_ids = {
        value for value in (
            settings.GOOGLE_CLIENT_ID_WEB,
            settings.GOOGLE_CLIENT_ID_IOS,
            settings.GOOGLE_CLIENT_ID_ANDROID,
        ) if value
    }
    selected_client_id = client_id or settings.GOOGLE_CLIENT_ID_WEB
    if not selected_client_id or selected_client_id not in allowed_client_ids:
        raise ValueError("OAuth client is not configured")
    payload = {
        "client_id": selected_client_id,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    if selected_client_id == settings.GOOGLE_CLIENT_ID_WEB and settings.GOOGLE_CLIENT_SECRET_WEB:
        payload["client_secret"] = settings.GOOGLE_CLIENT_SECRET_WEB
    if code_verifier:
        payload["code_verifier"] = code_verifier

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=payload)
        if resp.status_code != 200:
            raise ValueError(f"Google token exchange failed: {resp.text}")
        data = resp.json()

    # Calculate absolute expiry
    expires_in = data.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    data["expires_at"] = expires_at.isoformat()
    data["oauth_client_id"] = selected_client_id
    return data


async def refresh_google_token(
    refresh_token: str, client_id: Optional[str] = None
) -> Dict[str, Any]:
    """Refresh an expired access token using a refresh token."""
    settings = get_settings()
    allowed_client_ids = {
        value for value in (
            settings.GOOGLE_CLIENT_ID_WEB,
            settings.GOOGLE_CLIENT_ID_IOS,
            settings.GOOGLE_CLIENT_ID_ANDROID,
        ) if value
    }
    selected_client_id = client_id or settings.GOOGLE_CLIENT_ID_WEB
    if not selected_client_id or selected_client_id not in allowed_client_ids:
        raise ValueError("OAuth client is not configured")
    payload = {
        "client_id": selected_client_id,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    if selected_client_id == settings.GOOGLE_CLIENT_ID_WEB and settings.GOOGLE_CLIENT_SECRET_WEB:
        payload["client_secret"] = settings.GOOGLE_CLIENT_SECRET_WEB
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(GOOGLE_TOKEN_URL, data=payload)
        if resp.status_code != 200:
            raise ValueError(f"Google token refresh failed: {resp.text}")
        data = resp.json()

    expires_in = data.get("expires_in", 3600)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    data["expires_at"] = expires_at.isoformat()
    data["oauth_client_id"] = selected_client_id
    return data


async def fetch_google_user_info(access_token: str) -> Dict[str, Any]:
    """Fetch user profile from Google."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code != 200:
            raise ValueError(f"Google userinfo failed: {resp.text}")
        return resp.json()


async def revoke_google_token(token: str) -> bool:
    """Revoke a Google access/refresh token."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"https://oauth2.googleapis.com/revoke?token={token}",
        )
        return resp.status_code == 200


# ── Module-level singleton accessor ──

_token_store: Optional[TokenStore] = None


def get_token_store() -> TokenStore:
    """Return a process-wide TokenStore singleton (lazy-initialized)."""
    global _token_store
    if _token_store is None:
        _token_store = TokenStore()
    return _token_store
