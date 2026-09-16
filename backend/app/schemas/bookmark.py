from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.lesson import LessonModel
from app.schemas.section import SectionModel

if TYPE_CHECKING:
    from app.schemas.concept import ConceptModel
    from app.schemas.exercise import ExerciseModel


class BookmarkType(str, Enum):
    SECTION = "section"
    CONCEPT = "concept"
    EXERCISE = "exercise"


class BookmarkBase(BaseSchema):
    lesson_id: UUID
    section_id: UUID | None = None
    concept_id: UUID | None = None
    exercise_id: UUID | None = None
    bookmark_type: BookmarkType
    label: str | None = None


class BookmarkCreate(BookmarkBase):
    pass


class BookmarkResponse(BookmarkBase):
    id: UUID
    created_at: datetime


class BookmarkModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "bookmarks"

    lesson_id: Mapped[bytes] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_id: Mapped[bytes | None] = mapped_column(
        ForeignKey("lesson_sections.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    concept_id: Mapped[bytes | None] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    exercise_id: Mapped[bytes | None] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    bookmark_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    lesson: Mapped[LessonModel] = relationship()
    section: Mapped[SectionModel | None] = relationship()
    concept: Mapped["ConceptModel | None"] = relationship()
    exercise: Mapped["ExerciseModel | None"] = relationship()
