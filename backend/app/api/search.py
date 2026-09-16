"""Search lessons, sections, or concepts."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, select
import uuid

from app.core.database import get_db_session
from app.schemas.lesson import LessonModel
from app.schemas.section import SectionModel

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
async def search(
    q: str = Query(..., min_length=1),
    type: str | None = Query(None, pattern="^(lesson|concept|exercise)$"),
    session: AsyncSession = Depends(get_db_session),
):
    """Search lessons, sections, or concepts."""
    query_lower = f"%{q.lower()}%"
    results = []

    if type is None or type == "lesson":
        lessons = (
            await session.execute(
                select(LessonModel).where(
                    or_(
                        LessonModel.title.ilike(query_lower),
                        LessonModel.subject.ilike(query_lower),
                    )
                ).limit(20)
            )
        ).scalars().all()
        for l in lessons:
            results.append({
                'type': 'lesson',
                'id': str(uuid.UUID(bytes=l.id)),
                'title': l.title,
                'snippet': l.subject,
                'lesson_id': str(uuid.UUID(bytes=l.id)),
            })

    return results
