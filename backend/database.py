"""
backend/database.py
─────────────────────────────────────────────────────────────────────────────
Async SQLAlchemy engine and session factory for the SOC Agent backend.

All database interactions throughout the project use the async session
returned by `get_async_session()`.  The engine is created once at module
level and reused across requests (connection pooling handled internally).

Usage (in a FastAPI route or agent):
    from backend.database import get_async_session

    async with get_async_session() as session:
        result = await session.execute(select(CVE).where(CVE.cve_id == "..."))
        cve = result.scalar_one_or_none()

Lifespan:
    The engine is created during `backend.main` lifespan startup and disposed
    on shutdown — do not create engines ad-hoc inside request handlers.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.config import get_settings

log = structlog.get_logger(__name__)

# ── Module-level singletons (initialised in `init_db`, used everywhere) ───────
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_db() -> None:
    """
    Create the async engine and session factory using settings from config.

    Call this ONCE during application startup (FastAPI lifespan).
    Calling it multiple times is safe — subsequent calls are no-ops.
    """
    global _engine, _session_factory

    if _engine is not None:
        # Already initialised — idempotent
        return

    settings = get_settings()

    _engine = create_async_engine(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
        pool_timeout=settings.db_pool_timeout,
        echo=settings.db_echo_sql,  # logs every SQL statement when True
        pool_pre_ping=True,         # validate connections before checkout
        future=True,                # SQLAlchemy 2.0 behaviour (always True in SA2)
    )

    _session_factory = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,     # avoid lazy-load after commit in async context
        autoflush=False,            # explicit flush control per request
    )

    log.info(
        "database.engine.created",
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
    )


async def close_db() -> None:
    """
    Dispose the engine connection pool.

    Call this during application shutdown (FastAPI lifespan teardown).
    """
    global _engine, _session_factory

    if _engine is not None:
        await _engine.dispose()
        _engine = None
        _session_factory = None
        log.info("database.engine.disposed")


@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager that yields a database session.

    Commits on clean exit, rolls back on any exception, always closes.

    Example:
        async with get_async_session() as session:
            session.add(some_model_instance)
            # commit happens automatically on context exit
    """
    if _session_factory is None:
        raise RuntimeError(
            "Database not initialised — call `init_db()` during application startup."
        )

    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
