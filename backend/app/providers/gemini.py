"""Google Gemini LLM provider with multi-model fallback support."""
from __future__ import annotations

import asyncio
import json
import logging
import warnings
from typing import Any
from urllib.parse import quote

import httpx

# Silence the `google.generativeai` package's deprecation warning
# before importing it. The package still works; we'll migrate to
# `google.genai` in a follow-up. The warning is emitted from a worker
# thread and doesn't carry a `module` attribute, so we install a
# broad FutureWarning filter (just for this import) and reset it
# immediately after.
with warnings.catch_warnings():
    warnings.simplefilter("ignore", FutureWarning)
    import google.generativeai as genai  # noqa: E402
    from google.generativeai.types import HarmBlockThreshold, HarmCategory  # noqa: E402
from pydantic import BaseModel, ValidationError

from app.providers.base import (
    LLMProvider,
    Message,
    ProviderAuthError,
    ProviderPermanentError,
    ProviderRateLimitError,
    ProviderTemporaryError,
)

logger = logging.getLogger(__name__)


# Ordered list of model IDs to try. The first is the most capable /
# most-available; the rest are fallbacks.
# Only models known to be live on the Gemini free tier are included —
# non-existent model IDs return 404 but only after a long timeout on
# large prompts, so a stale chain can make the whole call feel hung.
DEFAULT_MODEL_CHAIN: list[str] = [
    "gemini-flash-latest",
]


class GeminiProvider:
    """Provider backed by the Google Gemini API.

    The provider tries each model in ``model_chain`` in order. If a model
    returns a quota / 429 error, the next model is attempted. The same
    request is retried up to ``max_retries`` times against each model
    before moving on, with exponential backoff between attempts.
    """

    name = "gemini"

    def __init__(
        self,
        api_key: str | None = None,
        access_token: str | None = None,
        model_chain: list[str] | None = None,
        safety_off: bool = True,
    ) -> None:
        if not api_key and not access_token:
            raise ProviderAuthError("Gemini credentials are not configured")
        self.api_key = api_key
        self.access_token = access_token
        self.model_chain: list[str] = list(model_chain or DEFAULT_MODEL_CHAIN)
        self.safety_off = safety_off
        if api_key:
            genai.configure(api_key=api_key)

    def is_available(self) -> bool:
        return bool(self.api_key or self.access_token)

    async def _complete_with_oauth(
        self,
        model_id: str,
        system_instruction: str | None,
        user_prompt: str,
        temperature: float,
    ) -> str:
        """Call Gemini over REST with a user's OAuth bearer token.

        The legacy Python SDK treats its credential as an API key and stores
        configuration globally, which is unsafe when concurrent requests use
        different users. A direct bearer request keeps credentials scoped to
        this call.
        """
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(model_id, safe='')}:generateContent"
        )
        body: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "responseMimeType": "application/json",
            },
        }
        if system_instruction:
            body["systemInstruction"] = {"parts": [{"text": system_instruction}]}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {self.access_token}"},
                json=body,
            )
        if response.status_code in (401, 403):
            raise ProviderAuthError("Gemini OAuth credentials were rejected")
        if response.status_code == 429:
            raise ProviderRateLimitError("Gemini rate limit exceeded")
        if response.status_code >= 500:
            raise ProviderTemporaryError(
                f"Gemini service error ({response.status_code})"
            )
        if response.status_code >= 400:
            raise ProviderPermanentError(
                f"Gemini request failed ({response.status_code})"
            )
        payload = response.json()
        try:
            return payload["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderPermanentError("Gemini returned no text content") from exc

    def _safety_settings(self) -> dict[HarmCategory, HarmBlockThreshold]:
        if not self.safety_off:
            return {}
        # Allow educational / factual content through.
        return {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

    def _build_prompt(self, messages: list[Message]) -> tuple[str, str | None]:
        """Flatten chat messages into a (system_instruction, user_prompt) pair."""
        system_parts: list[str] = []
        user_parts: list[str] = []
        for msg in messages:
            if msg.role == "system":
                system_parts.append(msg.content)
            elif msg.role == "user":
                user_parts.append(msg.content)
            elif msg.role == "assistant":
                # Treat prior assistant messages as additional context.
                user_parts.append(f"[assistant]: {msg.content}")
            else:
                user_parts.append(msg.content)
        system_instruction = "\n\n".join(system_parts) if system_parts else None
        user_prompt = "\n\n".join(user_parts) if user_parts else ""
        return system_instruction, user_prompt

    def _schema_for(self, response_model: type[BaseModel]) -> dict[str, Any]:
        """Return Gemini-compatible generation config with JSON schema.

        Gemini's schema parser is strict OpenAPI 3 and rejects many
        JSON-Schema / Pydantic-v2 constructs. We:
        - inline ``$ref`` from ``$defs``
        - strip unsupported keys (title, default, examples, …)
        - flatten ``anyOf: [T, {"type": "null"}]`` into a single
          nullable type (the OpenAPI 3 way)
        - flatten ``anyOf`` of oneOf-style enums into a single
          ``enum: [...]`` list
        """
        import copy

        schema = copy.deepcopy(response_model.model_json_schema())
        defs: dict[str, Any] = schema.pop("$defs", {})

        unsupported_keys = {
            "title",
            "default",
            "examples",
            "description",
            "additionalProperties",
            "$schema",
            "$ref",
        }

        # Gemini's parser is also strict about `required` — it only accepts
        # property names that actually exist in `properties`. Pydantic v2
        # emits all field names in `required` even when they have defaults,
        # which can include synthesized keys like `__root__` or aliases.
        # We just drop `required` entirely and let Gemini treat absent
        # fields as optional.
        def strip_required(node: dict[str, Any]) -> None:
            node.pop("required", None)

        def inline(node: Any) -> Any:
            if isinstance(node, dict):
                if "$ref" in node:
                    ref = node["$ref"]
                    if ref.startswith("#/$defs/"):
                        name = ref.split("/")[-1]
                        if name in defs:
                            return inline(copy.deepcopy(defs[name]))
                for k in unsupported_keys:
                    node.pop(k, None)
                strip_required(node)
                flatten_anyof_null(node)
                for k, v in list(node.items()):
                    if isinstance(v, (dict, list)):
                        node[k] = inline(v)
                return node
            elif isinstance(node, list):
                return [inline(item) for item in node]
            return node

        def flatten_anyof_null(node: dict[str, Any]) -> None:
            """Convert anyOf:[T, {type:null}] into T with nullable=True."""
            if "anyOf" in node and isinstance(node["anyOf"], list):
                variants = node["anyOf"]
                has_null = any(
                    isinstance(v, dict) and v.get("type") == "null"
                    for v in variants
                )
                if has_null and len(variants) == 2:
                    non_null = next(
                        v for v in variants
                        if not (isinstance(v, dict) and v.get("type") == "null")
                    )
                    if isinstance(non_null, dict):
                        node.pop("anyOf")
                        for k, v in non_null.items():
                            node.setdefault(k, v)
                        node["nullable"] = True
                elif has_null and len(variants) > 2:
                    node["anyOf"] = [
                        v for v in variants
                        if not (isinstance(v, dict) and v.get("type") == "null")
                    ]
                elif all(
                    isinstance(v, dict) and "enum" in v for v in variants
                ):
                    # anyOf of single-value enums: collapse to one enum
                    merged = []
                    for v in variants:
                        if isinstance(v, dict) and isinstance(v.get("enum"), list):
                            merged.extend(v["enum"])
                    node["enum"] = list(dict.fromkeys(merged))
                    node.pop("anyOf", None)

        inline(schema)
        return {
            "temperature": 0.2,
            "response_mime_type": "application/json",
            "response_schema": schema,
        }

    def _parse_error(self, exc: Exception) -> Exception:
        if isinstance(exc, asyncio.TimeoutError):
            return ProviderTemporaryError(f"Gemini timeout: {exc}")
        if exc is None:
            return ProviderTemporaryError(f"Gemini connection error: {exc}")
        msg = str(exc).lower()
        if "api_key" in msg or "api key" in msg or "401" in msg or "403" in msg or "permission" in msg or "invalid" in msg:
            return ProviderAuthError(f"Gemini auth error: {exc}")
        if "429" in msg or "quota" in msg or "rate" in msg or "exhausted" in msg or "resource_exhausted" in msg or "rate_limit" in msg:
            return ProviderRateLimitError(f"Gemini rate limit: {exc}")
        if "timeout" in msg or "unavailable" in msg or "500" in msg or "502" in msg or "503" in msg or "504" in msg or "deadline" in msg:
            return ProviderTemporaryError(f"Gemini temporary error: {exc}")
        return ProviderPermanentError(f"Gemini permanent error: {exc}")

    async def complete(
        self,
        messages: list[Message],
        response_model: type[BaseModel],
        model: str | None = None,
        temperature: float = 0.2,
        max_retries: int = 2,
    ) -> BaseModel:
        chain = [model] if model else list(self.model_chain)
        system_instruction, user_prompt = self._build_prompt(messages)
        # We don't pass a strict response_schema because Gemini's free
        # tier rejects many Pydantic v2 constructs (anyOf, $defs, …).
        # Instead we ask for JSON via response_mime_type and validate
        # the response ourselves with pydantic.
        generation_config = {
            "temperature": temperature,
            "response_mime_type": "application/json",
        }

        # Append an instruction that forces the model to emit strict JSON
        # matching the schema. The schema itself is provided as a hint
        # in the prompt so the model knows the shape.
        schema_hint = json.dumps(response_model.model_json_schema(), ensure_ascii=False)
        user_prompt = (
            user_prompt
            + "\n\n---\nReturn your response as a JSON object that "
            "EXACTLY matches this JSON Schema:\n"
            + schema_hint
        )

        last_error: Exception | None = None
        for model_id in chain:
            for attempt in range(max_retries + 1):
                try:
                    if self.access_token:
                        text = await self._complete_with_oauth(
                            model_id, system_instruction, user_prompt, temperature
                        )
                    else:
                        model_instance = genai.GenerativeModel(
                            model_name=model_id,
                            safety_settings=self._safety_settings(),
                            system_instruction=system_instruction,
                            generation_config=generation_config,
                        )
                        response = await asyncio.wait_for(
                            asyncio.to_thread(
                                model_instance.generate_content, user_prompt
                            ),
                            timeout=30.0
                        )
                        text = response.text or ""
                    if not text:
                        raise ProviderPermanentError(
                            f"Gemini returned empty content (model={model_id})"
                        )
                    # Gemini may wrap the JSON in ```json ... ``` fences.
                    cleaned = text.strip()
                    if cleaned.startswith("```"):
                        # Strip leading and trailing fences
                        lines = cleaned.splitlines()
                        if lines and lines[0].startswith("```"):
                            lines = lines[1:]
                        if lines and lines[-1].startswith("```"):
                            lines = lines[:-1]
                        cleaned = "\n".join(lines).strip()
                    try:
                        data = json.loads(cleaned)
                    except json.JSONDecodeError as exc:
                        raise ProviderPermanentError(
                            f"Gemini returned invalid JSON: {exc}; body={cleaned[:200]}"
                        ) from exc
                    try:
                        return response_model.model_validate(data)
                    except ValidationError as exc:
                        raise ProviderPermanentError(
                            f"Gemini response did not match schema: {exc}"
                        ) from exc
                except asyncio.TimeoutError:
                    raise ProviderTemporaryError(
                        f"Gemini API call timed out after 30s (model={model_id})"
                    )
                except Exception as exc:  # noqa: BLE001
                    mapped = self._parse_error(exc)
                    last_error = mapped
                    if isinstance(mapped, ProviderAuthError):
                        # Auth errors won't fix themselves with another model.
                        raise mapped
                    if isinstance(mapped, ProviderRateLimitError):
                        logger.warning(
                            "gemini_quota_or_rate_limit model_id=%s attempt=%d error=%s",
                            model_id, attempt + 1, str(mapped),
                        )
                        # Skip remaining attempts on this model and try the next.
                        break
                    if isinstance(mapped, ProviderPermanentError):
                        # Permanent errors won't fix themselves; try the next model
                        # (sometimes a different model returns valid output).
                        logger.warning(
                            "gemini_permanent_error_try_next_model model_id=%s error=%s",
                            model_id, str(mapped),
                        )
                        break
                    # Temporary error — backoff and retry.
                    if attempt < max_retries:
                        backoff = 1.5 * (2 ** attempt)
                        logger.info(
                            "gemini_retry_after_backoff model_id=%s attempt=%d sleep=%.1f",
                            model_id, attempt + 1, backoff,
                        )
                        await asyncio.sleep(backoff)
                        continue
                    # Out of retries on this model; try the next.
                    break
        # All models failed.
        if last_error:
            raise last_error
        raise ProviderTemporaryError("Gemini: all models failed without an error")


__all__ = ["GeminiProvider", "DEFAULT_MODEL_CHAIN"]
