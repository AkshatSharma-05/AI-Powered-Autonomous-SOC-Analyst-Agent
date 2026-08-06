"""
backend/routers/cve_router.py
─────────────────────────────────────────────────────────────────────────────
CVE REST API endpoints — Spec R17, R18, R20, R21.

Endpoints:
    GET  /cves
        Paginated CVE feed ordered by published_date DESC (newest first).
        Includes exploit_status tag and risk_score for dashboard rendering (R17).

    GET  /cves/{cve_id}/matches
        Returns the matched assets for a specific CVE with zone, exposure,
        and match_type (exact | fuzzy) (R18).

    POST /pipeline/trigger
        Manual trigger for a full A1 poll cycle (useful for demo/testing).

    POST /pipeline/inject/{cve_id}
        Direct single-CVE injection — fetches the CVE by ID from NVD using
        the `cveId` query param (not the time-window used by scheduled polls),
        upserts it into the database, and immediately queues it for A2+A3
        processing. This is a permanent SOC capability ("check this CVE now")
        not a test-only hook. Result arrives via WebSocket broadcast (R19).
        Used for R21 demo checkpoint with CVE-2021-44228 (Log4Shell).
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from typing import Optional

import structlog
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select, text

from backend.database import get_async_session
from backend.models.cve import CVE
from backend.schemas import (
    AssetMatch,
    CVEMatchResponse,
    CVEResponse,
    PaginatedCVEResponse,
)

log = structlog.get_logger(__name__)

router = APIRouter(prefix="/cves", tags=["CVEs"])


@router.get(
    "",
    response_model=PaginatedCVEResponse,
    summary="Paginated CVE feed",
    description=(
        "Returns CVEs ordered by risk_score DESC by default (highest-risk first). "
        "Supports sort_by param: risk_score | published_date | cvss_score. "
        "Includes exploit_status and risk_score for dashboard display (R17, R20)."
    ),
)
async def list_cves(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=200, description="Results per page"),
    exploit_status: Optional[str] = Query(
        None,
        description="Filter by exploit status: 'None' | 'PoC Exists' | 'Weaponised' | 'Actively Exploited'",
    ),
    min_cvss: Optional[float] = Query(None, ge=0.0, le=10.0, description="Minimum CVSS score filter"),
    sort_by: Optional[str] = Query(
        "risk_score",
        description="Sort field: 'risk_score' (default) | 'published_date' | 'cvss_score'",
    ),
) -> PaginatedCVEResponse:
    """GET /cves — paginated CVE list, highest risk first by default (R17, R20)."""
    async with get_async_session() as session:
        # Build ordering — default to risk_score DESC so page 1 always shows
        # the most critical CVEs rather than just the most recently published ones.
        _sort_map = {
            "risk_score": CVE.risk_score.desc().nulls_last(),
            "published_date": CVE.published_date.desc().nulls_last(),
            "cvss_score": CVE.cvss_score.desc().nulls_last(),
        }
        primary_order = _sort_map.get(sort_by or "risk_score", CVE.risk_score.desc().nulls_last())
        query = select(CVE).order_by(primary_order, CVE.created_at.desc())

        if exploit_status:
            query = query.where(CVE.exploit_status == exploit_status)
        if min_cvss is not None:
            query = query.where(CVE.cvss_score >= min_cvss)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await session.execute(count_query)
        total = total_result.scalar_one()

        # Paginate
        offset = (page - 1) * page_size
        paginated_query = query.offset(offset).limit(page_size)
        result = await session.execute(paginated_query)
        cves = result.scalars().all()

        items = []
        for cve in cves:
            # Count matched assets from junction table
            match_count_result = await session.execute(
                text("SELECT COUNT(*) FROM cve_asset_match WHERE cve_id = :cve_id"),
                {"cve_id": cve.cve_id},
            )
            match_count = match_count_result.scalar_one()

            items.append(CVEResponse(
                cve_id=cve.cve_id,
                cvss_score=cve.cvss_score,
                description=cve.description,
                published_date=cve.published_date,
                source=cve.source,
                exploit_status=cve.exploit_status or "None",
                risk_score=cve.risk_score or 0.0,
                matched_asset_count=match_count,
                created_at=cve.created_at,
            ))

    return PaginatedCVEResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        has_next=(offset + page_size) < total,
    )


@router.get(
    "/{cve_id}/matches",
    response_model=CVEMatchResponse,
    summary="CVE asset matches",
    description=(
        "Returns all assets matched to a specific CVE with their zone, "
        "exposure multiplier, and match type (exact | fuzzy) (R18, R20)."
    ),
)
async def get_cve_matches(cve_id: str) -> CVEMatchResponse:
    """GET /cves/{cve_id}/matches — asset correlation details (R18, R20)."""
    async with get_async_session() as session:
        # Load CVE
        cve_result = await session.execute(
            select(CVE).where(CVE.cve_id == cve_id)
        )
        cve = cve_result.scalar_one_or_none()

        if cve is None:
            raise HTTPException(status_code=404, detail=f"CVE '{cve_id}' not found")

        # Load asset matches from junction table
        matches_result = await session.execute(
            text("""
                SELECT
                    cam.asset_hostname,
                    cam.match_type,
                    cam.fuzzy_score,
                    cam.exposure_multiplier,
                    cam.is_internet_facing,
                    cam.zone,
                    a.ip_address
                FROM cve_asset_match cam
                LEFT JOIN asset a ON a.hostname = cam.asset_hostname
                WHERE cam.cve_id = :cve_id
                ORDER BY cam.exposure_multiplier DESC, cam.fuzzy_score DESC
            """),
            {"cve_id": cve_id},
        )
        rows = matches_result.fetchall()

        matched_assets = [
            AssetMatch(
                hostname=row.asset_hostname,
                ip_address=row.ip_address,
                zone=row.zone,
                is_internet_facing=row.is_internet_facing,
                match_type=row.match_type,
                exposure_multiplier=row.exposure_multiplier,
            )
            for row in rows
        ]

    return CVEMatchResponse(
        cve_id=cve.cve_id,
        cvss_score=cve.cvss_score,
        exploit_status=cve.exploit_status or "None",
        risk_score=cve.risk_score or 0.0,
        matched_assets=matched_assets,
    )


# ── Manual pipeline trigger (for testing / demo) ──────────────────────────────

trigger_router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


@trigger_router.post(
    "/trigger",
    summary="Manually trigger a poll cycle",
    description="Runs A1 poll cycle immediately without waiting for the scheduler. Useful for demo/testing.",
)
async def trigger_poll() -> dict:
    """POST /pipeline/trigger — manual A1 poll (for testing)."""
    from backend.agents.ingestion import run_poll_cycle
    import asyncio

    log.info("pipeline.manual_trigger")
    # Run in background so the HTTP response returns immediately
    asyncio.create_task(run_poll_cycle())
    return {"status": "poll_cycle_started", "message": "A1 poll cycle triggered in background"}


@trigger_router.post(
    "/inject/{cve_id}",
    summary="Inject a specific CVE by ID",
    description=(
        "Fetches a single CVE directly from NVD by ID (not a time-window scan), "
        "upserts it into the database, and immediately queues it for A2 + A3 processing. "
        "The final result (exploit_status, risk_score, matched assets) arrives via the "
        "existing WebSocket broadcast — connect to WS /ws/cves before calling this endpoint. "
        "This is a permanent SOC capability ('check this CVE right now') used for the "
        "R21 demo checkpoint (CVE-2021-44228 — Log4Shell)."
    ),
)
async def inject_cve(cve_id: str) -> dict:
    """
    POST /pipeline/inject/{cve_id} — manual single-CVE injection (R21).

    Runs synchronously so the caller knows immediately whether NVD recognised
    the CVE ID. The downstream A2+A3 processing is asynchronous — result
    arrives via WebSocket.
    """
    import re
    from datetime import datetime, timezone

    from backend.models.cve import CVE as CVEModel
    from backend.models.pipeline_state import PipelineState as PipelineStateModel
    from backend.services.nvd_client import fetch_by_id
    from backend.services.redis_client import push_cve
    from backend.services.stix_normaliser import build_stix_bundle
    from backend.database import get_async_session
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    # Basic CVE ID format validation
    if not re.match(r"^CVE-\d{4}-\d{4,}$", cve_id, re.IGNORECASE):
        raise HTTPException(
            status_code=422,
            detail=f"'{cve_id}' is not a valid CVE ID (expected format: CVE-YYYY-NNNNN)",
        )

    cve_id = cve_id.upper()
    inject_start = datetime.now(timezone.utc)
    log.info("pipeline.inject.start", cve_id=cve_id)

    # ── 1. Fetch from NVD (single-item, no page delay) ──────────────────────
    try:
        raw_cve = await fetch_by_id(cve_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        log.error("pipeline.inject.nvd_error", cve_id=cve_id, error=str(exc))
        raise HTTPException(
            status_code=502,
            detail=f"NVD lookup failed for '{cve_id}': {exc}",
        )

    # ── 2. STIX normalise ────────────────────────────────────────────────
    stix_bundle = build_stix_bundle(
        cve_id=raw_cve.cve_id,
        description=raw_cve.description,
        cvss_score=raw_cve.cvss_score,
        published_date=raw_cve.published_date,
        cpe_uris=raw_cve.cpe_uris,
        source=raw_cve.source,
    )

    # ── 3. Upsert — always overwrite (inject = force-refresh) ─────────────
    # Unlike the scheduled poll (which only updates if cvss IS NULL),
    # injection always overwrites all fields so you always get fresh NVD data.
    try:
        async with get_async_session() as session:
            stmt = pg_insert(CVEModel).values(
                cve_id=raw_cve.cve_id,
                cvss_score=raw_cve.cvss_score,
                published_date=raw_cve.published_date,
                description=raw_cve.description,
                stix_data=stix_bundle,
                source=raw_cve.source,
                cpe_uris=raw_cve.cpe_uris,
            ).on_conflict_do_update(
                index_elements=["cve_id"],
                set_={
                    # Force-refresh ALL fields on inject (no quality guard)
                    "cvss_score": pg_insert(CVEModel).excluded.cvss_score,
                    "cpe_uris": pg_insert(CVEModel).excluded.cpe_uris,
                    "stix_data": pg_insert(CVEModel).excluded.stix_data,
                    "description": pg_insert(CVEModel).excluded.description,
                    "source": pg_insert(CVEModel).excluded.source,
                    "published_date": pg_insert(CVEModel).excluded.published_date,
                },
            )
            await session.execute(stmt)

            # Always mark as ingested (re-ingest)
            ps_stmt = pg_insert(PipelineStateModel).values(
                cve_id=raw_cve.cve_id,
                stage="ingested",
                status="completed",
            ).on_conflict_do_update(
                index_elements=["cve_id", "stage"],
                set_={"status": "completed"},
            )
            await session.execute(ps_stmt)

    except Exception as exc:
        log.error("pipeline.inject.db_error", cve_id=cve_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Database upsert failed: {exc}")

    # ── 4. Always push to Redis queue (even if CVE existed before) ──────
    # This is the key difference from scheduled ingestion — we always re-queue
    # so A2+A3 re-run and the WS broadcast fires regardless of prior state.
    try:
        await push_cve(raw_cve.cve_id)
    except Exception as exc:
        log.error("pipeline.inject.redis_error", cve_id=cve_id, error=str(exc))
        raise HTTPException(status_code=500, detail=f"Redis queue push failed: {exc}")

    elapsed_ms = int((datetime.now(timezone.utc) - inject_start).total_seconds() * 1000)

    log.info(
        "pipeline.inject.complete",
        cve_id=raw_cve.cve_id,
        cvss=raw_cve.cvss_score,
        cpe_count=len(raw_cve.cpe_uris),
        elapsed_ms=elapsed_ms,
    )

    return {
        "status": "queued",
        "cve_id": raw_cve.cve_id,
        "cvss_score": raw_cve.cvss_score,
        "cpe_count": len(raw_cve.cpe_uris),
        "source": raw_cve.source,
        "elapsed_ms": elapsed_ms,
        "message": (
            f"CVE '{raw_cve.cve_id}' fetched from NVD (CVSS={raw_cve.cvss_score}, "
            f"{len(raw_cve.cpe_uris)} CPEs) and queued for A2+A3 processing. "
            "Result will arrive via WebSocket broadcast (/ws/cves)."
        ),
    }
