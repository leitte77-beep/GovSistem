from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

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

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: SecretStr = SecretStr("")
    MINIO_SECRET_KEY: SecretStr = SecretStr("")
    MINIO_BUCKET: str = "doe-publicacoes"
    MINIO_SECURE: bool = False

    SIGNER_URL: str = "http://signer:8100"
    API_URL: str = "http://api:8000"
    INTERNAL_API_KEY: SecretStr = SecretStr("")

    LOG_LEVEL: str = "INFO"
    WORKER_CONCURRENCY: int = 4

    @model_validator(mode="after")
    def validate_secrets(self):
        if not self.POSTGRES_PASSWORD.get_secret_value():
            raise ValueError("POSTGRES_PASSWORD must be set")
        return self


settings = Settings()
