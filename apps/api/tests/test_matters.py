"""Tests for matter business rules: transitions, permissions, and validation."""


import pytest

from app.core.html_sanitizer import sanitize_html
from app.models.enums import MatterStatus


class TestMatterStatusTransitions:
    def test_draft_to_review(self):
        MatterStatus.DRAFT.assert_transition(MatterStatus.REVIEW)

    def test_review_to_approved(self):
        MatterStatus.REVIEW.assert_transition(MatterStatus.APPROVED)

    def test_review_to_rejected(self):
        MatterStatus.REVIEW.assert_transition(MatterStatus.REJECTED)

    def test_rejected_back_to_draft(self):
        MatterStatus.REJECTED.assert_transition(MatterStatus.DRAFT)

    def test_approved_cannot_go_back_to_review(self):
        with pytest.raises(ValueError):
            MatterStatus.APPROVED.assert_transition(MatterStatus.REVIEW)

    def test_draft_cannot_skip_to_approved(self):
        with pytest.raises(ValueError):
            MatterStatus.DRAFT.assert_transition(MatterStatus.APPROVED)

    def test_draft_cannot_skip_to_published(self):
        with pytest.raises(ValueError):
            MatterStatus.DRAFT.assert_transition(MatterStatus.PUBLISHED)

    def test_published_is_frozen(self):
        with pytest.raises(ValueError):
            MatterStatus.PUBLISHED.assert_transition(MatterStatus.DRAFT)
        assert not MatterStatus.PUBLISHED.can_transition_to(MatterStatus.DRAFT)
        assert not MatterStatus.PUBLISHED.can_transition_to(MatterStatus.REVIEW)
        assert not MatterStatus.PUBLISHED.can_transition_to(MatterStatus.APPROVED)

    def test_archived_is_terminal(self):
        assert not MatterStatus.ARCHIVED.can_transition_to(MatterStatus.DRAFT)

    def test_approved_only_goes_to_published(self):
        assert MatterStatus.APPROVED.can_transition_to(MatterStatus.PUBLISHED)
        assert not MatterStatus.APPROVED.can_transition_to(MatterStatus.REVIEW)
        assert not MatterStatus.APPROVED.can_transition_to(MatterStatus.REJECTED)


class TestMatterImmutability:
    """Matters in approved/published/archived status cannot be edited."""

    def test_draft_is_editable(self):
        assert MatterStatus.can_edit(MatterStatus.DRAFT)

    def test_review_is_editable(self):
        assert MatterStatus.can_edit(MatterStatus.REVIEW)

    def test_rejected_is_editable(self):
        assert MatterStatus.can_edit(MatterStatus.REJECTED)

    def test_approved_is_not_editable(self):
        assert not MatterStatus.can_edit(MatterStatus.APPROVED)

    def test_published_is_not_editable(self):
        assert not MatterStatus.can_edit(MatterStatus.PUBLISHED)

    def test_archived_is_not_editable(self):
        assert not MatterStatus.can_edit(MatterStatus.ARCHIVED)


class TestSanitizeOnCreate:
    """The creation schema must sanitize HTML before storing."""

    def test_sanitize_strips_scripts(self):
        dirty = "<p>Clean</p><script>alert(1)</script>"
        clean = sanitize_html(dirty)
        assert "<p>Clean</p>" in clean
        assert "<script>" not in clean

    def test_sanitize_strips_iframes(self):
        dirty = "<p>OK</p><iframe src='http://evil.com'></iframe>"
        clean = sanitize_html(dirty)
        assert "iframe" not in clean
        assert "OK" in clean

    def test_sanitize_allows_safe_tables(self):
        safe = "<table><tr><td>R$ 1.000,00</td></tr></table>"
        result = sanitize_html(safe)
        assert "<table>" in result
        assert "R$ 1.000,00" in result

    def test_sanitize_removes_inline_events(self):
        dirty = '<p onclick="alert(1)">Click me</p>'
        clean = sanitize_html(dirty)
        assert "onclick" not in clean
        assert "Click me" in clean

    def test_sanitize_removes_javascript_href(self):
        dirty = '<a href="javascript:alert(1)">link</a>'
        clean = sanitize_html(dirty)
        assert "javascript:" not in clean
        assert "<a" in clean


class TestApprovedCanEnterEdition:
    """Only APPROVED matters can be included in an edition."""

    def test_approved_is_eligible(self):
        assert MatterStatus.APPROVED.can_transition_to(MatterStatus.PUBLISHED)

    def test_draft_is_not_eligible(self):
        assert not MatterStatus.DRAFT.can_transition_to(MatterStatus.PUBLISHED)

    def test_review_is_not_eligible(self):
        assert not MatterStatus.REVIEW.can_transition_to(MatterStatus.PUBLISHED)

    def test_published_is_already_published(self):
        assert MatterStatus.PUBLISHED.can_transition_to(MatterStatus.ARCHIVED)


class TestEditionReadyStatus:
    """Diagramador workflow: only sees APPROVED matters."""

    def test_diagramador_works_with_approved(self):
        assert MatterStatus.APPROVED.can_transition_to(MatterStatus.PUBLISHED)

    def test_draft_not_ready_for_diagramador(self):
        assert not MatterStatus.DRAFT.can_transition_to(MatterStatus.PUBLISHED)

    def test_review_not_ready_for_diagramador(self):
        assert not MatterStatus.REVIEW.can_transition_to(MatterStatus.PUBLISHED)
