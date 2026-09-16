from app.api.lessons import router as lessons_router
from app.api.progress import router as progress_router
from app.api.auth import router as auth_router
from app.api.subscription import router as subscription_router
from app.api.account import router as account_router
from app.api.questions import router as questions_router
from app.api.notifications import router as notifications_router
from app.api.search import router as search_router
from app.api.exercises import router as exercises_router
from app.api.uploads import router as uploads_router

__all__ = [
    "lessons_router",
    "progress_router",
    "auth_router",
    "subscription_router",
    "account_router",
    "questions_router",
    "notifications_router",
    "search_router",
    "exercises_router",
    "uploads_router",
]