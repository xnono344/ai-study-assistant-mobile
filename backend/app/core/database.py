from contextlib import asynccontextmanager
import logging
from typing import Any, AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

# Silence SQLAlchemy's verbose default logging before any engine is
# constructed. Without this, every PRAGMA / SELECT / commit logs at
# INFO and drowns out our actual app messages. This has to happen
# here, at import time, because `create_engine` (called by Database.__init__)
# creates the `sqlalchemy.engine` logger and attaches a handler
# before `configure_logging` runs in the FastAPI lifespan.
for _noisy in (
    "sqlalchemy",
    "sqlalchemy.engine",
    "sqlalchemy.engine.Engine",
    "sqlalchemy.pool",
    "sqlalchemy.dialects",
    "sqlalchemy.orm",
    "aiosqlite",  # logs every PRAGMA / SELECT via aiosqlite instrumentation
):
    logging.getLogger(_noisy).setLevel(logging.ERROR)
    logging.getLogger(_noisy).propagate = False


class Base(DeclarativeBase):
    pass


class Database:
    def __init__(self, database_url: str) -> None:
        # Use a 30s connect_args timeout so SQLite operations don't hang
        # indefinitely under contention. The WAL + busy_timeout PRAGMAs
        # are set on each new connection via the `_set_sqlite_pragma`
        # event listener below — this lets multiple readers and a single
        # writer coexist without `database is locked` errors.
        connect_args: dict[str, Any] = {"timeout": 30}
        if database_url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        self.engine: AsyncEngine = create_async_engine(
            database_url,
            echo=False,
            future=True,
            connect_args=connect_args,
        )
        self.session_factory = async_sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )

        # Enable WAL mode + busy_timeout for SQLite connections.
        if database_url.startswith("sqlite"):
            from sqlalchemy import event
            from sqlalchemy.engine import Engine

            @event.listens_for(Engine, "connect")
            def _set_sqlite_pragma(dbapi_connection: Any, _record: Any) -> None:
                cursor = dbapi_connection.cursor()
                try:
                    cursor.execute("PRAGMA journal_mode=WAL")
                    cursor.execute("PRAGMA busy_timeout=30000")
                    cursor.execute("PRAGMA synchronous=NORMAL")
                finally:
                    cursor.close()

    async def create_all(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_all(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        async with self.session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    async def close(self) -> None:
        await self.engine.dispose()


_db: Database | None = None


def get_database() -> Database:
    global _db
    if _db is None:
        _db = Database(get_settings().DATABASE_URL)
    return _db


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    db = get_database()
    async with db.session() as session:
        yield session
