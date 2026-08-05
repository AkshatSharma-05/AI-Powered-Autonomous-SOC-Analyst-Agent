# SOC Agent — AI-Powered Autonomous SOC Analyst

> **B.Tech CS Major Project — KIET Group of Institutions, AY 2026–27**
> Aligned with GOV-CS-018 problem statement (CERT-In/NTRO)

A multi-agent AI system that automates SOC vulnerability triage — from a new CVE being published, to a fully-reasoned, human-approved remediation plan, in **under 30 seconds**.

---

## Quick Start (V0 Skeleton)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- [Node.js 20+](https://nodejs.org/) (for frontend dev)
- [Python 3.12](https://www.python.org/downloads/)

### 1. Setup environment

```bash
cp .env.example .env
# Edit .env — change passwords and add your Clerk keys
```

For the frontend:
```bash
cp frontend/.env.local.example frontend/.env.local
# Edit frontend/.env.local — add your Clerk keys from clerk.com
```

### 2. Start all services

```bash
docker compose up -d
```

All three services (backend, postgres, redis) should be healthy within 30 seconds:
```bash
docker compose ps
```

### 3. Run database migrations

```bash
# Inside the backend container:
docker compose exec backend alembic upgrade head
```

### 4. Seed asset inventory

```bash
docker compose exec backend python scripts/seed_assets.py
```

### 5. Verify everything works

| Check | Command | Expected |
|---|---|---|
| R2: Health | `curl http://localhost:8000/health` | `{"status":"ok"}` |
| R3: Schema | `docker compose exec postgres psql -U soc_user -d soc_db -c "\dt"` | 3 tables |
| R4: Redis | `docker compose exec backend python scripts/test_redis_roundtrip.py` | PASS |
| R5: Seed | See seed script output | 10 rows, 3 zones |
| R6: Auth | Visit `http://localhost:3000` | Redirected to Clerk login |

### Dashboard
Open **http://localhost:3000** — you'll be prompted to sign in via Clerk.

### API Docs
Open **http://localhost:8000/docs** — FastAPI Swagger UI.

---

## Architecture

| Agent | Name | Status |
|---|---|---|
| A1 | CVE Ingestion | V1.0 |
| A2 | Asset Correlator | V1.0 |
| A3 | Exploit Intelligence | V1.0 |
| A4 | Remediation Planner (Claude Sonnet 4.6) | V2.0 |
| A5 | Auto-Reporter | V3.0 |

**Tech Stack:** Python · FastAPI · LangGraph · PostgreSQL · Redis · Next.js 15 · Clerk · Docker

---

## Team

| Member | Role | Owns |
|---|---|---|
| Member 1 | Pipeline Engineer | A1 + A3, Postgres schema, Redis, APScheduler |
| Member 2 | AI/Reasoning Engineer | A2 + A4, LangGraph graph, Pydantic schemas |
| Member 3 | Platform Engineer | A5 + Dashboard, FastAPI, Docker, CI |

See [spec.md](spec.md) for the full specification and [SETUP.md](SETUP.md) for detailed setup instructions.
