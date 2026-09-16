from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.lesson import LessonModel


class QuestionBase(BaseSchema):
    lesson_id: UUID
    question: str
    answer: str | None = None
    source_refs: list[UUID] = []


class QuestionCreate(QuestionBase):
    pass


class QuestionResponse(QuestionBase):
    id: UUID
    created_at: datetime


class QuestionModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "questions"

    lesson_id: Mapped[bytes] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_refs: Mapped[list[str]] = mapped_column(JSON, default=list)

    lesson: Mapped[LessonModel] = relationship()