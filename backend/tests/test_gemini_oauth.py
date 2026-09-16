"""Offline tests for the user-scoped Gemini OAuth transport."""

import pytest

from app.providers.gemini import GeminiProvider


@pytest.mark.asyncio
async def test_oauth_transport_uses_bearer_header(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200
        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": '{"answer":"4"}'}]}}]}

    class FakeClient:
        def __init__(self, **kwargs):
            captured["timeout"] = kwargs.get("timeout")
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None
        async def post(self, url, headers, json):
            captured.update(url=url, headers=headers, body=json)
            return FakeResponse()

    monkeypatch.setattr("app.providers.gemini.httpx.AsyncClient", FakeClient)
    provider = GeminiProvider(access_token="user-oauth-token")
    text = await provider._complete_with_oauth(
        "gemini-flash-latest", "Be concise", "2+2?", 0.2
    )

    assert text == '{"answer":"4"}'
    assert captured["headers"] == {"Authorization": "Bearer user-oauth-token"}
    assert "user-oauth-token" not in captured["url"]
    assert captured["body"]["systemInstruction"]["parts"][0]["text"] == "Be concise"
