"""
migrations/env.py
─────────────────────────────────────────────────────────────────────────────
Alembic environment script — runs every time `alembic` is invoked.

This project uses SQLAlchemy 2.0 async mode (asyncpg driver).  Alembic's
default template is synchronous, so we use `run_async_migrations()` wrapped
in `asyncio.run()` to drive migrations over an async engine.

Autogenerate support:
    All models must be imported (directly or via their package __init__) so
    that `Base.metadata` contains their table definitions.  We import from
    `backend.models` which in turn imports all model classes.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# ── Import models so Alembic can autogenerate from them ───────────────────────
# This import registers all table definitions with Base.metadata.
import backend.models  # noqa: F401 — side-effect import
from backend.models.base import Base
from backend.config import get_settings

# ── Alembic Config object (gives access to alembic.ini values) ───────────────
config = context.config

# ── Wire Python logging to alembic.ini's [loggers] section ───────────────────
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Target metadata for autogenerate ─────────────────────────────────────────
target_metadata = Base.metadata


def get_url() -> str:
    """
    Read the database URL from the application settings (which reads .env).

    This overrides the placeholder `sqlalchemy.url` in alembic.ini so the
    real credentials come from the environment, never from the ini file.
    """
    return get_settings().database_url


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode (generates SQL without a live connection).

    Useful for generating a migration SQL script to review before applying.
    Run with: alembic upgrade head --sql
    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,          # detect column type changes
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode (applies changes to a live database).

    Uses an async engine (asyncpg) matching the application's engine.
    """
    connectable = create_async_engine(get_url(), future=True)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def do_run_migrations(connection):
    """
    Synchronous callback invoked by `run_sync` inside the async connection.

    SQLAlchemy's `run_sync` bridges async and sync — Alembic's context.run_migrations()
    is synchronous internally, so it must be called this way.
    """
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


# ── Entrypoint ────────────────────────────────────────────────────────────────
if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
