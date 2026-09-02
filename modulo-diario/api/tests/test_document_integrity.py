from __future__ import annotations

from app.services.document_integrity import (
    canonical_matter_core,
    codes_match,
    matter_content_hash,
    normalize_public_code,
)


def _matter(**overrides):
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "organization_id": "22222222-2222-2222-2222-222222222222",
        "act_type_name": "Portaria",
        "act_number": "04",
        "act_year": 2026,
        "act_date": "2026-09-01",
        "title": "PORTARIA – 04/2026",
        "summary": "EXONERA A SERVIDORA NEIDE",
        "content_html": "<p>EXONERAR...</p>",
    }
    base.update(overrides)
    return base


class TestMatterContentHash:
    def test_same_content_same_hash(self):
        assert matter_content_hash(_matter()) == matter_content_hash(_matter())

    def test_one_char_change_changes_hash(self):
        a = _matter(summary="EXONERA A SERVIDORA NEIDE")
        b = _matter(summary="EXONERA A SERVIDORA NEID")
        assert matter_content_hash(a) != matter_content_hash(b)

    def test_deterministic_key_order_and_utf8(self):
        a = matter_content_hash(_matter(title="Edital – 001/2026 ção"))
        b = matter_content_hash(_matter(title="Edital – 001/2026 ção"))
        assert a == b

    def test_tenant_id_participates_but_not_name(self):
        # two tenants (different org ids) → different hash
        h1 = matter_content_hash(_matter(organization_id="a"))
        h2 = matter_content_hash(_matter(organization_id="b"))
        assert h1 != h2
        # tenant display name/domain is not part of the canonical core
        core = canonical_matter_core(_matter())
        assert "farol" not in str(core["title"])

    def test_legacy_html_only_matter_is_hashable(self):
        m = {
            "id": "3",
            "act_number": None,
            "act_year": None,
            "act_date": None,
            "title": "Aviso",
            "summary": None,
            "content_html": "<p>texto</p>",
        }
        assert isinstance(matter_content_hash(m), str)
        assert len(matter_content_hash(m)) == 64

    def test_semantic_equals_html_variant_is_stable(self):
        sem = _matter(semantic={"blocks": [{"type": "p", "content": "x"}]}, content_html="")
        html = _matter(content_html="<p>x</p>", semantic=None)
        # different canonical representations → intentionally different hashes
        assert matter_content_hash(sem) != matter_content_hash(html)


class TestNormalizePublicCode:
    def test_uppercase_and_strip(self):
        assert normalize_public_code("  20260023-296cd414  ") == "20260023-296CD414"

    def test_codes_match_case_and_dash(self):
        assert codes_match("20260023-296CD414", "20260023-296cd414")
        assert codes_match("20260023-296CD414", "20260023-296CD414")
        # dash-insensitive (typed without dash)
        assert codes_match("20260023-296CD414", "20260023296CD414")
        assert codes_match("20260023-296CD414", " 20260023-296CD414 ")

    def test_mismatch(self):
        assert not codes_match("20260023-296CD414", "20260023-AAAAAA")
        assert not codes_match(None, "x")
        assert not codes_match("x", None)
