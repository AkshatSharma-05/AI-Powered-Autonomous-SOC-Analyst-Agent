# SOC Agent — Team Setup Guide

Every team member follows this guide exactly once after cloning the repo.
Estimated time: **10–15 minutes**.

---

## Prerequisites

Install these once on your machine:

| Tool | Version | Download |
|---|---|---|
| Docker Desktop | Latest | https://www.docker.com/products/docker-desktop/ |
| Python | **3.12.x exactly** | https://www.python.org/downloads/ |
| Git | Any | https://git-scm.com/ |

> **Python version matters.** The repo contains a `.python-version` file pinned to `3.12`.
> If you use `pyenv`, it will automatically switch to the correct version when you `cd` into the project.
> Verify your version with: `python --version` — it must start with `3.12`.

Verify Docker is running before continuing:
```bash
docker info   # should print engine details, not an error
```

---

## Step 1 — Clone the repo

> **Before sharing this file: replace the URL below with your actual GitHub repo link.**

```bash
git clone https://github.com/YOUR-ORG/soc-agent.git
cd soc-agent
```

---

## Step 2 — Create your .env file

```bash
cp .env.example .env
```

Open `.env` and change **at minimum** these two passwords (use the same values across your team — share them privately, never via Git):

```
POSTGRES_PASSWORD=your_shared_team_password
REDIS_PASSWORD=your_shared_team_password
```

Then update the connection strings to match:
```
DATABASE_URL=postgresql+asyncpg://soc_user:your_shared_team_password@localhost:5432/soc_db
REDIS_URL=redis://:your_shared_team_password@localhost:6379/0
```

Add your personal API keys:
```
GITHUB_TOKEN=ghp_your_personal_token    # required — see below
NVD_API_KEY=your_nvd_key                # optional but recommended
```

**Getting a GitHub token:**
1. Go to https://github.com/settings/tokens → Generate new token (classic)
2. Select scopes: `read:packages`, `read:org`, `public_repo`
3. Paste the token into `GITHUB_TOKEN` in your `.env`

---

## Step 3 — Start the infrastructure containers

```bash
docker compose up -d
```

This starts PostgreSQL 16 and Redis 7 in the background.

Verify both are healthy:
```bash
docker compose ps
```
Both services should show `healthy` in the Status column. If they show `starting`, wait 10 seconds and run `ps` again.

---

## Step 4 — Create your Python virtual environment

```bash
python -m venv .venv

# Mac / Linux:
source .venv/bin/activate

# Windows (PowerShell):
.venv\Scripts\Activate.ps1

# Windows (CMD):
.venv\Scripts\activate.bat
```

Your terminal prompt should now show `(.venv)`.

---

## Step 5 — Install Python dependencies

```bash
pip install -r requirements.txt
```

---

## Step 6 — Run database migrations

This creates all 9 tables in PostgreSQL:

```bash
alembic upgrade head
```

Expected output ends with something like:
```
INFO  [alembic.runtime.migration] Running upgrade -> 001, initial schema
```

> **⚠️ This step requires `migrations/versions/001_initial_schema.py` to be committed.**
> Member 1 (Pipeline Engineer) is building this now. Until it is merged into `main`,
> this step will print `No new upgrade operations to perform` — that is expected.
> Pull the latest code (`git pull`) and re-run once Member 1 confirms the migration is ready.

Verify the tables exist:
```bash
docker exec -it soc_postgres psql -U soc_user -d soc_db -c "\dt"
```

---

## Step 7 — Start the API server

```bash
uvicorn backend.main:app --reload
```

Visit http://localhost:8000/docs — you should see the FastAPI Swagger UI.

> **⚠️ This step requires `backend/main.py` to be committed.**
> Member 1 is building this alongside the database layer. Until it is merged into `main`,
> this command will fail with `ModuleNotFoundError` — that is expected.
> Pull the latest code and re-run once Member 1 confirms `main.py` is ready.

---

## Optional: Browser UIs for inspecting data

Start pgAdmin (PostgreSQL browser) and Redis Commander with:
```bash
docker compose --profile tools up -d
```

| Tool | URL | Credentials |
|---|---|---|
| pgAdmin | http://localhost:5050 | See `PGADMIN_EMAIL` / `PGADMIN_PASSWORD` in your `.env` |
| Redis Commander | http://localhost:8081 | No login required |

To connect pgAdmin to the database:
1. Open http://localhost:5050
2. Right-click Servers → Register → Server
3. Name: `SOC Local`
4. Connection tab: Host = `postgres`, Port = `5432`, Username/Password from your `.env`

> **Note:** Inside Docker, use hostname `postgres` (the service name), not `localhost`.

---

## Git branching rules

We use a simple feature-branch workflow. **Never push directly to `main`.**

```
main          ← stable, always working, protected
├── feature/member1/a1-ingestion
├── feature/member2/a2-correlator
└── feature/member3/a5-reporter
```

**Rules:**
1. Always branch off the latest `main` before starting new work:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/member1/your-feature-name
   ```
2. Push your branch and open a Pull Request when your file is ready for review:
   ```bash
   git add .
   git commit -m "feat(a1): add NVD polling client"
   git push origin feature/member1/your-feature-name
   ```
3. At least one other team member must review the PR before it is merged.
4. After merging, always run `git pull` and `alembic upgrade head` on your local machine to pick up any new migrations.
5. Never commit `.env` — if you accidentally do, tell the team immediately so passwords can be rotated.

**Commit message format:**
```
feat(scope): short description       ← new feature
fix(scope): short description        ← bug fix
chore(scope): short description      ← config, deps, tooling
docs(scope): short description       ← documentation only
```
Scope examples: `a1`, `a2`, `a3`, `a4`, `a5`, `db`, `config`, `scheduler`

---

## Daily workflow

```bash
# Start infrastructure (if not already running)
docker compose up -d

# Activate venv
source .venv/bin/activate      # Mac/Linux
.venv\Scripts\activate         # Windows

# Pull latest code and apply any new migrations
git pull
alembic upgrade head

# Start the API
uvicorn backend.main:app --reload

# When done for the day — stop containers to free memory
docker compose stop
```

---

## Useful commands

```bash
# View logs from PostgreSQL or Redis
docker compose logs postgres
docker compose logs redis

# Open a psql shell
docker exec -it soc_postgres psql -U soc_user -d soc_db

# Open a Redis CLI shell
docker exec -it soc_redis redis-cli -a your_redis_password

# Check what's in the CVE pipeline queue
docker exec -it soc_redis redis-cli -a your_redis_password LRANGE cve_pipeline_queue 0 -1

# Wipe ALL data and start fresh (destructive!)
docker compose down -v
alembic upgrade head

# Pull latest code and apply new migrations
git pull
alembic upgrade head

# List all branches
git branch -a

# See what files you have changed locally
git status

# Discard all local changes and reset to last commit (destructive!)
git checkout -- .
```

---

## Troubleshooting

**Port already in use:**
Change `POSTGRES_PORT` or `REDIS_PORT` in your `.env` (e.g. to `5433` or `6380`) and restart the containers:
```bash
docker compose down
docker compose up -d
```

**`alembic: command not found`:**
Your venv is not activated. Run `source .venv/bin/activate` first, then retry.

**`asyncpg: cannot connect` / `Connection refused`:**
The Docker containers are not running or not yet healthy.
```bash
docker compose ps          # check status
docker compose up -d       # start if stopped
docker compose logs postgres  # check for errors
```
Also confirm your `DATABASE_URL` password matches `POSTGRES_PASSWORD` in `.env`.

**`redis.exceptions.AuthenticationError`:**
The password in `REDIS_URL` does not match `REDIS_PASSWORD`. They must be identical in your `.env`.

**`ModuleNotFoundError: No module named 'backend'`:**
Run uvicorn from the project root (`soc-agent/`), not from inside the `backend/` folder:
```bash
cd soc-agent        # make sure you are here
uvicorn backend.main:app --reload
```

**`pip install` fails on `asyncpg` / `cryptography`:**
These packages compile C extensions. You may need build tools:
- **Mac:** `xcode-select --install`
- **Ubuntu/Debian:** `sudo apt install python3-dev build-essential libssl-dev`
- **Windows:** Install [Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

**Merge conflict on `alembic/versions/`:**
Do not resolve migration conflicts manually — call Member 1 immediately. Migration files must be applied in the correct order or the schema will be corrupted.
