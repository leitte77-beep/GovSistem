"""Canonical semantic document schema (Fase 2).

The semantic document is the single source of truth for a matter's content.
It is expressed as a versioned JSONB structure with typed, discriminated-union
blocks. The same document drives the editor, review, public page and PDF.

Design notes:
  * ``schema_version`` must be bumped on any breaking change.
  * Every block carries a stable ``id``, a ``type`` (discriminator), an
    ``order``, the raw source it came from, a classification ``confidence``
    and a ``confirmed`` flag (human confirmation required for low confidence).
  * ``content_hash`` is the SHA-256 of the block's canonical serialization.
  * No block ever re-writes legal text silently: text fidelity is enforced
    separately by ``app.semantic.integrity``.
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Annotated, Literal, Optional, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

SCHEMA_VERSION = 1
DOCUMENT_TYPE_DEFAULT = "ato_oficial"
CLASSIFICATION_PENDING = "pending"
CLASSIFICATION_CONFIRMED = "confirmed"
CLASSIFICATION_AUTO = "auto"

# Block source origin
ORIGIN_MANUAL = "manual"
ORIGIN_PASTE_HTML = "paste_html"
ORIGIN_PASTE_PLAIN = "paste_plain"
ORIGIN_DETERMINISTIC = "deterministic"
ORIGIN_AI_SUGGESTED = "ai_suggested"
ORIGIN_LEGACY_HTML = "legacy_html"
ORIGIN_PDF = "pdf"


def stable_id() -> str:
    return uuid.uuid4().hex[:12]


def sha256_of(obj: dict) -> str:
    import json

    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    ).hexdigest()


class BlockBase(BaseModel):
    """Common fields for every semantic block."""

    id: str = Field(default_factory=stable_id)
    order: int = 0
    origin: str = ORIGIN_MANUAL
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    confirmed: bool = False
    metadata: dict = Field(default_factory=dict)
    content_hash: Optional[str] = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _ensure_block_hash(self):
        if self.content_hash is None:
            self.content_hash = self.compute_content_hash()
        return self

    def compute_content_hash(self) -> str:
        payload = self.model_dump(
            mode="json", exclude={"content_hash", "id", "order"}
        )
        return sha256_of(payload)


class RichTextBlock(BlockBase):
    """A block whose content is controlled rich text (HTML)."""

    content: str = ""
    rich: bool = True


# ── Concrete blocks ──────────────────────────────────────────────────────────


class HeadingBlock(BlockBase):
    type: Literal["heading"] = "heading"
    level: int = Field(default=1, ge=1, le=6)
    text: str = ""


class PreambleBlock(RichTextBlock):
    type: Literal["preamble"] = "preamble"


class CommandBlock(BlockBase):
    """E.g. 'DECRETA:', 'RESOLVE:', 'SANCIONA:', 'TORNA PÚBLICO:'."""

    type: Literal["command"] = "command"
    text: str = ""


class ParagraphBlock(RichTextBlock):
    type: Literal["paragraph"] = "paragraph"


class ParagraphItemBlock(RichTextBlock):
    """A § paragraph that belongs to an article."""

    type: Literal["paragraph_item"] = "paragraph_item"
    number: Optional[str] = None  # None => 'Parágrafo único'
    text: str = ""


class IncisoBlock(RichTextBlock):
    type: Literal["inciso"] = "inciso"
    number: str = ""  # roman numeral, e.g. "I"
    text: str = ""


class AlineaBlock(RichTextBlock):
    type: Literal["alinea"] = "alinea"
    number: str = ""  # lowercase letter, e.g. "a"
    text: str = ""


class ListBlock(RichTextBlock):
    type: Literal["list"] = "list"
    ordered: bool = False
    items: list[str] = Field(default_factory=list)


class TableCell(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = ""
    rowspan: int = Field(default=1, ge=1)
    colspan: int = Field(default=1, ge=1)
    header: bool = False
    align: Optional[str] = None  # left | center | right | justify
    valign: Optional[str] = None  # top | middle | bottom
    is_total: bool = False


class TableBlock(BlockBase):
    type: Literal["table"] = "table"
    caption: str = ""
    headers: list[str] = Field(default_factory=list)
    rows: list[list[TableCell]] = Field(default_factory=list)
    column_widths: list[float] = Field(default_factory=list)
    repeat_header: bool = True
    original_data: list[list[str]] = Field(default_factory=list)


class ImageBlock(BlockBase):
    type: Literal["image"] = "image"
    src: str = ""
    alt: str = ""
    caption: str = ""


class QuoteBlock(RichTextBlock):
    type: Literal["quote"] = "quote"


class PageBreakBlock(BlockBase):
    type: Literal["page_break"] = "page_break"


class SignatureEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = ""
    role: str = ""
    organ: str = ""
    location: str = ""
    date: str = ""
    functional_id: Optional[str] = None


class SignatureBlock(BlockBase):
    """Visual block of the issuing authority.

    This is NOT the PDF digital signature (PAdES). It is the human-facing
    authority signature block rendered by the visual template.
    """

    type: Literal["signature_block"] = "signature_block"
    entries: list[SignatureEntry] = Field(default_factory=list)
    alignment: str = "center"


class AttachmentReferenceBlock(BlockBase):
    type: Literal["attachment_reference"] = "attachment_reference"
    file_id: Optional[str] = None
    filename: str = ""
    title: str = ""


class LegacyHtmlBlock(RichTextBlock):
    type: Literal["legacy_html"] = "legacy_html"


class PdfReferenceBlock(BlockBase):
    type: Literal["pdf_reference"] = "pdf_reference"
    src: str = ""
    page_count: int = 0
    mode: str = "pdf_original"


class ArticleBlock(BlockBase):
    """Article with number, optional suffix, caput, and nested structure."""

    type: Literal["article"] = "article"
    number: Optional[str] = None
    suffix: Optional[str] = None  # e.g. 'Art. 1º-A'
    caput: str = ""
    paragraphs: list[ParagraphItemBlock] = Field(default_factory=list)
    incisos: list[IncisoBlock] = Field(default_factory=list)
    alineas: list[AlineaBlock] = Field(default_factory=list)
    items: list[str] = Field(default_factory=list)  # nested 'a)' items
    rich: bool = True


# ── Discriminated union ──────────────────────────────────────────────────────

SemanticBlock = Annotated[
    Union[
        HeadingBlock,
        PreambleBlock,
        CommandBlock,
        ParagraphBlock,
        ParagraphItemBlock,
        IncisoBlock,
        AlineaBlock,
        ListBlock,
        TableBlock,
        ImageBlock,
        QuoteBlock,
        PageBreakBlock,
        SignatureBlock,
        AttachmentReferenceBlock,
        LegacyHtmlBlock,
        PdfReferenceBlock,
        ArticleBlock,
    ],
    Field(discriminator="type"),
]


# ── Document ─────────────────────────────────────────────────────────────────


class SemanticDocument(BaseModel):
    schema_version: int = SCHEMA_VERSION
    document_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    document_type: str = DOCUMENT_TYPE_DEFAULT
    title: str = ""
    summary: str = ""
    locale: str = "pt-BR"
    timezone: str = "America/Sao_Paulo"
    template_id: Optional[str] = None
    template_version: Optional[str] = None
    source_type: str = ORIGIN_MANUAL
    source_hash: Optional[str] = None
    text_integrity_hash: Optional[str] = None
    classification_status: str = CLASSIFICATION_PENDING
    blocks: list[SemanticBlock] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("blocks")
    @classmethod
    def _assign_orders(cls, blocks: list[SemanticBlock]) -> list[SemanticBlock]:
        for i, block in enumerate(blocks):
            block.order = i
            if block.content_hash is None:
                block.content_hash = block.compute_content_hash()
        return blocks

    @model_validator(mode="after")
    def _ensure_block_hashes(self) -> "SemanticDocument":
        for i, block in enumerate(self.blocks):
            block.order = i
            if block.content_hash is None:
                block.content_hash = block.compute_content_hash()
        return self

    def plain_text(self) -> str:
        """Extract a normalized plain-text representation of all blocks."""
        import re

        parts: list[str] = []
        for block in self.blocks:
            btype = block.type
            if btype == "heading":
                parts.append(_strip_html(block.text))
            elif btype == "command":
                parts.append(block.text)
            elif btype == "article":
                label = f"Art. {block.suffix or block.number}".strip() if (block.suffix or block.number) else "Art."
                parts.append(label)
                parts.append(_strip_html(block.caput))
                for p in block.paragraphs:
                    pnum = f"§ {p.number}" if p.number else "Parágrafo único"
                    parts.append(pnum)
                    parts.append(_strip_html(p.content))
                for i in block.incisos:
                    parts.append(i.number)
                    parts.append(_strip_html(i.content))
                for a in block.alineas:
                    parts.append(a.number)
                    parts.append(_strip_html(a.content))
            elif btype in ("legacy_html", "paragraph", "preamble", "quote"):
                parts.append(_strip_html(block.content))
            elif btype == "paragraph_item":
                parts.append(f"§ {block.number}".strip() if block.number else "Parágrafo único")
                parts.append(_strip_html(block.content))
            elif btype == "inciso":
                parts.append(block.number)
                parts.append(_strip_html(block.content))
            elif btype == "alinea":
                parts.append(block.number)
                parts.append(_strip_html(block.content))
            elif btype == "list":
                parts.extend(_strip_html(i) for i in block.items)
            elif btype == "table":
                parts.append(_strip_html(block.caption))
                for row in block.rows:
                    for cell in row:
                        parts.append(_strip_html(cell.content))
                for row in block.original_data:
                    parts.extend(row)
            elif btype == "signature_block":
                for entry in block.entries:
                    parts.append(entry.name)
                    parts.append(entry.role)
                    parts.append(entry.organ)
            elif btype == "image":
                parts.append(block.alt)
            elif btype == "attachment_reference":
                parts.append(block.title)
        return "\n".join(p for p in parts if p)


def _strip_html(value: str) -> str:
    import html as html_mod
    import re

    if not value:
        return ""
    value = re.sub(r"<[^>]+>", " ", value)
    value = html_mod.unescape(value)
    return re.sub(r"\s+", " ", value).strip()
