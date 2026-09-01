"""Versioned, token-based publication templates (Fase 6).

Templates configure visual presentation (page, typography, tables, signature
block, required sections) using validated **tokens** — never arbitrary
JavaScript/Jinja2/executable HTML. Templates are versioned: a published
(active) version is immutable; changing it requires duplicating to a new
version.

Security invariants:
  * No free-form code is stored or rendered.
  * Fonts/colors/sizes are constrained to an allow-list of keys/values.
  * Asset URLs must resolve locally or to an allow-list.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TEMPLATE_STATUS_DRAFT = "draft"
TEMPLATE_STATUS_ACTIVE = "active"
TEMPLATE_STATUS_ARCHIVED = "archived"

# Canonical token keys allowed in template config.
TOKEN_KEYS = {
    "page.margin.top", "page.margin.right", "page.margin.bottom", "page.margin.left",
    "page.size",
    "typography.body.family", "typography.body.size", "typography.body.weight",
    "typography.body.line_height",
    "typography.title.family", "typography.title.size", "typography.title.weight",
    "typography.command.alignment",
    "blocks.preamble.alignment", "blocks.command.alignment",
    "blocks.article.indent", "blocks.article.caput_weight",
    "blocks.paragraph.alignment", "blocks.paragraph.indent",
    "tables.border.width", "tables.border.color", "tables.cell.padding",
    "tables.header.background", "tables.header.weight",
    "tables.repeat_header",
    "signature.alignment", "signature.name.weight", "signature.role.weight",
    "header.show", "footer.show", "page.numbering", "page.summary",
    "validation_block.show", "title.alignment",
}

_ALLOWED_FONT_FAMILIES = {
    "Times New Roman", "Times", "Georgia", "Arial", "Helvetica", "Calibri",
    "Liberation Serif", "Liberation Sans", "DejaVu Serif", "DejaVu Sans", "Courier New",
}
_ALLOWED_ALIGNMENTS = {"left", "center", "right", "justify"}
_ALLOWED_WEIGHTS = {"normal", "bold", "italic", "bold italic"}
_ALLOWED_SIZES_RE = re.compile(r"^\d{1,2}(\.\d+)?\s?(pt|mm|cm|px)$")
_ALLOWED_COLOR_RE = re.compile(r"^(#[0-9a-fA-F]{3,8}|rgb\([\d\s,]+\)|transparent|currentColor)$")
_ALLOWED_LENGTH_RE = re.compile(r"^\d{1,3}(\.[\d]+)?\s?(mm|cm|pt|px|in)$")


class TemplateConfig(BaseModel):
    """Validated, token-based configuration for one template version."""

    model_config = ConfigDict(extra="forbid")

    tokens: dict[str, str] = Field(default_factory=dict)
    allowed_blocks: list[str] = Field(default_factory=list)
    required_sections: list[str] = Field(default_factory=list)
    recommended_order: list[str] = Field(default_factory=list)

    @field_validator("tokens")
    @classmethod
    def _validate_tokens(cls, tokens: dict[str, str]) -> dict[str, str]:
        for key, value in tokens.items():
            if key not in TOKEN_KEYS:
                raise ValueError(f"Token não permitido: {key}")
            _validate_token_value(key, value)
        return tokens

    @field_validator("allowed_blocks")
    @classmethod
    def _validate_allowed_blocks(cls, blocks: list[str]) -> list[str]:
        known = {
            "heading", "preamble", "command", "paragraph", "article",
            "paragraph_item", "inciso", "alinea", "list", "table", "image",
            "quote", "page_break", "signature_block", "attachment_reference",
            "legacy_html", "pdf_reference",
        }
        unknown = set(blocks) - known
        if unknown:
            raise ValueError(f"Blocos desconhecidos no modelo: {sorted(unknown)}")
        return blocks

    def config_hash(self) -> str:
        import json

        payload = {
            "tokens": {k: self.tokens[k] for k in sorted(self.tokens)},
            "allowed_blocks": sorted(self.allowed_blocks),
            "required_sections": sorted(self.required_sections),
            "recommended_order": list(self.recommended_order),
        }
        return hashlib.sha256(
            json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()

    def css_variables(self) -> dict[str, str]:
        """Map tokens to CSS custom-property names for the renderer."""
        return {f"--doe-{k.replace('.', '-')}": v for k, v in self.tokens.items()}


def _validate_token_value(key: str, value: str) -> None:
    value = (value or "").strip()
    if not value:
        return
    if key == "typography.body.size" or key == "typography.title.size":
        if not _ALLOWED_SIZES_RE.match(value):
            raise ValueError(f"Valor inválido para {key}: {value}")
        return
    if key in ("page.margin.top", "page.margin.right", "page.margin.bottom",
               "page.margin.left", "blocks.article.indent", "blocks.paragraph.indent",
               "tables.cell.padding", "tables.border.width"):
        if not _ALLOWED_LENGTH_RE.match(value):
            raise ValueError(f"Valor inválido para {key}: {value}")
        return
    if "family" in key:
        if value not in _ALLOWED_FONT_FAMILIES:
            raise ValueError(f"Família de fonte não permitida em {key}: {value}")
        return
    if "weight" in key and value not in _ALLOWED_WEIGHTS:
        raise ValueError(f"Peso inválido em {key}: {value}")
        return
    if "alignment" in key and value not in _ALLOWED_ALIGNMENTS:
        raise ValueError(f"Alinhamento inválido em {key}: {value}")
        return
    if key in ("tables.border.color", "tables.header.background"):
        if not _ALLOWED_COLOR_RE.match(value):
            raise ValueError(f"Cor inválida em {key}: {value}")
        return
    if key in ("header.show", "footer.show", "page.numbering", "page.summary",
               "validation_block.show", "tables.repeat_header"):
        if value not in ("true", "false", "1", "0"):
            raise ValueError(f"Valor booleano inválido em {key}: {value}")
        return


DEFAULT_TOKENS: dict[str, str] = {
    "page.margin.top": "2cm",
    "page.margin.right": "2cm",
    "page.margin.bottom": "2cm",
    "page.margin.left": "2.5cm",
    "page.size": "A4",
    "typography.body.family": "Liberation Serif",
    "typography.body.size": "11pt",
    "typography.body.weight": "normal",
    "typography.body.line_height": "1.4",
    "typography.title.family": "Liberation Serif",
    "typography.title.size": "14pt",
    "typography.title.weight": "bold",
    "typography.command.alignment": "center",
    "blocks.preamble.alignment": "justify",
    "blocks.command.alignment": "center",
    "blocks.article.indent": "1.25cm",
    "blocks.article.caput_weight": "normal",
    "blocks.paragraph.alignment": "justify",
    "blocks.paragraph.indent": "1.25cm",
    "tables.border.width": "0.75pt",
    "tables.border.color": "#000000",
    "tables.cell.padding": "4pt",
    "tables.header.background": "#e8e8e8",
    "tables.header.weight": "bold",
    "tables.repeat_header": "true",
    "signature.alignment": "center",
    "signature.name.weight": "bold",
    "signature.role.weight": "normal",
    "header.show": "true",
    "footer.show": "true",
    "page.numbering": "true",
    "page.summary": "true",
    "validation_block.show": "true",
    "title.alignment": "center",
}


# ── Seed template registry (homologation) ────────────────────────────────────

ALLOWED_DEFAULT_BLOCKS = [
    "heading", "preamble", "command", "paragraph", "article",
    "paragraph_item", "inciso", "alinea", "list", "table", "image",
    "quote", "page_break", "signature_block", "attachment_reference",
]

TEMPLATE_DEFINITIONS: dict[str, dict[str, Any]] = {
    "decreto": {
        "name": "Decreto",
        "document_type": "decreto",
        "required_sections": ["command", "article", "signature_block"],
        "recommended_order": [
            "heading", "preamble", "command", "article", "signature_block",
        ],
    },
    "portaria": {
        "name": "Portaria",
        "document_type": "portaria",
        "required_sections": ["command", "article", "signature_block"],
        "recommended_order": [
            "heading", "preamble", "command", "article", "signature_block",
        ],
    },
    "lei": {
        "name": "Lei",
        "document_type": "lei",
        "required_sections": ["command", "article", "signature_block"],
        "recommended_order": [
            "heading", "preamble", "command", "article", "signature_block",
        ],
    },
    "resolucao": {
        "name": "Resolução",
        "document_type": "resolucao",
        "required_sections": ["command", "article", "signature_block"],
        "recommended_order": [
            "heading", "preamble", "command", "article", "signature_block",
        ],
    },
    "edital": {
        "name": "Edital",
        "document_type": "edital",
        "required_sections": ["signature_block"],
        "recommended_order": ["heading", "preamble", "command", "article", "signature_block"],
    },
    "licitacao": {
        "name": "Licitação",
        "document_type": "licitacao",
        "required_sections": ["signature_block"],
        "recommended_order": ["heading", "preamble", "article", "table", "signature_block"],
    },
    "ata": {
        "name": "Ata",
        "document_type": "ata",
        "required_sections": [],
        "recommended_order": ["heading", "preamble", "paragraph", "signature_block"],
    },
    "contrato": {
        "name": "Contrato",
        "document_type": "contrato",
        "required_sections": ["signature_block"],
        "recommended_order": ["heading", "preamble", "article", "signature_block"],
    },
    "relatorio_contabil": {
        "name": "Relatório Contábil",
        "document_type": "relatorio_contabil",
        "required_sections": ["table"],
        "recommended_order": ["heading", "preamble", "table", "signature_block"],
    },
    "outro": {
        "name": "Outros",
        "document_type": "outro",
        "required_sections": [],
        "recommended_order": [],
    },
    "pdf_original": {
        "name": "PDF Original",
        "document_type": "pdf_original",
        "required_sections": ["pdf_reference"],
        "recommended_order": ["heading", "pdf_reference"],
        "allowed_blocks": ["heading", "pdf_reference", "attachment_reference"],
    },
}


def default_config_for(slug: str) -> TemplateConfig:
    definition = TEMPLATE_DEFINITIONS.get(slug, TEMPLATE_DEFINITIONS["outro"])
    tokens = dict(DEFAULT_TOKENS)
    # Right-aligned signature block is common in official acts; keep center default.
    config = TemplateConfig(
        tokens=tokens,
        allowed_blocks=definition.get("allowed_blocks", ALLOWED_DEFAULT_BLOCKS),
        required_sections=list(definition.get("required_sections", [])),
        recommended_order=list(definition.get("recommended_order", [])),
    )
    return config


def template_slugs() -> list[str]:
    return list(TEMPLATE_DEFINITIONS.keys())
