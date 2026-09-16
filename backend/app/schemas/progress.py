from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.section import SectionModel
from app.schemas.lesson import LessonModel

if TYPE_CHECKING:
    from app.schemas.concept import ConceptModel


class ConfidenceLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class SectionProgressBase(BaseSchema):
    lesson_id: UUID
    section_id: UUID
    completed: bool = False
    checklist_items_done: list[str] = []
    time_spent_minutes: int = 0
    confidence: ConfidenceLevel = ConfidenceLevel.LOW


class SectionProgressCreate(SectionProgressBase):
    pass


class SectionProgressUpdate(BaseSchema):
    completed: bool | None = None
    checklist_items_done: list[str] | None = None
    time_spent_minutes: int | None = None
    confidence: ConfidenceLevel | None = None


class SectionProgressResponse(SectionProgressBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class WeakAreaBase(BaseSchema):
    lesson_id: UUID
    section_id: UUID
    concept_id: UUID
    failure_count: int = 1
    last_failed: datetime


class WeakAreaCreate(WeakAreaBase):
    pass


class WeakAreaResponse(WeakAreaBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class StudySessionBase(BaseSchema):
    lesson_id: UUID
    duration_minutes: int = 0
    sections_studied: list[UUID] = []
    exercises_attempted: int = 0
    exercises_correct: int = 0


class StudySessionCreate(StudySessionBase):
    pass


class StudySessionResponse(StudySessionBase):
    id: UUID
    created_at: datetime


class SectionProgressModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "section_progress"

    lesson_id: Mapped[bytes] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_id: Mapped[bytes] = mapped_column(
        ForeignKey("lesson_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    completed: Mapped[bool] = mapped_column(default=False)
    checklist_items_done: Mapped[list[str]] = mapped_column(JSON, default=list)
    time_spent_minutes: Mapped[int] = mapped_column(default=0)
    confidence: Mapped[ConfidenceLevel] = mapped_column(
        SQLEnum(ConfidenceLevel),
        default=ConfidenceLevel.LOW,
    )

    lesson: Mapped[LessonModel] = relationship()
    section: Mapped[SectionModel] = relationship(back_populates="progress")


class WeakAreaModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "weak_areas"

    lesson_id: Mapped[bytes] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_id: Mapped[bytes] = mapped_column(
        ForeignKey("lesson_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    concept_id: Mapped[bytes] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    failure_count: Mapped[int] = mapped_column(default=1)
    last_failed: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    lesson: Mapped[LessonModel] = relationship()
    section: Mapped[SectionModel] = relationship()
    concept: Mapped["ConceptModel"] = relationship()


class StudySessionModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "study_sessions"

    lesson_id: Mapped[bytes] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    duration_minutes: Mapped[int] = mapped_column(default=0)
    sections_studied: Mapped[list[str]] = mapped_column(JSON, default=list)
    exercises_attempted: Mapped[int] = mapped_column(default=0)
    exercises_correct: Mapped[int] = mapped_column(default=0)
