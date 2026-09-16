"""Exercise-related endpoints (attempts, etc.)."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session

router = APIRouter(prefix="/exercises", tags=["exercises"])


class ExerciseAttemptRequest(BaseModel):
    answer: str
    time_spent_seconds: int = 0


@router.post("/{exercise_id}/attempt")
async def submit_exercise_attempt(
    exercise_id: str,
    payload: ExerciseAttemptRequest,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Submit an answer to an exercise.

    For MVP, this returns a simple placeholder correctness signal based on
    the length of the answer. A real implementation would compare against
    the exercise's stored solution via the LLM.
    """
    is_correct = len(payload.answer.strip()) > 5  # Placeholder logic
    return {
        "id": exercise_id,
        "exercise_id": exercise_id,
        "is_correct": is_correct,
    }
