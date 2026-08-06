"""Maquina de estados que interpreta a ordem do documento e monta os blocos.

Aplica as regras deterministicas (rules.py) com condicoes de contexto:
impede classificacoes sem sentido (ex.: "Objeto:" em extrato e campo, nao
titulo; texto em maiusculas dentro de tabela nao e categoria) e trata
continuacoes (sumula, titulo e artigos em varias linhas).
"""

import re
from enum import Enum
from typing import Optional

from app.services.gazette import rules
from app.services.gazette.segmenter import Segment
from app.services.gazette.types import Block, BlockSource, BlockType


class State(str, Enum):
    START = "START"
    CATEGORY = "CATEGORY"
    TITLE = "TITLE"
    SUBTITLE = "SUBTITLE"
    SUMMARY = "SUMMARY"
    PREAMBLE = "PREAMBLE"
    CONSIDERATIONS = "CONSIDERATIONS"
    COMMAND = "COMMAND"
    ARTICLES = "ARTICLES"
    FIELDS = "FIELDS"
    BODY = "BODY"
    TABLE = "TABLE"
    CLOSING = "CLOSING"
    SIGNATURE = "SIGNATURE"
    END = "END"


_TITLE_CONTINUATION_START = re.compile(r"^(DE|DA|DO|DAS|DOS|E|PARA|POR)\b")
_SUBTITLE_START = re.compile(
    r"^(PREG[AÃ]O|PROCESSO|TOMADA\s+DE\s+PRE[CÇ]OS|CONCORR[EÊ]NCIA|CONVITE|"
    r"CHAMAMENTO|DISPENSA|INEXIGIBILIDADE|EDITAL|CONTRATO|CREDENCIAMENTO)\b"
)
_ARTICLE_NUMBER = re.compile(r"^Art\.?\s*(\d+)", re.IGNORECASE)
_VALOR_TOTAL_LABEL = re.compile(r"^(valor\s+(total|global)|total(\s+geral)?)\s*$", re.IGNORECASE)

_NESTABLE = {
    BlockType.PARAGRAPH,
    BlockType.SOLE_PARAGRAPH,
    BlockType.SUBSECTION,
    BlockType.LETTER_ITEM,
    BlockType.NUMBERED_ITEM,
}


class _Builder:
    def __init__(self) -> None:
        self.blocks: list[Block] = []
        self.warnings: list[str] = []
        self.order = 0
        self.last_article: Optional[Block] = None
        self.last_paragraph: Optional[Block] = None
        self.last_subsection: Optional[Block] = None
        self.last_letter: Optional[Block] = None
        self.open_block: Optional[Block] = None  # alvo de continuacao de texto

    def reset_article_context(self) -> None:
        self.last_paragraph = None
        self.last_subsection = None
        self.last_letter = None

    def add(
        self,
        seg: Segment,
        block_type: BlockType,
        confidence: float,
        source: BlockSource,
        parent: Optional[Block] = None,
        metadata: Optional[dict] = None,
    ) -> Block:
        self.order += 1
        block = Block(
            type=block_type,
            order=self.order,
            original_text=seg.text,
            start_offset=seg.start,
            end_offset=seg.end,
            confidence=confidence,
            source=source,
            metadata=metadata or {},
        )
        if parent is not None:
            parent.children.append(block)
        else:
            self.blocks.append(block)
        self.open_block = block
        return block

    def merge_into(self, block: Block, seg: Segment) -> None:
        block.original_text = f"{block.original_text}\n{seg.text}"
        block.end_offset = seg.end


def _next_text_segment(segments: list[Segment], index: int) -> Optional[Segment]:
    for seg in segments[index + 1:]:
        if seg.kind == "text" and seg.text.strip():
            return seg
    return None


def _field_metadata(text: str) -> dict:
    label, _, value = text.partition(":")
    return {"label": label.strip(), "value": value.strip()}


def classify_segments(segments: list[Segment]) -> tuple[list[Block], list[str]]:
    b = _Builder()
    state = State.START

    for index, seg in enumerate(segments):
        text = seg.text.strip()
        if not text:
            continue

        # Tabela detectada tem prioridade sobre qualquer heuristica de texto.
        if seg.kind == "table":
            source = BlockSource.HTML if seg.metadata.get("from_html") else BlockSource.FALLBACK
            b.add(
                seg,
                BlockType.TABLE,
                0.98 if seg.metadata.get("from_html") else 0.85,
                source,
                metadata={"html": seg.table_html},
            )
            state = State.TABLE
            b.open_block = None
            continue

        rule = rules.match_rule(text)
        next_seg = _next_text_segment(segments, index)

        # --- Assinatura: nome em maiusculas seguido de cargo conhecido ---
        if (
            rule is None
            and state not in (State.START, State.CATEGORY)
            and rules.looks_like_person_name(text)
            and (
                state in (State.CLOSING, State.SIGNATURE)
                or (next_seg is not None and rules.looks_like_role(next_seg.text))
            )
        ):
            b.add(seg, BlockType.SIGNATURE_NAME, 0.96, BlockSource.RULE)
            state = State.SIGNATURE
            continue

        if state == State.SIGNATURE and rule is None and rules.looks_like_role(text):
            b.add(seg, BlockType.SIGNATURE_ROLE, 0.96, BlockSource.RULE)
            continue

        # --- Inicio do documento: categoria e titulo ---
        if state in (State.START, State.CATEGORY):
            if rule is not None and rule.block_type == BlockType.DOCUMENT_TITLE:
                b.add(seg, BlockType.DOCUMENT_TITLE, rule.confidence, BlockSource.RULE)
                state = State.TITLE
                continue
            if (
                state == State.START
                and rule is None
                and rules.looks_like_category(text)
                and next_seg is not None
                and rules.looks_like_title(next_seg.text)
            ):
                b.add(seg, BlockType.CATEGORY, 0.80, BlockSource.RULE)
                state = State.CATEGORY
                continue
            if rule is None and rules.looks_like_title(text):
                b.add(seg, BlockType.DOCUMENT_TITLE, 0.75, BlockSource.RULE)
                state = State.TITLE
                continue

        # --- Continuacao / subtitulo apos o titulo ---
        if state == State.TITLE and rule is None and rules.looks_like_title(text):
            title_block = b.open_block
            if _SUBTITLE_START.match(text):
                b.add(seg, BlockType.DOCUMENT_SUBTITLE, 0.85, BlockSource.RULE)
                state = State.SUBTITLE
                continue
            if title_block is not None and (
                _TITLE_CONTINUATION_START.match(text)
                or title_block.original_text.rstrip().endswith((",", "E"))
            ):
                b.merge_into(title_block, seg)
                continue
            b.add(seg, BlockType.DOCUMENT_SUBTITLE, 0.75, BlockSource.RULE)
            state = State.SUBTITLE
            continue

        # --- Regras deterministicas com contexto ---
        if rule is not None:
            block_type = rule.block_type

            # "Objeto:" e afins dentro de extrato/quadro sao campos.
            if block_type == BlockType.FIELD:
                metadata = _field_metadata(text)
                if _VALOR_TOTAL_LABEL.match(metadata["label"]) and state in (
                    State.TABLE,
                    State.BODY,
                ):
                    b.add(seg, BlockType.TOTAL_VALUE, 0.97, BlockSource.RULE)
                    continue
                b.add(seg, BlockType.FIELD, rule.confidence, BlockSource.RULE, metadata=metadata)
                state = State.FIELDS
                continue

            if block_type == BlockType.ARTICLE:
                block = b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                match = _ARTICLE_NUMBER.match(text)
                if match:
                    block.metadata["number"] = match.group(1)
                b.last_article = block
                b.reset_article_context()
                state = State.ARTICLES
                continue

            if block_type in _NESTABLE and state == State.ARTICLES:
                if block_type in (BlockType.PARAGRAPH, BlockType.SOLE_PARAGRAPH):
                    parent = b.last_article
                elif block_type == BlockType.SUBSECTION:
                    parent = b.last_paragraph or b.last_article
                elif block_type == BlockType.LETTER_ITEM:
                    parent = b.last_subsection or b.last_paragraph or b.last_article
                else:  # NUMBERED_ITEM
                    parent = (
                        b.last_letter or b.last_subsection or b.last_paragraph
                        or b.last_article
                    )
                block = b.add(seg, block_type, rule.confidence, BlockSource.RULE, parent=parent)
                if block_type in (BlockType.PARAGRAPH, BlockType.SOLE_PARAGRAPH):
                    b.last_paragraph = block
                    b.last_subsection = None
                    b.last_letter = None
                elif block_type == BlockType.SUBSECTION:
                    b.last_subsection = block
                    b.last_letter = None
                elif block_type == BlockType.LETTER_ITEM:
                    b.last_letter = block
                continue

            if block_type == BlockType.COMMAND:
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                state = State.ARTICLES
                b.last_article = None
                b.reset_article_context()
                continue

            if block_type == BlockType.SUMMARY:
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                state = State.SUMMARY
                continue

            if block_type == BlockType.CONSIDERATION:
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                state = State.CONSIDERATIONS
                continue

            if block_type == BlockType.PREAMBLE:
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                state = State.PREAMBLE
                continue

            if block_type in (BlockType.DATE, BlockType.LOCATION):
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                state = State.CLOSING
                continue

            if block_type == BlockType.ANNEX_TITLE:
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                state = State.BODY
                continue

            if block_type == BlockType.TOTAL_VALUE:
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                continue

            if block_type == BlockType.NUMBERED_ITEM and state not in (
                State.ARTICLES,
                State.BODY,
                State.TABLE,
            ):
                # Item numerado fora de contexto: texto comum.
                b.add(seg, BlockType.BODY_PARAGRAPH, 0.55, BlockSource.FALLBACK)
                state = State.BODY
                continue

            if block_type == BlockType.DOCUMENT_TITLE and state not in (
                State.START,
                State.CATEGORY,
            ):
                # Novo titulo de ato no meio do documento (documento composto).
                b.add(seg, block_type, rule.confidence, BlockSource.RULE)
                state = State.TITLE
                continue

            b.add(seg, block_type, rule.confidence, BlockSource.RULE)
            continue

        # --- Sem regra: heuristicas de contexto e continuacoes ---
        if state == State.SUMMARY and b.open_block is not None and (
            not seg.blank_before or not rules.is_uppercase_line(text)
        ):
            b.merge_into(b.open_block, seg)
            continue

        if state in (State.PREAMBLE, State.CONSIDERATIONS) and (
            b.open_block is not None and not seg.blank_before
        ):
            b.merge_into(b.open_block, seg)
            continue

        if state == State.ARTICLES and b.open_block is not None and (
            not seg.blank_before and not rules.is_uppercase_line(text)
        ):
            b.merge_into(b.open_block, seg)
            continue

        if state == State.FIELDS and b.open_block is not None and (
            b.open_block.type == BlockType.FIELD and not seg.blank_before
        ):
            b.merge_into(b.open_block, seg)
            if "value" in b.open_block.metadata:
                b.open_block.metadata["value"] = (
                    f"{b.open_block.metadata['value']} {text}".strip()
                )
            continue

        # Empresa com CNPJ em destaque (processos de compras).
        if rules.RE_CNPJ.search(text) and rules.is_uppercase_line(text):
            b.add(seg, BlockType.COMPANY_INFORMATION, 0.85, BlockSource.RULE)
            state = State.BODY
            continue

        # Preambulo heuristico: maiusculas terminando em virgula no inicio.
        if state in (State.TITLE, State.SUBTITLE, State.SUMMARY) and (
            rules.is_uppercase_line(text) and text.endswith(",")
        ):
            b.add(seg, BlockType.PREAMBLE, 0.75, BlockSource.RULE)
            state = State.PREAMBLE
            continue

        # Texto comum (fallback) — nenhum conteudo e descartado.
        b.add(seg, BlockType.BODY_PARAGRAPH, 0.55, BlockSource.FALLBACK)
        if state not in (State.TABLE, State.FIELDS):
            state = State.BODY

    _post_validate(b)
    return b.blocks, b.warnings


def _post_validate(b: _Builder) -> None:
    all_blocks = [blk for root in b.blocks for blk in root.iter_all()]
    types = {blk.type for blk in all_blocks}

    if BlockType.DOCUMENT_TITLE not in types:
        b.warnings.append("Título do documento não identificado.")
    if BlockType.CATEGORY not in types:
        b.warnings.append("Categoria não identificada.")

    unknown = [blk for blk in all_blocks if blk.type == BlockType.UNKNOWN]
    if unknown:
        b.warnings.append(f"{len(unknown)} trecho(s) não classificado(s).")

    fallback = [
        blk for blk in all_blocks
        if blk.source == BlockSource.FALLBACK and blk.type == BlockType.BODY_PARAGRAPH
    ]
    if fallback:
        b.warnings.append(
            f"{len(fallback)} trecho(s) classificados como texto comum "
            "por falta de padrão conhecido."
        )

    low_confidence = [blk for blk in all_blocks if blk.confidence < 0.5]
    if low_confidence:
        b.warnings.append(f"{len(low_confidence)} bloco(s) com confiança baixa.")

    names = [blk for blk in all_blocks if blk.type == BlockType.SIGNATURE_NAME]
    roles = [blk for blk in all_blocks if blk.type == BlockType.SIGNATURE_ROLE]
    if names and not roles:
        b.warnings.append("Assinatura sem cargo identificado.")

    articles = [blk for blk in all_blocks if blk.type == BlockType.ARTICLE]
    numbers = [
        int(a.metadata["number"])
        for a in articles
        if a.metadata.get("number", "").isdigit()
    ]
    if numbers and numbers != sorted(numbers):
        b.warnings.append("Artigos possivelmente fora de sequência.")
