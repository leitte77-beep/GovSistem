from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_DEFAULTS = {
    "change-me-in-dev",
    "change_me_in_dev",
    "change-me",
    "change_me",
    "secret",
    "changeme",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "DOE Signer"
    VERSION: str = "0.1.0"
    LOG_LEVEL: str = "DEBUG"
    ENVIRONMENT: str = "development"

    SIGNER_PROVIDER: str = "a1"
    SIGNER_A1_PFX_PATH: str = "/certs/cert.pfx"
    SIGNER_A1_PASSWORD: SecretStr = SecretStr("")

    VERIFICATION_BASE_URL: str = Field(
        default="https://farol.govsistem.com.br/verificar",
        description="Base URL for verification links embedded in signed PDFs",
    )

    INTERNAL_API_KEY: SecretStr = SecretStr("dev-internal-key-saas")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @model_validator(mode="after")
    def validate_secrets(self):
        if self.is_production:
            ikey = self.INTERNAL_API_KEY.get_secret_value()
            if not ikey or len(ikey) < 32 or ikey.lower() in _INSECURE_DEFAULTS:
                raise ValueError(
                    "INTERNAL_API_KEY must be set to a strong random value "
                    "(>=32 chars) in production."
                )
            if self.SIGNER_PROVIDER.strip().lower() == "mock":
                raise ValueError(
                    "SIGNER_PROVIDER=mock is forbidden in production. "
                    "Refusing to start."
                )
        return self


settings = Settings()
