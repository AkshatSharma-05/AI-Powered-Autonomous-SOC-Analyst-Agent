"""
migrations/versions/002_add_v1_schema.py
─────────────────────────────────────────────────────────────────────────────
Alembic migration: V1.0 schema additions.

Changes:
  1. cve table — add columns:
       source              VARCHAR(50)   — ingestion source (nvd/osv/github_advisory)
       cpe_uris            JSONB         — list of affected CPE 2.3 URIs
       exploit_status      VARCHAR(50)   — denormalized from A3 for fast reads
       risk_score          FLOAT         — denormalized composite risk score
       matched_asset_hostnames JSONB     — denormalized list of matched hostnames

  2. pipeline_state table — add unique constraint on (cve_id, stage) to
     support ON CONFLICT upserts from agents.

  3. New table: cve_asset_match
       cve_id              VARCHAR(30) FK → cve.cve_id
       asset_hostname      VARCHAR(255)
       match_type          VARCHAR(10)   — "exact" | "fuzzy"
       fuzzy_score         FLOAT
       exposure_multiplier FLOAT
       is_internet_facing  BOOLEAN
       zone                VARCHAR(50)
       PRIMARY KEY (cve_id, asset_hostname)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add new columns to `cve` table ────────────────────────────────────

    op.add_column(
        "cve",
        sa.Column(
            "source",
            sa.String(50),
            nullable=True,
            comment="Ingestion source: 'nvd' | 'osv' | 'github_advisory'",
        ),
    )

    op.add_column(
        "cve",
        sa.Column(
            "cpe_uris",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="List of affected CPE 2.3 URI strings from NVD",
        ),
    )

    op.add_column(
        "cve",
        sa.Column(
            "exploit_status",
            sa.String(50),
            nullable=True,
            server_default="None",
            comment="Denormalized exploit status: None | PoC Exists | Weaponised | Actively Exploited",
        ),
    )

    op.add_column(
        "cve",
        sa.Column(
            "risk_score",
            sa.Float(),
            nullable=True,
            server_default="0.0",
            comment="Denormalized composite risk score: CVSS × exposure × exploit_factor",
        ),
    )

    op.add_column(
        "cve",
        sa.Column(
            "matched_asset_hostnames",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
            comment="Denormalized list of matched asset hostnames from A2",
        ),
    )

    # ── 2. Add unique constraint to pipeline_state (cve_id, stage) ───────────
    # Allows ON CONFLICT DO UPDATE upserts from agents
    op.create_unique_constraint(
        "uq_pipeline_state_cve_stage",
        "pipeline_state",
        ["cve_id", "stage"],
    )

    # ── 3. Create cve_asset_match junction table ──────────────────────────────
    op.create_table(
        "cve_asset_match",
        sa.Column("cve_id", sa.String(30), sa.ForeignKey("cve.cve_id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_hostname", sa.String(255), nullable=False),
        sa.Column("match_type", sa.String(10), nullable=False, comment="'exact' or 'fuzzy'"),
        sa.Column("fuzzy_score", sa.Float(), nullable=False, default=1.0),
        sa.Column("exposure_multiplier", sa.Float(), nullable=False, default=1.0),
        sa.Column("is_internet_facing", sa.Boolean(), nullable=False, default=False),
        sa.Column("zone", sa.String(50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("cve_id", "asset_hostname", name="pk_cve_asset_match"),
    )

    # Index for fast lookups by CVE or by asset
    op.create_index("ix_cve_asset_match_cve_id", "cve_asset_match", ["cve_id"])
    op.create_index("ix_cve_asset_match_hostname", "cve_asset_match", ["asset_hostname"])

    # Index exploit_status for dashboard filtering
    op.create_index("ix_cve_exploit_status", "cve", ["exploit_status"])
    op.create_index("ix_cve_risk_score", "cve", ["risk_score"])


def downgrade() -> None:
    # Drop indexes
    op.drop_index("ix_cve_risk_score", table_name="cve")
    op.drop_index("ix_cve_exploit_status", table_name="cve")
    op.drop_index("ix_cve_asset_match_hostname", table_name="cve_asset_match")
    op.drop_index("ix_cve_asset_match_cve_id", table_name="cve_asset_match")

    # Drop junction table
    op.drop_table("cve_asset_match")

    # Remove unique constraint on pipeline_state
    op.drop_constraint("uq_pipeline_state_cve_stage", "pipeline_state", type_="unique")

    # Remove new CVE columns
    op.drop_column("cve", "matched_asset_hostnames")
    op.drop_column("cve", "risk_score")
    op.drop_column("cve", "exploit_status")
    op.drop_column("cve", "cpe_uris")
    op.drop_column("cve", "source")
