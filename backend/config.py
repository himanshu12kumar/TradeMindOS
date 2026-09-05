from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./trademind.db"
    SECRET_KEY: str = "changeme-use-a-strong-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # ── Email Digest Settings ───────────────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""           # your.email@gmail.com
    SMTP_PASSWORD: str = ""       # Gmail App Password
    FROM_EMAIL: str = ""          # same as SMTP_USER usually
    FROM_NAME: str = "TradeMind OS"
    # ── AI Coach Settings ──────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
