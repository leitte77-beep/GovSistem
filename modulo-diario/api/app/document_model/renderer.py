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
import re
import html

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
    TableBlock,
    TableCell,
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


def _style(section: SectionSpec) -> dict:
    return {
        "alignment": section.alignment,
        "font_weight": section.font_weight,
        "italic": section.italic,
        "uppercase": section.uppercase,
        "indent_em": section.indent_em,
        "space_before_mm": section.space_before_mm,
        "space_after_mm": section.space_after_mm,
    }


def _build_section(
    section: SectionSpec, resolved: dict[str, str], blocks: list[SemanticBlock]
) -> None:
    if not _keep(section, resolved):
        return
    kind = section.kind
    if section.template_html:
        from app.core.html_sanitizer import sanitize_html, extract_plain_text
        safe_values = {key: html.escape(value.upper() if key in {"nome_servidor", "cargo", "secretaria"} else value)
                       for key, value in resolved.items()}
        for key in re.findall(r"\{\{\s*([a-z0-9_]+)\s*\}\}", section.template_html):
            if not safe_values.get(key):
                safe_values[key] = f"[PENDENTE: {key}]"
        rendered_html = sanitize_html(interpolate(section.template_html, safe_values))
        blocks.append(ParagraphBlock(content=extract_plain_text(rendered_html), rich=False,
                                     metadata={"template_html": rendered_html}))
        return

    if kind == SectionKind.HEADING:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(HeadingBlock(level=section.level, text=text, metadata={"style": _style(section)}))
        return

    if kind == SectionKind.COMMAND:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(CommandBlock(text=text, metadata={"style": _style(section)}))
        return

    if kind == SectionKind.PREAMBLE:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(PreambleBlock(content=text, metadata={"style": _style(section)}))
        return

    if kind == SectionKind.PARAGRAPH:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(ParagraphBlock(content=text, metadata={"style": _style(section)}))
        return

    if kind == SectionKind.QUOTE:
        text = _text_block_text(section, resolved)
        if text:
            blocks.append(QuoteBlock(content=text, metadata={"style": _style(section)}))
        return

    if kind == SectionKind.TABLE:
        headers = [interpolate(value, resolved).strip() for value in section.table_headers]
        rows = [
            [TableCell(content=interpolate(value, resolved).strip()) for value in row]
            for row in section.table_rows
        ]
        if headers or rows:
            blocks.append(
                TableBlock(
                    headers=headers,
                    rows=rows,
                    column_widths=[float(width) for width in section.table_column_widths],
                )
            )
        return

    if kind == SectionKind.ARTICLE:
        caput = interpolate(section.text, resolved).strip()
        # Alguns modelos antigos classificaram os dispositivos romanos de
        # portarias como artigos. Preserve a forma original I/II/III e não
        # renderize rótulos inválidos como "Art. Iº".
        roman_numbers = {"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"}
        if section.number and section.number.upper() in roman_numbers:
            caput = re.sub(
                rf"^{re.escape(section.number.upper())}\s*[–—-]\s*", "", caput,
                flags=re.IGNORECASE,
            )
            if caput:
                blocks.append(
                    ParagraphBlock(
                        content=f"{section.number.upper()} – {caput}",
                        metadata={"style": _style(section)},
                    )
                )
            for child in section.children:
                child_text = interpolate(child.text, resolved).strip()
                if child_text:
                    blocks.append(
                        ParagraphBlock(
                            content=child_text,
                            metadata={"style": _style(child)},
                        )
                    )
            return
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
                    metadata={"style": _style(section)},
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


_ACT_DATE_KEY_RE = re.compile(
    r"^data_(?:ato|portaria|decreto|documento|assinatura|expedicao|edicao)"
    r"(?:_extenso|_por_extenso)?$"
)


def act_date_defaults(config: DocumentModelConfig) -> dict[str, str]:
    """Data do próprio ato: hoje, quando quem preenche não informou outra.

    A data em que o ato é assinado/expedido é a do dia da montagem na quase
    totalidade dos casos, e deixá-la pendente obriga a digitar de novo algo que
    o sistema já sabe. É um padrão, não um dado inventado: fica no formulário
    como qualquer outro valor e pode ser alterado à mão antes de publicar.
    """
    from app.services.document_numbering import institutional_today
    from app.services.pdf_utils import format_date

    today = institutional_today()
    defaults: dict[str, str] = {}
    for field in config.fields:
        if not _ACT_DATE_KEY_RE.match(field.key):
            continue
        if field.key.endswith("extenso"):
            defaults[field.key] = format_date(today)
        elif getattr(field.type, "value", field.type) == "date":
            defaults[field.key] = today.isoformat()
        else:
            defaults[field.key] = today.strftime("%d/%m/%Y")
    return defaults


def render(config: DocumentModelConfig, raw_values: dict[str, object]) -> RenderOutcome:
    """Valida valores e monta o documento canônico. Pendências não impedem a
    geração do documento parcial (recuperável); erros de valor/chave levantam."""
    values = dict(raw_values or {})
    for key, value in act_date_defaults(config).items():
        if not str(values.get(key) or "").strip():
            values[key] = value
    raw_values = values
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
