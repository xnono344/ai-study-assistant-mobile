"""FastAPI application entry point."""

import os
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import (
    lessons_router,
    progress_router,
    auth_router,
    subscription_router,
    account_router,
    questions_router,
    notifications_router,
    search_router,
    exercises_router,
    uploads_router,
)
from app.core.config import get_settings
from app.core.database import get_database
from app.core.logging import configure_logging, get_logger

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    configure_logging(settings.DEBUG)

    logger.info("application_starting env=%s host=%s port=%s",
                settings.ENVIRONMENT, settings.APP_HOST, settings.APP_PORT)

    # Sentry init (optional)
    if settings.SENTRY_DSN and settings.ENVIRONMENT != "development":
        try:
            import sentry_sdk
            from sentry_sdk.integrations.fastapi import FastApiIntegration
            from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

            def before_send(event, _hint):
                if "request" in event and "headers" in event["request"]:
                    event["request"]["headers"] = {
                        k: v for k, v in event["request"]["headers"].items()
                        if k.lower() not in ("authorization", "cookie", "x-session-id")
                    }
                if "user" in event and "email" in event["user"]:
                    event["user"]["email"] = "[filtered]"
                return event

            sentry_sdk.init(
                dsn=settings.SENTRY_DSN,
                environment=settings.ENVIRONMENT,
                integrations=[FastApiIntegration(), SqlalchemyIntegration()],
                traces_sample_rate=0.1,
                profiles_sample_rate=0.1,
                before_send=before_send,
                release=settings.APP_VERSION,
            )
            logger.info("sentry_initialized")
        except Exception as e:
            logger.warning("sentry_init_failed error=%s", e)

    db = get_database()
    await db.create_all()

    logger.info("database_initialized")
    yield

    await db.close()
    logger.info("application_shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="AI Self-Study Assistant API",
        description="Backend API for Nexus Study mobile + web",
        version="0.1.0",
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-API-Version"],
    )

    # Exception handlers (ensure consistent error JSON envelope)
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors(), "type": "validation_error"},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "type": "http_error"},
        )

    # Security headers middleware
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
        if settings.ENVIRONMENT != "development":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "connect-src 'self' https://generativelanguage.googleapis.com https://accounts.google.com https://www.googleapis.com; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self';"
            )
        response.headers["X-API-Version"] = "0.1.0"
        return response

    # Health check
    @app.get("/api/health")
    async def health_check() -> dict:
        return {"status": "ok", "version": "0.1.0", "env": settings.ENVIRONMENT}

    # API v1 (current) — mounted under BOTH /api and /api/v1.
    #
    # The Next.js frontend (frontend/src/lib/api.ts) calls the unversioned
    # /api/* paths (e.g. /api/lessons, /api/progress, /api/progress/sessions).
    # Earlier, routers were only mounted under /api/v1/*, so every frontend
    # write 404'd. Registering each router under both prefixes keeps the v1
    # namespace (used by any manually built paths) AND makes the frontend work.
    for prefix in ("/api", "/api/v1"):
        app.include_router(auth_router, prefix=prefix)
        app.include_router(lessons_router, prefix=prefix)
        app.include_router(progress_router, prefix=prefix)
        app.include_router(subscription_router, prefix=prefix)
        app.include_router(account_router, prefix=prefix)
        app.include_router(questions_router, prefix=prefix)
        app.include_router(notifications_router, prefix=prefix)
        app.include_router(search_router, prefix=prefix)
        app.include_router(exercises_router, prefix=prefix)
        app.include_router(uploads_router, prefix=prefix)

    # Rate limiting (basic in-memory)
    from collections import defaultdict
    from datetime import datetime, timedelta, timezone

    rate_limit_store: dict[str, list[datetime]] = defaultdict(list)

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        if request.url.path.startswith("/api/") and not request.url.path.endswith("/health"):
            session_id = request.headers.get("X-Session-Id", request.client.host if request.client else "unknown")
            now = datetime.now(timezone.utc)
            window = now - timedelta(minutes=1)
            # Clean old
            rate_limit_store[session_id] = [t for t in rate_limit_store[session_id] if t > window]

            # Tier-based limits
            # For now, simple limit (TODO: per-endpoint + tier-based)
            max_per_minute = 100
            if request.url.path.endswith("/process") or "/process" in request.url.path:
                max_per_minute = 5
            elif request.url.path.startswith("/api/v1/uploads") and request.method == "POST":
                max_per_minute = 10
            elif request.url.path.startswith("/api/v1/questions"):
                max_per_minute = 30

            if len(rate_limit_store[session_id]) >= max_per_minute:
                logger.warning("rate_limit_exceeded session=%s path=%s", session_id, request.url.path)
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Please wait before trying again."},
                )
            rate_limit_store[session_id].append(now)
        return await call_next(request)

    return app


app = create_app()
