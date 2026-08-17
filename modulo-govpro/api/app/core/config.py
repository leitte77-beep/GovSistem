from typing import List

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "GovPro API"
    VERSION: str = "0.1.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "govpro"
    POSTGRES_USER: str = "govpro_user"
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

    # ── Autenticação / SSO (espelho do ChatGov) ──────────────────────────────
    # O login vem do SaaS. O token é validado contra uma LISTA de segredos:
    # o segredo local do módulo + as chaves de assinatura do SaaS (JWT_SECRETS).
    JWT_SECRET: str = "govpro-dev-secret-change-in-production"
    JWT_SECRETS: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Chave local para assinar tokens próprios (dev/e2e), distinta do SaaS.
    SECRET_KEY: SecretStr = SecretStr("")

    @property
    def jwt_secrets(self) -> List[str]:
        return [self.JWT_SECRET, *[s.strip() for s in self.JWT_SECRETS.split(",") if s.strip()]]

    INTERNAL_API_KEY: SecretStr = SecretStr("")

    # ── MinIO / armazenamento ────────────────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: SecretStr = SecretStr("")
    MINIO_SECRET_KEY: SecretStr = SecretStr("")
    MINIO_BUCKET: str = "govpro-files"
    MINIO_SECURE: bool = False

    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "uploads"

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024
    ALLOWED_MIME_TYPES: list[str] = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.oasis.opendocument.text",
        "application/vnd.oasis.opendocument.spreadsheet",
        "text/csv",
        "text/plain",
        "image/jpeg",
        "image/png",
        "application/octet-stream",
    ]

    CORS_ORIGINS: List[str] = [
        "http://localhost:7502",
        "http://localhost:7503",
        "https://govpro.govsistem.com.br",
        "https://proc.govsistem.com.br",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return value
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    PUBLIC_URL: str = "https://proc.govsistem.com.br"
    SENTRY_DSN: str | None = None
    ENVIRONMENT: str = "development"

    # ── Celery / Redis (jobs de manutenção) ─────────────────────────────────
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    # ── ICP-Brasil (assinatura qualificada — PAdES/CAdES + carimbo) ─────────
    # Autoridade de carimbo de tempo (RFC 3161). Sem URL → carimbo desativado
    # (assinatura CAdES-BES, sem T).
    ICP_TSA_URL: str | None = None
    ICP_TSA_TIMEOUT_S: float = 10.0
    ICP_TSA_RETRIES: int = 2
    ICP_TSA_CIRCUIT_BREAKER_THRESHOLD: int = 3
    ICP_TSA_CIRCUIT_BREAKER_COOLDOWN_S: int = 60
    # Fallback: se o carimbo falhar, assina mesmo assim (degradado, sem T).
    ICP_TSA_FALLBACK_SEM_CARIMBO: bool = True

    @model_validator(mode="after")
    def validate_secrets(self):
        if not self.SECRET_KEY.get_secret_value():
            import logging
            import secrets as _secrets

            key = _secrets.token_hex(32)
            logging.getLogger("govpro").warning(
                "SECRET_KEY not set — generated temporary key for dev."
            )
            object.__setattr__(self, "SECRET_KEY", SecretStr(key))
        if not self.POSTGRES_PASSWORD.get_secret_value():
            if self.DEBUG:
                object.__setattr__(self, "POSTGRES_PASSWORD", SecretStr("govpro_password"))
            else:
                raise ValueError("POSTGRES_PASSWORD must be set")
        return self


settings = Settings()
