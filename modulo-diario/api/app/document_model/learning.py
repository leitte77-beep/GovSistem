"""Aprender com documentos existentes (Fase 4).

A IA analisa documentos oficiais reais (PDF/DOCX) e **propõe** um
``DocumentModelConfig`` (campos + seções), classificando textos fixos, campos
variáveis, blocos condicionais e assinatura. A proposta nunca é aplicada
automaticamente: o administrador revisa e aprova; só então uma nova versão
(rascunho) é criada pelo fluxo normal de versionamento.

A IA é assistente, não autora: o modelo ativo continua sendo a fonte de verdade.
"""

from __future__ import annotations

import io
import logging
import re
import uuid

from pydantic import ValidationError

from app.document_model.schemas import (
    SCOPE_DOCUMENT_TYPES,
    DocumentModelConfig,
    FieldType,
    SectionKind,
    extract_markers,
)
from app.services.ai.deepseek_client import DeepSeekClient
from app.services.ai.errors import AiInvalidResponseError

logger = logging.getLogger(__name__)

LEARN_PROMPT_VERSION = "dm-learn-v1"

# Limite de caracteres por documento e total, para caber no orçamento da IA.
MAX_CHARS_PER_DOC = 12000
MAX_TOTAL_CHARS = 40000

_MARKER_KEY = re.compile(r"^[a-z0-9_]+$")

_KINDS = ", ".join(sorted(k.value for k in SectionKind))
_FIELD_TYPES = ", ".join(sorted(t.value for t in FieldType))


def extract_text(filename: str, content: bytes) -> str:
    """Extrai texto de um documento de referência (PDF/DOCX)."""
    lower = (filename or "").lower()
    if lower.endswith(".pdf"):
        from pdfminer.high_level import extract_text as pdf_extract_text

        return pdf_extract_text(io.BytesIO(content)) or ""
    if lower.endswith(".docx"):
        from docx import Document as DocxDocument

        doc = DocxDocument(io.BytesIO(content))
        parts = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                parts.append(" | ".join(cell.text for cell in row.cells))
        return "\n".join(parts)
    raise ValueError("Formato não suportado para treinamento (use PDF ou DOCX).")


def build_system_message() -> str:
    return (
        "Você analisa documentos oficiais de uma prefeitura e propõe um MODELO "
        "documental estruturado. Responda SOMENTE com um objeto JSON, sem "
        "comentários, no formato:\n"
        '{"purpose": str, "scope_document_type": str, "document_title": str, '
        '"summary": str, "fields": [{"key": str, "label": str, "type": str, '
        '"required": bool, "options": [str]}], "sections": [{"id": str, '
        '"kind": str, "text": str, "alignment": str, "level": int, '
        '"number": str|null, "fixed_text": bool, "locked": bool, '
        '"ai_generated": bool, "when_field": str|null, "when_value": str|null, '
        '"entries": [{"name": str, "role": str}]}]}\n'
        f"Kinds permitidos: {_KINDS}.\n"
        f"Tipos de campo permitidos: {_FIELD_TYPES}.\n"
        "Regras obrigatórias:\n"
        "- Todo marcador {{chave}} no texto deve ter um campo com essa key.\n"
        "- Use {{chave}} para dados variáveis (nomes, datas, números, cargos).\n"
        "- Marque textos institucionais/legais invariáveis com \"fixed_text\": true "
        'e "locked": true (ex.: "RESOLVE:", "Registre-se e Publique-se").\n'
        "- Use \"when_field\"/\"when_value\" para trechos condicionais.\n"
        "- Prefira kind \"article\" para dispositivos, \"signature_block\" para "
        "assinatura, \"command\" para RESOLVE/DECRETA.\n"
        "- NÃO invente dados; apenas modele a estrutura observada.\n"
        "- Responda apenas o JSON."
    )


def build_user_message(document_type: str, documents: list[tuple[str, str]]) -> str:
    blocks = []
    for idx, (name, text) in enumerate(documents, start=1):
        excerpt = text[:MAX_CHARS_PER_DOC]
        blocks.append(f"--- DOCUMENTO {idx}: {name} ---\n{excerpt}")
    body = "\n\n".join(blocks)[:MAX_TOTAL_CHARS]
    return (
        f"Tipo de documento esperado: {document_type}.\n"
        "Analise os documentos oficiais abaixo e proponha o modelo documental "
        "estruturado (JSON):\n\n" + body
    )


def _repair_config(data: dict, document_type: str) -> dict:
    """Normaliza a resposta da IA para caber em ``DocumentModelConfig``.

    - Valida escopo, kinds e tipos de campo.
    - Garante que todo marcador tenha um campo declarado (cria campos text).
    - Descarta seções/kinds inválidos em vez de falhar.
    """
    if not isinstance(data, dict):
        raise ValueError("A IA não retornou um objeto JSON.")

    scope = str(data.get("scope_document_type") or document_type).strip().lower()
    if scope not in SCOPE_DOCUMENT_TYPES:
        scope = document_type if document_type in SCOPE_DOCUMENT_TYPES else "outro"

    fields_raw = data.get("fields") if isinstance(data.get("fields"), list) else []
    fields: list[dict] = []
    seen_keys: set[str] = set()
    for f in fields_raw:
        if not isinstance(f, dict):
            continue
        key = str(f.get("key") or "").strip().lower()
        if not _MARKER_KEY.match(key) or key in seen_keys:
            continue
        ftype = str(f.get("type") or "text").strip().lower()
        if ftype not in {t.value for t in FieldType}:
            ftype = "text"
        field = {
            "key": key,
            "label": str(f.get("label") or key),
            "type": ftype,
            "required": bool(f.get("required", False)),
            "options": [str(o) for o in (f.get("options") or []) if str(o).strip()],
        }
        if field["type"] == "select" and not field["options"]:
            field["type"] = "text"
        fields.append(field)
        seen_keys.add(key)

    valid_kinds = {k.value for k in SectionKind}
    # Sub-blocos que não podem ser raiz (o validador rejeitaria a config).
    non_root_kinds = {"paragraph_item", "inciso", "alinea"}
    sections_raw = data.get("sections") if isinstance(data.get("sections"), list) else []
    sections: list[dict] = []
    used_ids: set[str] = set()

    def norm_section(s: dict) -> dict | None:
        if not isinstance(s, dict):
            return None
        kind = str(s.get("kind") or "paragraph").strip().lower()
        if kind not in valid_kinds:
            return None
        sid = str(s.get("id") or "").strip().lower()
        if not _MARKER_KEY.match(sid) or sid in used_ids:
            sid = f"s{uuid.uuid4().hex[:8]}"
        used_ids.add(sid)
        out: dict = {
            "id": sid,
            "kind": kind,
            "text": str(s.get("text") or ""),
            "alignment": str(
                s.get("alignment")
                or ("justify" if kind in {"paragraph", "article"} else "center")
            ),
            "level": int(s.get("level") or 1),
        }
        if s.get("number") is not None:
            out["number"] = str(s["number"])
        for flag in ("fixed_text", "locked", "ai_generated"):
            if s.get(flag):
                out[flag] = True
        if s.get("when_field"):
            out["when_field"] = str(s["when_field"])
            out["when_value"] = str(s.get("when_value") or "")
        if kind == "signature_block":
            entries = s.get("entries") if isinstance(s.get("entries"), list) else []
            clean = [
                {"name": str(e.get("name") or ""), "role": str(e.get("role") or "")}
                for e in entries
                if isinstance(e, dict)
            ]
            out["entries"] = clean or [
                {"name": "{{autoridade_nome}}", "role": "{{autoridade_cargo}}"}
            ]
        children_raw = s.get("children") if isinstance(s.get("children"), list) else []
        if kind == "article" and children_raw:
            children = [norm_section(c) for c in children_raw]
            out["children"] = [c for c in children if c]
        return out

    for s in sections_raw:
        normalized = norm_section(s) if isinstance(s, dict) else None
        if normalized and normalized["kind"] not in non_root_kinds:
            sections.append(normalized)

    # Garante campos para todos os marcadores usados.
    texts: list[str] = [str(data.get("document_title") or ""), str(data.get("summary") or "")]
    for s in sections:
        texts.append(str(s.get("text") or ""))
        for e in s.get("entries", []) or []:
            texts.extend([str(e.get("name") or ""), str(e.get("role") or "")])
    for value in texts:
        for marker in extract_markers(value):
            if marker not in seen_keys:
                fields.append(
                    {
                        "key": marker,
                        "label": marker.replace("_", " ").title(),
                        "type": "text",
                        "required": False,
                        "options": [],
                    }
                )
                seen_keys.add(marker)

    default_purpose = "Modelo aprendido pela IA"
    purpose = str(data.get("purpose") or default_purpose).strip() or default_purpose
    return {
        "purpose": purpose[:200],
        "description": str(data.get("description") or "")[:2000],
        "scope_document_type": scope,
        "document_title": str(data.get("document_title") or "")[:300],
        "summary": str(data.get("summary") or "")[:1000],
        "fields": fields,
        "sections": sections,
    }


async def analyze_documents(
    document_type: str,
    documents: list[tuple[str, str]],
    api_key: str,
    *,
    transport=None,
) -> tuple[DocumentModelConfig, dict]:
    """Analisa os documentos e devolve uma config validada (proposta)."""
    client = DeepSeekClient(api_key, transport=transport)
    messages = [
        {"role": "system", "content": build_system_message()},
        {"role": "user", "content": build_user_message(document_type, documents)},
    ]
    # Teto alto o suficiente para o raciocínio + o JSON de saída (modelo de
    # raciocínio consome o orçamento antes de responder).
    data, meta = await client.complete_json(messages, max_tokens=16384)
    repaired = _repair_config(data, document_type)
    try:
        config = DocumentModelConfig.model_validate(repaired)
    except ValidationError as exc:
        raise AiInvalidResponseError(
            "A proposta da IA não pôde ser validada como modelo documental."
        ) from exc
    return config, meta


__all__ = [
    "LEARN_PROMPT_VERSION",
    "extract_text",
    "build_system_message",
    "build_user_message",
    "analyze_documents",
]
