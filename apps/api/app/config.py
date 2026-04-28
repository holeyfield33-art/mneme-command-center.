import os


class Settings:
    api_host: str = os.getenv("MNEME_API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("MNEME_API_PORT", "8000"))
    database_url: str = os.getenv("MNEME_DATABASE_URL", "sqlite:///./mneme.db")
    secret_key: str = os.getenv("MNEME_SECRET_KEY", "change-me-in-local-env")
    admin_password: str = os.getenv("MNEME_ADMIN_PASSWORD", "admin")
    access_token_minutes: int = int(os.getenv("MNEME_ACCESS_TOKEN_MINUTES", "720"))
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    claude_code_command: str = os.getenv("CLAUDE_CODE_COMMAND", "")
    claude_code_timeout_seconds: int = int(os.getenv("CLAUDE_CODE_TIMEOUT_SECONDS", "900"))
    allow_mock_claude_for_tests: bool = os.getenv("ALLOW_MOCK_CLAUDE_FOR_TESTS", "false").lower() == "true"
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")
    public_dashboard_url: str = os.getenv("PUBLIC_DASHBOARD_URL", "")
    notifications_enabled: bool = os.getenv("NOTIFICATIONS_ENABLED", "false").lower() == "true"


settings = Settings()
