"""Configuração central do GovSaúde.

Nenhum segredo é embutido no código. Em produção a aplicação recusa subir sem
as chaves obrigatórias. Em desenvolvimento/teste o núcleo gera chaves
temporárias apenas para permitir a execução local.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from typing import Any

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("govsaude")


def _split_list(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            return json.loads(stripped)
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env.local", ".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # ── Identidade ──────────────────────────────────────────────────────────
    APP_NAME: str = "GovSaúde API"
    APP_TITLE: str = "GovSaúde — Gestão da Saúde Pública Municipal"
    VERSION: str = "0.7.0"
    RELEASE_NOTES: str = (
        "Fase 7 — odontologia: catálogo parametrizável, odontograma versionado "
        "(FDI), atendimento com anamnese e digitação retroativa, procedimentos "
        "programados × realizados, documentos e relatórios. "
        "Fase 6 — motor genérico de programas e linhas de cuidado, inscrições, "
        "programação previsto × realizado, busca ativa, formulários versionados, "
        "indicadores e estimativa de demanda futura. Seeds nacionais entram "
        "inativos e sem regra clínica oficial até a validação do tenant."
    )
    APP_ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    APP_HOST: str = "127.0.0.1"

    # ── Portas livres no monorepo ───────────────────────────────────────────
    API_PORT: int = 8210
    FRONTEND_PORT: int = 7601

    # ── Banco ───────────────────────────────────────────────────────────────
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5440
    POSTGRES_DB: str = "govsaude"
    POSTGRES_USER: str = "govsaude_user"
    POSTGRES_PASSWORD: SecretStr = SecretStr("")
    DATABASE_URL_OVERRIDE: str = ""
    REFERENCIA_SCHEMA: str = "referencia"

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
        if self.DATABASE_URL_OVERRIDE:
            return self.DATABASE_URL_OVERRIDE.replace("+aiosqlite", "").replace(
                "+asyncpg", "+psycopg"
            )
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}"
            f":{self.POSTGRES_PASSWORD.get_secret_value()}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # ── Redis / fila ────────────────────────────────────────────────────────
    REDIS_URL: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6381
    REDIS_DB: int = 0
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    @property
    def redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def broker_url(self) -> str:
        return self.CELERY_BROKER_URL or self.redis_url

    @property
    def result_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.redis_url

    # ── Armazenamento (MinIO/S3) ────────────────────────────────────────────
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_PATH: str = "storage"
    S3_ENDPOINT: str = ""
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "govsaude-files"
    S3_ACCESS_KEY: SecretStr = SecretStr("")
    S3_SECRET_KEY: SecretStr = SecretStr("")
    S3_FORCE_PATH_STYLE: bool = True
    S3_SIGNED_URL_TTL_SECONDS: int = 300

    # ── Upload / antivírus ──────────────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_MIME_TYPES: list[str] = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]
    ALLOWED_EXTENSIONS: list[str] = [
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".csv",
        ".xlsx",
    ]
    CLAMAV_HOST: str = ""
    CLAMAV_PORT: int = 3310
    CLAMAV_ENABLED: bool = False

    # ── Segurança / JWT ─────────────────────────────────────────────────────
    SECRET_KEY: SecretStr = SecretStr("")
    SAAS_JWT_SECRET: SecretStr = SecretStr("")
    ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "govsistem"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    INACTIVITY_MINUTES: int = 30
    INTERNAL_API_KEY: SecretStr = SecretStr("")

    FIELD_ENCRYPTION_KEY: SecretStr = SecretStr("")
    FIELD_ENCRYPTION_KEY_OLD: SecretStr = SecretStr("")
    CPF_HMAC_KEY: SecretStr = SecretStr("")

    PASSWORD_MIN_LENGTH: int = 12
    PASSWORD_MIN_UPPERCASE: int = 1
    PASSWORD_MIN_LOWERCASE: int = 1
    PASSWORD_MIN_DIGITS: int = 1
    PASSWORD_MIN_SYMBOLS: int = 1
    PASSWORD_MAX_FAILURES: int = 5
    PASSWORD_LOCKOUT_MINUTES: int = 30
    PASSWORD_EXPIRE_DAYS: int = 90
    PASSWORD_HISTORY_SIZE: int = 5
    MFA_ISSUER: str = "GovSaúde"
    MFA_ENABLED: bool = True

    RATE_LIMIT_REQUESTS: int = 300
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    PUBLIC_RATE_LIMIT_REQUESTS: int = 60

    TERMS_REQUIRED_DEFAULT: bool = False
    TERMS_CURRENT_VERSION: str = "2026-10-01"

    # ── Fuso / competência ─────────────────────────────────────────────────
    DEFAULT_TIMEZONE: str = "America/Sao_Paulo"

    # ── Integrações oficiais ────────────────────────────────────────────────
    SAAS_API_URL: str = ""
    SIGNER_URL: str = "http://signer:8100"
    RNDS_ENV: str = "HOMOLOGACAO"
    RNDS_BASE_URL_HOMOLOGACAO: str = ""
    RNDS_BASE_URL_PRODUCAO: str = ""
    RNDS_CERT_PATH: str = ""
    RNDS_CERT_PASSWORD: SecretStr = SecretStr("")
    INTEGRACOES_AUTOMATICAS: bool = False
    INTEGRACOES_LOTE_MAXIMO: int = 500

    # ── SSE ─────────────────────────────────────────────────────────────────
    SSE_HEARTBEAT_SECONDS: int = 20
    SSE_MAX_CONNECTIONS_PER_TENANT: int = 500

    # ── CORS / URLs públicas ────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:7601",
        "http://127.0.0.1:7601",
    ]
    PUBLIC_URL: str = "http://localhost:7601"
    API_PUBLIC_URL: str = "http://localhost:8210"

    # ── Tarefas ─────────────────────────────────────────────────────────────
    SCHEDULER_ENABLED: bool = True
    JOB_RETENTION_DAYS: int = 90
    AUDIT_RETENTION_YEARS: int = 20

    _cors = field_validator("CORS_ORIGINS", mode="before")(_split_list)
    _mimes = field_validator("ALLOWED_MIME_TYPES", "ALLOWED_EXTENSIONS", mode="before")(
        _split_list
    )

    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.lower() in {"production", "prod"}

    @property
    def is_test(self) -> bool:
        return self.APP_ENV.lower() == "test"

    @property
    def field_encryption_key(self) -> bytes:
        """Chave Fernet atual, normalizada para 32 bytes urlsafe-base64."""
        raw = self.FIELD_ENCRYPTION_KEY.get_secret_value()
        if not raw:
            digest = hashlib.sha256(
                self.SECRET_KEY.get_secret_value().encode("utf-8")
            ).digest()
            return base64.urlsafe_b64encode(digest)
        return _normalizar_chave_fernet(raw)

    @property
    def field_encryption_key_old(self) -> bytes | None:
        raw = self.FIELD_ENCRYPTION_KEY_OLD.get_secret_value()
        return _normalizar_chave_fernet(raw) if raw else None

    @property
    def cpf_hmac_key(self) -> bytes:
        raw = self.CPF_HMAC_KEY.get_secret_value()
        if raw:
            return raw.encode("utf-8")
        return hashlib.sha256(
            self.SECRET_KEY.get_secret_value().encode("utf-8")
        ).digest()

    @model_validator(mode="after")
    def _validar_segredos(self):
        if not self.SECRET_KEY.get_secret_value():
            if self.is_production:
                raise ValueError("SECRET_KEY deve ser definido em produção")
            object.__setattr__(self, "SECRET_KEY", SecretStr(secrets.token_hex(32)))
            logger.warning(
                "SECRET_KEY não definido — chave temporária gerada para desenvolvimento."
            )
        if not self.POSTGRES_PASSWORD.get_secret_value():
            if self.is_production:
                raise ValueError("POSTGRES_PASSWORD deve ser definido em produção")
            object.__setattr__(self, "POSTGRES_PASSWORD", SecretStr("govsaude_password"))
        if self.is_production:
            if not self.SAAS_JWT_SECRET.get_secret_value():
                raise ValueError("SAAS_JWT_SECRET deve ser definido em produção")
            if not self.INTERNAL_API_KEY.get_secret_value():
                raise ValueError("INTERNAL_API_KEY deve ser definido em produção")
            if not self.FIELD_ENCRYPTION_KEY.get_secret_value():
                raise ValueError("FIELD_ENCRYPTION_KEY deve ser definido em produção")
            if not self.CPF_HMAC_KEY.get_secret_value():
                raise ValueError("CPF_HMAC_KEY deve ser definido em produção")
        return self


def _normalizar_chave_fernet(raw: str) -> bytes:
    """Aceita chave Fernet válida ou um segredo arbitrário.

    Segredos arbitrários são derivados com SHA-256 para evitar que uma
    configuração curta quebre a criptografia em produção. O formato resultante
    continua sendo uma chave Fernet de 32 bytes em base64 URL-safe.
    """
    candidate = raw.encode("utf-8")
    try:
        decoded = base64.urlsafe_b64decode(candidate)
        if len(decoded) == 32:
            return candidate
    except Exception:  # noqa: BLE001 - entrada arbitrária é aceita e derivada
        pass
    return base64.urlsafe_b64encode(hashlib.sha256(candidate).digest())


settings = Settings()
