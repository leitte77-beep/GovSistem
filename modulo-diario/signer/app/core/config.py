from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    APP_NAME: str = "DOE Signer"
    VERSION: str = "0.1.0"
    LOG_LEVEL: str = "DEBUG"

    SIGNER_PROVIDER: str = "a1"
    SIGNER_A1_PFX_PATH: str = "/certs/cert.pfx"
    SIGNER_A1_PASSWORD: SecretStr = SecretStr("")

    VERIFICATION_BASE_URL: str = Field(
        default="http://localhost:7200/verificar",
        description="Base URL for verification links embedded in signed PDFs",
    )

    INTERNAL_API_KEY: SecretStr = SecretStr("")


settings = Settings()
