from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.providers.base import ProviderError
from app.schemas import (
    ConceptModel,
    ConceptType,
    LessonCreate,
    LessonResponse,
    LessonUpdate,
    LessonModel,
    SectionModel,
)
from app.services import LessonAnalyzer
from fastapi import Request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

# Simple in-memory rate limiter for lesson creation
_lesson_create_times: dict[str, list[datetime]] = defaultdict(list)

def _check_rate_limit(request: Request, max_per_minute: int = 5) -> None:
    client_ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    window = now - timedelta(minutes=1)
    _lesson_create_times[client_ip] = [
        t for t in _lesson_create_times[client_ip] if t > window
    ]
    if len(_lesson_create_times[client_ip]) >= max_per_minute:
        raise HTTPException(
            status_code=429,
            detail="Too many lesson creation requests. Please wait a minute before creating another lesson."
        )
    _lesson_create_times[client_ip].append(now)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lessons", tags=["lessons"])


@router.post("", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
async def create_lesson(
    request: Request,
    payload: LessonCreate,
    process: bool = Query(
        True,
        description=(
            "If true (default), run the LLM analysis pipeline immediately "
            "and populate the lesson with structured content before returning. "
            "Pass ?process=false to create a placeholder lesson you can fill "
            "in later via POST /api/lessons/{id}/process."
        ),
    ),
    session: AsyncSession = Depends(get_db_session),
) -> LessonModel:
    """Create a new lesson and (optionally) run the analysis pipeline."""
    _check_rate_limit(request)
    lesson = LessonModel(
        title=payload.title,
        subject=payload.subject,
        level=payload.level,
        chapter=payload.chapter,
        source_url=str(payload.source_url) if payload.source_url else None,
        introduction=payload.introduction or _make_intro(payload),
        lesson_metadata=payload.lesson_metadata or {},
    )
    session.add(lesson)
    await session.flush()

    if process:
        try:
            analyzer = LessonAnalyzer()
            lesson = await analyzer.process_lesson(session, lesson)
        except ProviderError as exc:
            # If the LLM fails, keep the placeholder section so the
            # lesson is still usable — the user can retry processing.
            logger.warning(
                "lesson_create_processing_failed lesson_id=%s error=%s",
                UUID(bytes=lesson.id), str(exc),
            )
            section = SectionModel(
                lesson_id=lesson.id,
                title=_section_title_for(payload),
                order=0,
                content=_section_content_for(payload),
                summary=_section_summary_for(payload),
                section_metadata={"seeded": True, "process_error": str(exc)},
            )
            session.add(section)
            await session.flush()
        except Exception as exc:  # noqa: BLE001
            logger.exception("lesson_create_unexpected_error lesson_id=%s", UUID(bytes=lesson.id))
            section = SectionModel(
                lesson_id=lesson.id,
                title=_section_title_for(payload),
                order=0,
                content=_section_content_for(payload),
                summary=_section_summary_for(payload),
                section_metadata={"seeded": True, "process_error": str(exc)},
            )
            session.add(section)
            await session.flush()
    else:
        section = SectionModel(
            lesson_id=lesson.id,
            title=_section_title_for(payload),
            order=0,
            content=_section_content_for(payload),
            summary=_section_summary_for(payload),
            section_metadata={"seeded": True},
        )
        session.add(section)
        await session.flush()

    await session.refresh(lesson)
    return lesson


@router.post("/{lesson_id}/process")
async def process_lesson(
    lesson_id: UUID,
    x_session_id: str | None = Header(None, alias="X-Session-Id"),
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Run the LLM analysis pipeline on an existing lesson.

    Replaces any existing sections and concepts with freshly-generated
    material. Returns a summary of what was created.

    Uses the user's Google OAuth token if connected, otherwise falls
    back to the server's GOOGLE_API_KEY (demo mode, rate-limited).
    """
    stmt = select(LessonModel).where(LessonModel.id == lesson_id.bytes)
    lesson = (await session.execute(stmt)).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    # Check user has Google connected (for mobile, premium feature)
    if x_session_id:
        try:
            sid_bytes = UUID(x_session_id).bytes if len(x_session_id) == 36 else x_session_id.encode()
        except (ValueError, AttributeError):
            sid_bytes = None
        if sid_bytes:
            from app.schemas.user import UserModel
            user = (await session.execute(
                select(UserModel).where(UserModel.session_id == sid_bytes)
            )).scalar_one_or_none()
            if user is not None and user.google_user_id is None:
                # Anonymous user trying to process without Google
                raise HTTPException(
                    status_code=402,
                    detail="Connect Google to use AI features. You will use your own Gemini API quota."
                )

    # Use user's token if available, otherwise fallback
    from app.services.user_llm import get_user_or_default_provider
    try:
        provider = await get_user_or_default_provider(session, x_session_id)
    except ProviderError as exc:
        raise HTTPException(status_code=402, detail=str(exc))

    # Wrap the provider in a single-provider LLMService for the analyzer
    from app.providers.service import LLMService
    from app.providers.registry import ProviderRegistry
    registry = ProviderRegistry()
    registry._instances['gemini'] = provider
    custom_service = LLMService(registry=registry)

    try:
        analyzer = LessonAnalyzer(llm=custom_service)
        await analyzer.process_lesson(session, lesson)
    except ProviderError as exc:
        logger.error("lesson_process_failed lesson_id=%s error=%s", lesson_id, str(exc))
        raise HTTPException(
            status_code=502,
            detail=f"Lesson processing failed: {exc}",
        )

    # Count what was created.
    sections_list = (await session.execute(
        select(SectionModel).where(SectionModel.lesson_id == lesson_id.bytes)
    )).scalars().all()
    concepts_count = (await session.execute(
        select(ConceptModel).where(
            ConceptModel.section_id.in_([s.id for s in sections_list])
        ) if sections_list else select(ConceptModel).where(False)
    )).scalars().all()

    return {
        "lesson_id": str(lesson_id),
        "status": "completed",
        "sections": len(sections_list),
        "concepts": len(concepts_count),
    }


@router.get("", response_model=list[LessonResponse])
async def list_lessons(
    session: AsyncSession = Depends(get_db_session),
    subject: str | None = None,
    level: str | None = None,
) -> list[LessonModel]:
    stmt = select(LessonModel).order_by(LessonModel.created_at.desc())
    if subject:
        stmt = stmt.where(LessonModel.subject == subject)
    if level:
        stmt = stmt.where(LessonModel.level == level)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{lesson_id}", response_model=LessonResponse)
async def get_lesson(
    lesson_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> LessonModel:
    stmt = select(LessonModel).where(LessonModel.id == lesson_id.bytes)
    result = await session.execute(stmt)
    lesson = result.scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.get("/{lesson_id}/sections")
async def list_lesson_sections(
    lesson_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> list[dict[str, Any]]:
    """Return the sections of a lesson, shaped for the frontend workspace.

    The response shape mirrors what `LessonWorkspace` expects so the existing
    client components (`SectionContent`, `ImportantPoints`, etc.) can render
    without changes. The data is intentionally minimal — real content will be
    filled in once the LLM pipeline is wired in.
    """
    # ensure the lesson exists
    lesson_stmt = select(LessonModel).where(LessonModel.id == lesson_id.bytes)
    lesson = (await session.execute(lesson_stmt)).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    sections_stmt = (
        select(SectionModel)
        .where(SectionModel.lesson_id == lesson_id.bytes)
        .order_by(SectionModel.order.asc())
    )
    sections = list((await session.execute(sections_stmt)).scalars().all())

    return [
        {
            "id": str(UUID(bytes=s.id)),
            "title": s.title,
            "content": s.content or "",
            "summary": s.summary or "",
            "keyPoints": _derive_key_points(s),
        }
        for s in sections
    ]


@router.get("/{lesson_id}/workspace")
async def get_lesson_workspace(
    lesson_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """Return the full lesson workspace payload for the frontend.

    Combines the lesson metadata with its sections and a minimal
    `LessonData`-shaped structure that `LessonWorkspace.tsx` understands.
    If the lesson has been processed by the LLM pipeline, the section
    concepts (definitions, formulas, rules, etc.) are loaded from the
    database. Otherwise a single seeded placeholder section is returned.
    """
    stmt = (
        select(LessonModel)
        .where(LessonModel.id == lesson_id.bytes)
        .options(
            selectinload(LessonModel.sections).selectinload(SectionModel.concepts)
        )
    )
    lesson = (await session.execute(stmt)).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    is_generated = any(
        s.section_metadata.get("generated") for s in lesson.sections
    )

    sections = []
    for s in sorted(lesson.sections, key=lambda x: x.order):
        summary_text = s.summary or ""
        # Bucket concepts by type for the frontend
        important_points = []
        definitions = []
        formulas = []
        rules = []
        memorization = []
        common_mistakes = []
        worked_examples = []
        for c in s.concepts:
            meta = c.concept_metadata or {}
            if c.concept_type == ConceptType.IMPORTANT_POINT:
                important_points.append(
                    {
                        "id": str(UUID(bytes=c.id)),
                        "text": c.content,
                        "importance": c.importance.value
                        if hasattr(c.importance, "value")
                        else str(c.importance),
                        "category": meta.get("category", "method"),
                    }
                )
            elif c.concept_type == ConceptType.DEFINITION:
                definitions.append(
                    {
                        "id": str(UUID(bytes=c.id)),
                        "term": meta.get("term", c.title),
                        "definition": c.content,
                    }
                )
            elif c.concept_type == ConceptType.FORMULA:
                formulas.append(
                    {
                        "id": str(UUID(bytes=c.id)),
                        "latex": c.content,
                        "description": meta.get("description", c.title),
                        "variables": meta.get("variables", {}),
                    }
                )
            elif c.concept_type == ConceptType.RULE:
                rules.append(
                    {
                        "id": str(UUID(bytes=c.id)),
                        "name": meta.get("name", c.title),
                        "statement": c.content,
                        "conditions": meta.get("conditions", []),
                    }
                )
            elif c.concept_type == ConceptType.MEMORIZATION:
                memorization.append(
                    {
                        "id": str(UUID(bytes=c.id)),
                        "text": c.content,
                        "hint": meta.get("hint"),
                    }
                )
            elif c.concept_type == ConceptType.COMMON_MISTAKE:
                common_mistakes.append(c.content)
            elif c.concept_type == ConceptType.WORKED_EXAMPLE:
                worked_examples.append(
                    {
                        "id": str(UUID(bytes=c.id)),
                        "problem": meta.get("problem", c.title),
                        "solutionSteps": meta.get("solution_steps", []),
                    }
                )

        sections.append(
            {
                "id": str(UUID(bytes=s.id)),
                "title": s.title,
                "content": s.content or "",
                "summary": {
                    "quickReview": summary_text,
                    "standard": summary_text,
                    "revisionSheet": {
                        "formulas": [f["latex"] for f in formulas],
                        "definitions": [
                            f"{d['term']} — {d['definition']}" for d in definitions
                        ],
                        "rules": [r["statement"] for r in rules],
                        "keyIdeas": [ip["text"] for ip in important_points[:6]],
                        "reminders": list(common_mistakes),
                    },
                },
                "keyPoints": [ip["text"] for ip in important_points],
                "progress": 0,
                "importantPoints": important_points,
                "formulas": formulas,
                "definitions": definitions,
                "rules": rules,
                "memorizationItems": memorization,
                "commonMistakes": common_mistakes,
                "workedExamples": worked_examples,
                "exercises": [],
                "checklist": _build_checklist_from_concepts(lesson, s)
                if is_generated
                else _seed_checklist(lesson),
            }
        )

    return {
        "id": str(UUID(bytes=lesson.id)),
        "title": lesson.title,
        "subject": lesson.subject,
        "level": lesson.level,
        "chapter": lesson.chapter,
        "introduction": lesson.introduction or "",
        "progress": 0,
        "sources": [],
        "sections": sections,
        "generated": is_generated,
    }


@router.patch("/{lesson_id}", response_model=LessonResponse)
async def update_lesson(
    lesson_id: UUID,
    payload: LessonUpdate,
    session: AsyncSession = Depends(get_db_session),
) -> LessonModel:
    stmt = select(LessonModel).where(LessonModel.id == lesson_id.bytes)
    lesson = (await session.execute(stmt)).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "source_url" and value is not None:
            value = str(value)
        setattr(lesson, field, value)
    await session.flush()
    await session.refresh(lesson)
    return lesson


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(
    lesson_id: UUID,
    session: AsyncSession = Depends(get_db_session),
) -> None:
    stmt = select(LessonModel).where(LessonModel.id == lesson_id.bytes)
    lesson = (await session.execute(stmt)).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    await session.delete(lesson)


# ----------------------------------------------------------------- helpers


def _make_intro(payload: LessonCreate) -> str:
    return (
        f"مرحبًا بك في درس {payload.subject} حول «{payload.title}» "
        f"({payload.level}). "
        "هذه بداية الدرس. يمكنك إضافة ملاحظاتك، ووضع إشارة على الأقسام التي "
        "أتممتها، وطرح أسئلة في أي وقت لتعميق فهمك."
    )


def _section_title_for(payload: LessonCreate) -> str:
    return f"مقدّمة في {payload.title}"


def _section_content_for(payload: LessonCreate) -> str:
    return (
        f"# {payload.title}\n\n"
        f"المادة: {payload.subject}\n"
        f"المستوى: {payload.level}\n"
        f"{'الفصل: ' + payload.chapter if payload.chapter else ''}\n\n"
        "- حدّد الأهداف الرئيسية للدرس قبل البدء في القراءة.\n"
        "- اقرأ الدرس بقصد الفهم لا الحفظ، ثم أضف ملخصًا خاصًا بك.\n"
        "- استخدم التبويبات أعلاه (نظرة عامة / قائمة المراجعة / التمارين / المصادر) "
        "للانتقال بين جوانب الدرس المختلفة."
    )


def _section_summary_for(payload: LessonCreate) -> str:
    return (
        f"ملخّص سريع: «{payload.title}» في مادة {payload.subject} "
        f"({payload.level}). ركّز على الأفكار الأساسية أولاً، ثم ارجع لاحقًا "
        "لتعميق التفاصيل وحلّ التمارين."
    )


def _derive_key_points(section: SectionModel) -> list[str]:
    # Naive: split the content into lines that look like bullet points.
    pts: list[str] = []
    if section.content:
        for line in section.content.splitlines():
            stripped = line.strip()
            if stripped.startswith(("-", "*", "•")) and len(stripped) > 1:
                pts.append(stripped.lstrip("-*• ").strip())
    if not pts and section.summary:
        pts.append(section.summary)
    return pts[:6]


def _build_checklist_from_concepts(lesson: LessonModel, section: SectionModel) -> list[dict[str, Any]]:
    """Build a study checklist from the section's concepts."""
    items: list[dict[str, Any]] = []
    priority = 1
    for c in section.concepts:
        if c.concept_type in (ConceptType.DEFINITION, ConceptType.IMPORTANT_POINT):
            kind = "understand"
        elif c.concept_type == ConceptType.MEMORIZATION:
            kind = "memorize"
        elif c.concept_type == ConceptType.WORKED_EXAMPLE:
            kind = "practice"
        elif c.concept_type == ConceptType.FORMULA:
            kind = "memorize"
        elif c.concept_type == ConceptType.RULE:
            kind = "memorize"
        else:
            kind = "review"
        items.append(
            {
                "id": str(UUID(bytes=c.id)),
                "text": c.content[:160],
                "type": kind,
                "sectionId": str(UUID(bytes=section.id)),
                "priority": priority,
                "completed": False,
            }
        )
        priority += 1
        if priority > 8:
            break
    if not items:
        return _seed_checklist(lesson)
    return items


def _seed_important_points(lesson: LessonModel) -> list[dict[str, Any]]:
    return [
        {
            "id": str(UUID(bytes=lesson.id)),
            "text": f"هذا الدرس يتناول «{lesson.title}» في مادة {lesson.subject}.",
            "importance": "must_know",
            "category": "method",
        }
    ]


def _seed_definitions(lesson: LessonModel) -> list[dict[str, Any]]:
    return [
        {
            "id": str(UUID(bytes=lesson.id)),
            "term": lesson.title,
            "definition": f"مفهوم أساسي في مادة {lesson.subject} لمستوى {lesson.level}.",
        }
    ]


def _seed_checklist(lesson: LessonModel) -> list[dict[str, Any]]:
    return [
        {
            "id": f"{UUID(bytes=lesson.id)}-understand",
            "text": f"فهم الفكرة المحورية لـ {lesson.title}",
            "type": "understand",
            "sectionId": "default",
            "priority": 1,
            "completed": False,
        },
        {
            "id": f"{UUID(bytes=lesson.id)}-practice",
            "text": f"حلّ تمارين تطبيقية حول {lesson.title}",
            "type": "practice",
            "sectionId": "default",
            "priority": 2,
            "completed": False,
        },
    ]
