"""High-level LLM service with cross-provider fallback."""
from __future__ import annotations

import logging
from typing import TypeVar

from pydantic import BaseModel

from app.providers.base import (
    LLMProvider,
    Message,
    ProviderAuthError,
    ProviderError,
    ProviderPermanentError,
    ProviderRateLimitError,
    ProviderTemporaryError,
)
from app.providers.registry import ProviderRegistry, get_provider_registry

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LLMService:
    """Tries each configured provider in priority order until one succeeds.

    Quota / rate-limit errors trigger a move to the next provider.
    Auth and permanent errors raise immediately (no fallback).
    """

    def __init__(self, registry: ProviderRegistry | None = None) -> None:
        self.registry = registry or get_provider_registry()

    def _providers(self) -> list[LLMProvider]:
        return self.registry.list_available()

    async def complete(
        self,
        messages: list[Message],
        response_model: type[T],
        temperature: float = 0.2,
    ) -> T:
        providers = self._providers()
        if not providers:
            raise ProviderError(
                "No LLM providers are available. Configure GOOGLE_API_KEY "
                "(or another provider's key) in your .env file."
            )

        errors: list[tuple[str, Exception]] = []
        for provider in providers:
            try:
                logger.info(
                    "llm_complete_attempt provider=%s message_count=%d",
                    provider.name, len(messages),
                )
                return await provider.complete(
                    messages=messages,
                    response_model=response_model,
                    temperature=temperature,
                )
            except ProviderAuthError as exc:
                # Don't try the next provider for auth errors — they will all fail.
                logger.error("llm_auth_error provider=%s error=%s", provider.name, str(exc))
                raise
            except ProviderPermanentError as exc:
                # The current model/parser failed; try the next provider.
                logger.warning(
                    "llm_permanent_error_try_next_provider provider=%s error=%s",
                    provider.name, str(exc),
                )
                errors.append((provider.name, exc))
                continue
            except ProviderRateLimitError as exc:
                logger.warning(
                    "llm_rate_limit_try_next_provider provider=%s error=%s",
                    provider.name, str(exc),
                )
                errors.append((provider.name, exc))
                continue
            except ProviderTemporaryError as exc:
                logger.warning(
                    "llm_temporary_error_try_next_provider provider=%s error=%s",
                    provider.name, str(exc),
                )
                errors.append((provider.name, exc))
                continue
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "llm_unexpected_error_try_next_provider provider=%s",
                    provider.name,
                )
                errors.append((provider.name, exc))
                continue

        # Every provider failed.
        summary = "; ".join(f"{name}: {err}" for name, err in errors)
        raise ProviderError(f"All configured LLM providers failed. {summary}")


_service: LLMService | None = None


def get_llm_service() -> LLMService:
    global _service
    if _service is None:
        _service = LLMService()
    return _service


__all__ = ["LLMService", "get_llm_service"]
