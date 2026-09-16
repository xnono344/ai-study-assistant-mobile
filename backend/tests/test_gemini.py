"""Smoke test for the Gemini provider.

This test is skipped if GOOGLE_API_KEY is not set.
"""
from __future__ import annotations

import os
from pathlib import Path

# Load the .env file at the project root before importing anything
# that depends on settings.
from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / ".env", override=False)

import pytest
from pydantic import BaseModel

from app.providers.base import (
    ProviderAuthError,
    ProviderError,
    ProviderRateLimitError,
)
from app.providers.gemini import DEFAULT_MODEL_CHAIN, GeminiProvider
from app.providers.service import LLMService


class CapitalAnswer(BaseModel):
    capital: str
    country: str


pytestmark = [pytest.mark.asyncio, pytest.mark.integration]


@pytest.mark.skipif(
    not os.environ.get("GOOGLE_API_KEY"),
    reason="GOOGLE_API_KEY not set",
)
async def test_gemini_simple_completion():
    provider = GeminiProvider(api_key=os.environ["GOOGLE_API_KEY"])
    messages = [
        {
            "role": "system",
            "content": "Reply with strict JSON matching the requested schema.",
        },
        {
            "role": "user",
            "content": (
                "What is the capital of Morocco? "
                "Respond in JSON with fields 'capital' and 'country'."
            ),
        },
    ]
    # Convert to Message objects
    from app.providers.base import Message

    msgs = [Message(role=m["role"], content=m["content"]) for m in messages]
    result = await provider.complete(msgs, CapitalAnswer)
    assert isinstance(result, CapitalAnswer)
    assert "rabat" in result.capital.lower()


@pytest.mark.skipif(
    not os.environ.get("GOOGLE_API_KEY"),
    reason="GOOGLE_API_KEY not set",
)
async def test_llm_service_uses_gemini():
    service = LLMService()
    from app.providers.base import Message

    msgs = [
        Message(
            role="user",
            content=(
                "What is 2+2? Reply in JSON with field 'answer' as an integer string."
            ),
        ),
    ]

    class Answer(BaseModel):
        answer: str

    result = await service.complete(msgs, Answer)
    assert result.answer.strip() == "4"


@pytest.mark.skipif(
    not os.environ.get("GOOGLE_API_KEY"),
    reason="GOOGLE_API_KEY not set",
)
async def test_gemini_falls_back_on_unknown_model():
    """If the first model returns 404, the provider should fall back
    to the next model in the chain and still succeed."""
    from app.providers.base import Message

    # Start with an intentionally-bad model, then fall through to good ones.
    chain = [
        "gemini-does-not-exist-v999",
        "gemini-3.6-flash",
    ]
    provider = GeminiProvider(
        api_key=os.environ["GOOGLE_API_KEY"],
        model_chain=chain,
    )

    class Answer(BaseModel):
        answer: str

    msgs = [
        Message(
            role="user",
            content=(
                "What is 5+7? Reply in JSON with field 'answer' as a string."
            ),
        ),
    ]
    result = await provider.complete(msgs, Answer)
    assert result.answer.strip() == "12"
