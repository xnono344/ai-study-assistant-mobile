from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from pydantic import Field, HttpUrl
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.schemas.section import SectionModel, SectionResponse
    from app.schemas.source import SourceModel


class LessonBase(BaseSchema):
    title: str
    subject: str
    level: str
    chapter: str | None = None
    source_id: UUID | None = None
    source_url: HttpUrl | None = None
    introduction: str | None = None
    # `metadata` collides with SQLAlchemy's `Base.metadata` class attribute,
    # which would make pydantic's `from_attributes=True` try to serialize
    # the SQLAlchemy MetaData object. The DB column is therefore named
    # `lesson_metadata`; we expose it under the JSON key `metadata` via
    # pydantic's `serialization_alias`, and read it back from the model
    # attribute `lesson_metadata` via `validation_alias`.
    lesson_metadata: dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="lesson_metadata",
        serialization_alias="metadata",
    )


class LessonCreate(LessonBase):
    pass


class LessonUpdate(BaseSchema):
    title: str | None = None
    subject: str | None = None
    level: str | None = None
    chapter: str | None = None
    source_id: UUID | None = None
    source_url: HttpUrl | None = None
    introduction: str | None = None
    lesson_metadata: dict[str, Any] | None = Field(
        default=None,
        validation_alias="lesson_metadata",
        serialization_alias="metadata",
    )


class LessonResponse(LessonBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class LessonWithSections(LessonResponse):
    sections: list["SectionResponse"] = []


class LessonModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "lessons"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    chapter: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    source_id: Mapped[bytes | None] = mapped_column(
        ForeignKey("sources.id"),
        nullable=True,
    )
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    introduction: Mapped[str | None] = mapped_column(Text, nullable=True)
    lesson_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    sections: Mapped[list["SectionModel"]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
    )
    source: Mapped["SourceModel"] = relationship()
