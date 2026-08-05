# ─────────────────────────────────────────────────────────────────────────────
# SOC Agent — Backend Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build:
#   Stage 1 (deps)  — install Python dependencies into /install
#   Stage 2 (final) — copy /install + source, run uvicorn
#
# This keeps the final image lean by excluding build tools (gcc, pip, etc.)
# that are only needed during the install phase.
#
# Build:  docker build -t soc-backend .
# Run:    docker run -p 8000:8000 --env-file .env soc-backend
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependency installation ─────────────────────────────────────────
FROM python:3.12-slim AS deps

WORKDIR /install

# Install system packages needed to compile asyncpg and cryptography C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first — Docker layer cache means this layer is only
# rebuilt when requirements.txt changes, not when source code changes.
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: final runtime image ──────────────────────────────────────────────
FROM python:3.12-slim AS final

# Non-root user for security — never run as root in production
RUN useradd --create-home --shell /bin/bash socagent

WORKDIR /app

# Copy installed packages from the deps stage
COPY --from=deps /install /usr/local

# Copy application source code
COPY backend/ ./backend/
COPY migrations/ ./migrations/
COPY alembic.ini .
COPY scripts/ ./scripts/

# Switch to non-root user
USER socagent

# Expose the FastAPI port
EXPOSE 8000

# Health check — Docker will mark the container unhealthy if /health fails
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" \
    || exit 1

# Start uvicorn — host 0.0.0.0 required to accept connections from Docker network
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
