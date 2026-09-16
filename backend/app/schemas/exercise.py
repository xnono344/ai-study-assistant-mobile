from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import HttpUrl
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.section import SectionModel


class ExerciseDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class ExerciseBase(BaseSchema):
    section_id: UUID
    title: str
    content: str
    source_name: str
    source_url: HttpUrl
    difficulty: ExerciseDifficulty = ExerciseDifficulty.MEDIUM
    has_solution: bool = False
    is_ai_generated: bool = False
    metadata: dict[str, Any] = {}


class ExerciseCreate(ExerciseBase):
    pass


class ExerciseResponse(ExerciseBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class ExerciseAttemptBase(BaseSchema):
    exercise_id: UUID
    answer: str
    is_correct: bool | None = None
    time_spent_seconds: int = 0


class ExerciseAttemptCreate(ExerciseAttemptBase):
    pass


class ExerciseAttemptResponse(ExerciseAttemptBase):
    id: UUID
    attempted_at: datetime


class ExerciseModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "exercises"

    section_id: Mapped[bytes] = mapped_column(
        ForeignKey("lesson_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[ExerciseDifficulty] = mapped_column(
        SQLEnum(ExerciseDifficulty),
        nullable=False,
        default=ExerciseDifficulty.MEDIUM,
    )
    has_solution: Mapped[bool] = mapped_column(default=False)
    is_ai_generated: Mapped[bool] = mapped_column(default=False)
    exercise_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    section: Mapped[SectionModel] = relationship(back_populates="exercises")
    attempts: Mapped[list["ExerciseAttemptModel"]] = relationship(
        back_populates="exercise",
        cascade="all, delete-orphan",
    )


class ExerciseAttemptModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "exercise_attempts"

    exercise_id: Mapped[bytes] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)
    time_spent_seconds: Mapped[int] = mapped_column(default=0)
    attempted_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    exercise: Mapped[ExerciseModel] = relationship(back_populates="attempts")