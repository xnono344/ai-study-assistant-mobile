"""Progress and study-session endpoints.

Aggregates data from the existing StudySession / SectionProgress /
ExerciseAttempt tables into shapes the dashboard and progress page
need. All numbers come straight from the database — no mocks, no
hard-coded values.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas import (
    ExerciseAttemptModel,
    LessonModel,
    SectionModel,
    SectionProgressModel,
    StudySessionModel,
)
from app.schemas.progress import (
    ConfidenceLevel,
    StudySessionCreate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/progress", tags=["progress"])


class SessionUpdate(BaseModel):
    """Body for PATCH /progress/sessions/{id}."""

    duration_minutes: int | None = None
    sections_studied: list[str] | None = None
    exercises_attempted: int | None = None
    exercises_correct: int | None = None


class SectionCompleteRequest(BaseModel):
    """Body for POST /progress/sections/{id}/complete.

    The mobile client always sends `{confidence}` as a JSON body. We accept
    it here (not as a query param) so the body is non-empty — FastAPI
    treats a query-only signature as ambiguous when a body is also present.
    """

    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM


def _now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ----------------------------------------------------------------- sessions


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: StudySessionCreate,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Record a study session.

    The frontend calls this when a user opens a lesson, and PATCHes
    the row (via /sessions/{id}) when they close it with the actual
    duration. For lightweight cases the frontend can also send a
    completed session in a single POST.
    """
    if payload.duration_minutes is not None and payload.duration_minutes < 0:
        raise HTTPException(status_code=400, detail="duration_minutes must be non-negative")
    row = StudySessionModel(
        lesson_id=payload.lesson_id.bytes,
        duration_minutes=max(0, int(payload.duration_minutes or 0)),
        sections_studied=[str(s) for s in (payload.sections_studied or [])],
        exercises_attempted=max(0, int(payload.exercises_attempted or 0)),
        exercises_correct=max(0, int(payload.exercises_correct or 0)),
    )
    session.add(row)
    await session.flush()
    return {
        "id": str(UUID(bytes=row.id)),
        "lesson_id": str(payload.lesson_id),
        "duration_minutes": row.duration_minutes,
        "sections_studied": row.sections_studied,
        "exercises_attempted": row.exercises_attempted,
        "exercises_correct": row.exercises_correct,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.patch("/sessions/{session_id}")
async def update_session(
    session_id: UUID,
    payload: SessionUpdate = None,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Update a session in place — e.g. record the final duration."""
    stmt = select(StudySessionModel).where(StudySessionModel.id == session_id.bytes)
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if payload is None:
        return {
            "id": str(UUID(bytes=row.id)),
            "duration_minutes": row.duration_minutes,
            "sections_studied": row.sections_studied,
            "exercises_attempted": row.exercises_attempted,
            "exercises_correct": row.exercises_correct,
        }
    if payload.duration_minutes is not None:
        row.duration_minutes = max(0, int(payload.duration_minutes))
    if payload.sections_studied is not None:
        # Merge with any existing sections so we never lose data
        existing = set(row.sections_studied or [])
        existing.update(payload.sections_studied)
        row.sections_studied = sorted(existing)
    if payload.exercises_attempted is not None:
        row.exercises_attempted = max(0, int(payload.exercises_attempted))
    if payload.exercises_correct is not None:
        row.exercises_correct = max(0, int(payload.exercises_correct))
    await session.flush()
    return {
        "id": str(UUID(bytes=row.id)),
        "duration_minutes": row.duration_minutes,
        "sections_studied": row.sections_studied,
        "exercises_attempted": row.exercises_attempted,
        "exercises_correct": row.exercises_correct,
    }


# ----------------------------------------------------------------- section progress


@router.post("/sections/{section_id}/complete", status_code=status.HTTP_200_OK)
async def mark_section_complete(
    section_id: UUID,
    payload: SectionCompleteRequest = SectionCompleteRequest(),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Mark a section as completed with a confidence level."""
    confidence = payload.confidence
    # Look up the section to get its lesson_id
    section_stmt = select(SectionModel).where(SectionModel.id == section_id.bytes)
    section = (await session.execute(section_stmt)).scalar_one_or_none()
    if section is None:
        raise HTTPException(status_code=404, detail="Section not found")

    # Upsert: if a row exists for (lesson, section) update it, else insert
    stmt = select(SectionProgressModel).where(
        SectionProgressModel.section_id == section_id.bytes
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        row = SectionProgressModel(
            lesson_id=section.lesson_id,
            section_id=section_id.bytes,
            completed=True,
            confidence=confidence,
            time_spent_minutes=0,
        )
        session.add(row)
    else:
        row.completed = True
        row.confidence = confidence
    await session.flush()
    return {
        "id": str(UUID(bytes=row.id)),
        "section_id": str(section_id),
        "completed": row.completed,
        "confidence": row.confidence.value
        if hasattr(row.confidence, "value")
        else str(row.confidence),
    }


# ----------------------------------------------------------------- aggregate stats


@router.get("")
async def get_progress(
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Aggregated progress for the dashboard and progress page.

    Returns real numbers from the database:
      - total_lessons: count of lessons ever created
      - total_study_time_minutes: sum of all study-session durations
      - study_time_today_minutes / _this_week_minutes: time-bucketed
      - exercises_completed / exercises_attempted: from exercise attempts
      - streak_days: consecutive days with at least one study session
      - weekly_minutes_per_day: list of 7 {day, hours} entries
        (oldest first) suitable for a bar chart
      - per_lesson_progress: [{lesson_id, title, progress_pct}]
      - section_progress: section completion counts
    """
    now = _now_utc()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())  # Monday

    # ----- total lessons
    total_lessons = (
        await session.execute(select(func.count(LessonModel.id)))
    ).scalar_one() or 0

    # ----- sessions in different windows
    all_sessions = (
        (
            await session.execute(
                select(StudySessionModel).order_by(StudySessionModel.created_at.asc())
            )
        )
        .scalars()
        .all()
    )

    total_minutes = sum(int(s.duration_minutes or 0) for s in all_sessions)
    today_minutes = sum(
        int(s.duration_minutes or 0)
        for s in all_sessions
        if s.created_at and s.created_at >= today_start
    )
    week_minutes = sum(
        int(s.duration_minutes or 0)
        for s in all_sessions
        if s.created_at and s.created_at >= week_start
    )

    # ----- streak: count consecutive days back from today with ≥1 session
    days_with_session: set[Any] = set()
    for s in all_sessions:
        if s.created_at:
            days_with_session.add(s.created_at.date())
    streak = 0
    cursor = today_start.date()
    while cursor in days_with_session:
        streak += 1
        cursor = cursor - timedelta(days=1)

    # ----- weekly activity, last 7 days oldest first
    weekly: list[dict[str, Any]] = []
    for i in range(6, -1, -1):
        day = (today_start - timedelta(days=i)).date()
        minutes = sum(
            int(s.duration_minutes or 0)
            for s in all_sessions
            if s.created_at and s.created_at.date() == day
        )
        weekly.append(
            {
                "date": day.isoformat(),
                "day": day.strftime("%a"),
                "minutes": minutes,
                "hours": round(minutes / 60.0, 2),
            }
        )

    # ----- exercises: count exercise attempts
    exercise_attempts = (
        (
            await session.execute(select(ExerciseAttemptModel))
        )
        .scalars()
        .all()
    )
    exercises_attempted = len(exercise_attempts)
    exercises_correct = sum(1 for a in exercise_attempts if a.is_correct)

    # ----- per-lesson progress
    all_lessons = (
        (await session.execute(select(LessonModel))).scalars().all()
    )
    per_lesson = []
    for lesson in all_lessons:
        # Count completed sections for this lesson
        section_count_stmt = select(func.count(SectionModel.id)).where(
            SectionModel.lesson_id == lesson.id
        )
        section_total = (await session.execute(section_count_stmt)).scalar_one() or 0
        completed_stmt = (
            select(func.count(SectionProgressModel.id))
            .join(SectionModel, SectionProgressModel.section_id == SectionModel.id)
            .where(
                SectionModel.lesson_id == lesson.id,
                SectionProgressModel.completed == True,  # noqa: E712
            )
        )
        completed = (await session.execute(completed_stmt)).scalar_one() or 0
        pct = round((completed / section_total) * 100) if section_total else 0
        per_lesson.append(
            {
                "lesson_id": str(UUID(bytes=lesson.id)),
                "title": lesson.title,
                "subject": lesson.subject,
                "level": lesson.level,
                "progress_pct": pct,
                "sections_total": section_total,
                "sections_completed": completed,
            }
        )

    # ----- weak areas: count failure_count per concept
    # (we don't have an actual failures table for this MVP — leave empty
    # so the UI shows an honest "no weak areas yet" state)
    weak_areas: list[dict[str, Any]] = []

    return {
        "total_lessons": int(total_lessons),
        "total_study_time_minutes": int(total_minutes),
        "study_time_today_minutes": int(today_minutes),
        "study_time_this_week_minutes": int(week_minutes),
        "exercises_attempted": int(exercises_attempted),
        "exercises_completed": int(exercises_correct),
        "streak_days": int(streak),
        "weekly": weekly,
        "per_lesson": per_lesson,
        "weak_areas": weak_areas,
        "generated_at": now.isoformat(),
    }


__all__ = ["router"]
