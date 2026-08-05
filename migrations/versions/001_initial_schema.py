"""Initial schema — cve, asset, pipeline_state tables

Revision ID: 001
Revises:
Create Date: 2026-08-05

Spec R3:
    Creates the three tables required for V0:
    - cve            : incoming vulnerability records
    - asset          : organisation infrastructure inventory
    - pipeline_state : per-CVE agent pipeline audit trail

All timestamps are TIMESTAMP WITH TIME ZONE (timestamptz) — UTC-normalised
storage prevents ambiguity when team members work across time zones.

Primary keys:
    cve.cve_id         — text (CVE-YYYY-NNNNN format, globally unique)
    asset.id           — UUID v4 (gen_random_uuid(), requires pgcrypto extension)
    pipeline_state.id  — UUID v4

The pgcrypto extension is enabled in scripts/init_db.sql which runs before
this migration on first container creation.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── cve ───────────────────────────────────────────────────────────────────
    op.create_table(
        "cve",
        sa.Column(
            "cve_id",
            sa.String(length=30),
            primary_key=True,
            nullable=False,
            comment="CVE identifier, e.g. 'CVE-2021-44228'",
        ),
        sa.Column(
            "cvss_score",
            sa.Float(),
            nullable=True,
            comment="CVSS v3.1 base score (0.0–10.0); nullable if NVD has not yet scored",
        ),
        sa.Column(
            "published_date",
            sa.DateTime(timezone=True),
            nullable=True,
            comment="UTC timestamp when the CVE was first published",
        ),
        sa.Column(
            "description",
            sa.Text(),
            nullable=True,
            comment="English description from NVD",
        ),
        sa.Column(
            "stix_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Full STIX 2.1 bundle JSON produced by A1",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="Row creation timestamp (set by PostgreSQL server clock)",
        ),
    )

    # GIN index on stix_data for fast JSONB key lookups
    op.create_index(
        "ix_cve_stix_data_gin",
        "cve",
        ["stix_data"],
        postgresql_using="gin",
    )

    # ── asset ─────────────────────────────────────────────────────────────────
    op.create_table(
        "asset",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="Surrogate UUID primary key",
        ),
        sa.Column(
            "hostname",
            sa.String(length=255),
            nullable=False,
            comment="DNS hostname or display name of the asset",
        ),
        sa.Column(
            "ip_address",
            sa.String(length=45),
            nullable=True,
            comment="Primary IP address (IPv4 or IPv6)",
        ),
        sa.Column(
            "cpe_string",
            sa.Text(),
            nullable=False,
            comment="CPE 2.3 URI, e.g. 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*'",
        ),
        sa.Column(
            "zone",
            sa.String(length=50),
            nullable=False,
            comment="Network zone: dmz | internal | cloud",
        ),
        sa.Column(
            "is_internet_facing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
            comment="True → 3× exposure multiplier in composite risk score",
        ),
    )

    # Index on zone for fast A2 queries filtering by network segment
    op.create_index("ix_asset_zone", "asset", ["zone"])

    # Index on is_internet_facing for fast exposure-priority queries
    op.create_index("ix_asset_internet_facing", "asset", ["is_internet_facing"])

    # ── pipeline_state ────────────────────────────────────────────────────────
    op.create_table(
        "pipeline_state",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
            comment="Surrogate UUID primary key",
        ),
        sa.Column(
            "cve_id",
            sa.String(length=30),
            sa.ForeignKey("cve.cve_id", ondelete="CASCADE"),
            nullable=False,
            comment="References the CVE being tracked",
        ),
        sa.Column(
            "stage",
            sa.String(length=50),
            nullable=False,
            comment=(
                "Agent stage: ingested | correlated | exploit_checked | "
                "plan_generated | approved | reported"
            ),
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'pending'"),
            comment="Stage status: pending | running | completed | failed | skipped",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
            comment="Last update timestamp",
        ),
    )

    # Index on cve_id — most queries filter by CVE
    op.create_index("ix_pipeline_state_cve_id", "pipeline_state", ["cve_id"])

    # Composite index for dashboard "show me all CVEs in stage X" queries
    op.create_index(
        "ix_pipeline_state_stage_status",
        "pipeline_state",
        ["stage", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_pipeline_state_stage_status", table_name="pipeline_state")
    op.drop_index("ix_pipeline_state_cve_id", table_name="pipeline_state")
    op.drop_table("pipeline_state")

    op.drop_index("ix_asset_internet_facing", table_name="asset")
    op.drop_index("ix_asset_zone", table_name="asset")
    op.drop_table("asset")

    op.drop_index("ix_cve_stix_data_gin", table_name="cve")
    op.drop_table("cve")
