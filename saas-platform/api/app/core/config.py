from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "GovSistem API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "saas_platform"
    POSTGRES_USER: str = "saas_user"
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

    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    @property
    def REDIS_URL(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    CORS_ORIGINS: list[str] = [
        "http://localhost:9002",
        "http://localhost:9102",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return json.loads(stripped)
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    SECRET_KEY: SecretStr = SecretStr("")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MODULE_TOKEN_EXPIRE_MINUTES: int = 60

    INTERNAL_API_KEY: SecretStr = SecretStr("")
    DIARIO_MODULE_INTERNAL_API_URL: str | None = None
    DIARIO_MODULE_ADMIN_URL: str | None = None
    CHATGOV_MODULE_INTERNAL_API_URL: str | None = None
    CHATGOV_MODULE_ADMIN_URL: str | None = None
    GOVTASK_MODULE_INTERNAL_API_URL: str | None = None
    GOVTASK_MODULE_ADMIN_URL: str | None = None
    GOVAVALIA_MODULE_INTERNAL_API_URL: str | None = None
    GOVAVALIA_MODULE_ADMIN_URL: str | None = None
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_MIN_UPPERCASE: int = 1
    PASSWORD_MIN_LOWERCASE: int = 1
    PASSWORD_MIN_DIGITS: int = 1
    PASSWORD_MAX_FAILURES: int = 5
    PASSWORD_LOCKOUT_MINUTES: int = 30
    PASSWORD_EXPIRE_DAYS: int = 90

    SENTRY_DSN: str | None = None
    ENVIRONMENT: str = "development"

    ASAAS_ENV: str = "sandbox"
    ASAAS_API_KEY: SecretStr = SecretStr("")
    ASAAS_WEBHOOK_TOKEN: SecretStr = SecretStr("")
    ASAAS_BASE_URL_SANDBOX: str = "https://sandbox.asaas.com/api/v3"
    ASAAS_BASE_URL_PRODUCTION: str = "https://api.asaas.com/v3"
    PAYMENT_WEBHOOK_PUBLIC_URL: str = ""

    FISCAL_PROVIDER: str = "sandbox"
    FOCUS_NFE_LOGIN: str = ""
    FOCUS_NFE_TOKEN: SecretStr = SecretStr("")
    FOCUS_BASE_URL_SANDBOX: str = "https://homologacao.focusnfe.com.br"
    FOCUS_BASE_URL_PRODUCTION: str = "https://api.focusnfe.com.br"

    SMTP_HOST: str = "smtp.hostinger.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = "contato@govsistem.com.br"
    SMTP_PASSWORD: SecretStr = SecretStr("")
    SMTP_FROM: str = "contato@govsistem.com.br"
    SMTP_USE_SSL: bool = True

    @property
    def ASAAS_BASE_URL(self) -> str:
        if self.ASAAS_ENV == "production":
            return self.ASAAS_BASE_URL_PRODUCTION
        return self.ASAAS_BASE_URL_SANDBOX

    @property
    def FOCUS_BASE_URL(self) -> str:
        if self.ASAAS_ENV == "production":
            return self.FOCUS_BASE_URL_PRODUCTION
        return self.FOCUS_BASE_URL_SANDBOX

    @model_validator(mode="after")
    def validate_secrets(self):
        if not self.SECRET_KEY.get_secret_value():
            if self.DEBUG:
                import logging
                import secrets as _secrets
                key = _secrets.token_hex(32)
                logging.getLogger("saas").warning(
                    "SECRET_KEY not set — generated temporary key for dev."
                )
                object.__setattr__(self, "SECRET_KEY", SecretStr(key))
            else:
                raise ValueError("SECRET_KEY must be set in production")
        if not self.POSTGRES_PASSWORD.get_secret_value():
            raise ValueError("POSTGRES_PASSWORD must be set")
        return self


settings = Settings()
