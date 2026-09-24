from functools import lru_cache

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str
    redis_url: str
    secret_key: str
    cors_origins: list[AnyHttpUrl] = []

    @field_validator("secret_key")
    @classmethod
    def secret_key_must_be_safe(cls, value: str) -> str:
        if len(value) < 32 or value.startswith("replace-"):
            raise ValueError("SECRET_KEY must be a unique secret with at least 32 characters")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

