"""Provider registry that orchestrates fallbacks between LLM providers."""
from __future__ import annotations

import logging

from app.core.config import get_settings
from app.providers.base import LLMProvider
from app.providers.gemini import GeminiProvider

logger = logging.getLogger(__name__)


_PROVIDERS: dict[str, type[LLMProvider]] = {
    "gemini": GeminiProvider,
}


class ProviderRegistry:
    """Holds configured provider instances and resolves the priority list."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._instances: dict[str, LLMProvider] = {}

    def get(self, name: str) -> LLMProvider | None:
        if name in self._instances:
            return self._instances[name]

        if name == "gemini":
            api_key = self.settings.GOOGLE_API_KEY
            if not api_key:
                logger.info("provider_not_configured name=%s", name)
                return None
            instance = GeminiProvider(
                api_key=api_key,
                model_chain=self.settings.gemini_model_chain,
            )
            self._instances[name] = instance
            return instance

        logger.warning("provider_unknown name=%s", name)
        return None

    def list_available(self) -> list[LLMProvider]:
        available: list[LLMProvider] = []
        for name in self.settings.llm_provider_priority:
            provider = self.get(name)
            if provider is not None and provider.is_available():
                available.append(provider)
        return available


_registry: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        _registry = ProviderRegistry()
    return _registry


__all__ = ["ProviderRegistry", "get_provider_registry"]
