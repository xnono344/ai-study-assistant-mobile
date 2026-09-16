"""Tests for User, OAuth token store, and auth endpoints."""

import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

# Generate a valid Fernet key for testing
from cryptography.fernet import Fernet
os.environ.setdefault("ENCRYPTION_KEY", Fernet.generate_key().decode())

import pytest
from uuid import uuid4

from app.schemas.user import UserModel, OAuthTokenModel, SubscriptionTier
from app.services.token_store import TokenStore, is_expired


@pytest.mark.asyncio
async def test_native_oauth_exchange_uses_pkce_without_web_secret(monkeypatch):
    """Native authorization codes must be exchanged with their native client ID."""
    from types import SimpleNamespace
    from app.services import token_store

    captured = {}

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"access_token": "access", "refresh_token": "refresh", "expires_in": 3600}

    class FakeClient:
        def __init__(self, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None
        async def post(self, url, data):
            captured.update(data)
            return FakeResponse()

    settings = SimpleNamespace(
        GOOGLE_CLIENT_ID_WEB="web-id",
        GOOGLE_CLIENT_SECRET_WEB="web-secret",
        GOOGLE_CLIENT_ID_IOS="ios-id",
        GOOGLE_CLIENT_ID_ANDROID="android-id",
    )
    monkeypatch.setattr(token_store, "get_settings", lambda: settings)
    monkeypatch.setattr(token_store.httpx, "AsyncClient", FakeClient)

    result = await token_store.exchange_code_for_tokens(
        "code", "nexusstudy://oauth", "verifier", "android-id"
    )

    assert captured["client_id"] == "android-id"
    assert captured["code_verifier"] == "verifier"
    assert "client_secret" not in captured
    assert result["oauth_client_id"] == "android-id"


def test_token_store_encrypt_decrypt():
    """Round-trip encryption/decryption of OAuth tokens."""
    store = TokenStore()
    original = {
        "access_token": "ya29.fake-access-token",
        "refresh_token": "1//fake-refresh-token",
        "expires_in": 3600,
        "scope": "openid email profile https://www.googleapis.com/auth/generative-language",
    }
    ciphertext = store.encrypt(original)
    assert ciphertext != str(original)  # not plaintext
    decrypted = store.decrypt(ciphertext)
    assert decrypted["access_token"] == original["access_token"]
    assert decrypted["refresh_token"] == original["refresh_token"]


def test_token_store_different_encryptions():
    """Same plaintext encrypts to different ciphertexts (Fernet uses random IV)."""
    store = TokenStore()
    plaintext = {"access_token": "abc", "refresh_token": "xyz"}
    a = store.encrypt(plaintext)
    b = store.encrypt(plaintext)
    assert a != b  # Non-deterministic encryption
    assert store.decrypt(a) == store.decrypt(b) == plaintext


def test_is_expired():
    """Check expiry detection."""
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc).isoformat()
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    assert is_expired({"expires_at": past}) is True
    assert is_expired({"expires_at": now}) is True  # within 5min buffer
    assert is_expired({"expires_at": future}) is False
    assert is_expired({}) is True  # missing = expired
    assert is_expired({"expires_at": "invalid"}) is True  # unparseable = expired


def test_user_model_defaults():
    """User model should have safe defaults."""
    from app.core.database import get_database
    import asyncio

    async def setup():
        db = get_database()
        await db.create_all()
        return db

    asyncio.run(setup())

    user = UserModel(
        session_id=uuid4().bytes,
        subscription_tier=SubscriptionTier.FREE.value,
        is_anonymous=True,
    )
    assert user.subscription_tier == "free"
    assert user.is_anonymous is True
    assert user.google_user_id is None
    assert user.email is None


def test_oauth_token_model_creation():
    """OAuthToken model should store encrypted blob."""
    store = TokenStore()
    user_id = uuid4().bytes
    encrypted = store.encrypt({
        "access_token": "test",
        "refresh_token": "test2",
        "expires_in": 3600,
    })
    token = OAuthTokenModel(
        user_id=user_id,
        provider="google",
        encrypted_blob=encrypted,
        scopes=["openid", "email"],
    )
    assert token.provider == "google"
    assert len(token.encrypted_blob) > 0
    decrypted = store.decrypt(token.encrypted_blob)
    assert decrypted["access_token"] == "test"
