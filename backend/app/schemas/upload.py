from datetime import datetime
from enum import Enum
from uuid import UUID

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.lesson import LessonModel


class UploadType(str, Enum):
    PDF = "pdf"
    IMAGE = "image"
    TEXT = "text"


class UploadBase(BaseSchema):
    filename: str
    content_type: str
    file_size: int
    content_hash: str
    upload_type: UploadType
    extracted_text: str | None = None
    source_context: str | None = None
    lesson_id: UUID | None = None


class UploadCreate(UploadBase):
    pass


class UploadResponse(UploadBase):
    id: UUID
    created_at: datetime


class UploadModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "uploads"

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    upload_type: Mapped[UploadType] = mapped_column(
        SQLEnum(UploadType),
        nullable=False,
    )
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    lesson_id: Mapped[bytes | None] = mapped_column(
        ForeignKey("lessons.id"),
        nullable=True,
    )

    lesson: Mapped[LessonModel | None] = relationship()