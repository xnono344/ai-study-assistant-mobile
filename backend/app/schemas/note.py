from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.lesson import LessonModel
from app.schemas.section import SectionModel


class NoteBase(BaseSchema):
    lesson_id: UUID
    section_id: UUID | None = None
    content: str
    title: str | None = None


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseSchema):
    content: str | None = None
    title: str | None = None


class NoteResponse(NoteBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class NoteModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "notes"

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
    content: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    lesson: Mapped[LessonModel] = relationship()
    section: Mapped[SectionModel | None] = relationship()