from enum import Enum


class MatterStatus(str, Enum):
    DRAFT = "draft"
    REVIEW = "review"
    APPROVED = "approved"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    REJECTED = "rejected"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.DRAFT: [cls.REVIEW, cls.ARCHIVED],
            cls.REVIEW: [cls.APPROVED, cls.REJECTED, cls.DRAFT],
            cls.APPROVED: [cls.PUBLISHED, cls.DRAFT],
            cls.PUBLISHED: [cls.ARCHIVED],
            cls.ARCHIVED: [],
            cls.REJECTED: [cls.DRAFT, cls.REVIEW],
        }

    def can_transition_to(self, target: "MatterStatus") -> bool:
        if self == target:
            return True
        allowed = self.valid_transitions().get(self, [])
        return target in allowed

    def assert_transition(self, target: "MatterStatus") -> None:
        if not self.can_transition_to(target):
            raise ValueError(
                f"Status transition from '{self.value}' to '{target.value}' "
                f"is not allowed for Matter"
            )

    @classmethod
    def can_edit(cls, status: "MatterStatus") -> bool:
        return status in (cls.DRAFT, cls.REVIEW, cls.REJECTED)


class EditionType(str, Enum):
    NORMAL = "normal"
    EXTRA = "extra"
    SUPLEMENTAR = "suplementar"


class EditionStatus(str, Enum):
    DRAFT = "draft"
    REVIEWING = "reviewing"
    SCHEDULED = "scheduled"
    CLOSED = "closed"
    PDF_GENERATED = "pdf_generated"
    SIGNED = "signed"
    PUBLISHED = "published"
    CANCELLED = "cancelled"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.DRAFT: [cls.REVIEWING, cls.CLOSED, cls.CANCELLED],
            cls.REVIEWING: [cls.SCHEDULED, cls.CLOSED, cls.DRAFT, cls.CANCELLED],
            cls.SCHEDULED: [cls.CLOSED, cls.DRAFT, cls.CANCELLED],
            cls.CLOSED: [cls.PDF_GENERATED, cls.DRAFT, cls.CANCELLED],
            cls.PDF_GENERATED: [cls.SIGNED, cls.CLOSED, cls.CANCELLED, cls.DRAFT],
            cls.SIGNED: [cls.PUBLISHED, cls.CANCELLED],
            cls.PUBLISHED: [],
            cls.CANCELLED: [],
        }

    def can_transition_to(self, target: "EditionStatus") -> bool:
        if self == target:
            return True
        allowed = self.valid_transitions().get(self, [])
        return target in allowed

    def assert_transition(self, target: "EditionStatus") -> None:
        if not self.can_transition_to(target):
            raise ValueError(
                f"Status transition from '{self.value}' to '{target.value}' "
                f"is not allowed for Edition"
            )

    @classmethod
    def can_edit(cls, status: "EditionStatus") -> bool:
        status = cls(status)
        return status in (cls.DRAFT, cls.REVIEWING, cls.SCHEDULED)

    @classmethod
    def can_add_items(cls, status: "EditionStatus") -> bool:
        status = cls(status)
        return status in (cls.DRAFT, cls.REVIEWING, cls.SCHEDULED)

    @classmethod
    def can_reopen(cls, status: "EditionStatus") -> bool:
        status = cls(status)
        return status in (cls.CLOSED, cls.PDF_GENERATED)

    @classmethod
    def can_sign(cls, status: "EditionStatus") -> bool:
        status = cls(status)
        return status == cls.PDF_GENERATED

    @classmethod
    def can_publish(cls, status: "EditionStatus") -> bool:
        status = cls(status)
        return status == cls.SIGNED


class MatterRelationType(str, Enum):
    """Structured, auditable relationship between two published matters.

    Semantics (source acts upon target):
      RECTIFIES    → source corrects target (target stays published; source is the erratum)
      REPUBLISHES  → source re-publishes target's content (e.g. after a defect)
      CANCELS      → source formally cancels target (target stays available)
      REVOKES      → source revokes the legal effect of target (target text stays)
      AMENDS       → source alters target (laws/decrees/portarias)
      SUPERSEDES   → source replaces target
      COMPLEMENTS  → source supplements target
    """

    RECTIFIES = "rectifies"
    REPUBLISHES = "republishes"
    CANCELS = "cancels"
    REVOKES = "revokes"
    AMENDS = "amends"
    SUPERSEDES = "supersedes"
    COMPLEMENTS = "complements"

    @property
    def label(self) -> str:
        return _RELATION_LABELS.get(self, self.value)

    @property
    def inverse(self) -> str:
        """When displayed from the target side ('X was ... by source')."""
        return _RELATION_INVERSE.get(self, self.value)


_RELATION_LABELS = {
    MatterRelationType.RECTIFIES: "Retifica",
    MatterRelationType.REPUBLISHES: "Republica",
    MatterRelationType.CANCELS: "Cancela",
    MatterRelationType.REVOKES: "Revoga",
    MatterRelationType.AMENDS: "Altera",
    MatterRelationType.SUPERSEDES: "Substitui",
    MatterRelationType.COMPLEMENTS: "Complementa",
}

_RELATION_INVERSE = {
    MatterRelationType.RECTIFIES: "Retificada",
    MatterRelationType.REPUBLISHES: "Republicada",
    MatterRelationType.CANCELS: "Cancelada",
    MatterRelationType.REVOKES: "Revogada",
    MatterRelationType.AMENDS: "Alterada",
    MatterRelationType.SUPERSEDES: "Substituída",
    MatterRelationType.COMPLEMENTS: "Complementada",
}


class AttachmentType(str, Enum):
    ANNEX = "annex"
    APPENDIX = "appendix"
    REFERENCE = "reference"
    OTHER = "other"


class SignatureProviderType(str, Enum):
    A1 = "a1"
    A3 = "a3"
    HSM = "hsm"
    CLOUD = "cloud"
    SEAL = "seal"


class AuditAction(str, Enum):
    MATTER_CREATED = "matter.created"
    MATTER_UPDATED = "matter.updated"
    MATTER_STATUS_CHANGED = "matter.status_changed"
    MATTER_PUBLISHED = "matter.published"
    MATTER_RELATION_CREATED = "matter.relation.created"
    MATTER_RELATION_DELETED = "matter.relation.deleted"
    EDITION_CREATED = "edition.created"
    EDITION_UPDATED = "edition.updated"
    EDITION_STATUS_CHANGED = "edition.status_changed"
    EDITION_PUBLISHED = "edition.published"
    EDITION_SIGNED = "edition.signed"
    EDITION_CANCELLED = "edition.cancelled"
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_ROLE_CHANGED = "user.role_changed"
    CREDENTIAL_CREATED = "credential.created"
    CREDENTIAL_UPDATED = "credential.updated"
    FILE_UPLOADED = "file.uploaded"
    FILE_DELETED = "file.deleted"
    LOGIN = "auth.login"
    LOGIN_FAILED = "auth.login_failed"
    LOGOUT = "auth.logout"
