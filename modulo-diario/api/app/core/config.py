from typing import List

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "DOE API"
    VERSION: str = "0.1.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "doe"
    POSTGRES_USER: str = "doe_user"
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
    REDIS_DB: int = 0

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: SecretStr = SecretStr("")
    MINIO_SECRET_KEY: SecretStr = SecretStr("")
    MINIO_BUCKET: str = "doe-publicacoes"
    MINIO_SECURE: bool = False

    CORS_ORIGINS: List[str] = [
        "http://localhost:7201",
        "http://localhost:7200",
    ]

    PUBLIC_URL: str = "http://localhost:7200"

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
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    SIGNER_URL: str = "http://signer:8100"
    INTERNAL_API_KEY: SecretStr = SecretStr("")

    CLAMAV_HOST: str = ""
    CLAMAV_PORT: int = 3310

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024
    ALLOWED_EXTENSIONS: list[str] = [
        ".docx", ".xlsx", ".csv", ".pdf",
    ]
    ALLOWED_MIME_TYPES: list[str] = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "text/plain",
        "application/pdf",
    ]

    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "uploads"
    STORAGE_TENANT_ISOLATION: bool = True

    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_MIN_UPPERCASE: int = 1
    PASSWORD_MIN_LOWERCASE: int = 1
    PASSWORD_MIN_DIGITS: int = 1
    PASSWORD_MIN_SYMBOLS: int = 0
    PASSWORD_MAX_FAILURES: int = 5
    PASSWORD_LOCKOUT_MINUTES: int = 30
    PASSWORD_EXPIRE_DAYS: int = 90
    MFA_REQUIRED_ROLES: list[str] = ["ASSINADOR", "ADMIN"]

    LOG_RETENTION_DAYS: int = 365
    BACKUP_ENCRYPTED_DIR: str = "backups/encrypted"

    @model_validator(mode="after")
    def validate_secrets(self):
        if not self.SECRET_KEY.get_secret_value():
            if self.DEBUG:
                import logging
                import secrets as _secrets
                key = _secrets.token_hex(32)
                logging.getLogger("doe").warning(
                    "SECRET_KEY not set — generated temporary key for dev. "
                    "Set SECRET_KEY env var for persistence across restarts."
                )
                object.__setattr__(self, "SECRET_KEY", SecretStr(key))
            else:
                raise ValueError("SECRET_KEY must be set in production")
        if not self.POSTGRES_PASSWORD.get_secret_value():
            raise ValueError("POSTGRES_PASSWORD must be set")
        return self


settings = Settings()
