from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from pydantic import HttpUrl
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.schemas.base import Base, BaseSchema, TimestampMixin, UUIDMixin
from app.schemas.section import SectionModel

if TYPE_CHECKING:
    from app.schemas.source import SourceModel


class ConceptType(str, Enum):
    DEFINITION = "definition"
    FORMULA = "formula"
    RULE = "rule"
    MEMORIZATION = "memorization"
    COMMON_MISTAKE = "common_mistake"
    WORKED_EXAMPLE = "worked_example"
    IMPORTANT_POINT = "important_point"


class ImportanceLevel(str, Enum):
    MUST_KNOW = "must_know"
    SHOULD_REMEMBER = "should_remember"
    GOOD_TO_KNOW = "good_to_know"


class ConceptBase(BaseSchema):
    section_id: UUID
    concept_type: ConceptType
    title: str
    content: str
    importance: ImportanceLevel = ImportanceLevel.GOOD_TO_KNOW
    source_ref: UUID | None = None
    metadata: dict[str, Any] = {}


class ConceptCreate(ConceptBase):
    pass


class ConceptResponse(ConceptBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class DefinitionData(BaseSchema):
    term: str
    definition: str


class FormulaData(BaseSchema):
    latex: str
    description: str
    variables: dict[str, str] = {}


class RuleData(BaseSchema):
    name: str
    statement: str
    conditions: list[str] = []


class MemorizationData(BaseSchema):
    text: str
    hint: str | None = None


class WorkedExampleData(BaseSchema):
    problem: str
    solution_steps: list[str]


class ImportantPointData(BaseSchema):
    text: str
    category: str


class ConceptModel(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "concepts"

    section_id: Mapped[bytes] = mapped_column(
        ForeignKey("lesson_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    concept_type: Mapped[ConceptType] = mapped_column(
        SQLEnum(ConceptType),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    importance: Mapped[ImportanceLevel] = mapped_column(
        SQLEnum(ImportanceLevel),
        nullable=False,
        default=ImportanceLevel.GOOD_TO_KNOW,
    )
    source_ref: Mapped[bytes | None] = mapped_column(
        ForeignKey("sources.id"),
        nullable=True,
    )
    concept_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    section: Mapped[SectionModel] = relationship(back_populates="concepts")
    source: Mapped["SourceModel"] = relationship()
