"""
backend/main.py
─────────────────────────────────────────────────────────────────────────────
FastAPI application factory for the SOC Agent backend.

Entry point for uvicorn:
    uvicorn backend.main:app --reload          (local dev)
    uvicorn backend.main:app --host 0.0.0.0   (Docker container)

V1.0 endpoints:
    GET  /health             → {"status": "ok"}           (R2)
    GET  /cves               → paginated CVE feed          (R17, R20)
    GET  /cves/{id}/matches  → matched assets              (R18, R20)
    POST /pipeline/trigger   → manual poll trigger         (demo/testing)
    WS   /ws/cves            → live CVE updates            (R19, R20)

V1.0 background services:
    APScheduler — polls NVD/OSV/GitHub Advisory every 15 min (R8, R9)
    Pipeline loop — dequeues CVEs, runs A2+A3, broadcasts to WebSocket (R19)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import get_settings
from backend.database import close_db, init_db
from backend.routers.cve_router import router as cve_router
from backend.routers.cve_router import trigger_router
from backend.routers.ws_router import router as ws_router
from backend.services.http_client import close_http_client, init_http_client
from backend.services.redis_client import close_redis, init_redis
from backend.services.ws_manager import ws_manager


# ── Structured logging setup ──────────────────────────────────────────────────

def _configure_logging() -> None:
    settings = get_settings()

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]

    if settings.environment == "development":
        renderer = structlog.dev.ConsoleRenderer()
    else:
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

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Initialise all shared resources on startup; release them on shutdown.

    Startup order:
        1. DB engine + session factory
        2. Redis connection pool
        3. HTTP client (resilient, with backoff)
        4. Exploit-DB CSV pre-load (A3 warm-up)
        5. CISA KEV pre-load (A3 warm-up)
        6. APScheduler — A1 poll cycle every 15 min
        7. Pipeline loop — background task (A2+A3+WebSocket)
    """
    settings = get_settings()
    log.info(
        "soc_agent.startup",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )

    # ── 1. Database ───────────────────────────────────────────────────────────
    init_db()
    log.info("soc_agent.db.ready")

    # ── 2. Redis ──────────────────────────────────────────────────────────────
    await init_redis()
    log.info("soc_agent.redis.ready")

    # ── 3. HTTP client ────────────────────────────────────────────────────────
    init_http_client()
    log.info("soc_agent.http_client.ready")

    # ── 4 & 5. Pre-warm A3 caches (non-blocking — failures are logged) ────────
    async def _prewarm_caches() -> None:
        """Download Exploit-DB CSV and CISA KEV in the background at startup."""
        from backend.services import exploitdb_client, kev_client
        try:
            log.info("soc_agent.prewarm.start")
            await asyncio.gather(
                exploitdb_client.refresh_if_stale(),
                kev_client.refresh_if_stale(),
                return_exceptions=True,
            )
            log.info("soc_agent.prewarm.complete")
        except Exception as exc:
            log.warning("soc_agent.prewarm.failed", error=str(exc))

    asyncio.create_task(_prewarm_caches())

    # ── 6. APScheduler ────────────────────────────────────────────────────────
    from backend.agents.ingestion import run_poll_cycle

    scheduler = AsyncIOScheduler(timezone=settings.scheduler_timezone)
    scheduler.add_job(
        run_poll_cycle,
        trigger="interval",
        minutes=settings.scheduler_poll_interval_minutes,
        max_instances=settings.scheduler_max_instances,
        id="a1_poll_cycle",
        name="A1 CVE Ingestion Poll",
        replace_existing=True,
    )
    scheduler.start()
    log.info(
        "soc_agent.scheduler.started",
        interval_minutes=settings.scheduler_poll_interval_minutes,
    )

    # ── 7. Pipeline background loop ───────────────────────────────────────────
    from backend.agents.pipeline import run_pipeline_loop

    pipeline_task = asyncio.create_task(
        run_pipeline_loop(ws_broadcast_fn=ws_manager.broadcast)
    )
    log.info("soc_agent.pipeline.loop_started")

    # ── Run an immediate first poll so data appears on startup ─────────────────
    asyncio.create_task(run_poll_cycle())
    log.info("soc_agent.initial_poll.triggered")

    yield  # ── Application is live ──────────────────────────────────────────

    # ── Shutdown ──────────────────────────────────────────────────────────────
    log.info("soc_agent.shutdown.start")

    # Stop scheduler first — no new jobs
    scheduler.shutdown(wait=False)

    # Cancel pipeline loop
    pipeline_task.cancel()
    try:
        await pipeline_task
    except asyncio.CancelledError:
        pass

    # Close external connections
    await close_http_client()
    await close_redis()
    await close_db()

    log.info("soc_agent.shutdown.complete")


# ── Application factory ───────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """Build and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "AI-Powered Autonomous SOC Analyst — multi-agent pipeline "
            "for CVE triage, exploit intelligence, and remediation planning."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ────────────────────────────────────────────────────────────────

    @application.get(
        "/health",
        tags=["System"],
        summary="Health check",
        response_model=dict[str, str],
    )
    async def health_check() -> dict[str, str]:
        """Spec R2: GET /health → {"status": "ok"}."""
        return {"status": "ok"}

    # V1.0 routers
    application.include_router(cve_router)
    application.include_router(trigger_router)
    application.include_router(ws_router)

    return application


# ── Module-level `app` instance ───────────────────────────────────────────────
app: FastAPI = create_app()
