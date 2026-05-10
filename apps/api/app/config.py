import os


class Settings:
    api_host: str = os.getenv("MNEME_API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("MNEME_API_PORT", "8000"))
    database_url: str = os.getenv("MNEME_DATABASE_URL", "sqlite:///./mneme.db")
    secret_key: str = os.getenv("MNEME_SECRET_KEY", "change-me-in-local-env")
    admin_password: str = os.getenv("MNEME_ADMIN_PASSWORD", "admin")
    access_token_minutes: int = int(os.getenv("MNEME_ACCESS_TOKEN_MINUTES", "720"))

    # ── AI provider (anthropic | openai | google | ollama) ──────────────────
    model_provider: str = os.getenv("MODEL_PROVIDER", "anthropic")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-5")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    google_api_key: str = os.getenv("GOOGLE_API_KEY", "")
    google_model: str = os.getenv("GOOGLE_MODEL", "gemini-2.5-pro")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.1")

    # ── Legacy Claude CLI (still supported as fallback) ──────────────────────
    claude_code_command: str = os.getenv("CLAUDE_CODE_COMMAND", "")
    claude_code_timeout_seconds: int = int(os.getenv("CLAUDE_CODE_TIMEOUT_SECONDS", "900"))
    claude_code_max_retries: int = int(os.getenv("CLAUDE_CODE_MAX_RETRIES", "1"))
    claude_code_retry_delay_seconds: int = int(os.getenv("CLAUDE_CODE_RETRY_DELAY_SECONDS", "3"))
    claude_artifact_dir: str = os.getenv("CLAUDE_ARTIFACT_DIR", "")
    allow_mock_claude_for_tests: bool = os.getenv("ALLOW_MOCK_CLAUDE_FOR_TESTS", "false").lower() == "true"

    # ── Agent loop ────────────────────────────────────────────────────────────
    agent_max_iterations: int = int(os.getenv("AGENT_MAX_ITERATIONS", "30"))

    # ── GitHub ────────────────────────────────────────────────────────────────
    github_token: str = os.getenv("GITHUB_TOKEN", "")
    github_workspace_dir: str = os.getenv("GITHUB_WORKSPACE_DIR", "")

    # ── Notifications ─────────────────────────────────────────────────────────
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")
    public_dashboard_url: str = os.getenv("PUBLIC_DASHBOARD_URL", "")
    notifications_enabled: bool = os.getenv("NOTIFICATIONS_ENABLED", "false").lower() == "true"


settings = Settings()
