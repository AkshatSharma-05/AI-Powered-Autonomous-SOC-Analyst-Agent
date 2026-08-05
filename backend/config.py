"""
backend/config.py
─────────────────────────────────────────────────────────────────────────────
Centralised application settings for the SOC Agent system.

All configuration is loaded from environment variables (or a .env file at the
project root). No secrets, hostnames, or magic strings should appear anywhere
else in the codebase — import `get_settings()` and reference an attribute.

Uses pydantic-settings (v2) which:
  • Reads from .env automatically via python-dotenv under the hood
  • Type-validates every variable at startup — bad config fails fast
  • Exposes IDE autocompletion on every setting

Install: pip install pydantic-settings
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, AnyHttpUrl, RedisDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application-wide settings.  One instance is created at startup and cached
    via `get_settings()`.  Every field maps 1-to-1 with a .env variable (case-
    insensitive).  Fields without defaults are *required* — the app will refuse
    to start if they are missing.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,   # DATABASE_URL == database_url
        extra="ignore",         # silently drop unknown env vars
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Application
    # ─────────────────────────────────────────────────────────────────────────

    app_name: str = Field(default="SOC Agent", description="Human-readable app name")
    app_version: str = Field(default="0.1.0", description="Semantic version string")
    environment: Literal["development", "staging", "production"] = Field(
        default="development",
        description="Runtime environment — controls logging verbosity and debug mode",
    )
    debug: bool = Field(
        default=False,
        description="Enable FastAPI debug mode; never True in production",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # PostgreSQL (asyncpg driver)
    # ─────────────────────────────────────────────────────────────────────────
    # The URL *must* use the postgresql+asyncpg:// scheme for SQLAlchemy 2.0
    # async mode.  A plain postgresql:// URL will raise a driver error at
    # connection time.  Example:
    #   DATABASE_URL=postgresql+asyncpg://soc_user:secret@localhost:5432/soc_db

    database_url: str = Field(
        ...,
        description=(
            "Async PostgreSQL DSN using asyncpg driver.  "
            "Scheme must be 'postgresql+asyncpg://'"
        ),
    )
    db_pool_size: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Number of persistent connections in the SQLAlchemy pool",
    )
    db_max_overflow: int = Field(
        default=20,
        ge=0,
        le=100,
        description="Extra connections allowed above pool_size under peak load",
    )
    db_pool_timeout: int = Field(
        default=30,
        ge=5,
        description="Seconds to wait for a free connection before raising TimeoutError",
    )
    db_echo_sql: bool = Field(
        default=False,
        description="Log every SQL statement — only enable during local debugging",
    )

    @field_validator("database_url")
    @classmethod
    def validate_async_driver(cls, v: str) -> str:
        """Enforce postgresql+asyncpg:// scheme to catch misconfiguration early."""
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must use the 'postgresql+asyncpg://' scheme for "
                "SQLAlchemy async mode.  Got: " + v
            )
        return v

    # ─────────────────────────────────────────────────────────────────────────
    # Redis 7
    # ─────────────────────────────────────────────────────────────────────────

    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL.  Example: redis://localhost:6379/0",
    )

    # Queue / key names — centralised here so every agent uses the same string
    redis_cve_queue_name: str = Field(
        default="cve_pipeline_queue",
        description="Redis list name; A1 LPUSHes CVE UUIDs, worker BRPOPs them",
    )
    redis_last_poll_key_nvd: str = Field(
        default="a1:last_poll:nvd",
        description="Redis key storing the ISO-8601 timestamp of A1's last NVD poll",
    )
    redis_last_poll_key_osv: str = Field(
        default="a1:last_poll:osv",
        description="Redis key storing the ISO-8601 timestamp of A1's last OSV poll",
    )
    redis_last_poll_key_github: str = Field(
        default="a1:last_poll:github_advisory",
        description="Redis key storing the ISO-8601 timestamp of A1's last GitHub Advisory poll",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # NVD API v2  (https://nvd.nist.gov/developers/vulnerabilities)
    # ─────────────────────────────────────────────────────────────────────────
    # Without an API key: 5 req / 30 s rolling window.
    # With an API key  : 50 req / 30 s rolling window.
    # Strongly recommended to register at https://nvd.nist.gov/developers/request-an-api-key

    nvd_api_base_url: str = Field(
        default="https://services.nvd.nist.gov/rest/json/cves/2.0",
        description="NVD API v2 CVE endpoint",
    )
    nvd_api_key: str | None = Field(
        default=None,
        description=(
            "NVD API key.  Optional but strongly recommended — "
            "raises rate limit from 5 to 50 req/30 s"
        ),
    )
    nvd_results_per_page: int = Field(
        default=100,
        ge=1,
        le=2000,
        description="resultsPerPage param for NVD pagination (max 2000 per NVD docs)",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # OSV.dev API  (https://osv.dev/docs/)
    # ─────────────────────────────────────────────────────────────────────────
    # NOTE: OSV /v1/query is package-scoped, not a time-based CVE feed.
    # The strategy for how A1 uses OSV must be confirmed before nvd_client.py
    # is written.  See pre-flight questions in the brief acknowledgement.

    osv_api_base_url: str = Field(
        default="https://api.osv.dev/v1",
        description="OSV.dev REST API base URL",
    )
    osv_bulk_download_url: str = Field(
        default="https://osv-vulnerabilities.storage.googleapis.com",
        description=(
            "OSV GCS bucket base URL for bulk ecosystem downloads.  "
            "Used as fallback if the /v1/query approach is not viable for time-based polling"
        ),
    )

    # ─────────────────────────────────────────────────────────────────────────
    # GitHub  (Advisory + Code Search)
    # ─────────────────────────────────────────────────────────────────────────

    github_token: str | None = Field(
        default=None,
        description=(
            "GitHub Personal Access Token.  Required for Advisory GraphQL API "
            "(read:packages, read:org scopes) and Code Search API (A3).  "
            "Generate at https://github.com/settings/tokens"
        ),
    )
    github_graphql_url: str = Field(
        default="https://api.github.com/graphql",
        description="GitHub GraphQL v4 API endpoint",
    )
    github_rest_api_url: str = Field(
        default="https://api.github.com",
        description="GitHub REST API v3 base URL (for Code Search in A3)",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # CISA Known Exploited Vulnerabilities (KEV) feed
    # ─────────────────────────────────────────────────────────────────────────
    # Used by Agent A3 (Exploit Intelligence), not A1.  Centralised here so
    # the URL is never hardcoded inside a service client.

    cisa_kev_url: str = Field(
        default=(
            "https://www.cisa.gov/sites/default/files/feeds/"
            "known_exploited_vulnerabilities.json"
        ),
        description="CISA KEV JSON feed URL — polled by A3, not A1",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Exploit-DB / GitHub Code Search  (Agent A3)
    # ─────────────────────────────────────────────────────────────────────────

    exploitdb_csv_url: str = Field(
        default="https://gitlab.com/exploit-database/exploitdb/-/raw/main/files_exploits.csv",
        description="Exploit-DB CSV manifest URL — used by A3",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # APScheduler
    # ─────────────────────────────────────────────────────────────────────────

    scheduler_poll_interval_minutes: int = Field(
        default=15,
        ge=1,
        description="How often A1 polls NVD / OSV / GitHub Advisory for new CVEs",
    )
    scheduler_timezone: str = Field(
        default="UTC",
        description="Timezone for the APScheduler — always UTC in production",
    )
    scheduler_max_instances: int = Field(
        default=1,
        description=(
            "Max concurrent instances of the ingestion job.  "
            "Keep at 1 to avoid duplicate writes during overlapping polls"
        ),
    )

    # ─────────────────────────────────────────────────────────────────────────
    # HTTP / Resilience
    # ─────────────────────────────────────────────────────────────────────────

    http_timeout_seconds: float = Field(
        default=30.0,
        gt=0,
        description="Default httpx request timeout in seconds",
    )
    max_retry_attempts: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum retry attempts for external API calls before giving up",
    )
    retry_base_delay_seconds: float = Field(
        default=1.0,
        gt=0,
        description="Initial backoff delay for exponential retry (seconds)",
    )
    retry_max_delay_seconds: float = Field(
        default=60.0,
        gt=0,
        description="Maximum backoff delay cap for exponential retry (seconds)",
    )
    retry_jitter_factor: float = Field(
        default=0.25,
        ge=0.0,
        le=1.0,
        description=(
            "Jitter as a fraction of computed delay.  "
            "0.25 means ±25 % random noise added to avoid thundering herd"
        ),
    )

    # ─────────────────────────────────────────────────────────────────────────
    # API / Pagination defaults
    # ─────────────────────────────────────────────────────────────────────────

    default_page_size: int = Field(
        default=50,
        ge=1,
        le=500,
        description="Default number of results returned by paginated GET endpoints",
    )
    max_page_size: int = Field(
        default=200,
        ge=1,
        le=1000,
        description="Hard ceiling on page_size query param — prevents abuse",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # CORS  (Member 3 — Next.js frontend)
    # ─────────────────────────────────────────────────────────────────────────

    cors_origins: list[str] = Field(
        default=["http://localhost:3000"],
        description=(
            "Allowed CORS origins.  In production, replace with the deployed "
            "Next.js URL.  JSON array syntax in .env: "
            '\'["https://soc.example.com"]\''
        ),
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Anthropic / Claude  (Member 2 — A4 Remediation Planner)
    # ─────────────────────────────────────────────────────────────────────────

    anthropic_api_key: str | None = Field(
        default=None,
        description="Anthropic API key for Claude — used by A4 (Member 2)",
    )
    anthropic_model: str = Field(
        default="claude-sonnet-4-6",
        description="Claude model identifier for the remediation planner",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # JIRA  (Member 3 — A5 Reporter)
    # ─────────────────────────────────────────────────────────────────────────

    jira_base_url: str | None = Field(
        default=None,
        description="JIRA instance base URL, e.g. https://your-org.atlassian.net",
    )
    jira_user_email: str | None = Field(
        default=None,
        description="Email address associated with the JIRA API token",
    )
    jira_api_token: str | None = Field(
        default=None,
        description="JIRA API token (not password) — generate in Atlassian account settings",
    )
    jira_project_key: str | None = Field(
        default=None,
        description="JIRA project key where CVE tickets will be created, e.g. 'SOC'",
    )
    jira_issue_type: str = Field(
        default="Bug",
        description="JIRA issue type for CVE tickets",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Slack  (Member 3 — A5 Reporter)
    # ─────────────────────────────────────────────────────────────────────────

    slack_webhook_url: str | None = Field(
        default=None,
        description="Slack Incoming Webhook URL for CVE alert notifications",
    )
    slack_alert_channel: str = Field(
        default="#security-alerts",
        description="Slack channel name shown in alert payloads (informational only)",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Email / SMTP  (Member 3 — A5 Reporter)
    # ─────────────────────────────────────────────────────────────────────────

    smtp_host: str | None = Field(
        default=None,
        description="SMTP server hostname, e.g. smtp.gmail.com",
    )
    smtp_port: int = Field(
        default=587,
        description="SMTP port — 587 for STARTTLS, 465 for SSL",
    )
    smtp_use_tls: bool = Field(
        default=True,
        description="Use STARTTLS when connecting to the SMTP server",
    )
    smtp_username: str | None = Field(
        default=None,
        description="SMTP authentication username",
    )
    smtp_password: str | None = Field(
        default=None,
        description="SMTP authentication password or app-specific password",
    )
    smtp_from_address: str | None = Field(
        default=None,
        description="From address used in outbound CVE alert emails",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Singleton accessor
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the application settings singleton.

    Uses functools.lru_cache so the .env file is parsed exactly once at
    startup.  In tests, call `get_settings.cache_clear()` before patching
    environment variables to force a reload.

    Usage
    -----
    from backend.config import get_settings

    settings = get_settings()
    print(settings.database_url)
    """
    return Settings()
