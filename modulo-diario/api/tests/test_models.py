"""Unit tests for data model rules: status transitions and immutability."""

import pytest

from app.models.enums import EditionStatus, MatterStatus

# ─── Matter Status Transitions ───────────────────────────────────────────────

class TestMatterStatusTransitions:
    def test_draft_can_go_to_review(self):
        assert MatterStatus.DRAFT.can_transition_to(MatterStatus.REVIEW)

    def test_draft_can_go_to_archived(self):
        assert MatterStatus.DRAFT.can_transition_to(MatterStatus.ARCHIVED)

    def test_draft_cannot_skip_to_published(self):
        assert not MatterStatus.DRAFT.can_transition_to(MatterStatus.PUBLISHED)

    def test_draft_cannot_go_to_approved(self):
        assert not MatterStatus.DRAFT.can_transition_to(MatterStatus.APPROVED)

    def test_review_can_go_to_approved(self):
        assert MatterStatus.REVIEW.can_transition_to(MatterStatus.APPROVED)

    def test_review_can_go_to_rejected(self):
        assert MatterStatus.REVIEW.can_transition_to(MatterStatus.REJECTED)

    def test_review_can_return_to_draft(self):
        assert MatterStatus.REVIEW.can_transition_to(MatterStatus.DRAFT)

    def test_approved_can_be_published(self):
        assert MatterStatus.APPROVED.can_transition_to(MatterStatus.PUBLISHED)

    def test_approved_can_return_to_draft(self):
        assert MatterStatus.APPROVED.can_transition_to(MatterStatus.DRAFT)

    def test_approved_cannot_skip_to_review(self):
        assert not MatterStatus.APPROVED.can_transition_to(MatterStatus.REVIEW)

    def test_published_cannot_transition_to_anything_except_archived(self):
        assert MatterStatus.PUBLISHED.can_transition_to(MatterStatus.ARCHIVED)
        assert not MatterStatus.PUBLISHED.can_transition_to(MatterStatus.DRAFT)
        assert not MatterStatus.PUBLISHED.can_transition_to(MatterStatus.REVIEW)
        assert not MatterStatus.PUBLISHED.can_transition_to(MatterStatus.APPROVED)
        assert not MatterStatus.PUBLISHED.can_transition_to(MatterStatus.REJECTED)

    def test_archived_is_terminal(self):
        assert not MatterStatus.ARCHIVED.can_transition_to(MatterStatus.DRAFT)
        assert not MatterStatus.ARCHIVED.can_transition_to(MatterStatus.PUBLISHED)

    def test_rejected_can_return_to_draft(self):
        assert MatterStatus.REJECTED.can_transition_to(MatterStatus.DRAFT)

    def test_rejected_cannot_skip_to_approved(self):
        assert not MatterStatus.REJECTED.can_transition_to(MatterStatus.APPROVED)

    def test_self_transition_is_allowed(self):
        assert MatterStatus.DRAFT.can_transition_to(MatterStatus.DRAFT)
        assert MatterStatus.PUBLISHED.can_transition_to(MatterStatus.PUBLISHED)


class TestMatterStatusAssertTransition:
    def test_valid_raises_no_error(self):
        MatterStatus.DRAFT.assert_transition(MatterStatus.REVIEW)

    def test_invalid_raises_value_error(self):
        with pytest.raises(ValueError, match="Status transition"):
            MatterStatus.DRAFT.assert_transition(MatterStatus.PUBLISHED)

    def test_published_transition_raises_error(self):
        with pytest.raises(ValueError, match="Status transition"):
            MatterStatus.PUBLISHED.assert_transition(MatterStatus.DRAFT)


class TestMatterImmutability:
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


# ─── Edition Status Transitions ──────────────────────────────────────────────

class TestEditionStatusTransitions:
    def test_draft_can_go_to_reviewing(self):
        assert EditionStatus.DRAFT.can_transition_to(EditionStatus.REVIEWING)

    def test_draft_can_be_cancelled(self):
        assert EditionStatus.DRAFT.can_transition_to(EditionStatus.CANCELLED)

    def test_draft_cannot_skip_to_published(self):
        assert not EditionStatus.DRAFT.can_transition_to(EditionStatus.PUBLISHED)

    def test_reviewing_can_go_to_scheduled(self):
        assert EditionStatus.REVIEWING.can_transition_to(EditionStatus.SCHEDULED)

    def test_reviewing_can_return_to_draft(self):
        assert EditionStatus.REVIEWING.can_transition_to(EditionStatus.DRAFT)

    def test_reviewing_can_be_cancelled(self):
        assert EditionStatus.REVIEWING.can_transition_to(EditionStatus.CANCELLED)

    def test_scheduled_can_go_to_closed(self):
        assert EditionStatus.SCHEDULED.can_transition_to(EditionStatus.CLOSED)

    def test_scheduled_cannot_go_directly_to_published(self):
        assert not EditionStatus.SCHEDULED.can_transition_to(EditionStatus.PUBLISHED)

    def test_scheduled_can_return_to_draft(self):
        assert EditionStatus.SCHEDULED.can_transition_to(EditionStatus.DRAFT)

    def test_scheduled_can_be_cancelled(self):
        assert EditionStatus.SCHEDULED.can_transition_to(EditionStatus.CANCELLED)

    def test_closed_can_go_to_pdf_generated(self):
        assert EditionStatus.CLOSED.can_transition_to(EditionStatus.PDF_GENERATED)

    def test_closed_cannot_go_directly_to_published(self):
        assert not EditionStatus.CLOSED.can_transition_to(EditionStatus.PUBLISHED)

    def test_closed_can_be_reopened_to_draft(self):
        assert EditionStatus.CLOSED.can_transition_to(EditionStatus.DRAFT)

    def test_closed_can_be_cancelled(self):
        assert EditionStatus.CLOSED.can_transition_to(EditionStatus.CANCELLED)

    def test_pdf_generated_can_be_signed(self):
        assert EditionStatus.PDF_GENERATED.can_transition_to(EditionStatus.SIGNED)

    def test_pdf_generated_can_return_to_closed(self):
        assert EditionStatus.PDF_GENERATED.can_transition_to(EditionStatus.CLOSED)

    def test_pdf_generated_can_be_cancelled(self):
        assert EditionStatus.PDF_GENERATED.can_transition_to(EditionStatus.CANCELLED)

    def test_signed_can_be_published(self):
        assert EditionStatus.SIGNED.can_transition_to(EditionStatus.PUBLISHED)

    def test_signed_can_be_cancelled(self):
        assert EditionStatus.SIGNED.can_transition_to(EditionStatus.CANCELLED)

    def test_signed_cannot_go_back(self):
        assert not EditionStatus.SIGNED.can_transition_to(EditionStatus.DRAFT)
        assert not EditionStatus.SIGNED.can_transition_to(EditionStatus.CLOSED)
        assert not EditionStatus.SIGNED.can_transition_to(EditionStatus.PDF_GENERATED)

    def test_published_is_terminal(self):
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.DRAFT)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.REVIEWING)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.SCHEDULED)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.CANCELLED)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.CLOSED)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.PDF_GENERATED)
        assert not EditionStatus.PUBLISHED.can_transition_to(EditionStatus.SIGNED)

    def test_cancelled_is_terminal(self):
        assert not EditionStatus.CANCELLED.can_transition_to(EditionStatus.DRAFT)
        assert not EditionStatus.CANCELLED.can_transition_to(EditionStatus.PUBLISHED)

    def test_self_transition_is_allowed(self):
        for s in EditionStatus:
            assert s.can_transition_to(s), f"{s} self-transition failed"


class TestEditionImmutability:
    def test_draft_is_editable(self):
        assert EditionStatus.can_edit(EditionStatus.DRAFT)

    def test_reviewing_is_editable(self):
        assert EditionStatus.can_edit(EditionStatus.REVIEWING)

    def test_scheduled_is_editable(self):
        assert EditionStatus.can_edit(EditionStatus.SCHEDULED)

    def test_published_is_not_editable(self):
        assert not EditionStatus.can_edit(EditionStatus.PUBLISHED)

    def test_cancelled_is_not_editable(self):
        assert not EditionStatus.can_edit(EditionStatus.CANCELLED)

    def test_closed_is_not_editable(self):
        assert not EditionStatus.can_edit(EditionStatus.CLOSED)

    def test_pdf_generated_is_not_editable(self):
        assert not EditionStatus.can_edit(EditionStatus.PDF_GENERATED)

    def test_signed_is_not_editable(self):
        assert not EditionStatus.can_edit(EditionStatus.SIGNED)


class TestEditionWorkflowHelpers:
    def test_can_sign_checks_pdf_generated(self):
        assert EditionStatus.can_sign(EditionStatus.PDF_GENERATED)
        assert not EditionStatus.can_sign(EditionStatus.DRAFT)
        assert not EditionStatus.can_sign(EditionStatus.SIGNED)
        assert not EditionStatus.can_sign(EditionStatus.PUBLISHED)

    def test_can_publish_checks_signed(self):
        assert EditionStatus.can_publish(EditionStatus.SIGNED)
        assert not EditionStatus.can_publish(EditionStatus.PDF_GENERATED)
        assert not EditionStatus.can_publish(EditionStatus.DRAFT)
        assert not EditionStatus.can_publish(EditionStatus.PUBLISHED)


class TestEditionStatusAssertTransition:
    def test_valid_raises_no_error(self):
        EditionStatus.DRAFT.assert_transition(EditionStatus.REVIEWING)

    def test_invalid_raises_value_error(self):
        with pytest.raises(ValueError, match="Status transition"):
            EditionStatus.DRAFT.assert_transition(EditionStatus.PUBLISHED)

    def test_published_transition_raises_error(self):
        with pytest.raises(ValueError, match="Status transition"):
            EditionStatus.PUBLISHED.assert_transition(EditionStatus.DRAFT)


# ─── All Status Values Coverage ──────────────────────────────────────────────

class TestStatusCoverage:
    def test_all_matter_statuses_covered(self):
        """Every MatterStatus value has an entry in valid_transitions."""
        transitions = MatterStatus.valid_transitions()
        for status in MatterStatus:
            assert status in transitions, f"{status} missing from transitions"

    def test_all_edition_statuses_covered(self):
        """Every EditionStatus value has an entry in valid_transitions."""
        transitions = EditionStatus.valid_transitions()
        for status in EditionStatus:
            assert status in transitions, f"{status} missing from transitions"

    def test_valid_transitions_values_are_valid_statuses(self):
        """All transition target values are valid MatterStatus values."""
        for source, targets in MatterStatus.valid_transitions().items():
            for target in targets:
                assert target in MatterStatus.__members__.values(), (
                    f"Invalid target {target} from {source}"
                )
