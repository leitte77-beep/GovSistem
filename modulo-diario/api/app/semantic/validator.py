"""Validation of the semantic document and its blocks (Fase 4)."""

from __future__ import annotations

import re
from typing import Optional

from .schemas import (
    CLASSIFICATION_CONFIRMED,
    CLASSIFICATION_PENDING,
    SemanticDocument,
)

_BLOCKING_ERRORS = {"no_title", "empty_document", "table_invalid", "block_unconfirmed"}


def validate_document(
    doc: SemanticDocument,
    *,
    require_confirmed: bool = True,
    require_title: bool = True,
) -> dict:
    """Validate a SemanticDocument.

    Returns ``{"valid": bool, "errors": [...], "warnings": [...]}``.

    ``errors`` are blocking (block submission to review); ``warnings`` are
    informational. If ``require_confirmed`` is True, any block with
    ``confidence < 1.0`` that is not ``confirmed`` produces a blocking error.
    """
    errors: list[str] = []
    warnings: list[str] = []

    if require_title and not (doc.title or "").strip():
        errors.append("no_title: Documento sem título.")

    if not doc.blocks:
        errors.append("empty_document: Documento sem blocos de conteúdo.")

    unconfirmed = []
    for block in doc.blocks:
        if block.confidence < 1.0 and not block.confirmed:
            unconfirmed.append(f"{block.type} ({block.id})")
        if block.type == "table":
            table_issues = _validate_table(block)
            if table_issues:
                errors.append(f"table_invalid: tabela {block.id} — {table_issues[0]}")
                warnings.extend(table_issues[1:])
        if block.type == "article":
            if not (block.caput or block.paragraphs or block.incisos):
                errors.append(f"article_empty: artigo {block.id} sem caput/nested.")

    if require_confirmed and unconfirmed:
        errors.append(
            "block_unconfirmed: há blocos de baixa confiança não confirmados: "
            + ", ".join(unconfirmed[:5])
        )

    if doc.classification_status == CLASSIFICATION_PENDING:
        warnings.append("classification_pending: classificação ainda não confirmada.")

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
    }


def _validate_table(table) -> list[str]:
    issues: list[str] = []
    if not table.headers and not table.rows:
        issues.append("tabela sem cabeçalho nem linhas.")
        return issues
    expected_cols = len(table.headers) if table.headers else (len(table.rows[0]) if table.rows else 0)
    for idx, row in enumerate(table.rows):
        width = sum(c.colspan for c in row)
        if expected_cols and width != expected_cols:
            issues.append(
                f"linha {idx + 1} tem {width} colunas (esperado {expected_cols})."
            )
    return issues


def confirm_block(doc: SemanticDocument, block_id: str) -> bool:
    """Mark a single block as human-confirmed."""
    for block in doc.blocks:
        if block.id == block_id:
            block.confirmed = True
            block.confidence = 1.0
            block.content_hash = block.compute_content_hash()
            return True
    return False


def confirm_document(doc: SemanticDocument) -> None:
    """Confirm all blocks and set classification status to confirmed."""
    for block in doc.blocks:
        block.confirmed = True
        block.confidence = 1.0
        block.content_hash = block.compute_content_hash()
    doc.classification_status = CLASSIFICATION_CONFIRMED
