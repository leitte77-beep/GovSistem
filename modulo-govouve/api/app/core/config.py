from typing import List

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "GovOuve API"
    VERSION: str = "0.1.0"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "govouve"
    POSTGRES_USER: str = "govouve_user"
    POSTGRES_PASSWORD: SecretStr = SecretStr("")

    @property
    def DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}"
            f":{self.POSTGRES_PASSWORD.get_secret_value()}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def DATABASE_URL_SYNC(self) -> str:
        return (
            f"postgresql://{self.POSTGRES_USER}"
            f":{self.POSTGRES_PASSWORD.get_secret_value()}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 3

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: SecretStr = SecretStr("")
    MINIO_SECRET_KEY: SecretStr = SecretStr("")
    MINIO_BUCKET: str = "govouve"
    MINIO_SECURE: bool = False

    CORS_ORIGINS: List[str] = [
        "http://localhost:7401",
        "http://localhost:7400",
    ]

    PUBLIC_URL: str = "http://localhost:7400"

    SENTRY_DSN: str | None = None
    ENVIRONMENT: str = "development"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return value
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    SECRET_KEY: SecretStr = SecretStr("")
    SAAS_JWT_SECRET: SecretStr = SecretStr("")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    INTERNAL_API_KEY: SecretStr = SecretStr("")

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 30
    MAX_UPLOAD_SIZE_BYTES: int = 30 * 1024 * 1024
    ALLOWED_EXTENSIONS: list[str] = [
        ".pdf", ".docx", ".xlsx", ".csv",
        ".jpg", ".jpeg", ".png", ".mp4", ".mp3", ".wav",
    ]
    ALLOWED_MIME_TYPES: list[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "image/jpeg",
        "image/png",
        "video/mp4",
        "audio/mpeg",
        "audio/wav",
    ]

    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "uploads"

    NOTIFY_DEADLINE_DAYS: list[int] = [5, 2, 0]

    PRAZO_OUVIDORIA_DIAS: int = 30
    PRAZO_OUVIDORIA_PRORROGACAO_DIAS: int = 30
    PRAZO_LAI_DIAS: int = 20
    PRAZO_LAI_PRORROGACAO_DIAS: int = 10
    PRAZO_SUBSIDIO_DIAS: int = 20
    PRAZO_SUBSIDIO_PRORROGACAO_DIAS: int = 20

    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_MIN_UPPERCASE: int = 1
    PASSWORD_MIN_LOWERCASE: int = 1
    PASSWORD_MIN_DIGITS: int = 1
    PASSWORD_MIN_SYMBOLS: int = 0
    PASSWORD_MAX_FAILURES: int = 5
    PASSWORD_LOCKOUT_MINUTES: int = 30
    PASSWORD_EXPIRE_DAYS: int = 90
    MFA_REQUIRED_ROLES: list[str] = []

    LOG_RETENTION_DAYS: int = 365

    RESERVED_SUBDOMAINS: list[str] = ["admin", "api", "www", "static"]

    @model_validator(mode="after")
    def validate_secrets(self):
        if not self.SECRET_KEY.get_secret_value():
            if self.DEBUG:
                import logging
                import secrets as _secrets
                key = _secrets.token_hex(32)
                logging.getLogger("govouve").warning(
                    "SECRET_KEY not set — generated temporary key for dev. "
                    "Set SECRET_KEY env var for persistence across restarts."
                )
                object.__setattr__(self, "SECRET_KEY", SecretStr(key))
            else:
                raise ValueError("SECRET_KEY must be set in production")
        if not self.POSTGRES_PASSWORD.get_secret_value():
            if self.DEBUG:
                import logging
                logging.getLogger("govouve").warning(
                    "POSTGRES_PASSWORD not set — using default dev password."
                )
                object.__setattr__(self, "POSTGRES_PASSWORD", SecretStr("govouve_password"))
            else:
                raise ValueError("POSTGRES_PASSWORD must be set")
        return self


settings = Settings()
