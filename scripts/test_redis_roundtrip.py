"""
scripts/test_redis_roundtrip.py
─────────────────────────────────────────────────────────────────────────────
Spec R4 acceptance check: Redis queue round-trip test.

Verifies that:
  1. A message can be pushed (LPUSH) to the CVE pipeline queue.
  2. The exact same message can be popped (BRPOP) back out.
  3. The values match exactly — no corruption, no encoding issues.

Usage:
    # With Docker running:
    python scripts/test_redis_roundtrip.py

    # Or inside the backend container:
    docker compose exec backend python scripts/test_redis_roundtrip.py

Exit codes:
    0 — PASS (round-trip succeeded)
    1 — FAIL (connection error or value mismatch)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import os
import sys

import redis

# ── Configuration ─────────────────────────────────────────────────────────────
# Read from environment so this script works both locally (via .env) and inside
# the Docker container (via docker-compose env_file).

# Allow running without a full .env by checking for python-dotenv
try:
    from dotenv import load_dotenv
    load_dotenv()  # loads .env from the current working directory / parent dirs
except ImportError:
    pass  # dotenv not available — rely on environment already being set

REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
QUEUE_NAME: str = os.environ.get("REDIS_CVE_QUEUE_NAME", "cve_pipeline_queue")
TEST_MESSAGE: str = "test-cve-001"  # spec R4 exact value
BRPOP_TIMEOUT: int = 5              # seconds to wait for a pop before giving up


def main() -> int:
    """
    Push a test message, pop it back, assert equality.

    Returns 0 on success, 1 on failure.
    """
    print(f"\n{'─' * 60}")
    print("  SOC Agent — Redis Round-Trip Test (Spec R4)")
    print(f"{'─' * 60}")
    print(f"  Redis URL  : {REDIS_URL}")
    print(f"  Queue name : {QUEUE_NAME}")
    print(f"  Message    : {TEST_MESSAGE!r}")
    print(f"{'─' * 60}\n")

    # ── Connect ───────────────────────────────────────────────────────────────
    try:
        client = redis.from_url(REDIS_URL, decode_responses=True)
        client.ping()
        print("  [OK] Connected to Redis")
    except redis.exceptions.ConnectionError as exc:
        print(f"  [FAIL] Cannot connect to Redis: {exc}")
        print(
            "\n  Is the Redis container running?\n"
            "  Run: docker compose up -d redis\n"
        )
        return 1
    except redis.exceptions.AuthenticationError as exc:
        print(f"  [FAIL] Redis authentication error: {exc}")
        print(
            "\n  Check that REDIS_PASSWORD in .env matches the Redis container config.\n"
        )
        return 1

    # ── Push ──────────────────────────────────────────────────────────────────
    try:
        queue_length = client.lpush(QUEUE_NAME, TEST_MESSAGE)
        print(f"  [OK] LPUSH '{TEST_MESSAGE}' → queue length now {queue_length}")
    except redis.exceptions.RedisError as exc:
        print(f"  [FAIL] LPUSH failed: {exc}")
        return 1

    # ── Pop ───────────────────────────────────────────────────────────────────
    try:
        result = client.brpop(QUEUE_NAME, timeout=BRPOP_TIMEOUT)
    except redis.exceptions.RedisError as exc:
        print(f"  [FAIL] BRPOP failed: {exc}")
        return 1

    if result is None:
        print(
            f"  [FAIL] BRPOP timed out after {BRPOP_TIMEOUT}s — "
            "no message received from queue"
        )
        return 1

    _, received_message = result  # BRPOP returns (queue_name, value)
    print(f"  [OK] BRPOP received: {received_message!r}")

    # ── Assert exact match ────────────────────────────────────────────────────
    if received_message == TEST_MESSAGE:
        print(f"\n  {'✓' * 3}  PASS — values match exactly  {'✓' * 3}\n")
        return 0
    else:
        print(
            f"\n  [FAIL] Value mismatch!\n"
            f"    Expected : {TEST_MESSAGE!r}\n"
            f"    Received : {received_message!r}\n"
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
