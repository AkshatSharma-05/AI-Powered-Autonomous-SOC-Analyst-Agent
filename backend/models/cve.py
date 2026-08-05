"""
backend/models/cve.py
─────────────────────────────────────────────────────────────────────────────
SQLAlchemy ORM model for the `cve` table.

Spec R3 schema:
    cve_id (PK), cvss_score, published_date, description,
    stix_data (JSONB), created_at

The `stix_data` column stores the full STIX 2.1 bundle JSON produced by
Agent A1 after normalisation.  Using JSONB (not JSON) gives us indexing
support and faster query operators in PostgreSQL.
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

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Row creation timestamp (set by PostgreSQL server clock)",
    )

    def __repr__(self) -> str:
        return f"<CVE id={self.cve_id!r} cvss={self.cvss_score}>"
