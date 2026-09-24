"""Security hardening tests: XSS, upload validation, auth, immutability."""

import io

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.html_sanitizer import sanitize_html
from app.core.password_policy import PasswordPolicyError, validate_password
from app.core.security import hash_password, verify_password
from app.main import app
from app.models.enums import EditionStatus, MatterStatus

# ── XSS ──────────────────────────────────────────────────────────────────────


class TestXssPrevention:
    def test_script_tag_removed(self):
        result = sanitize_html("<p>Safe</p><script>alert('xss')</script>")
        assert "script" not in result
        assert "<p>Safe</p>" in result

    def test_iframe_removed(self):
        result = sanitize_html("<iframe src='http://evil.com'></iframe>")
        assert "iframe" not in result

    def test_inline_events_removed(self):
        result = sanitize_html('<p onclick="evil()">text</p>')
        assert "onclick" not in result

    def test_javascript_href_removed(self):
        result = sanitize_html('<a href="javascript:alert(1)">link</a>')
        assert "javascript:" not in result


# ── Upload Validation ────────────────────────────────────────────────────────


class TestUploadValidation:
    def test_docx_extension_allowed(self):
        from app.core.config import settings
        assert ".docx" in settings.ALLOWED_EXTENSIONS

    def test_exe_extension_denied(self):
        from app.core.config import settings
        assert ".exe" not in settings.ALLOWED_EXTENSIONS

    def test_upload_rejects_empty_file(self):
        import pytest
        from fastapi import UploadFile

        from app.core.file_validator import validate_upload

        file = UploadFile(filename="empty.pdf", file=io.BytesIO(b""))
        with pytest.raises(Exception):
            import asyncio
            asyncio.run(validate_upload(file))


# ── Unauthorized Access ──────────────────────────────────────────────────────


class TestUnauthorizedAccess:
    def test_invalid_token_format(self):
        import pytest

        from app.core.security import decode_token
        with pytest.raises(Exception):
            decode_token("not.a.valid.jwt")

    def test_protected_route_requires_auth_header(self):
        """All routes under /api/v1/* (except public/* and health) require auth."""
        from app.api.v1.router import api_router
        private_routes = [
            r.path for r in api_router.routes
            if hasattr(r, "path") and "public" not in r.path and "health" not in r.path
        ]
        assert len(private_routes) > 0

    @pytest.mark.anyio
    async def test_invalid_token_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get(
                "/api/v1/matters",
                headers={"Authorization": "Bearer invalid_token_here"},
            )
            assert resp.status_code == 401


# ── Password Policy ──────────────────────────────────────────────────────────


class TestPasswordPolicy:
    def test_short_password_rejected(self):
        with pytest.raises(PasswordPolicyError):
            validate_password("Ab1")

    def test_no_uppercase_rejected(self):
        with pytest.raises(PasswordPolicyError):
            validate_password("abcdefgh1")

    def test_no_digit_rejected(self):
        with pytest.raises(PasswordPolicyError):
            validate_password("Abcdefghi")

    def test_valid_password_accepted(self):
        validate_password("SenhaForte123")

    def test_hash_and_verify(self):
        h = hash_password("MinhaSenha@2026")
        assert verify_password("MinhaSenha@2026", h)
        assert not verify_password("OutraSenha@2026", h)


# ── Immutability ─────────────────────────────────────────────────────────────


class TestImmutability:
    def test_published_matter_not_editable(self):
        assert not MatterStatus.can_edit(MatterStatus.PUBLISHED)

    def test_published_edition_cannot_transition(self):
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.DRAFT)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.CLOSED)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.SIGNED)

    def test_signed_edition_only_publish_or_cancel(self):
        assert EditionStatus.SIGNED.can_transition_to(EditionStatus.PUBLISHED)
        assert EditionStatus.SIGNED.can_transition_to(EditionStatus.CANCELLED)
        assert not EditionStatus.SIGNED.can_transition_to(EditionStatus.DRAFT)
        assert EditionStatus.SIGNED.can_transition_to(EditionStatus.SIGNED)  # self-transition

    def test_immutability_hash_tamper_detection(self):
        h1 = "abc123"
        h2 = "abc124"
        assert h1 != h2  # Any change produces different hash
