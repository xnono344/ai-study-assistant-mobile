import pytest
from uuid import UUID
from app.schemas import (
    SourceModel,
    SourceType,
    LessonModel,
    SectionModel,
    ConceptModel,
    ConceptType,
    ImportanceLevel,
    ExerciseModel,
    ExerciseDifficulty,
)
from app.core.database import Base, get_database
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


@pytest.mark.asyncio
async def test_database_connection():
    db = get_database()
    async with db.session() as session:
        result = await session.execute(select(1))
        assert result.scalar() == 1


@pytest.mark.asyncio
async def test_source_model():
    db = get_database()
    async with db.session() as session:
        source = SourceModel(
            name="Test Source",
            url="https://example.com",
            source_type=SourceType.OFFICIAL,
            title="Test Title",
        )
        session.add(source)
        await session.commit()
        await session.refresh(source)

        assert source.id is not None
        assert source.name == "Test Source"
        assert source.source_type == SourceType.OFFICIAL

        # Clean up
        await session.delete(source)
        await session.commit()


@pytest.mark.asyncio
async def test_lesson_model():
    db = get_database()
    async with db.session() as session:
        source = SourceModel(
            name="Test Source",
            url="https://example.com",
            source_type=SourceType.OFFICIAL,
        )
        session.add(source)
        await session.commit()
        await session.refresh(source)

        lesson = LessonModel(
            title="Test Lesson",
            subject="Physics",
            level="1st Year Bac",
            chapter="Mechanics",
            source_id=source.id,
            introduction="Test introduction",
        )
        session.add(lesson)
        await session.commit()
        await session.refresh(lesson)

        assert lesson.id is not None
        assert lesson.title == "Test Lesson"
        assert lesson.subject == "Physics"

        # Clean up
        await session.delete(lesson)
        await session.delete(source)
        await session.commit()


@pytest.mark.asyncio
async def test_section_model():
    db = get_database()
    async with db.session() as session:
        source = SourceModel(
            name="Test Source",
            url="https://example.com",
            source_type=SourceType.OFFICIAL,
        )
        session.add(source)
        await session.commit()
        await session.refresh(source)

        lesson = LessonModel(
            title="Test Lesson",
            subject="Physics",
            level="1st Year Bac",
            source_id=source.id,
        )
        session.add(lesson)
        await session.commit()
        await session.refresh(lesson)

        section = SectionModel(
            lesson_id=lesson.id,
            title="Test Section",
            order=1,
            content="Test content",
        )
        session.add(section)
        await session.commit()
        await session.refresh(section)

        assert section.id is not None
        assert section.title == "Test Section"
        assert section.order == 1

        # Clean up
        await session.delete(section)
        await session.delete(lesson)
        await session.delete(source)
        await session.commit()


@pytest.mark.asyncio
async def test_concept_model():
    db = get_database()
    async with db.session() as session:
        source = SourceModel(
            name="Test Source",
            url="https://example.com",
            source_type=SourceType.OFFICIAL,
        )
        session.add(source)
        await session.commit()
        await session.refresh(source)

        lesson = LessonModel(
            title="Test Lesson",
            subject="Physics",
            level="1st Year Bac",
            source_id=source.id,
        )
        session.add(lesson)
        await session.commit()
        await session.refresh(lesson)

        section = SectionModel(
            lesson_id=lesson.id,
            title="Test Section",
            order=1,
        )
        session.add(section)
        await session.commit()
        await session.refresh(section)

        concept = ConceptModel(
            section_id=section.id,
            concept_type=ConceptType.DEFINITION,
            title="Test Concept",
            content="Test content",
            importance=ImportanceLevel.MUST_KNOW,
        )
        session.add(concept)
        await session.commit()
        await session.refresh(concept)

        assert concept.id is not None
        assert concept.concept_type == ConceptType.DEFINITION
        assert concept.importance == ImportanceLevel.MUST_KNOW

        # Clean up
        await session.delete(concept)
        await session.delete(section)
        await session.delete(lesson)
        await session.delete(source)
        await session.commit()


@pytest.mark.asyncio
async def test_exercise_model():
    db = get_database()
    async with db.session() as session:
        source = SourceModel(
            name="Test Source",
            url="https://example.com",
            source_type=SourceType.OFFICIAL,
        )
        session.add(source)
        await session.commit()
        await session.refresh(source)

        lesson = LessonModel(
            title="Test Lesson",
            subject="Physics",
            level="1st Year Bac",
            source_id=source.id,
        )
        session.add(lesson)
        await session.commit()
        await session.refresh(lesson)

        section = SectionModel(
            lesson_id=lesson.id,
            title="Test Section",
            order=1,
        )
        session.add(section)
        await session.commit()
        await session.refresh(section)

        exercise = ExerciseModel(
            section_id=section.id,
            title="Test Exercise",
            content="Test content",
            source_name="Test Source",
            source_url="https://example.com/exercise",
            difficulty=ExerciseDifficulty.EASY,
        )
        session.add(exercise)
        await session.commit()
        await session.refresh(exercise)

        assert exercise.id is not None
        assert exercise.difficulty == ExerciseDifficulty.EASY

        # Clean up
        await session.delete(exercise)
        await session.delete(section)
        await session.delete(lesson)
        await session.delete(source)
        await session.commit()