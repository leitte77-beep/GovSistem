"""Fase 2 — one canonical content source + optimistic locking."""

import pytest
from fastapi import HTTPException

from app.core.content_mode import (
    MODE_LEGACY_HTML,
    MODE_ORIGINAL_PDF,
    MODE_SEMANTIC,
    is_semantic,
    normalize_mode,
)
from app.core.versioning import current_etag, parse_if_match, require_no_conflict


def test_normalize_mode_maps_legacy_values():
    assert normalize_mode("rich_text") == MODE_LEGACY_HTML
    assert normalize_mode("pdf") == MODE_ORIGINAL_PDF
    assert normalize_mode("semantic") == MODE_SEMANTIC
    assert normalize_mode("legacy_html") == MODE_LEGACY_HTML
    assert normalize_mode("original_pdf") == MODE_ORIGINAL_PDF
    assert normalize_mode(None) == MODE_LEGACY_HTML
    assert normalize_mode("UNKNOWN") == MODE_LEGACY_HTML  # safe default


def test_is_semantic():
    assert is_semantic("semantic") is True
    assert is_semantic("rich_text") is False
    assert is_semantic(None) is False


def test_parse_if_match_formats():
    assert parse_if_match(_req({})) is None
    assert parse_if_match(_req({"if-match": "13"})) == 13
    assert parse_if_match(_req({"if-match": '"13-2026-09-01"'})) == 13
    assert parse_if_match(_req({"if-match": 'W/"13-abc"'})) == 13


def test_require_no_conflict_matches_when_expected_equals_current():
    matter = _matter(revision=3)
    # no header -> no conflict
    require_no_conflict(_req({}), matter)
    # matching header -> no conflict
    require_no_conflict(_req({"if-match": "3"}), matter)
    require_no_conflict(_req({"if-match": '"3-x"'}), matter)


def test_require_no_conflict_409_on_stale_version():
    matter = _matter(revision=5)
    with pytest.raises(HTTPException) as exc:
        require_no_conflict(_req({"if-match": "3"}), matter)
    assert exc.value.status_code == 409
    assert "v3" in exc.value.detail


def test_current_etag_contains_version():
    matter = _matter(revision=7)
    assert current_etag(matter) == '"7-"'


class _FakeHeaders(dict):
    def get(self, key, default=None):
        return dict.get(self, key.lower(), default)


class _FakeRequest:
    def __init__(self, headers: dict):
        self.headers = _FakeHeaders({k.lower(): v for k, v in headers.items()})


def _req(headers: dict) -> _FakeRequest:
    return _FakeRequest(headers)


def _matter(revision: int):
    class _M:
        version = revision
        updated_at = None

    return _M()
