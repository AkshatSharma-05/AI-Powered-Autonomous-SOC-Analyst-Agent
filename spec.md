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
4. If relevant, an LLM (Claude Sonnet 4.6 / Gemini) reasons over all this context and generates a structured, validated remediation plan (patch order, workarounds, rollback steps, downtime estimate).
5. A human analyst approves/rejects high-impact actions via a dashboard (LangGraph interrupt checkpoint, 4-hour auto-escalation timeout).
6. On approval, the system auto-creates a JIRA ticket, sends Slack/email alerts, and later produces weekly executive PDF reports.

### System Architecture — Five Agents

| Agent | Name | Responsibility | Status |
|---|---|---|---|
| **A1** | CVE Ingestion | Poll NVD API v2, OSV.dev, GitHub Advisory DB every 15 min. Dedup by CVE ID. Normalize to STIX 2.1. Push to Redis queue. Retry + exponential backoff on failures. | ✅ **COMPLETED (V1.0)** |
| **A2** | Asset Correlator | Match incoming CVEs against a live infra inventory. Exact match via CPE 2.3 URI against NVD dictionary; fallback fuzzy match via Jaccard coefficient (threshold 0.80) on vendor/product/version tokens. Log unresolved matches for manual review (never silently discard). Apply exposure scoring (3× multiplier for internet-facing assets). This step discards ~80–90% of CVEs before the LLM ever runs. | ✅ **COMPLETED (V1.0)** |
| **A3** | Exploit Intelligence | Query CISA KEV, Exploit-DB, GitHub Code Search API (for PoC commits by CVE ID). Output status: `None` / `PoC Exists` / `Weaponised` / `Actively Exploited`. Compute composite risk score: `CVSS base score × exposure multiplier × exploit factor`. | ✅ **COMPLETED (V1.0)** |
| **A4** | Remediation Planner | The system's reasoning agent — a LangGraph ReAct node. Builds a structured prompt from A1–A3 context, calls LLM, gets back a structured JSON patch plan, validates it against a Pydantic schema. Implements a LangGraph interrupt checkpoint before any production-affecting action. Stores full reasoning trace. | ⏳ **ACTIVE MILESTONE (V2.0)** |
| **A5** | Auto-Reporter | JIRA REST API ticket creation, Slack webhook alerts, SMTP email, weekly executive PDF (ReportLab), STIX/TAXII 2.1 export for SIEM integration. | 🔮 **UPCOMING (V3.0)** |

**Composite risk scoring formula:** `CVSS base score × exposure multiplier × exploit factor`

**Orchestration:** LangGraph — stateful multi-agent graph, conditional edges, interrupt/resume logic for human-in-the-loop approval.

### Tech Stack

- **Backend:** Python 3.12, FastAPI (REST + WebSocket server)
- **Orchestration:** LangGraph, APScheduler (polling jobs & background queues)
- **LLM Engine:** Claude Sonnet 4.6 / Gemini API — structured JSON outputs validated with Pydantic
- **Database & Queue:** PostgreSQL (JSONB STIX storage), Redis 7 (LPUSH/BRPOP queue & cursor tracking)
- **Frontend:** Next.js 16 (App Router + Turbopack), Clerk for auth, WebSockets for live feed, Tailwind CSS
- **Infra:** Docker Compose (all services containerized), Alembic migrations
- **Data formats:** STIX 2.1 (normalization), STIX/TAXII 2.1 (export)

---

## 2. Current Milestone

**Version 2.0 — LLM Remediation Planner (Agent A4) & Human Approval Checkpoint.**

> **V0 (Skeleton)** and **V1.0 (Live CVE Ingestion, Asset Correlation & Exploit Intelligence)** are fully completed, verified, and merged into `main`.

**V2.0 Goal:** An ingested CVE with `risk_score > 15` is automatically processed by Agent A4 (LLM Planner), generating a structured patch plan with rollback steps and downtime estimates. High-impact plans enter a LangGraph `interrupt` checkpoint requiring human approval on the dashboard before execution/reporting.

---

## 3. Constitution (non-negotiable constraints — apply to every task)

- Tech stack is fixed as specified in Section 1. No substitutions.
- Every service runs in a container from the start.
- Secrets never get hardcoded or committed. `.env` is in `.gitignore`.
- Code must be commented — this project is evaluated on code quality and feeds a research paper.
- Don't build ahead of the current milestone's scope (see Section 6, Out of Scope).
- Verify every task against Section 5's acceptance checks before declaring completion.

---

## 4. System Requirements

### Version 0 — Infrastructure Skeleton (COMPLETED ✅)

- **R1 — Environment startup:** `docker compose up` starts backend, PostgreSQL, and Redis as healthy within 30s.
- **R2 — Health check:** `GET /health` returns HTTP 200 `{"status": "ok"}`.
- **R3 — Schema availability:** PostgreSQL creates `cve`, `asset`, and `pipeline_state` tables automatically.
- **R4 — Queue round-trip:** Producer/consumer round-trip connectivity verified on Redis queue.
- **R5 — Seeded inventory:** `seed_assets.py` inserts 10 assets across 3 distinct zones with valid CPE 2.3 URIs.
- **R6 — Dashboard auth:** Clerk auth integration routes unauthenticated users to login.
- **R7 — LangGraph scaffold:** Shared Pydantic state schema created.

---

### Version 1.0 — Ingestion, Correlation, Exploit Intel & Realtime Dashboard (COMPLETED ✅)

- **R8 — NVD API v2 poller (`nvd_client.py`):** Incremental poll using `lastModStartDate`/`lastModEndDate` with cursor stored in Redis (`poll:last:nvd`). Paginates 100/page with mandatory 6s inter-page rate limit.
- **R9 — OSV + GitHub Advisory pollers:** Package-scoped OSV lookups per asset CPE (`osv_client.py`) and GraphQL GitHub Advisory poll (`github_advisory_client.py`).
- **R10 — Resilient HTTP client (`http_client.py`):** Exponential backoff + full jitter, 5 retries on 429/5xx, timeout handling.
- **R11 — STIX 2.1 normalisation (`stix_normaliser.py`):** Vulnerability SDOs (deterministic `uuid5(NAMESPACE, cve_id)`) + Software SCOs stored in `cve.stix_data` (JSONB).
- **R12 — Redis pipeline queue (`redis_client.py`):** `LPUSH` on ingestion, `BRPOP` consumer loop in `pipeline.py`.
- **R13 — Exact CPE match (`correlator.py`):** `vendor:product` exact matching between CVE CPE URIs and asset CPE strings.
- **R14 — Fuzzy CPE match (`cpe_utils.py`):** Tokenized Jaccard similarity ($J(A, B) \ge 0.80$) fallback for non-exact matches.
- **R15 — Skip no-match CVEs:** Unmatched CVEs marked `skipped` in `pipeline_state` to optimize downstream resources.
- **R16 — Exposure multiplier:** 3.0× multiplier for DMZ/Cloud internet-facing assets (`is_internet_facing = true`), 1.0× for internal assets.
- **R17 — GET /cves endpoint (`cve_router.py`):** Paginated, ordered by `published_date DESC`, filterable by `exploit_status` and `min_cvss`.
- **R18 — GET /cves/{cve_id}/matches endpoint (`cve_router.py`):** Returns matched assets with zone, match type, exposure multiplier, and IP.
- **R19 — WebSocket live push (`ws_manager.py` / `ws_router.py`):** `WS /ws/cves` broadcasts `cve_processed` events to connected dashboard clients.
- **R20 — Dashboard rendering (`page.tsx`):** Next.js 16 dashboard table with live auto-prepend, stats bar, filter tabs, and slide-out asset panel.
- **R21 — Benchmark demo & Manual CVE Injection (`POST /pipeline/inject/{cve_id}`):** Single-item NVD lookup by ID without time-window restrictions. Injected Log4Shell (`CVE-2021-44228`) matched `app-server-01` (DMZ, 3.0×), tagged `Actively Exploited` (KEV 2.0×), computed risk score `60.0`, and broadcasted via WebSockets in ~5 seconds (< 30s spec limit).
- **R22 — CISA KEV integration (`kev_client.py`):** In-memory catalog of 1,661+ entries, 1h cache, O(1) membership check.
- **R23 — Exploit-DB search (`exploitdb_client.py`):** Full offline search across 47,100+ exploits via 6h cached CSV data.
- **R24 — GitHub PoC search (`github_poc_client.py`):** GitHub Code Search for public proof-of-concept repositories with recency evaluation.
- **R25 — 4-Tier exploit classification & risk formula:** Tiers: `Actively Exploited` (2.0×), `Weaponised` (1.5×), `PoC Exists` (1.2×), `None` (1.0×). Formula: $\text{CVSS} \times \text{Exposure} \times \text{Exploit Factor}$.
- **R26 — Exploit status dashboard components:** `ExploitBadge.tsx` (4-tier color pills), `RiskScore.tsx` (score bar), `AssetPanel.tsx` (slide-out panel).

---

### Version 2.0 — Remediation Planner & Approval Checkpoint (ACTIVE ⏳)

- **R27 — Agent A4 LLM Remediation Planner:** Evaluates high-risk correlated CVEs (`risk_score > 15`) using LLM (Claude Sonnet 4.6 / Gemini) with structured Pydantic schema outputs.
- **R28 — Remediation Plan Schema:** Includes patch version recommendation, step-by-step mitigation, CLI/Ansible commands, rollback steps, downtime estimate (minutes), and impact assessment.
- **R29 — LangGraph Interrupt Checkpoint:** Pauses state execution before high-risk remediation actions, routing the plan to a human approval queue.
- **R30 — Dashboard Approvals UI:** Next.js dashboard tab for SOC analysts to review, approve, reject, or comment on pending remediation plans.
- **R31 — Audit Log & State Persistence:** Complete reasoning traces, model parameters, and approval decisions stored in `pipeline_state` for regulatory compliance.

---

## 5. Acceptance Criteria & Status

| Task / Feature | Acceptance Check | Status |
|---|---|---|
| Infrastructure Docker | `docker compose up` starts Postgres, Redis, Backend, Frontend healthy | ✅ PASS |
| DB Schema & Migrations | Migration `002_add_v1_schema.py` creates `cve`, `asset`, `pipeline_state`, `cve_asset_match` | ✅ PASS |
| Asset Seed Inventory | 10 assets seeded across 3 zones (`dmz`, `cloud`, `internal`) with CPE 2.3 URIs | ✅ PASS |
| A1 Ingestion Pipeline | Multi-source poll (NVD, OSV, GitHub Advisory) produces STIX 2.1 JSONB in DB | ✅ PASS |
| A2 Asset Correlator | Exact CPE match + Jaccard fuzzy ($\ge 0.80$) attaches assets with 3.0× / 1.0× multipliers | ✅ PASS |
| A3 Exploit Intelligence | CISA KEV (1,661 entries) + Exploit-DB (47k entries) + GitHub PoC tag 4 tiers & score risk | ✅ PASS |
| REST & WS API | `GET /cves`, `GET /cves/{id}/matches`, `POST /pipeline/inject/{cve_id}`, `WS /ws/cves` operational | ✅ PASS |
| Dashboard Frontend | Next.js 16 dashboard renders live table, risk progress bars, filters, and slide-out asset panel | ✅ PASS |
| R21 Demo Checkpoint | Log4Shell (`CVE-2021-44228`) injected $\rightarrow$ `app-server-01`, `Actively Exploited`, risk `60.0` in ~5s | ✅ PASS |
| A4 Remediation Planner | LLM produces validated remediation plan JSON for high-risk CVEs | ⏳ IN PROGRESS |
| LangGraph Interrupt | State pauses before action; approval UI renders pending plans | ⏳ IN PROGRESS |

---

## 6. Out of Scope for Version 2.0 (Deferred to V3.0)

- Automated JIRA ticket generation (A5)
- Slack webhook alert notifications & email dispatch (A5)
- Executive PDF report generation via ReportLab (A5)
- External TAXII 2.1 server feed publishing (A5)

---

## 7. What Comes Next (V3.0 Preview)

After Version 2.0 (LLM Planning & Approvals) is completed and verified, **Version 3.0 (Full Integrations & Executive Reporting)** will introduce Agent A5 to execute approved remediation actions, open JIRA tickets, trigger Slack notifications, and compile weekly PDF executive reports for CISOs.