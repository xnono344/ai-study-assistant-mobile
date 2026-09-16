"""Regression tests for the local launch configuration."""

from pathlib import Path

from app.core.config import BASE_DIR, Settings


def test_backend_settings_are_loaded_from_backend_directory() -> None:
    backend_dir = Path(__file__).resolve().parents[1]

    assert BASE_DIR == backend_dir
    assert Path(Settings.model_config["env_file"]) == backend_dir / ".env"


def test_relative_sqlite_database_is_resolved_and_parent_created() -> None:
    settings = Settings(
        _env_file=None,
        DATABASE_URL="sqlite+aiosqlite:///./data/launch-test.db",
    )
    database_path = Path(settings.DATABASE_URL.removeprefix("sqlite+aiosqlite:///"))

    assert database_path == BASE_DIR / "data" / "launch-test.db"
    assert database_path.parent.is_dir()
