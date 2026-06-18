-- ─────────────────────────────────────────────────────────────────────────────
-- scripts/init_db.sql
-- Runs ONCE automatically when the PostgreSQL container is first created.
-- DO NOT put schema here — that is Alembic's job (alembic upgrade head).
-- This file only enables extensions that must exist before Alembic runs.
-- ─────────────────────────────────────────────────────────────────────────────

-- gen_random_uuid() — used as default for all UUID primary keys in our schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm — enables fast ILIKE / trigram search on CVE descriptions (future use)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- btree_gin — enables GIN indexes on JSONB columns (stix_bundle, affected_packages)
CREATE EXTENSION IF NOT EXISTS "btree_gin";
