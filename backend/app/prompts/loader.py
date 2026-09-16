"""Jinja2 prompt template loader."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

PROMPTS_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=1)
def get_env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(PROMPTS_DIR)),
        autoescape=False,
        trim_blocks=True,
        lstrip_blocks=True,
        undefined=StrictUndefined,
    )


def render(name: str, **context: object) -> str:
    """Render a Jinja2 template by file name (without extension)."""
    template = get_env().get_template(f"{name}.j2")
    return template.render(**context)


__all__ = ["render", "get_env", "PROMPTS_DIR"]
