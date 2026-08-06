"""Configuração central do GovDoc (Gestão de Documentos).

Todas as opções vêm de variáveis de ambiente / arquivo .env. Nenhum segredo
possui valor real embutido: em produção a aplicação recusa subir sem eles.
"""

import logging
from typing import List

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("govdoc")


def _split_list(value):
    """Aceita lista JSON (`["a","b"]`), texto JSON ou string separada por vírgula."""
    if isinstance(value, str):
        import json

        stripped = value.strip()
        if stripped.startswith("[") or stripped.startswith("{"):
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                pass
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Em desenvolvimento os processos são iniciados com cwd em `api/`,
        # enquanto o arquivo compartilhado pelo módulo fica um nível acima.
        # No contêiner as mesmas opções chegam por variáveis de ambiente.
        env_file=("../.env.local", ".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
        # Sem decodificação JSON automática: listas chegam como string simples
        # (ex.: CORS_ORIGINS=a,b,c) e são normalizadas pelos validators `before`
        # abaixo. Com o padrão das versões novas do pydantic-settings, valores
        # não-JSON para tipos complexos quebrariam o boot.
        enable_decoding=False,
    )

    APP_NAME: str = "GovDoc API"
    APP_TITLE: str = "GovDoc — Gestão de Documentos"
    VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    APP_HOST: str = "127.0.0.1"

    # ── Portas (resolvidas por scripts/resolve-ports.mjs) ─────────────────────
    PORT_MODE: str = "auto"
    API_PORT: int = 43100
    FRONTEND_PORT: int = 43000

    # ── Banco ─────────────────────────────────────────────────────────────────
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "govdoc"
    POSTGRES_USER: str = "govdoc_user"
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

    # ── Redis (opcional — há fallback em processo) ─────────────────────────────
    REDIS_URL: str = ""

    # ── Armazenamento ─────────────────────────────────────────────────────────
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_PATH: str = "storage"
    S3_ENDPOINT: str = ""
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "govdoc-documents"
    S3_ACCESS_KEY: SecretStr = SecretStr("")
    S3_SECRET_KEY: SecretStr = SecretStr("")
    S3_FORCE_PATH_STYLE: bool = True
    S3_SIGNED_URL_TTL_SECONDS: int = 300

    # ── Upload ────────────────────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 500
    MAX_UPLOAD_BATCH_MB: int = 2000
    MAX_CONCURRENT_UPLOADS: int = 5
    ALLOWED_EXTENSIONS: List[str] = [
        ".pdf", ".doc", ".docx", ".odt", ".xls", ".xlsx", ".ods", ".csv",
        ".ppt", ".pptx", ".odp", ".txt", ".md", ".rtf", ".xml", ".json",
        ".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".bmp", ".tiff",
        ".zip", ".rar", ".7z", ".tar", ".gz",
        ".mp3", ".wav", ".ogg", ".m4a", ".mp4", ".webm", ".avi", ".mkv",
        ".p7s", ".xml",
    ]
    BLOCKED_EXTENSIONS: List[str] = [
        ".exe", ".dll", ".com", ".bat", ".cmd", ".msi", ".scr", ".pif",
        ".cpl", ".jar", ".sh", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".hta",
        ".apk", ".deb", ".rpm", ".elf", ".so", ".bin",
    ]
    ANTIVIRUS_ENABLED: bool = True
    CLAMAV_HOST: str = ""
    CLAMAV_PORT: int = 3310

    # ── Segurança ─────────────────────────────────────────────────────────────
    SECRET_KEY: SecretStr = SecretStr("")
    SAAS_JWT_SECRET: SecretStr = SecretStr("")
    # URL da API da plataforma GovSistem (ex.: http://host.docker.internal:9009/api/v1).
    # Usada apenas pela ponte de sessão de desenvolvimento, que valida a
    # identidade no SaaS antes de abrir sessão no módulo.
    SAAS_API_URL: str = ""
    # Ponte de sessão dev (`/auth/dev/session`): validada no SaaS, só ativa com
    # a flag explícita. Em produção as rotas retornam 404.
    ENABLE_DEV_SAAS_AUTH: bool = False
    # Sessão técnica dos testes automatizados (`/auth/dev/e2e-session`).
    ENABLE_DEV_E2E_AUTH: bool = False
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    INTERNAL_API_KEY: SecretStr = SecretStr("")
    RATE_LIMIT_REQUESTS: int = 300
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    EXTERNAL_RATE_LIMIT_REQUESTS: int = 30

    CORS_ORIGINS: List[str] = [
        "http://127.0.0.1:43000",
        "http://localhost:43000",
        "http://127.0.0.1:43001",
        "http://localhost:43001",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    PUBLIC_URL: str = "http://127.0.0.1:43000"

    # ── Lixeira / retenção ────────────────────────────────────────────────────
    TRASH_RETENTION_DAYS: int = 30
    EXPIRY_ALERT_DAYS: List[int] = [180, 90, 60, 30, 15, 7, 1]
    DOCUMENT_LOCK_MINUTES: int = 30

    # ── Backup ────────────────────────────────────────────────────────────────
    BACKUP_ENABLED: bool = True
    BACKUP_SCHEDULE: str = "0 2 * * *"
    BACKUP_DESTINATION: str = ""
    BACKUP_ENCRYPTION_PASSWORD: SecretStr = SecretStr("")
    BACKUP_RETENTION_DAILY: int = 7
    BACKUP_RETENTION_WEEKLY: int = 4
    BACKUP_RETENTION_MONTHLY: int = 12
    BACKUP_VERIFY_AFTER_RUN: bool = True
    PG_DUMP_PATH: str = "pg_dump"
    PG_RESTORE_PATH: str = "psql"

    # ── Tarefas automáticas ───────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_INTERVAL_SECONDS: int = 300

    # ── Extração de texto / OCR (opcionais) ───────────────────────────────────
    TEXT_EXTRACTION_ENABLED: bool = True
    OCR_ENABLED: bool = False
    TESSERACT_PATH: str = "tesseract"
    TESSERACT_LANG: str = "por"
    TIKA_URL: str = ""

    _cors = field_validator("CORS_ORIGINS", mode="before")(_split_list)
    _ext = field_validator("ALLOWED_EXTENSIONS", "BLOCKED_EXTENSIONS", mode="before")(_split_list)

    @field_validator("EXPIRY_ALERT_DAYS", mode="before")
    @classmethod
    def _parse_days(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                import json

                return json.loads(stripped)
            return [int(v.strip()) for v in stripped.split(",") if v.strip()]
        return value

    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def MAX_UPLOAD_BATCH_BYTES(self) -> int:
        return self.MAX_UPLOAD_BATCH_MB * 1024 * 1024

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
                "Defina SECRET_KEY no .env.local para manter sessões entre reinícios."
            )
        if not self.POSTGRES_PASSWORD.get_secret_value():
            if self.is_production:
                raise ValueError("POSTGRES_PASSWORD deve ser definido em produção")
            object.__setattr__(self, "POSTGRES_PASSWORD", SecretStr("govdoc_password"))
        if self.is_production and self.BACKUP_ENABLED and not self.BACKUP_DESTINATION:
            logger.warning(
                "BACKUP_DESTINATION não configurado — o backup gravaria junto da aplicação. "
                "Configure um destino externo (disco secundário, NAS ou S3)."
            )
        return self


settings = Settings()
