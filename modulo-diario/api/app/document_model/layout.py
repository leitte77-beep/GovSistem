"""Layout visual de um modelo documental (o "modelo visual").

Separa o **modelo visual** (fonte, tamanho, margens, cabeçalho, rodapé, brasão,
identidade institucional) do **modelo semântico** (campos, blocos, regras,
condicionais, textos fixos). O layout é versionado junto com a config semântica
e deve ser aplicado de forma idêntica no preview HTML e no PDF.

Invariantes:
  * ``extra="forbid"`` — nenhuma chave desconhecida entra.
  * Valores limitados (margens, tamanhos, cores) para evitar layout quebrado.
  * Nenhuma expressão/código: apenas propriedades declarativas.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

PAGE_SIZES = {"A4", "A3", "LETTER", "LEGAL"}
ORIENTATIONS = {"portrait", "landscape"}
ALIGNMENTS = {"left", "center", "right", "justify"}

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{3,8}$")


def _validate_alignment(v: str) -> str:
    v = v.strip().lower()
    if v not in ALIGNMENTS:
        raise ValueError(f"Alinhamento inválido: {v!r} (use {sorted(ALIGNMENTS)})")
    return v


def _validate_color(v: str) -> str:
    v = v.strip()
    if not _HEX_COLOR.match(v):
        raise ValueError(f"Cor inválida: {v!r} (use hexadecimal, ex.: #000000)")
    return v


class PageMargins(BaseModel):
    """Margens da página em milímetros."""

    model_config = ConfigDict(extra="forbid")

    top: int = Field(default=20, ge=0, le=80)
    right: int = Field(default=18, ge=0, le=80)
    bottom: int = Field(default=20, ge=0, le=80)
    left: int = Field(default=18, ge=0, le=80)


class FontSpec(BaseModel):
    """Especificação de fonte."""

    model_config = ConfigDict(extra="forbid")

    family: str = Field(default="Times New Roman", min_length=1, max_length=120)
    size: float = Field(default=12, ge=6, le=48)
    line_height: float = Field(default=1.5, ge=0.8, le=3)
    color: str = Field(default="#000000")

    @field_validator("color")
    @classmethod
    def _color(cls, v: str) -> str:
        return _validate_color(v)


class HeaderSpec(BaseModel):
    """Cabeçalho institucional (brasão, município, endereço, CNPJ, telefone, site)."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    show_coat_of_arms: bool = True
    show_institution_name: bool = True
    show_address: bool = True
    show_cnpj: bool = True
    show_phone: bool = True
    show_site: bool = True
    custom_html: str = Field(default="", max_length=5000)
    alignment: str = "center"

    @field_validator("alignment")
    @classmethod
    def _alignment(cls, v: str) -> str:
        return _validate_alignment(v)


class FooterSpec(BaseModel):
    """Rodapé (numeração de páginas, texto fixo)."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = True
    show_page_numbers: bool = True
    page_number_format: str = Field(default="Página {page} de {total}", max_length=100)
    custom_html: str = Field(default="", max_length=5000)
    alignment: str = "center"

    @field_validator("alignment")
    @classmethod
    def _alignment(cls, v: str) -> str:
        return _validate_alignment(v)


class DocumentLayout(BaseModel):
    """Layout visual completo de uma versão de modelo documental."""

    model_config = ConfigDict(extra="forbid")

    page_size: str = "A4"
    orientation: str = "portrait"
    margins: PageMargins = Field(default_factory=PageMargins)
    body_font: FontSpec = Field(default_factory=FontSpec)
    heading_font: FontSpec | None = None
    header: HeaderSpec = Field(default_factory=HeaderSpec)
    footer: FooterSpec = Field(default_factory=FooterSpec)
    show_coat_of_arms: bool = True
    coat_of_arms_url: str | None = Field(default=None, max_length=500)
    background_color: str = "#FFFFFF"
    accent_color: str = "#001631"

    @field_validator("page_size")
    @classmethod
    def _page_size(cls, v: str) -> str:
        v = v.strip().upper()
        if v not in PAGE_SIZES:
            raise ValueError(f"Tamanho de página inválido: {v!r} (use {sorted(PAGE_SIZES)})")
        return v

    @field_validator("orientation")
    @classmethod
    def _orientation(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ORIENTATIONS:
            raise ValueError(f"Orientação inválida: {v!r} (use {sorted(ORIENTATIONS)})")
        return v

    @field_validator("background_color", "accent_color")
    @classmethod
    def _colors(cls, v: str) -> str:
        return _validate_color(v)


def default_layout() -> dict:
    """Layout padrão (usado quando a versão não define um layout próprio)."""
    return DocumentLayout().model_dump(mode="json")


__all__ = [
    "PAGE_SIZES",
    "ORIENTATIONS",
    "ALIGNMENTS",
    "PageMargins",
    "FontSpec",
    "HeaderSpec",
    "FooterSpec",
    "DocumentLayout",
    "default_layout",
]
