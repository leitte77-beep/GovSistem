from typing import List

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "DOE API"
    VERSION: str = "0.1.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    ALEMBIC_EXPECTED_HEAD: str = "k8l9m0n1o2p3"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "doe"
    POSTGRES_USER: str = "doe_user"
    POSTGRES_PASSWORD: SecretStr = SecretStr("")

    # Accepts a secret provider backend selector; kept simple to avoid
    # over-engineering the local deployment (see app/services/secrets.py).
    SECRET_PROVIDER: str = "database"
    SIGNER_PROVIDER: str = "a1"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

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
    # When True, closing an edition enqueues PDF generation to the Celery
    # worker instead of doing it synchronously in the request. Default False
    # keeps the proven synchronous path.
    PDF_GENERATION_ASYNC: bool = False

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

    VERIFICATION_BASE_URL: str = "https://farol.govsistem.com.br/verificar"

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
    FOUR_EYES_REQUIRED: bool = True
    RECENT_AUTH_TTL_MINUTES: int = 5
    REQUIRE_RECENT_AUTH_FOR_PUBLISH: bool = False

    # ── Centralized DeepSeek integration (server-side defaults) ────────────
    # Every Diário Oficial menu/feature uses this single provider + model.
    # The per-organization API key is stored encrypted at rest (never here);
    # these values are only safe server defaults. Endpoint/model are kept on
    # the server so no client or per-org config can redirect calls elsewhere.
    DEEPSEEK_API_BASE: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"
    AI_DEFAULT_TIMEOUT_SECONDS: int = 60
    # deepseek-v4-flash é um modelo de raciocínio: consome tokens em
    # "reasoning" antes de produzir a resposta. Um teto baixo (ex.: 4096/8192)
    # pode ser totalmente gasto no raciocínio e deixar o conteúdo vazio.
    AI_MAX_TOKENS: int = 16384
    AI_MAX_CONCURRENCY: int = 4
    AI_MAX_RETRIES: int = 3

    @model_validator(mode="after")
    def validate_secrets(self):
        insecure_defaults = {
            "change-me-in-dev",
            "change_me_in_dev",
            "change-me",
            "change_me",
            "secret",
            "secret-key",
            "changeme",
        }
        is_prod = self.ENVIRONMENT.strip().lower() == "production"

        def _guard_known_default(value: str, env_name: str) -> None:
            if value.lower() in insecure_defaults:
                raise ValueError(
                    f"{env_name} uses an insecure known default in production "
                    f"({self.ENVIRONMENT!r}). Set a strong random value."
                )

        sk = self.SECRET_KEY.get_secret_value()
        if not sk:
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
        elif is_prod:
            _guard_known_default(sk, "SECRET_KEY")

        # Fail-closed: internal API key must exist and be strong in production.
        ikey = self.INTERNAL_API_KEY.get_secret_value()
        if is_prod:
            if not ikey or len(ikey) < 32 or ikey.lower() in insecure_defaults:
                raise ValueError(
                    "INTERNAL_API_KEY must be set to a strong random value "
                    "(>=32 chars) in production."
                )
            # Mocks never run in production.
            if self.SIGNER_PROVIDER.strip().lower() == "mock":
                raise ValueError(
                    "SIGNER_PROVIDER=mock is forbidden in production. "
                    "Refusing to start."
                )
            if str(self.POSTGRES_PASSWORD.get_secret_value()).lower() in insecure_defaults:
                raise ValueError(
                    "POSTGRES_PASSWORD uses an insecure known default in production."
                )

        if not self.POSTGRES_PASSWORD.get_secret_value():
            raise ValueError("POSTGRES_PASSWORD must be set")
        return self


settings = Settings()
