"""Integration tests for previously-uncovered API endpoints.

Covers:
  * POST /api/v1/questions                       (Q&A placeholder)
  * POST /api/v1/notifications/register         (push token registration)
  * PATCH /api/v1/notifications/preferences     (notification prefs)
  * POST /api/v1/exercises/{id}/attempt         (exercise attempt placeholder)

Note: We use a *file-based* SQLite (via tempfile.mkstemp) instead of
``:memory:`` because the in-memory DB is dropped when the
`TestClient` lifespan tears down its engine. Other test modules
(test_models.py) share the same `_db` singleton and run *after* the
client exits, so they need the schema to still exist.
"""

import os
import tempfile

# Use a per-process temp DB file BEFORE importing the app (required for
# settings + the module-level `_db` singleton in app.core.database).
_db_fd, _db_path = tempfile.mkstemp(suffix=".db", prefix="test_endpoints_")
os.close(_db_fd)
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_path}"

from cryptography.fernet import Fernet

os.environ.setdefault("ENCRYPTION_KEY", Fernet.generate_key().decode())

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    """Single TestClient per module so the in-memory notification state
    (which is module-level globals in app.api.notifications) is shared
    across tests, mimicking real client behavior."""
    app = create_app()
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------


def test_ask_question_returns_placeholder_answer(client: TestClient) -> None:
    """The MVP Q&A endpoint echoes the question in a placeholder answer
    and returns an empty source_refs list."""
    response = client.post(
        "/api/v1/questions",
        json={"lesson_id": "lesson-abc-123", "question": "What is momentum?"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert "answer" in body
    assert "source_refs" in body
    assert isinstance(body["source_refs"], list)
    assert body["source_refs"] == []
    # The question text should appear in the placeholder answer
    assert "What is momentum?" in body["answer"]


def test_ask_question_rejects_missing_fields(client: TestClient) -> None:
    """The 422 validation envelope should fire when required fields are
    missing (lesson_id / question)."""
    response = client.post("/api/v1/questions", json={"lesson_id": "x"})
    assert response.status_code == 422
    body = response.json()
    assert body["type"] == "validation_error"


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


def test_register_notification_token_and_update_preferences(client: TestClient) -> None:
    """Register a push token, then update preferences. Both endpoints
    require the X-Session-Id header and return 204 on success."""
    headers = {"X-Session-Id": "test-session-001"}

    # Register token
    reg = client.post(
        "/api/v1/notifications/register",
        json={"token": "ExponentPushToken[abc123]", "platform": "android"},
        headers=headers,
    )
    assert reg.status_code == 204, reg.text
    assert reg.content == b""

    # Update preferences
    prefs = client.patch(
        "/api/v1/notifications/preferences",
        json={
            "study_reminder": True,
            "streak_alert": False,
            "weekly_digest": True,
        },
        headers=headers,
    )
    assert prefs.status_code == 204, prefs.text
    assert prefs.content == b""


def test_notifications_require_session_header(client: TestClient) -> None:
    """Both notification endpoints must reject requests without
    X-Session-Id (FastAPI returns 422 for missing required headers)."""
    reg = client.post(
        "/api/v1/notifications/register",
        json={"token": "tok", "platform": "ios"},
    )
    assert reg.status_code == 422

    prefs = client.patch(
        "/api/v1/notifications/preferences",
        json={"study_reminder": True},
    )
    assert prefs.status_code == 422


# ---------------------------------------------------------------------------
# Exercise attempts
# ---------------------------------------------------------------------------


def test_exercise_attempt_correct_for_long_answer(client: TestClient) -> None:
    """MVP placeholder marks any answer longer than 5 chars as correct."""
    response = client.post(
        "/api/v1/exercises/ex-001/attempt",
        json={"answer": "A detailed explanation of Newton's second law.", "time_spent_seconds": 42},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_correct"] is True
    assert body["exercise_id"] == "ex-001"
    assert body["id"] == "ex-001"


def test_exercise_attempt_incorrect_for_short_answer(client: TestClient) -> None:
    """An answer shorter than the 5-char threshold should be marked
    incorrect by the placeholder heuristic."""
    response = client.post(
        "/api/v1/exercises/ex-002/attempt",
        json={"answer": "no", "time_spent_seconds": 5},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_correct"] is False
    assert body["exercise_id"] == "ex-002"
