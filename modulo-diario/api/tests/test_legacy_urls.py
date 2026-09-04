"""Tests for the legacy URL map (redirects preserve SEO)."""

from __future__ import annotations

import pytest

from app.models.legacy_url_map import LegacyUrlMap


def test_safe_path_rejects_private_routes():
    from app.api.v1.legacy_urls import _safe_path

    assert _safe_path("/edicoes/2026/1") == "/edicoes/2026/1"
    with pytest.raises(Exception):
        _safe_path("/admin/settings")
    with pytest.raises(Exception):
        _safe_path("/api/v1/editions")


def test_redirect_target_is_sanitized():
    from app.api.v1.legacy_urls import _safe_path

    assert _safe_path("edicoes/2026/1") == "/edicoes/2026/1"


def test_model_carries_original_url_to_new_path():
    m = LegacyUrlMap(
        organization_id=None,
        legacy_url="/antigo/2026/1.html",
        new_path="/edicoes/2026/1",
        status="active",
    )
    assert m.legacy_url == "/antigo/2026/1.html"
    assert m.new_path == "/edicoes/2026/1"
