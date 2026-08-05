"""
scripts/seed_assets.py
─────────────────────────────────────────────────────────────────────────────
Spec R5 acceptance check: seed the asset inventory with 10 records.

Requirements:
    - Exactly 10 asset records
    - Exactly 3 distinct network zones (dmz, internal, cloud)
    - Each record has a syntactically valid CPE 2.3 URI
    - Idempotent — safe to run multiple times (clears and re-inserts)

The assets are chosen to deliberately match the 5 benchmark CVEs from
spec Section 1, so A2 correlation tests in V1.0 will immediately show hits:
    CVE-2021-44228  → apache:log4j:2.14.1     (app-server-01)
    CVE-2024-3094   → xz:xz-utils:5.6.0       (bastion-01)
    CVE-2021-26855  → microsoft:exchange:2019  (mail-server-01)
    CVE-2022-0847   → linux:linux_kernel:5.16  (build-server-01, k8s-node-01)
    CVE-2023-44487  → nginx:nginx:1.24.0       (nginx-lb-01)

Usage:
    python scripts/seed_assets.py

    # Or inside the backend container (after `alembic upgrade head`):
    docker compose exec backend python scripts/seed_assets.py
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid

# Allow running without a full package install by loading .env first
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Add project root to sys.path so `from backend...` imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from backend.config import get_settings
from backend.models.asset import Asset

# ─────────────────────────────────────────────────────────────────────────────
# Seed data — 10 assets, 3 zones
#
# CPE 2.3 URI format:
#   cpe:2.3:<part>:<vendor>:<product>:<version>:<update>:<edition>
#             :<language>:<sw_edition>:<target_sw>:<target_hw>:<other>
#
# part: a = application, o = operating system, h = hardware
# Wildcards (*) fill unused fields per the CPE 2.3 spec.
# ─────────────────────────────────────────────────────────────────────────────

SEED_ASSETS: list[dict] = [
    # ── DMZ (internet-facing, 3× risk multiplier) ─────────────────────────────
    {
        "id": uuid.UUID("00000000-0000-0000-0001-000000000001"),
        "hostname": "app-server-01",
        "ip_address": "203.0.113.10",
        "cpe_string": "cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*",
        "zone": "dmz",
        "is_internet_facing": True,
        # Deliberately matches CVE-2021-44228 (Log4Shell, CVSS 10.0)
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0001-000000000002"),
        "hostname": "nginx-lb-01",
        "ip_address": "203.0.113.11",
        "cpe_string": "cpe:2.3:a:nginx:nginx:1.24.0:*:*:*:*:*:*:*",
        "zone": "dmz",
        "is_internet_facing": True,
        # Matches CVE-2023-44487 (HTTP/2 Rapid Reset, CVSS 7.5)
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0001-000000000003"),
        "hostname": "mail-server-01",
        "ip_address": "203.0.113.12",
        "cpe_string": "cpe:2.3:a:microsoft:exchange_server:2019:*:*:*:*:*:*:*",
        "zone": "dmz",
        "is_internet_facing": True,
        # Matches CVE-2021-26855 (ProxyLogon, CVSS 9.8, KEV-listed)
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0001-000000000004"),
        "hostname": "api-gateway-01",
        "ip_address": "203.0.113.13",
        "cpe_string": "cpe:2.3:a:kong:kong:3.4.0:*:*:*:*:*:*:*",
        "zone": "dmz",
        "is_internet_facing": True,
    },
    # ── Internal (not internet-facing, 1× multiplier) ─────────────────────────
    {
        "id": uuid.UUID("00000000-0000-0000-0002-000000000001"),
        "hostname": "build-server-01",
        "ip_address": "10.10.1.50",
        "cpe_string": "cpe:2.3:o:linux:linux_kernel:5.16.11:*:*:*:*:*:*:*",
        "zone": "internal",
        "is_internet_facing": False,
        # Matches CVE-2022-0847 (Dirty Pipe, CVSS 7.8, weaponized exploit)
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0002-000000000002"),
        "hostname": "db-primary-01",
        "ip_address": "10.10.1.100",
        "cpe_string": "cpe:2.3:a:postgresql:postgresql:16.1:*:*:*:*:*:*:*",
        "zone": "internal",
        "is_internet_facing": False,
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0002-000000000003"),
        "hostname": "bastion-01",
        "ip_address": "10.10.1.5",
        "cpe_string": "cpe:2.3:a:xz:xz-utils:5.6.0:*:*:*:*:*:*:*",
        "zone": "internal",
        "is_internet_facing": False,
        # Matches CVE-2024-3094 (xz-utils backdoor, CVSS 10.0)
    },
    # ── Cloud (mix of internet-facing and internal) ────────────────────────────
    {
        "id": uuid.UUID("00000000-0000-0000-0003-000000000001"),
        "hostname": "k8s-node-01",
        "ip_address": "172.16.0.10",
        "cpe_string": "cpe:2.3:o:linux:linux_kernel:5.16.11:*:*:*:*:*:*:*",
        "zone": "cloud",
        "is_internet_facing": False,
        # Also matches CVE-2022-0847
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0003-000000000002"),
        "hostname": "s3-proxy-01",
        "ip_address": "172.16.0.20",
        "cpe_string": "cpe:2.3:a:minio:minio:2024.1.1:*:*:*:*:*:*:*",
        "zone": "cloud",
        "is_internet_facing": True,
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0003-000000000003"),
        "hostname": "monitoring-01",
        "ip_address": "172.16.0.30",
        "cpe_string": "cpe:2.3:a:grafana:grafana:10.2.0:*:*:*:*:*:*:*",
        "zone": "cloud",
        "is_internet_facing": False,
    },
]


async def seed(session: AsyncSession) -> None:
    """
    Clear any existing seed rows and insert all 10 assets.

    Idempotent: deletes by the known fixed UUIDs before re-inserting, so
    re-running the script will not create duplicates.
    """
    known_ids = [a["id"] for a in SEED_ASSETS]

    # Remove existing seed records (safe to run on non-empty table)
    await session.execute(
        delete(Asset).where(Asset.id.in_(known_ids))
    )

    # Insert fresh seed rows
    for asset_data in SEED_ASSETS:
        session.add(Asset(**asset_data))

    await session.flush()
    print(f"  [OK] Inserted {len(SEED_ASSETS)} assets")


async def verify(session: AsyncSession) -> None:
    """
    Run the two acceptance checks from spec Section 5:
        - SELECT COUNT(*) FROM asset; → 10
        - SELECT DISTINCT zone FROM asset; → 3 rows
    """
    from sqlalchemy import func, select, distinct

    # Total count
    count_result = await session.execute(
        select(func.count()).select_from(Asset)
    )
    total = count_result.scalar_one()

    # Distinct zones
    zone_result = await session.execute(
        select(distinct(Asset.zone))
    )
    zones = sorted([row[0] for row in zone_result.all()])

    print(f"\n{'─' * 60}")
    print("  Verification (Spec R5)")
    print(f"{'─' * 60}")
    print(f"  COUNT(*) FROM asset        = {total}  (expected: 10)")
    print(f"  DISTINCT zone FROM asset   = {zones}  (expected: 3)")

    passed = total == 10 and len(zones) == 3
    if passed:
        print(f"\n  {'✓' * 3}  PASS  {'✓' * 3}\n")
    else:
        print(f"\n  [FAIL] One or more checks did not pass\n")
    return passed


async def main() -> int:
    settings = get_settings()

    print(f"\n{'─' * 60}")
    print("  SOC Agent — Asset Seed Script (Spec R5)")
    print(f"{'─' * 60}\n")

    engine = create_async_engine(settings.database_url, echo=False, future=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as session:
            async with session.begin():
                await seed(session)
            # commit happens here

        async with session_factory() as session:
            passed = await verify(session)

    except Exception as exc:
        print(f"\n  [FAIL] Error: {exc}")
        print(
            "\n  Is the database running and migrations applied?\n"
            "  Run: docker compose up -d postgres\n"
            "       alembic upgrade head\n"
        )
        await engine.dispose()
        return 1

    await engine.dispose()
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
