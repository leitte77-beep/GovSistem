from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "Modulo Diario Oficial API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "modulo_diario"
    POSTGRES_USER: str = "diario_user"
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
    MINIO_BUCKET: str = "diario-publicacoes"
    MINIO_SECURE: bool = False

    CORS_ORIGINS: list[str] = [
        "http://localhost:9102",
        "http://localhost:9002",
    ]

    SECRET_KEY: SecretStr = SecretStr("")
    JWT_ALGORITHM: str = "HS256"

    SIGNER_URL: str = "http://signer:8100"
    INTERNAL_API_KEY: SecretStr = SecretStr("")

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024
    ALLOWED_EXTENSIONS: list[str] = [".docx", ".xlsx", ".csv", ".pdf"]
    ALLOWED_MIME_TYPES: list[str] = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "text/plain",
        "application/pdf",
    ]

    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "uploads"

    SENTRY_DSN: str | None = None
    ENVIRONMENT: str = "development"

    @model_validator(mode="after")
    def validate_secrets(self):
        if not self.SECRET_KEY.get_secret_value():
            if self.DEBUG:
                import logging
                import secrets as _secrets
                key = _secrets.token_hex(32)
                logging.getLogger("diario").warning("SECRET_KEY not set — generated temporary key")
                object.__setattr__(self, "SECRET_KEY", SecretStr(key))
        if not self.POSTGRES_PASSWORD.get_secret_value():
            raise ValueError("POSTGRES_PASSWORD must be set")
        return self


settings = Settings()
