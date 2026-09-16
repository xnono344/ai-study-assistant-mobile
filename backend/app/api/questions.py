"""Q&A endpoints - ask questions about lessons using user's Gemini API."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session

router = APIRouter(prefix="/questions", tags=["questions"])


class QuestionRequest(BaseModel):
    lesson_id: str
    question: str


@router.post("")
async def ask_question(
    payload: QuestionRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """MVP placeholder for Q&A. Real implementation would use the user's
    Gemini OAuth token to answer questions about a lesson's content.
    """
    # For MVP, return a placeholder response
    return {
        "answer": (
            f"Thank you for your question about '{payload.question}'. "
            "The full Q&A feature with your personal Gemini API is coming soon."
        ),
        "source_refs": [],
    }
