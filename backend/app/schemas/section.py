from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.lesson import LessonModel

if TYPE_CHECKING:
    from app.schemas.concept import ConceptModel
    from app.schemas.exercise import ExerciseModel
    from app.schemas.progress import SectionProgressModel


class SectionBase(BaseSchema):
    lesson_id: UUID
    title: str
    order: int
    content: str | None = None
    summary: str | None = None
    metadata: dict[str, Any] = {}


class SectionCreate(SectionBase):
    pass


class SectionUpdate(BaseSchema):
    title: str | None = None
    order: int | None = None
    content: str | None = None
    summary: str | None = None
    metadata: dict[str, Any] | None = None


class SectionResponse(SectionBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class SectionAnalysisBase(BaseSchema):
    section_id: UUID
    explanation: str | None = None
    metadata: dict[str, Any] = {}


class SectionAnalysisCreate(SectionAnalysisBase):
    pass


class SectionAnalysisResponse(SectionAnalysisBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class SectionModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lesson_sections"

    lesson_id: Mapped[bytes] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    section_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    lesson: Mapped[LessonModel] = relationship(back_populates="sections")
    concepts: Mapped[list["ConceptModel"]] = relationship(
        back_populates="section",
        cascade="all, delete-orphan",
    )
    exercises: Mapped[list["ExerciseModel"]] = relationship(
        back_populates="section",
        cascade="all, delete-orphan",
    )
    progress: Mapped[list["SectionProgressModel"]] = relationship(
        back_populates="section",
        cascade="all, delete-orphan",
    )
