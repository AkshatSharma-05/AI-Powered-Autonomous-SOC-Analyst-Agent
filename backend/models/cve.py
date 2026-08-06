"""
backend/models/cve.py
─────────────────────────────────────────────────────────────────────────────
SQLAlchemy ORM model for the `cve` table.

V0 schema (R3):
    cve_id (PK), cvss_score, published_date, description,
    stix_data (JSONB), created_at

V1.0 additions (migration 002):
    source, cpe_uris (JSONB), exploit_status, risk_score,
    matched_asset_hostnames (JSONB)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class CVE(Base):
    """
    Represents a single CVE record as ingested and normalised by Agent A1.

    Primary key is the CVE ID string (e.g. "CVE-2021-44228") rather than a
    surrogate UUID, because CVE IDs are globally unique and human-readable —
    deduplication in A1 can simply do `INSERT ... ON CONFLICT DO NOTHING`.
    """

    __tablename__ = "cve"

    # ── Primary key ───────────────────────────────────────────────────────────
    cve_id: Mapped[str] = mapped_column(
        String(30),
        primary_key=True,
        comment="CVE identifier, e.g. 'CVE-2021-44228'",
    )

    # ── Scoring ───────────────────────────────────────────────────────────────
    cvss_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="CVSS v3.1 base score (0.0–10.0); nullable if NVD has not yet scored",
    )

    # ── Metadata ──────────────────────────────────────────────────────────────
    published_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="UTC timestamp when the CVE was first published by NVD/OSV",
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
        comment="English description from NVD; may be absent for very new CVEs",
    )

    # ── STIX 2.1 bundle ───────────────────────────────────────────────────────
    stix_data: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Full STIX 2.1 bundle JSON produced by A1's normaliser",
    )

    # ── V1.0 additions ────────────────────────────────────────────────────────

    source: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Ingestion source: 'nvd' | 'osv' | 'github_advisory'",
    )

    cpe_uris: Mapped[list[str] | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="List of affected CPE 2.3 URI strings extracted from NVD/OSV",
    )

    exploit_status: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        default="None",
        comment="Denormalized exploit status from A3: None|PoC Exists|Weaponised|Actively Exploited",
    )

    risk_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        default=0.0,
        comment="Denormalized composite risk score: CVSS × exposure_multiplier × exploit_factor",
    )

    matched_asset_hostnames: Mapped[list[str] | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Denormalized list of asset hostnames matched by A2",
    )

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Row creation timestamp (set by PostgreSQL server clock)",
    )

    def __repr__(self) -> str:
        return (
            f"<CVE id={self.cve_id!r} cvss={self.cvss_score} "
            f"exploit={self.exploit_status!r} risk={self.risk_score}>"
        )
