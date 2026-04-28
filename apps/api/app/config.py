import os


class Settings:
    api_host: str = os.getenv("MNEME_API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("MNEME_API_PORT", "8000"))
    database_url: str = os.getenv("MNEME_DATABASE_URL", "sqlite:///./mneme.db")
    secret_key: str = os.getenv("MNEME_SECRET_KEY", "change-me-in-local-env")
    admin_password: str = os.getenv("MNEME_ADMIN_PASSWORD", "admin")
    access_token_minutes: int = int(os.getenv("MNEME_ACCESS_TOKEN_MINUTES", "720"))


settings = Settings()
