"""LLM provider abstractions."""
from __future__ import annotations

from typing import Any, Generic, Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class Message(BaseModel):
    """A chat message."""

    role: str
    content: str


class LLMProvider(Protocol):
    """Protocol that all LLM providers must implement."""

    name: str

    async def complete(
        self,
        messages: list[Message],
        response_model: type[BaseModel],
        model: str | None = None,
        temperature: float = 0.2,
        max_retries: int = 2,
    ) -> BaseModel:
        """Call the provider and parse the result into ``response_model``."""
        ...

    def is_available(self) -> bool:
        """Whether the provider is configured (e.g. API key present)."""
        ...


class ProviderError(RuntimeError):
    """Raised when a provider fails to complete a request."""


class ProviderAuthError(ProviderError):
    """Raised on authentication / authorization failures (not retried)."""


class ProviderRateLimitError(ProviderError):
    """Raised on 429 / quota errors (may be retried with backoff)."""


class ProviderTemporaryError(ProviderError):
    """Raised on transient network or server errors (may be retried)."""


class ProviderPermanentError(ProviderError):
    """Raised on invalid request, schema validation, etc. (do not retry)."""


__all__ = [
    "Message",
    "LLMProvider",
    "ProviderError",
    "ProviderAuthError",
    "ProviderRateLimitError",
    "ProviderTemporaryError",
    "ProviderPermanentError",
]
