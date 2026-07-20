"""Tipos centrais do modulo gazette: blocos, tipos de documento e templates."""

import re
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class BlockType(str, Enum):
    CATEGORY = "category"
    DOCUMENT_TITLE = "document_title"
    DOCUMENT_SUBTITLE = "document_subtitle"
    SUMMARY = "summary"
    PREAMBLE = "preamble"
    CONSIDERATION = "consideration"
    COMMAND = "command"
    ARTICLE = "article"
    PARAGRAPH = "paragraph"
    SOLE_PARAGRAPH = "sole_paragraph"
    SUBSECTION = "subsection"
    LETTER_ITEM = "letter_item"
    NUMBERED_ITEM = "numbered_item"
    BODY_PARAGRAPH = "body_paragraph"
    FIELD = "field"
    COMPANY_INFORMATION = "company_information"
    TABLE = "table"
    TOTAL_VALUE = "total_value"
    LOCATION = "location"
    DATE = "date"
    SIGNATURE_NAME = "signature_name"
    SIGNATURE_ROLE = "signature_role"
    ANNEX_TITLE = "annex_title"
    ANNEX_CONTENT = "annex_content"
    NOTICE = "notice"
    UNKNOWN = "unknown"


class BlockSource(str, Enum):
    HTML = "html"
    RULE = "rule"
    AI = "ai"
    FALLBACK = "fallback"
    MANUAL = "manual"


class Block(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    type: BlockType = BlockType.UNKNOWN
    order: int = 0
    original_text: str
    start_offset: int = 0
    end_offset: int = 0
    confidence: float = 0.0
    source: BlockSource = BlockSource.FALLBACK
    children: list["Block"] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)

    def iter_all(self):
        yield self
        for child in self.children:
            yield from child.iter_all()


class ParsedDocument(BaseModel):
    document_type: str = "generic"
    category: Optional[str] = None
    title: Optional[str] = None
    table_of_contents_title: Optional[str] = None
    template: str = "generic"
    confidence: float = 0.0
    source_plain_text: str = ""
    source_html: Optional[str] = None
    normalized_text: str = ""
    blocks: list[Block] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    def iter_blocks(self):
        for block in self.blocks:
            yield from block.iter_all()


TEMPLATE_NORMATIVE_ACT = "normative-act"
TEMPLATE_EXTRACT_FIELDS = "extract-fields"
TEMPLATE_PROCUREMENT = "procurement"
TEMPLATE_ADMIN_BOARD = "admin-board"
TEMPLATE_GENERIC = "generic"

TEMPLATES = (
    TEMPLATE_NORMATIVE_ACT,
    TEMPLATE_EXTRACT_FIELDS,
    TEMPLATE_PROCUREMENT,
    TEMPLATE_ADMIN_BOARD,
    TEMPLATE_GENERIC,
)


@dataclass(frozen=True)
class DocumentTypeSpec:
    """Registro central e extensivel de tipos de documento reconhecidos."""

    id: str
    label: str
    template: str
    title_pattern: str

    @property
    def regex(self) -> re.Pattern:
        return re.compile(self.title_pattern, re.IGNORECASE)


# A ordem importa: o primeiro padrao que casar com o titulo define o tipo.
DOCUMENT_TYPES: tuple[DocumentTypeSpec, ...] = (
    DocumentTypeSpec("decree", "Decreto", TEMPLATE_NORMATIVE_ACT, r"^DECRETO\b"),
    DocumentTypeSpec("ordinance", "Portaria", TEMPLATE_NORMATIVE_ACT, r"^PORTARIA\b"),
    DocumentTypeSpec(
        "complementary_law", "Lei Complementar", TEMPLATE_NORMATIVE_ACT,
        r"^LEI\s+COMPLEMENTAR\b",
    ),
    DocumentTypeSpec("law", "Lei", TEMPLATE_NORMATIVE_ACT, r"^LEI\b"),
    DocumentTypeSpec(
        "resolution", "Resolucao", TEMPLATE_NORMATIVE_ACT, r"^RESOLU[CÇ][AÃ]O\b"
    ),
    DocumentTypeSpec(
        "termination_extract", "Extrato de Rescisao", TEMPLATE_ADMIN_BOARD,
        r"RESCIS[AÃ]O\b",
    ),
    DocumentTypeSpec(
        "amendment_extract", "Extrato de Termo Aditivo", TEMPLATE_EXTRACT_FIELDS,
        r"EXTRATO\s+D[OE].*ADITIVO|TERMO\s+ADITIVO",
    ),
    DocumentTypeSpec(
        "contract_extract", "Extrato de Contrato", TEMPLATE_EXTRACT_FIELDS,
        r"^EXTRATO\b",
    ),
    DocumentTypeSpec(
        "adjudication", "Termo de Adjudicacao", TEMPLATE_PROCUREMENT,
        r"ADJUDICA[CÇ][AÃ]O\b",
    ),
    DocumentTypeSpec(
        "homologation", "Termo de Homologacao", TEMPLATE_PROCUREMENT,
        r"HOMOLOGA[CÇ][AÃ]O\b",
    ),
    DocumentTypeSpec(
        "ratification", "Termo de Ratificacao", TEMPLATE_PROCUREMENT,
        r"RATIFICA[CÇ][AÃ]O\b",
    ),
    DocumentTypeSpec(
        "bidding_waiver", "Dispensa de Licitacao", TEMPLATE_PROCUREMENT,
        r"DISPENSA\s+DE\s+LICITA[CÇ][AÃ]O\b",
    ),
    DocumentTypeSpec(
        "bidding_unenforceability", "Inexigibilidade de Licitacao",
        TEMPLATE_PROCUREMENT, r"INEXIGIBILIDADE\b",
    ),
    DocumentTypeSpec(
        "selection_process", "Processo Seletivo", TEMPLATE_ADMIN_BOARD,
        r"PROCESSO\s+SELETIVO\b",
    ),
    DocumentTypeSpec(
        "public_contest", "Concurso Publico", TEMPLATE_ADMIN_BOARD,
        r"CONCURSO\s+P[UÚ]BLICO\b",
    ),
    DocumentTypeSpec(
        "procurement_process", "Processo de Compras", TEMPLATE_PROCUREMENT,
        r"PREG[AÃ]O\b|LICITA[CÇ][AÃ]O\b|PROCESSO\s+DE\s+COMPRAS?\b",
    ),
    DocumentTypeSpec("edict", "Edital", TEMPLATE_GENERIC, r"^EDITAL\b"),
    DocumentTypeSpec("notice", "Aviso", TEMPLATE_GENERIC, r"^AVISO\b"),
    DocumentTypeSpec("announcement", "Comunicado", TEMPLATE_GENERIC, r"^COMUNICADO\b"),
)

GENERIC_TYPE = DocumentTypeSpec("generic", "Publicacao", TEMPLATE_GENERIC, r"")


def detect_document_type(title: Optional[str]) -> DocumentTypeSpec:
    if not title:
        return GENERIC_TYPE
    for spec in DOCUMENT_TYPES:
        if spec.regex.search(title):
            return spec
    return GENERIC_TYPE
