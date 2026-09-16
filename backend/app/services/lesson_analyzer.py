"""Lesson analysis pipeline.

Takes a freshly-created lesson (with only a topic / subject / level) and
generates structured, source-grounded study material by calling the
configured LLM provider. The output replaces the placeholder content
seeded by the API endpoint.

Design notes:
- We use a SINGLE LLM call per lesson, asking the model to produce the
  full lesson (intro + 3-5 sections, each with content + concepts)
  in one go. This minimizes API usage — important because the free
  Gemini tier has a 20 req/day limit. The schema is intentionally
  compact (no nested objects per concept; we use plain string lists)
  so the model returns a valid response quickly and within its
  output-token budget.
- The pipeline is synchronous: the desktop app launches the backend
  on localhost and can wait while the LLM produces content.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.providers.base import Message, ProviderError
from app.providers.service import LLMService, get_llm_service
from app.schemas import (
    ConceptModel,
    ConceptType,
    ImportanceLevel,
    LessonModel,
    SectionModel,
)

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------- output schemas


class ConceptOut(BaseModel):
    """One concept: definitions, formulas, etc. all share this shape.

    `kind` tells the persistence layer how to bucket the concept
    (definition, formula, rule, memorization, common_mistake).
    `text` is the primary content; `extra` holds structured data
    like LaTeX + description, or problem + steps.
    """

    kind: str  # "definition" | "formula" | "rule" | "memorization" | "common_mistake"
    text: str
    extra: dict[str, Any] = Field(default_factory=dict)


class SectionOut(BaseModel):
    title: str
    content: str  # markdown body
    summary: str = ""
    important_points: list[str] = Field(default_factory=list)
    concepts: list[ConceptOut] = Field(default_factory=list)


class AnalysisOut(BaseModel):
    introduction: str = ""
    sections: list[SectionOut] = Field(default_factory=list)


# ----------------------------------------------------------------- analyzer


class LessonAnalyzer:
    """Generates structured lesson content via a single LLM call."""

    def __init__(self, llm: LLMService | None = None) -> None:
        self.llm = llm or get_llm_service()

    async def process_lesson(
        self, session: AsyncSession, lesson: LessonModel
    ) -> LessonModel:
        if not lesson.title.strip():
            raise ValueError("Lesson must have a title to be analyzed")

        if not lesson.id:
            raise ValueError("Lesson must have an ID before analysis — ensure the lesson was persisted first")
        start = time.monotonic()
        lid = UUID(bytes=lesson.id)
        logger.info(
            "lesson_analysis_start lesson_id=%s topic=%s subject=%s level=%s",
            lid, lesson.title, lesson.subject, lesson.level,
        )

        analysis = await self._call_llm(lesson)
        elapsed = time.monotonic() - start
        logger.info(
            "lesson_analysis_done lesson_id=%s sections=%d elapsed=%.1fs",
            lid, len(analysis.sections), elapsed,
        )

        if analysis.introduction and analysis.introduction.strip():
            lesson.introduction = analysis.introduction.strip()
        await self._persist(session, lesson, analysis)

        # Reload with sections + concepts
        stmt = (
            select(LessonModel)
            .where(LessonModel.id == lesson.id)
            .options(
                selectinload(LessonModel.sections).selectinload(SectionModel.concepts)
            )
        )
        result = await session.execute(stmt)
        found = result.scalar_one_or_none()
        if found is None:
            raise ValueError(f"Lesson {lesson.id} not found after persistence — possible DB issue")
        return found

    # --------------------------------------------------------- LLM call

    async def _call_llm(self, lesson: LessonModel) -> AnalysisOut:
        system_prompt = (
            "You are an expert Moroccan curriculum teacher. Produce a "
            "structured, accurate study lesson. Match the source language "
            "of the topic (Arabic, French, or English). Use markdown for "
            "content (## headings, lists, **bold** for key terms). "
            "Output strict JSON only, no prose."
        )
        user_prompt = (
            f"Topic: {lesson.title}\n"
            f"Subject: {lesson.subject}\n"
            f"Level: {lesson.level}\n"
            f"Chapter: {lesson.chapter or 'N/A'}\n\n"
            "Return a JSON object with:\n"
            "- `introduction`: 2-3 sentence overview of the lesson\n"
            "- `sections`: 3-5 sections ordered from foundational to advanced\n\n"
            "Each section has:\n"
            "- `title`: short heading\n"
            "- `content`: 200-400 word explanation in markdown\n"
            "- `summary`: 1-2 sentence recap\n"
            "- `important_points`: 2-4 short must-know statements\n"
            "- `concepts`: 2-6 study items, each with `kind` (one of: "
            '"definition", "formula", "rule", "memorization", '
            '"common_mistake"), `text` (the main content), and `extra` '
            "(an object — for formulas use `{latex, description}`, "
            "for definition use `{}`)\n"
        )
        try:
            return await self.llm.complete(
                messages=[
                    Message(role="system", content=system_prompt),
                    Message(role="user", content=user_prompt),
                ],
                response_model=AnalysisOut,
                temperature=0.3,
            )
        except ProviderError:
            raise
        except Exception as exc:
            logger.error("lesson_analysis_unexpected_error error=%s", exc)
            raise ProviderError(f"Lesson analysis failed: {exc}") from exc

    # --------------------------------------------------------- persistence

    async def _persist(
        self,
        session: AsyncSession,
        lesson: LessonModel,
        analysis: AnalysisOut,
    ) -> None:
        # Clear out any prior sections (cascade deletes their concepts).
        # Use a direct query rather than lesson.sections so we don't
        # trigger a lazy load mid-LLM call (which can hit 'database
        # is locked' on SQLite).
        from sqlalchemy import delete
        await session.execute(
            delete(SectionModel).where(SectionModel.lesson_id == lesson.id)
        )
        await session.flush()

        for order, sec_out in enumerate(analysis.sections):
            if not sec_out.title.strip() and not sec_out.content.strip():
                continue
            section = SectionModel(
                lesson_id=lesson.id,
                title=sec_out.title.strip() or f"Section {order + 1}",
                order=order,
                content=sec_out.content.strip(),
                summary=sec_out.summary.strip(),
                section_metadata={"generated": True, "order": order},
            )
            session.add(section)
            await session.flush()

            for text in sec_out.important_points:
                if not text.strip():
                    continue
                session.add(
                    ConceptModel(
                        section_id=section.id,
                        concept_type=ConceptType.IMPORTANT_POINT,
                        title=text.strip()[:255],
                        content=text.strip(),
                        importance=ImportanceLevel.MUST_KNOW,
                    )
                )

            for c in sec_out.concepts:
                if not c.text.strip():
                    continue
                kind = c.kind.strip().lower()
                if kind == "definition":
                    session.add(
                        ConceptModel(
                            section_id=section.id,
                            concept_type=ConceptType.DEFINITION,
                            title=c.text.strip()[:255],
                            content=c.text.strip(),
                            importance=ImportanceLevel.MUST_KNOW,
                            concept_metadata={"term": c.text.strip()[:120]},
                        )
                    )
                elif kind == "formula":
                    latex = c.extra.get("latex", c.text).strip()
                    desc = c.extra.get("description", "").strip()
                    session.add(
                        ConceptModel(
                            section_id=section.id,
                            concept_type=ConceptType.FORMULA,
                            title=(desc or latex)[:255],
                            content=latex,
                            importance=ImportanceLevel.MUST_KNOW,
                            concept_metadata={"description": desc},
                        )
                    )
                elif kind == "rule":
                    session.add(
                        ConceptModel(
                            section_id=section.id,
                            concept_type=ConceptType.RULE,
                            title=c.text.strip()[:255],
                            content=c.text.strip(),
                            importance=ImportanceLevel.SHOULD_REMEMBER,
                        )
                    )
                elif kind == "memorization":
                    session.add(
                        ConceptModel(
                            section_id=section.id,
                            concept_type=ConceptType.MEMORIZATION,
                            title=c.text.strip()[:255],
                            content=c.text.strip(),
                            importance=ImportanceLevel.SHOULD_REMEMBER,
                        )
                    )
                elif kind == "common_mistake":
                    session.add(
                        ConceptModel(
                            section_id=section.id,
                            concept_type=ConceptType.COMMON_MISTAKE,
                            title=c.text.strip()[:255],
                            content=c.text.strip(),
                            importance=ImportanceLevel.SHOULD_REMEMBER,
                        )
                    )
                else:
                    # Unknown kind — store as important point
                    session.add(
                        ConceptModel(
                            section_id=section.id,
                            concept_type=ConceptType.IMPORTANT_POINT,
                            title=c.text.strip()[:255],
                            content=c.text.strip(),
                            importance=ImportanceLevel.SHOULD_REMEMBER,
                            concept_metadata={"kind": kind},
                        )
                    )

        await session.flush()


__all__ = ["LessonAnalyzer", "AnalysisOut"]
