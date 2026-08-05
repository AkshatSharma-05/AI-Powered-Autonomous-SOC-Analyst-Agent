"""
backend/models/asset.py
─────────────────────────────────────────────────────────────────────────────
SQLAlchemy ORM model for the `asset` table.

Spec R3 schema:
    id (PK), hostname, ip_address, cpe_string, zone, is_internet_facing (bool)

This table is the organisation's infrastructure inventory.  Agent A2 queries
it to determine whether an incoming CVE affects any of our assets by matching
cpe_string against the CVE's affected packages.

The `zone` column uses free-text (not an enum) so new zones can be added
without a migration during early development.  Standard values: 'dmz',
'internal', 'cloud'.

`is_internet_facing` drives the 3× exposure multiplier in the composite
risk score formula: CVSS × exposure_multiplier × exploit_factor.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.models.base import Base


class Asset(Base):
    """
    A single host / service in the organisation's infrastructure inventory.

    Used by Agent A2 (Asset Correlator) to filter CVEs — only CVEs that
    match at least one asset proceed to A3/A4.
    """

    __tablename__ = "asset"

    # ── Primary key ───────────────────────────────────────────────────────────
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Surrogate UUID primary key — generated client-side by seed script",
    )

    # ── Identity ──────────────────────────────────────────────────────────────
    hostname: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        comment="DNS hostname or display name of the asset",
    )

    ip_address: Mapped[str | None] = mapped_column(
        String(45),  # IPv4 (15) or IPv6 (39) + margin
        nullable=True,
        comment="Primary IP address; nullable for assets with dynamic IPs",
    )

    # ── CPE identifier ────────────────────────────────────────────────────────
    cpe_string: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        comment=(
            "CPE 2.3 URI for the asset's primary software/OS, e.g. "
            "'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*'.  "
            "Used by A2 for exact-match and fuzzy-match correlation."
        ),
    )

    # ── Network context ───────────────────────────────────────────────────────
    zone: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Network zone: 'dmz' | 'internal' | 'cloud' (extensible)",
    )

    is_internet_facing: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment=(
            "True if the asset is directly reachable from the public internet.  "
            "Applies a 3× multiplier to the composite risk score in A2."
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<Asset hostname={self.hostname!r} zone={self.zone!r} "
            f"internet_facing={self.is_internet_facing}>"
        )
