from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import HttpUrl
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin


class SourceType(str, Enum):
    OFFICIAL = "official"
    ALLOSCHOOL = "alloschool"
    OTHER = "other"
    UPLOAD = "upload"


class SourceBase(BaseSchema):
    name: str
    url: HttpUrl | None = None
    source_type: SourceType
    title: str | None = None
    metadata: dict[str, Any] = {}


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseSchema):
    name: str | None = None
    url: HttpUrl | None = None
    source_type: SourceType | None = None
    title: str | None = None
    metadata: dict[str, Any] | None = None


class SourceResponse(SourceBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class SourceModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sources"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[SourceType] = mapped_column(
        SQLEnum(SourceType),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)