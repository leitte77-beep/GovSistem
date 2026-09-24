"""Configuração central do GovInfra.

Tudo vem de variáveis de ambiente / arquivo .env — nada de valor sensível
embutido no código. Em produção a aplicação recusa subir sem os segredos.
"""

import logging

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("govinfra")


def _split_list(value):
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            return value
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Em desenvolvimento os processos rodam com cwd em `api/`, e o arquivo
        # compartilhado do módulo fica um nível acima. No contêiner as mesmas
        # opções chegam por variáveis de ambiente.
        env_file=("../.env.local", ".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "GovInfra API"
    APP_TITLE: str = "GovInfra — Secretaria Municipal de Infraestrutura"
    VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    APP_HOST: str = "127.0.0.1"

    # ── Portas (resolvidas por scripts/resolve-ports.mjs) ────────────────────
    PORT_MODE: str = "auto"
    API_PORT: int = 44101
    FRONTEND_PORT: int = 44001

    # ── Banco ────────────────────────────────────────────────────────────────
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 44501
    POSTGRES_DB: str = "govinfra"
    POSTGRES_USER: str = "govinfra_user"
    POSTGRES_PASSWORD: SecretStr = SecretStr("")
    DATABASE_URL_OVERRIDE: str = ""

    @property
    def DATABASE_URL(self) -> str:
        if self.DATABASE_URL_OVERRIDE:
            return self.DATABASE_URL_OVERRIDE
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

    # ── Redis (opcional) ─────────────────────────────────────────────────────
    REDIS_URL: str = ""

    # ── Armazenamento ────────────────────────────────────────────────────────
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_PATH: str = "storage"
    S3_ENDPOINT: str = ""
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "govinfra-arquivos"
    S3_ACCESS_KEY: SecretStr = SecretStr("")
    S3_SECRET_KEY: SecretStr = SecretStr("")
    S3_FORCE_PATH_STYLE: bool = True
    S3_SIGNED_URL_TTL_SECONDS: int = 300

    # ── Upload ───────────────────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 50
    MAX_VIDEO_SIZE_MB: int = 200
    ALLOWED_EXTENSIONS: list[str] = [
        ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic",
        ".mp4", ".webm", ".mov",
        ".xls", ".xlsx", ".ods", ".csv", ".txt", ".odt", ".doc", ".docx",
    ]
    BLOCKED_EXTENSIONS: list[str] = [
        ".exe", ".dll", ".com", ".bat", ".cmd", ".msi", ".scr", ".pif", ".cpl",
        ".jar", ".sh", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".hta", ".apk",
        ".deb", ".rpm", ".elf", ".so", ".bin", ".php", ".phtml",
    ]

    # ── Segurança ────────────────────────────────────────────────────────────
    SECRET_KEY: SecretStr = SecretStr("")
    SAAS_JWT_SECRET: SecretStr = SecretStr("")
    SAAS_API_URL: str = ""
    # Pontes de login usadas só fora de produção; em produção respondem 404.
    ENABLE_DEV_SAAS_AUTH: bool = False
    ENABLE_DEV_E2E_AUTH: bool = False
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    INTERNAL_API_KEY: SecretStr = SecretStr("")
    RATE_LIMIT_REQUESTS: int = 300
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    PUBLIC_RATE_LIMIT_REQUESTS: int = 30

    CORS_ORIGINS: list[str] = [
        "http://127.0.0.1:44001",
        "http://localhost:44001",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    PUBLIC_URL: str = "http://127.0.0.1:44001"

    # ── Georreferenciamento ──────────────────────────────────────────────────
    # A geocodificação é sempre um AUXÍLIO: se o provedor cair, o cadastro
    # continua possível pela marcação manual do ponto no mapa.
    GEOCODE_PROVIDER: str = "nominatim"  # nominatim | none
    GEOCODE_BASE_URL: str = "https://nominatim.openstreetmap.org"
    GEOCODE_USER_AGENT: str = "GovInfra/1.0"
    GEOCODE_TIMEOUT_SECONDS: float = 6.0
    MAP_TILE_URL: str = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    MAP_TILE_ATTRIBUTION: str = "© OpenStreetMap"
    MAP_DEFAULT_LAT: float = -27.21
    MAP_DEFAULT_LON: float = -52.027
    MAP_DEFAULT_ZOOM: int = 12

    MUNICIPIO_NOME: str = "Município"
    MUNICIPIO_UF: str = "SC"

    # ── Tarefas automáticas ──────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_INTERVAL_SECONDS: int = 600

    _cors = field_validator("CORS_ORIGINS", mode="before")(_split_list)
    _ext = field_validator("ALLOWED_EXTENSIONS", "BLOCKED_EXTENSIONS", mode="before")(_split_list)

    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def MAX_VIDEO_SIZE_BYTES(self) -> int:
        return self.MAX_VIDEO_SIZE_MB * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in {"production", "prod"}

    @model_validator(mode="after")
    def _validate_secrets(self):
        if not self.SECRET_KEY.get_secret_value():
            if self.is_production:
                raise ValueError("SECRET_KEY deve ser definido em produção")
            import secrets as _secrets

            object.__setattr__(self, "SECRET_KEY", SecretStr(_secrets.token_hex(32)))
            logger.warning(
                "SECRET_KEY não definido — chave temporária gerada para desenvolvimento. "
                "Defina SECRET_KEY no .env.local para manter as sessões entre reinícios."
            )
        if not self.POSTGRES_PASSWORD.get_secret_value():
            if self.is_production:
                raise ValueError("POSTGRES_PASSWORD deve ser definido em produção")
            object.__setattr__(self, "POSTGRES_PASSWORD", SecretStr("govinfra_password"))
        if self.is_production and self.ENABLE_DEV_SAAS_AUTH:
            raise ValueError("ENABLE_DEV_SAAS_AUTH não pode ficar ligado em produção")
        if self.is_production and self.ENABLE_DEV_E2E_AUTH:
            raise ValueError("ENABLE_DEV_E2E_AUTH não pode ficar ligado em produção")
        return self


settings = Settings()
