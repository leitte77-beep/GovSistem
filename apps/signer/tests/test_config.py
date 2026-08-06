"""Test configuration settings and defaults."""

import pytest

from app.core.config import Settings


class TestSettingsDefaults:
    def test_app_name_default(self):
        s = Settings()
        assert s.APP_NAME == "DOE Signer"

    def test_version_default(self):
        s = Settings()
        assert s.VERSION == "0.1.0"

    def test_log_level_default(self):
        s = Settings()
        assert s.LOG_LEVEL == "DEBUG"

    def test_signer_provider_default(self):
        s = Settings()
        assert s.SIGNER_PROVIDER == "a1"

    def test_internal_api_key_has_default(self):
        s = Settings()
        key = s.INTERNAL_API_KEY.get_secret_value()
        assert isinstance(key, str)
        assert len(key) > 0
        assert key == "dev-internal-key-saas"

    def test_verification_base_url_default(self):
        s = Settings()
        assert s.VERIFICATION_BASE_URL == "https://govsistem.com.br/verificar"

    def test_signer_a1_pfx_path_default(self):
        s = Settings()
        assert s.SIGNER_A1_PFX_PATH == "/certs/cert.pfx"

    def test_signer_a1_password_is_secret_str(self):
        s = Settings()
        assert s.SIGNER_A1_PASSWORD.get_secret_value() == ""


class TestSettingsOverride:
    def test_override_via_kwargs(self):
        s = Settings(APP_NAME="Custom App")
        assert s.APP_NAME == "Custom App"

    def test_override_internal_api_key(self):
        s = Settings(INTERNAL_API_KEY="super-secret")
        assert s.INTERNAL_API_KEY.get_secret_value() == "super-secret"

    def test_override_signer_provider(self):
        s = Settings(SIGNER_PROVIDER="icp-brasil")
        assert s.SIGNER_PROVIDER == "icp-brasil"


def test_settings_singleton_import():
    """Verify the module-level settings instance imports cleanly."""
    from app.core.config import settings
    assert settings.APP_NAME == "DOE Signer"
    assert settings.SIGNER_PROVIDER == "a1"
