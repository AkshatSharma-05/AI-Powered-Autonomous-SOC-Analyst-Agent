"""
backend/main.py
─────────────────────────────────────────────────────────────────────────────
FastAPI application factory for the SOC Agent backend.

Entry point for uvicorn:
    uvicorn backend.main:app --reload          (local dev)
    uvicorn backend.main:app --host 0.0.0.0   (Docker container)

V0 endpoints:
    GET  /health  → {"status": "ok"}  (spec R2)

Future endpoints (added in V1.0+):
    GET  /cves           — paginated CVE feed
    GET  /assets         — inventory list
    POST /pipeline/run   — manual trigger
    WS   /ws/live        — real-time dashboard updates
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.database import close_db, init_db


# ── Structured logging setup ──────────────────────────────────────────────────
# Configure structlog to output JSON in production, colourised in development.
# Called once at module import so all loggers (incl. uvicorn) share the config.

def _configure_logging() -> None:
    settings = get_settings()

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]

    if settings.environment == "development":
        # Human-readable output during local development
        renderer = structlog.dev.ConsoleRenderer()
    else:
        # Machine-parseable JSON for log aggregators (Datadog, CloudWatch, etc.)
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


_configure_logging()
log = structlog.get_logger(__name__)


# ── Application lifespan ──────────────────────────────────────────────────────
# FastAPI 0.93+ uses the lifespan context manager instead of on_event hooks.
# Startup and shutdown logic lives here — DB connections, Redis ping, etc.

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Initialise shared resources on startup; release them on shutdown.

    Resources initialised here are available for the full duration of the
    server process.  This prevents the overhead of opening a new DB connection
    on every request.
    """
    settings = get_settings()
    log.info(
        "soc_agent.startup",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )

    # ── Startup ───────────────────────────────────────────────────────────────
    init_db()  # creates async engine + session factory (non-blocking)
    log.info("soc_agent.db.ready")

    # TODO (V1.0 — Member 1): initialise Redis connection pool here
    # TODO (V1.0 — Member 1): start APScheduler CVE polling jobs here

    yield  # application is live — handle requests

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await close_db()
    log.info("soc_agent.shutdown")


# ── Application factory ───────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """
    Build and configure the FastAPI application instance.

    Using a factory function (rather than a module-level `app = FastAPI()`)
    makes it trivial to create isolated app instances in tests.
    """
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "AI-Powered Autonomous SOC Analyst — multi-agent pipeline "
            "for CVE triage, exploit intelligence, and remediation planning."
        ),
        docs_url="/docs",       # Swagger UI
        redoc_url="/redoc",     # ReDoc UI
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Allows the Next.js frontend (localhost:3000 in dev) to call the API.
    # In production, replace with the deployed frontend URL via CORS_ORIGINS env var.
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ────────────────────────────────────────────────────────────────
    # V0: only /health is implemented.
    # V1.0+: import and include routers from backend/routers/.

    @application.get(
        "/health",
        tags=["System"],
        summary="Health check",
        description=(
            "Returns HTTP 200 with `{\"status\": \"ok\"}` when the backend is "
            "running.  Used by Docker Compose health checks and load balancers."
        ),
        response_model=dict[str, str],
    )
    async def health_check() -> dict[str, str]:
        """
        Spec R2: WHEN a client sends GET /health, THE SYSTEM SHALL respond
        with HTTP 200 and a JSON body {"status": "ok"}.
        """
        return {"status": "ok"}

    return application


# ── Module-level `app` instance ───────────────────────────────────────────────
# uvicorn references this: `uvicorn backend.main:app`
app: FastAPI = create_app()
