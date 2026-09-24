from typing import List

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "GovTask API"
    VERSION: str = "3.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    # Resumo diário no sino do Prefeito (tarefa em segundo plano).
    RESUMO_DIARIO_ATIVO: bool = True

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "govtask2"
    POSTGRES_USER: str = "govtask2_user"
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

    CORS_ORIGINS: List[str] = [
        "http://localhost:7602",
        "http://localhost:3000",
    ]
    PUBLIC_URL: str = "http://localhost:7602"

    SECRET_KEY: SecretStr = SecretStr("")
    SAAS_JWT_SECRET: SecretStr = SecretStr("")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    INTERNAL_API_KEY: SecretStr = SecretStr("")

    # Uploads. Armazenamento em disco no volume do container — o módulo não
    # depende de MinIO para funcionar.
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 32
    ALLOWED_EXTENSIONS: list[str] = [
        ".pdf", ".doc", ".docx", ".odt", ".xls", ".xlsx", ".ods",
        ".jpg", ".jpeg", ".png", ".webp", ".zip", ".p7s", ".txt",
    ]

    @property
    def MAX_UPLOAD_SIZE_BYTES(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()
