# SOC Agent — spec.md

This is the single source of truth for Antigravity. Read this entire file before writing any code. Build only what Section 4 specifies, in order, and verify each task against Section 5's acceptance checks before moving to the next one. Do not build anything listed in Section 6 (Out of Scope) yet.

---

## 1. Project Context

This is a B.Tech Computer Science major project (KIET Group of Institutions, AY 2026–27), aligned with the **GOV-CS-018** problem statement from CERT-In/NTRO. It is a **multi-agent AI system that automates SOC (Security Operations Center) vulnerability triage** — from a new CVE being published, to a fully-reasoned, human-approved remediation plan, in under 30 seconds, with zero manual effort until the approval checkpoint.

**Problem it solves:** Over 100 CVEs are published daily. Manual triage takes 60–72 hours per critical CVE. Attackers can weaponize a public exploit in as little as 14 minutes. That gap is where most breaches happen. SOC analysts also lose roughly 60% of their time to repetitive administrative work.

**What the system does end-to-end:**
1. Continuously ingests new CVEs from NVD, OSV.dev, and GitHub Security Advisories the moment they're published.
2. Checks whether the organization's actual infrastructure is affected — filtering out the 80–90% of CVEs that are irrelevant. This is what makes the LLM step affordable, so it must run *before* any LLM call.
3. Checks whether a real-world exploit already exists (CISA KEV catalogue, Exploit-DB, GitHub PoC code).
4. If relevant, an LLM (Claude Sonnet 4.6) reasons over all this context and generates a structured, validated remediation plan (patch order, workarounds, rollback steps, downtime estimate).
5. A human analyst approves/rejects high-impact actions via a dashboard (LangGraph interrupt checkpoint, 4-hour auto-escalation timeout).
6. On approval, the system auto-creates a JIRA ticket, sends Slack/email alerts, and later produces weekly executive PDF reports.

### System Architecture — Five Agents

| Agent | Name | Responsibility |
|---|---|---|
| **A1** | CVE Ingestion | Poll NVD API v2, OSV.dev, GitHub Advisory DB every 15 min. Dedup by CVE ID. Normalize to STIX 2.1. Push to Redis queue. Retry + exponential backoff on failures. |
| **A2** | Asset Correlator | Match incoming CVEs against a live infra inventory. Exact match via CPE 2.3 URI against NVD dictionary; fallback fuzzy match via Jaccard coefficient (threshold 0.80) on vendor/product/version tokens. Log unresolved matches for manual review (never silently discard). Apply exposure scoring (3× multiplier for internet-facing assets). This is the step that discards ~80–90% of CVEs before the LLM ever runs — it exists specifically to control LLM cost. |
| **A3** | Exploit Intelligence | Query CISA KEV, Exploit-DB API, GitHub Code Search API (for PoC commits by CVE ID). Score by recency (last 48h = highest) and type (weaponized > PoC > theoretical). Output status: `None` / `PoC Exists` / `Weaponised` / `Actively Exploited`. |
| **A4** | Remediation Planner | The system's only true reasoning agent — a LangGraph ReAct node. Builds a structured prompt from A1–A3 context, calls Claude Sonnet 4.6, gets back a structured JSON patch plan, validates it against a Pydantic schema. Implements a LangGraph interrupt checkpoint before any production-affecting action. Stores the full reasoning trace for auditability. |
| **A5** | Auto-Reporter | JIRA REST API ticket creation, Slack webhook alerts (routed by team), SMTP email, weekly executive PDF (Claude Sonnet 4.6 + ReportLab), STIX/TAXII 2.1 export for SIEM integration. |

**Composite risk scoring formula:** `CVSS base score × exposure multiplier × exploit factor`

**Orchestration:** LangGraph — stateful multi-agent graph, conditional edges, interrupt/resume logic for human-in-the-loop approval.

### Tech Stack (fixed — do not substitute)

- **Backend:** Python, FastAPI (REST + WebSocket server)
- **Orchestration:** LangGraph
- **LLM:** Claude Sonnet 4.6 API — single-provider architecture, structured JSON outputs validated with Pydantic
- **Database:** PostgreSQL
- **Queue:** Redis
- **Scheduling:** APScheduler (15-min polling jobs)
- **Frontend:** Next.js 15 (App Router), Clerk for auth (Admin / Analyst / Read-only roles), WebSocket for live updates, Recharts for gauges/charts
- **Infra:** Docker Compose (all services containerized), GitHub Actions CI (lint + test on push)
- **Data formats:** STIX 2.1 (normalization), STIX/TAXII 2.1 (export)

### Team & Ownership

| Person | Role | Owns |
|---|---|---|
| Member 1 | Pipeline Engineer | A1 + A3, Postgres schema design, Redis queue setup, APScheduler, API key management |
| Member 2 | AI/Reasoning Engineer | A2 + A4, composite risk scoring, LangGraph orchestration graph, Pydantic schemas, asset inventory seeding |
| Member 3 | Platform Engineer | A5 + Dashboard + Infra: FastAPI endpoints/WebSocket, Next.js dashboard, Docker Compose, CI pipeline, secrets management |

Each person owns a complete vertical slice so no one is blocked by anyone else.

### Branching Convention

```
main  ← clean, demo-ready, only touched at milestones
dev   ← integration branch, everyone merges here first
  ├── feature/a1-ingestion
  ├── feature/a3-exploit
  ├── feature/a2-correlator
  ├── feature/a4-planner
  ├── feature/a5-reporter
  └── feature/dashboard
```

Commit prefixes: `feat:`, `fix:`, `chore:` (optionally `docs:`, `refactor:`). Shared files that cause conflicts — `backend/main.py`, `backend/agents/pipeline.py`, `backend/agents/state.py`, `requirements.txt` — should be edited by one person at a time.

### The 5 Benchmark CVEs (used for testing throughout the project, not needed until V1.0+)

- CVE-2021-44228 (Apache Log4j, CVSS 10.0)
- CVE-2024-3094 (xz-utils, CVSS 10.0)
- CVE-2021-26855 (Microsoft Exchange, CVSS 9.8, KEV-listed)
- CVE-2022-0847 (Linux Kernel "Dirty Pipe", CVSS 7.8, weaponized exploit despite medium score)
- CVE-2023-44487 (HTTP/2 Rapid Reset, CVSS 7.5)

---

## 2. Current Milestone

**Version 0 — Skeleton.** Goal: everyone has a working local environment and the project skeleton exists. This is the all-hands, unblock-everything milestone. Nothing else in the roadmap (V1.0 ingestion pipeline, V2.0 intelligence + LLM, V3.0 full integrations) can start until this is done and verified.

---

## 3. Constitution (non-negotiable constraints — apply to every task, every milestone)

- Tech stack is fixed as specified in Section 1. No substitutions.
- Every service runs in a container from the start. Nothing is "local-only for now."
- Secrets never get hardcoded or committed. `.env` is in `.gitignore` from the first commit.
- Code must be commented — this project is also evaluated on code quality and feeds a research paper.
- Don't build ahead of the current milestone's scope (see Section 6, Out of Scope).
- After each task below, stop and verify it against Section 5 before moving to the next — don't chain untested work together.
- If a decision isn't covered by this spec (e.g. exact folder layout, exact Pydantic field naming beyond what's specified), ask rather than guess silently. Don't ask about anything already specified here.

---

## 4. Requirements for Version 0 (EARS format)

**R1 — Environment startup**
WHEN a developer runs `docker compose up`, THE SYSTEM SHALL start the backend, PostgreSQL, and Redis containers and report all three as healthy within 30 seconds.

**R2 — Health check**
WHEN a client sends `GET /health` to the backend, THE SYSTEM SHALL respond with HTTP 200 and a JSON body `{"status": "ok"}`.

**R3 — Schema availability**
WHEN the PostgreSQL container starts for the first time, THE SYSTEM SHALL create the `cve`, `asset`, and `pipeline_state` tables automatically (via migration or init script — not a manual step).

- `cve`: cve_id (PK), cvss_score, published_date, description, stix_data (JSONB), created_at
- `asset`: id (PK), hostname, ip_address, cpe_string, zone, is_internet_facing (bool)
- `pipeline_state`: id (PK), cve_id (FK), stage, status, updated_at

**R4 — Queue round-trip**
WHEN a test script pushes a message to the Redis queue, THE SYSTEM SHALL allow a consumer to pop that exact message back, confirming producer/consumer connectivity.

**R5 — Seeded inventory**
WHEN the asset seed script is run, THE SYSTEM SHALL insert exactly 10 asset records across 3 distinct network zones, each with a syntactically valid CPE 2.3 URI (e.g. `cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*`).

**R6 — Dashboard auth**
WHEN an unauthenticated user visits the dashboard, THE SYSTEM SHALL redirect them to a Clerk-hosted login page. WHEN a user authenticates successfully, THE SYSTEM SHALL redirect them to the (blank) dashboard home route.

**R7 — LangGraph scaffold**
THE SYSTEM SHALL define a shared Pydantic state object representing: cve_id, cvss_score, matched_assets (list), exploit_status, risk_score — importable by all future agent nodes, with no agent logic implemented yet.

---

## 5. Acceptance Criteria per Task

| Task | Acceptance check |
|---|---|
| docker-compose.yml | `docker compose up` exits 0 on all three services; `docker compose ps` shows all three as `running`/`healthy` |
| FastAPI health endpoint | `curl localhost:8000/health` returns `{"status":"ok"}` with 200 |
| Postgres schema | Connecting with any client and running `\dt` shows `cve`, `asset`, `pipeline_state` |
| Redis round-trip | A script pushes `"test-cve-001"`, a second call pops it, values match exactly |
| Seed script | `SELECT COUNT(*) FROM asset;` returns 10; `SELECT DISTINCT zone FROM asset;` returns 3 rows |
| Next.js + Clerk | Visiting `/` while logged out shows Clerk login; logging in reaches a dashboard route without console errors |
| LangGraph state scaffold | State object importable in a Python REPL with no errors; fields match R7 exactly |

**Definition of done for V0:** all 7 checks above pass. At that point, commit to `dev` and stop — do not proceed to Section 6 items until told to.

---

## 6. Out of Scope for Version 0 (do not build these yet)

- Any real NVD/OSV/GitHub API calls (that's A1, next milestone: V1.0)
- Any CPE matching logic (that's A2, V1.0)
- Any Claude API / LLM calls (that's A4, V2.0)
- Any JIRA/Slack/email integration (that's A5, V3.0)
- Any real dashboard data — CVE feed table and risk gauges arrive in V1.0/V2.0

---

## 7. What Comes Next (context only — not to be built now)

After V0 is verified, the next milestone (V1.0, mid-term demo) is: live CVE ingestion (A1) → asset correlation (A2) → basic dashboard CVE feed, demoed by injecting CVE-2021-44228 (Log4Shell) and showing it match the simulated Java server on the dashboard with a risk score, live, timed. When that milestone starts, this file should be updated with a new Section 2 (Current Milestone), Section 4 (Requirements), and Section 5 (Acceptance Criteria) for V1.0 — append rather than overwrite Sections 1 and 3, which stay constant across the whole project.