"""Application settings (env-driven)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# ``config.py`` lives at ``backend/app/core/config.py``.  Settings and local
# runtime data belong to the backend directory, independent of the shell's
# current working directory.
BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
    )

    # LLM Provider Configuration
    LLM_PROVIDER_PRIORITY: str = Field(default="gemini")
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    GOOGLE_API_KEY: str | None = None  # Optional fallback for demo (rate-limited)

    GEMINI_MODEL_CHAIN: str = Field(default="gemini-flash-latest")

    # Google OAuth (Mobile)
    GOOGLE_CLIENT_ID_WEB: str | None = None
    GOOGLE_CLIENT_SECRET_WEB: str | None = None
    GOOGLE_CLIENT_ID_IOS: str | None = None
    GOOGLE_CLIENT_ID_ANDROID: str | None = None
    GOOGLE_REDIRECT_URI: str = Field(default="nexusstudy://oauth")

    # Token Encryption (CRITICAL - must be 32-byte base64 Fernet key)
    ENCRYPTION_KEY: str | None = None

    # RevenueCat
    REVENUECAT_WEBHOOK_SECRET: str | None = None
    REVENUECAT_API_KEY: str | None = None

    # Database
    DATABASE_URL: str = Field(
        default=f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'app.db'}"
    )

    @field_validator("DATABASE_URL")
    @classmethod
    def resolve_sqlite_database_url(cls, value: str) -> str:
        """Resolve local SQLite files against ``backend`` and create their directory."""
        prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
        for prefix in prefixes:
            if not value.startswith(prefix):
                continue

            raw_path = value.removeprefix(prefix)
            if raw_path == ":memory:":
                return value

            database_path = Path(raw_path).expanduser()
            if not database_path.is_absolute():
                database_path = BASE_DIR / database_path
            database_path = database_path.resolve()
            database_path.parent.mkdir(parents=True, exist_ok=True)
            return f"{prefix}{database_path}"

        return value

    # Tesseract
    TESSERACT_CMD: str = "tesseract"
    TESSERACT_LANG: str = "fra+ara+eng"

    # CORS
    CORS_ORIGINS: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,app://localhost,capacitor://localhost,nexusstudy://,https://aistudyassistant.app,https://nexusstudy.app"
    )

    # Application
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    APP_VERSION: str = "0.1.0"

    # Sentry
    SENTRY_DSN: str | None = None

    @property
    def llm_provider_priority(self) -> list[str]:
        return [p.strip() for p in self.LLM_PROVIDER_PRIORITY.split(",") if p.strip()]

    @property
    def gemini_model_chain(self) -> list[str]:
        return [m.strip() for m in self.GEMINI_MODEL_CHAIN.split(",") if m.strip()]

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
