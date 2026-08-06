"""
backend/agents/pipeline.py
─────────────────────────────────────────────────────────────────────────────
Pipeline orchestrator — ties A2 (Correlator) and A3 (Exploit Intel) together.

Runs as a background asyncio task during the FastAPI lifespan.
Continuously pops CVE IDs from the Redis queue and processes them through
A2 → A3 → WebSocket broadcast.

The task is started in main.py lifespan and cancelled on shutdown.

Processing flow for each CVE:
  1. BRPOP from Redis queue (pop_cve with 0.1s timeout)
  2. A2: correlate(cve_id) → CorrelationResult
  3. If no matched assets → skip (pipeline_state already marked as skipped)
  4. A3: assess(cve_id, correlation) → ExploitAssessment
  5. Broadcast CVEWebSocketMessage to all connected dashboard clients (R19)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from backend.agents.correlator import correlate
from backend.agents.exploit_intel import assess
from backend.database import get_async_session
from backend.models.cve import CVE
from backend.schemas import CVEWebSocketMessage
from backend.services.redis_client import get_queue_depth, pop_cve

log = structlog.get_logger(__name__)


async def run_pipeline_loop(ws_broadcast_fn) -> None:
    """
    Continuously process CVEs from the Redis queue.

    ws_broadcast_fn: async callable that accepts a dict and broadcasts
                     it to all connected WebSocket clients.

    This function runs forever until the task is cancelled (on shutdown).
    """
    log.info("pipeline.loop.started")

    while True:
        try:
            cve_id = await pop_cve(timeout=1.0)
            if cve_id is None:
                # Queue empty — brief pause to avoid CPU spin
                await asyncio.sleep(0.5)
                continue

            await _process_cve(cve_id, ws_broadcast_fn)

        except asyncio.CancelledError:
            log.info("pipeline.loop.cancelled")
            break
        except Exception as exc:
            # Catch-all so one bad CVE doesn't kill the loop
            log.error("pipeline.loop.unexpected_error", error=str(exc))
            await asyncio.sleep(1.0)


async def _process_cve(cve_id: str, ws_broadcast_fn) -> None:
    """
    Run A2 → A3 → broadcast for a single CVE ID.
    """
    log.info("pipeline.processing", cve_id=cve_id)
    start_ts = datetime.now(timezone.utc)

    try:
        # ── A2: Asset Correlation ─────────────────────────────────────────────
        correlation = await correlate(cve_id)

        if not correlation.has_matches:
            log.info(
                "pipeline.no_assets.skipped",
                cve_id=cve_id,
                reason="A2 found no matching assets — CVE filtered out",
            )
            return

        # ── A3: Exploit Intelligence ──────────────────────────────────────────
        assessment = await assess(cve_id, correlation)

        # ── Load CVE metadata for WebSocket payload ───────────────────────────
        cve_data = await _load_cve(cve_id)

        end_ts = datetime.now(timezone.utc)
        elapsed_ms = int((end_ts - start_ts).total_seconds() * 1000)

        # ── R19: Broadcast to WebSocket clients ────────────────────────────────
        msg = CVEWebSocketMessage(
            event="cve_processed",
            cve_id=cve_id,
            cvss_score=cve_data.get("cvss_score"),
            description=cve_data.get("description"),
            published_date=cve_data.get("published_date"),
            exploit_status=assessment.exploit_status,
            risk_score=assessment.risk_score,
            matched_assets=[m.hostname for m in correlation.matched_assets],
            is_kev_listed=assessment.is_kev_listed,
            source=cve_data.get("source"),
            processed_at=end_ts,
        )

        await ws_broadcast_fn(msg.model_dump(mode="json"))

        log.info(
            "pipeline.cve_complete",
            cve_id=cve_id,
            exploit_status=assessment.exploit_status,
            risk_score=assessment.risk_score,
            matched_assets=[m.hostname for m in correlation.matched_assets],
            elapsed_ms=elapsed_ms,
        )

    except Exception as exc:
        log.error("pipeline.cve_failed", cve_id=cve_id, error=str(exc))


async def _load_cve(cve_id: str) -> dict:
    """Load basic CVE metadata from the database for the WS payload."""
    try:
        async with get_async_session() as session:
            result = await session.execute(
                select(CVE).where(CVE.cve_id == cve_id)
            )
            cve = result.scalar_one_or_none()
            if cve:
                return {
                    "cvss_score": cve.cvss_score,
                    "description": cve.description,
                    "published_date": cve.published_date,
                    "source": cve.source,
                }
    except Exception:
        pass
    return {}
