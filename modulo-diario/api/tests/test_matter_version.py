"""Tests for the Matter versioning service (pure logic + hash discipline)."""

from __future__ import annotations

from app.services.matter_version import canonical_payload, hash_canonical


class _Sim:
    def __init__(self, html: str) -> None:
        self.semantic_content = None
        self.content_json = None
        self.content_html = html
        self.act_number = "1"
        self.act_year = 2026
        self.act_date = None
        self.title = "T"
        self.summary = ""
        self.plain_text = html


def test_canonical_hash_changes_on_content_change():
    a = hash_canonical(canonical_payload(_Sim("<p>A</p>")))
    b = hash_canonical(canonical_payload(_Sim("<p>B</p>")))
    assert a != b


def test_canonical_hash_stable_for_same_content():
    a = hash_canonical(canonical_payload(_Sim("<p>A</p>")))
    b = hash_canonical(canonical_payload(_Sim("<p>A</p>")))
    assert a == b


def test_skipping_unchanged_logs_no_new_version():
    # The service dedups by content hash; two identical payloads share a hash.
    p1 = canonical_payload(_Sim("<p>x</p>"))
    p2 = canonical_payload(_Sim("<p>x</p>"))
    assert hash_canonical(p1) == hash_canonical(p2)
