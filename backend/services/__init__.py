"""
backend/services/__init__.py
─────────────────────────────────────────────────────────────────────────────
Service layer package — shared clients and utilities consumed by agents A1–A5.

Exports (imported lazily to avoid circular dependency on startup):
    http_client         → resilient async HTTP with exponential backoff
    redis_client        → queue push/pop and timestamp tracking
    stix_normaliser     → STIX 2.1 bundle builder
    cpe_utils           → CPE parsing, exact/fuzzy matching (A2)
    kev_client          → CISA KEV feed checker (A3)
    exploitdb_client    → Exploit-DB CSV searcher (A3)
    github_poc_client   → GitHub Code Search PoC finder (A3)
─────────────────────────────────────────────────────────────────────────────
"""
