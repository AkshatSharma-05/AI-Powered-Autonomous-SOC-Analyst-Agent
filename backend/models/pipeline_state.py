"""
backend/models/pipeline_state.py
─────────────────────────────────────────────────────────────────────────────
SQLAlchemy ORM model for the `pipeline_state` table.

Spec R3 schema:
    id (PK), cve_id (FK), stage, status, updated_at

This table is the audit trail for the LangGraph pipeline.  Every time a CVE
moves from one agent to the next, a row is upserted here.  The dashboard
reads this table to show progress on each CVE card.

Stage lifecycle (in order):
    ingested → correlated → exploit_checked → plan_generated → approved → reported

Status values per stage:
    pending | running | completed | failed | skipped
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.models.base import Base


class PipelineState(Base):
    """
    Tracks a CVE's progress through the five-agent pipeline.

    One row per (cve_id, stage) pair — updated in-place as the agent runs.
    The dashboard can query `WHERE cve_id = ?` to render a progress timeline.
    """

    __tablename__ = "pipeline_state"

    # ── Primary key ───────────────────────────────────────────────────────────
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Surrogate UUID primary key",
    )

    # ── Foreign key ───────────────────────────────────────────────────────────
    cve_id: Mapped[str] = mapped_column(
        String(30),
        ForeignKey("cve.cve_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="References the CVE being tracked through the pipeline",
    )

    # ── Pipeline position ─────────────────────────────────────────────────────
    stage: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment=(
            "Agent stage name — one of: "
            "ingested | correlated | exploit_checked | plan_generated | approved | reported"
        ),
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        comment="Stage execution status: pending | running | completed | failed | skipped",
    )

    # ── Audit ─────────────────────────────────────────────────────────────────
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="Last update timestamp (auto-refreshed by PostgreSQL on UPDATE)",
    )

    # ── Relationship (read-only navigation, not used by agents directly) ──────
    cve = relationship("CVE", backref="pipeline_states", lazy="noload")

    def __repr__(self) -> str:
        return (
            f"<PipelineState cve={self.cve_id!r} "
            f"stage={self.stage!r} status={self.status!r}>"
        )
