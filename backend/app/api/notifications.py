"""Notification token registration and preferences."""
from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from typing import Dict, Any

router = APIRouter(prefix="/notifications", tags=["notifications"])


class TokenRequest(BaseModel):
    token: str
    platform: str  # 'ios' or 'android'


class PreferencesRequest(BaseModel):
    study_reminder: bool | None = None
    streak_alert: bool | None = None
    weekly_digest: bool | None = None


# In-memory storage for MVP (replace with DB in production)
_notification_tokens: dict[str, list[str]] = {}
_notification_prefs: dict[str, dict] = {}


def _get_session_id(x_session_id: str = Header(..., alias="X-Session-Id")) -> str:
    return x_session_id


@router.post("/register", status_code=204)
async def register_token(
    payload: TokenRequest,
    session_id: str = Depends(_get_session_id),
):
    _notification_tokens.setdefault(session_id, []).append(payload.token)
    return None


@router.patch("/preferences", status_code=204)
async def update_preferences(
    payload: PreferencesRequest,
    session_id: str = Depends(_get_session_id),
):
    prefs = _notification_prefs.get(session_id, {})
    if payload.study_reminder is not None:
        prefs['study_reminder'] = payload.study_reminder
    if payload.streak_alert is not None:
        prefs['streak_alert'] = payload.streak_alert
    if payload.weekly_digest is not None:
        prefs['weekly_digest'] = payload.weekly_digest
    _notification_prefs[session_id] = prefs
    return None
