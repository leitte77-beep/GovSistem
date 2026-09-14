"""Renderização determinística de um modelo documental preenchido.

Dado o modelo (config) + valores validados, este renderizador produz um
:class:`SemanticDocument` — a mesma representação canônica do editor semântico
existente. Os textos fixos são inseridos pelo renderizador (nunca reescritos
pela IA); a IA só fornece valores. Para os mesmos modelo/versão/dados, a
renderização é idêntica (os blocos de redação livre podem variar e são
identificados em ``free_text``).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.document_model.fill import FillData, interpolate, validate_and_resolve
from app.document_model.schemas import (
    FREE_TEXT_KINDS,
    DocumentModelConfig,
    SectionKind,
    SectionSpec,
)
from app.semantic.schemas import (
    AlineaBlock,
    ArticleBlock,
    AttachmentReferenceBlock,
    CommandBlock,
    HeadingBlock,
    IncisoBlock,
    ParagraphBlock,
    ParagraphItemBlock,
    PreambleBlock,
    QuoteBlock,
    SemanticBlock,
    SemanticDocument,
    SignatureBlock,
    SignatureEntry,
)


@dataclass
class RenderOutcome:
    document: SemanticDocument
    canonical_text: str
    free_text: list[str]
    fill: FillData

    @property
    def complete(self) -> bool:
        return self.fill.complete


def _keep(section: SectionSpec, resolved: dict[str, str]) -> bool:
    if section.when_field is None:
        return True
    return resolved.get(section.when_field, "") == (section.when_value or "")


def _text_block_text(section: SectionSpec, resolved: dict[str, str]) -> str:
    return interpolate(section.text, resolved).strip()


def _build_section(
    section: SectionSpec, resolved: dict[str, str], blocks: list[SemanticBlock]
) -> None:
    if not _keep(section, resolved):
        return
    kind = section.kind

    if kind == SectionKind.HEADING:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(HeadingBlock(level=section.level, text=text))
        return

    if kind == SectionKind.COMMAND:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(CommandBlock(text=text))
        return

    if kind == SectionKind.PREAMBLE:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(PreambleBlock(content=text))
        return

    if kind == SectionKind.PARAGRAPH:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(ParagraphBlock(content=text))
        return

    if kind == SectionKind.QUOTE:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(QuoteBlock(content=text))
        return

    if kind == SectionKind.ARTICLE:
        caput = interpolate(section.text, resolved).strip()
        paragraphs: list[ParagraphItemBlock] = []
        incisos: list[IncisoBlock] = []
        alineas: list[AlineaBlock] = []
        for child in section.children:
            if not _keep(child, resolved):
                continue
            child_text = interpolate(child.text, resolved).strip()
            if child.kind == SectionKind.PARAGRAPH_ITEM and child_text:
                paragraphs.append(ParagraphItemBlock(number=child.number or "", content=child_text))
            elif child.kind == SectionKind.INCISO and child_text:
                incisos.append(IncisoBlock(number=child.number or "", content=child_text))
            elif child.kind == SectionKind.ALINEA and child_text:
                alineas.append(AlineaBlock(number=child.number or "", content=child_text))
        if caput or paragraphs or incisos or alineas:
            blocks.append(
                ArticleBlock(
                    number=section.number,
                    suffix=section.suffix,
                    caput=caput,
                    paragraphs=paragraphs,
                    incisos=incisos,
                    alineas=alineas,
                )
            )
        return

    if kind == SectionKind.SIGNATURE_BLOCK:
        entries = []
        for e in section.entries:
            name = interpolate(e.name, resolved).strip()
            if not name:
                continue
            entries.append(
                SignatureEntry(
                    name=name,
                    role=interpolate(e.role, resolved).strip(),
                    organ=interpolate(e.organ, resolved).strip(),
                    location=interpolate(e.location, resolved).strip(),
                    date=interpolate(e.date, resolved).strip(),
                    position=getattr(e, "position", "center") or "center",
                )
            )
        if entries:
            blocks.append(SignatureBlock(entries=entries, alignment=section.alignment))
        return

    if kind == SectionKind.ATTACHMENT_REFERENCE:
        title = _text_block_text(section, resolved)
        if title:
            blocks.append(AttachmentReferenceBlock(title=title))
        return


def render(config: DocumentModelConfig, raw_values: dict[str, object]) -> RenderOutcome:
    """Valida valores e monta o documento canônico. Pendências não impedem a
    geração do documento parcial (recuperável); erros de valor/chave levantam."""
    fill = validate_and_resolve(config, raw_values)
    resolved = fill.resolved

    blocks: list[SemanticBlock] = []
    free_text: list[str] = []
    for section in config.sections:
        before = len(blocks)
        _build_section(section, resolved, blocks)
        if (
            len(blocks) > before
            and section.kind in FREE_TEXT_KINDS
            and not section.fixed_text
            and not section.locked
        ):
            free_text.append(section.id)

    title = interpolate(config.document_title, resolved).strip()
    summary = interpolate(config.summary, resolved).strip()

    document = SemanticDocument(
        document_type=config.scope_document_type,
        title=title,
        summary=summary,
        source_type="deterministic",
        blocks=blocks,
    )
    return RenderOutcome(
        document=document,
        canonical_text=document.plain_text(),
        free_text=free_text,
        fill=fill,
    )


__all__ = ["RenderOutcome", "render", "SemanticDocument", "FillData"]
