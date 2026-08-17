"""Configuração central do GovCompras.

Tudo vem de variáveis de ambiente / arquivo .env — nada de valor sensível
embutido no código. Em produção a aplicação recusa subir sem os segredos.

Nenhum limite legal (valores de dispensa, prazos, modalidades) é constante no
código: o que a Lei 14.133/2021 deixa a critério do órgão vira configuração no
banco (`configuracoes`), nunca uma constante Python.
"""

import logging
from typing import Annotated

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger("govcompras")


def _split_list(value):
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            return value
        return [item.strip() for item in stripped.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env.local", ".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    APP_NAME: str = "GovCompras API"
    APP_TITLE: str = "GovCompras — Gestão Integrada de Compras, Licitações e Contratos"
    VERSION: str = "1.0.0"
    APP_ENV: str = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    APP_HOST: str = "127.0.0.1"

    # ── Portas (bloco reservado 45000-45699) ──────────────────────────────────
    PORT_MODE: str = "auto"
    API_PORT: int = 45101
    FRONTEND_PORT: int = 45001

    # ── Banco ────────────────────────────────────────────────────────────────
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 45501
    POSTGRES_DB: str = "govcompras"
    POSTGRES_USER: str = "govcompras_user"
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

    # ── Redis (opcional, cache/fila futura) ───────────────────────────────────
    REDIS_URL: str = ""

    # ── Armazenamento de documentos ───────────────────────────────────────────
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_PATH: str = "storage"
    S3_ENDPOINT: str = ""
    S3_REGION: str = "us-east-1"
    S3_BUCKET: str = "govcompras-arquivos"
    S3_ACCESS_KEY: SecretStr = SecretStr("")
    S3_SECRET_KEY: SecretStr = SecretStr("")
    S3_FORCE_PATH_STYLE: bool = True

    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: Annotated[list[str], NoDecode] = [
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".odt", ".ods",
        ".jpg", ".jpeg", ".png", ".webp",
    ]

    # ── Segurança ────────────────────────────────────────────────────────────
    SECRET_KEY: SecretStr = SecretStr("")
    SAAS_JWT_SECRET: SecretStr = SecretStr("")
    SAAS_API_URL: str = ""
    # Ponte de login de demonstração (personas fictícias) — nunca em produção.
    ENABLE_DEV_LOGIN: bool = False
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    INTERNAL_API_KEY: SecretStr = SecretStr("")
    RATE_LIMIT_REQUESTS: int = 300
    RATE_LIMIT_WINDOW_SECONDS: int = 60

    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://127.0.0.1:45001",
        "http://localhost:45001",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    PUBLIC_URL: str = "http://127.0.0.1:45001"

    MUNICIPIO_NOME: str = "Município"
    MUNICIPIO_UF: str = "SC"

    # ── Parâmetros de negócio ajustáveis (nunca hardcoded nas regras) ─────────
    # Faixas de SLA em % do prazo interno da etapa (seção 90 da especificação).
    SLA_LIMITE_ATENCAO_PCT: float = 0.7
    SLA_LIMITE_ATRASADO_PCT: float = 1.0
    SLA_LIMITE_CRITICO_PCT: float = 1.5
    # Janelas de alerta de vencimento de contrato/ata, em dias (seção 48).
    ALERTAS_VENCIMENTO_DIAS: Annotated[list[int], NoDecode] = [180, 120, 90, 60, 30, 15, 7, 1]

    _cors = field_validator("CORS_ORIGINS", mode="before")(_split_list)
    _ext = field_validator("ALLOWED_EXTENSIONS", mode="before")(_split_list)
    _alertas = field_validator("ALERTAS_VENCIMENTO_DIAS", mode="before")(_split_list)

    @property
    def MAX_FILE_SIZE_BYTES(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024

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
            object.__setattr__(self, "POSTGRES_PASSWORD", SecretStr("govcompras_password"))
        if self.is_production and self.ENABLE_DEV_LOGIN:
            raise ValueError("ENABLE_DEV_LOGIN não pode ficar ligado em produção")
        return self


settings = Settings()
