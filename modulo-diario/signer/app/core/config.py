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

    # ICP-Brasil trust store and revocation.
    ICP_BRASIL_ROOTS_PATH: str = "/certs/icp-brasil-roots.pem"
    # off | crl | ocsp | both — "off" reports revocation as not checked.
    REVOCATION_MODE: str = "off"
    REVOCATION_TIMEOUT: float = 10.0

    # RFC 3161 timestamp authority (ACT). Empty disables timestamping.
    TSA_URL: str = ""
    TSA_POLICY_OID: str = ""

    # PAdES signature policy OID to embed, when legally defined by the entity.
    # Embedding also requires the SHA-256 of the official policy document and
    # its URI (both published by ITI). Left empty => no policy is embedded and
    # ``policy_oid`` is reported as empty (never claim a policy not applied).
    SIGNER_POLICY_OID: str = ""
    SIGNER_POLICY_HASH: str = ""  # hex SHA-256 of the policy document
    SIGNER_POLICY_URI: str = ""

    # A3 (token/HSM or remote PSC) provider configuration.
    SIGNER_A3_REMOTE_URL: str = ""
    SIGNER_A3_REMOTE_TOKEN: SecretStr = SecretStr("")

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
