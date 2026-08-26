from typing import List

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "GovFrota API"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "govfrota"
    POSTGRES_USER: str = "govfrota_user"
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

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: SecretStr = SecretStr("")
    MINIO_SECRET_KEY: SecretStr = SecretStr("")
    MINIO_BUCKET: str = "govfrota-files"
    MINIO_SECURE: bool = False

    CORS_ORIGINS: List[str] = [
        "http://localhost:7601",
        "http://localhost:7602",
    ]

    PUBLIC_URL: str = "http://localhost:7601"

    SECRET_KEY: SecretStr = SecretStr("")
    SAAS_JWT_SECRET: SecretStr = SecretStr("")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DRIVER_TOKEN_EXPIRE_MINUTES: int = 720

    INTERNAL_API_KEY: SecretStr = SecretStr("")
    ALLOW_LOCAL_AUTH: bool = False

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 20
    MAX_UPLOAD_SIZE_BYTES: int = 20 * 1024 * 1024
    ALLOWED_EXTENSIONS: list[str] = [
        ".pdf", ".jpg", ".jpeg", ".png", ".webp",
        ".xlsx", ".csv", ".xml",
    ]
    ALLOWED_MIME_TYPES: list[str] = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "text/plain",
        "text/xml",
        "application/xml",
    ]

    STORAGE_BACKEND: str = "local"
    STORAGE_LOCAL_PATH: str = "uploads"

    # Duração das URLs temporárias de download (segundos)
    MINIO_PRESIGNED_EXPIRY: int = 300

    # Tratamento de imagens (fotos de abastecimento/painel/bomba)
    IMAGE_MAX_DIMENSION: int = 1600
    IMAGE_QUALITY: int = 85
    IMAGE_MAX_BYTES: int = 5 * 1024 * 1024
    IMAGE_FORMATS: list[str] = ["JPEG", "PNG", "WEBP"]
    IMAGE_FORMAT_OUTPUT: str = "JPEG"

    # Fuso horário padrão para exibição de relatórios (o armazenamento é UTC)
    DEFAULT_TIMEZONE: str = "America/Sao_Paulo"

    # Idempotência
    IDEMPOTENCY_MAX_LIFETIME_HOURS: int = 24

    # Segurança do login do motorista
    DRIVER_MAX_LOGIN_FAILURES: int = 5
    DRIVER_LOCKOUT_MINUTES: int = 30

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return value
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def validate_secrets(self):
        import logging

        log = logging.getLogger("govfrota")
        if not self.SECRET_KEY.get_secret_value():
            if self.DEBUG:
                import secrets as _secrets

                key = _secrets.token_hex(32)
                log.warning(
                    "SECRET_KEY não definida — chave temporária gerada para desenvolvimento."
                )
                object.__setattr__(self, "SECRET_KEY", SecretStr(key))
            else:
                raise ValueError("SECRET_KEY deve ser definida em produção")
        if not self.POSTGRES_PASSWORD.get_secret_value():
            if self.DEBUG:
                log.warning(
                    "POSTGRES_PASSWORD não definida — usando senha padrão de desenvolvimento."
                )
                object.__setattr__(self, "POSTGRES_PASSWORD", SecretStr("govfrota_password"))
            else:
                raise ValueError("POSTGRES_PASSWORD deve ser definida em produção")
        return self


settings = Settings()
