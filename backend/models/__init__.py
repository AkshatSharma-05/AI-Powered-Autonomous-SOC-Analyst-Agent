# backend/models/__init__.py
# Exposes all ORM models from a single import point.
# Import order matters for Alembic autogenerate — Base must be imported
# before any model that references it.
from backend.models.base import Base  # noqa: F401 — must be first
from backend.models.cve import CVE  # noqa: F401
from backend.models.asset import Asset  # noqa: F401
from backend.models.pipeline_state import PipelineState  # noqa: F401

__all__ = ["Base", "CVE", "Asset", "PipelineState"]
