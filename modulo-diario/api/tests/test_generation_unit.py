"""Teste unitário da extração estruturada por IA (geração de valores).

Usa ``httpx.MockTransport`` — nenhuma chamada de rede nem chave real. Garante
que: só campos declarados são mantidos (chaves extras descartadas), valores
inválidos são descartados, e o prompt internamente não entrega conteúdo além do
necessário.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

from httpx import MockTransport, Response

from app.document_model.generation import (
    PROMPT_VERSION,
    build_system_message,
    extract_values,
    selected_model_id,
)
from app.document_model.schemas import (
    DocumentField,
    DocumentModelConfig,
    FieldType,
    SectionKind,
    SectionSpec,
)


def _cfg() -> DocumentModelConfig:
    return DocumentModelConfig(
        purpose="Concessão de férias",
        scope_document_type="portaria",
        document_title="PORTARIA Nº 001/2026",
        fields=[
            DocumentField(key="servidor", label="Servidor", type=FieldType.TEXT, required=True),
            DocumentField(key="dias", label="Dias", type=FieldType.INTEGER, required=True),
            DocumentField(key="inicio", label="Início", type=FieldType.DATE, required=True),
        ],
        sections=[
            SectionSpec(id="a1", kind=SectionKind.ARTICLE, text="Concede férias a {{servidor}}.")
        ],
    )


def test_prompt_is_versioned_and_scoped():
    msg = build_system_message(_cfg())
    assert PROMPT_VERSION == "dm-extract-v2"
    assert "servidor" in msg and "dias" in msg
    # Não envia segredos nem pede qualquer chave.
    assert "api_key" not in msg.lower()


def test_extract_keeps_only_declared_fields():
    content = '{"servidor": "João", "dias": "30", "inicio": "2026-10-01", "hack": "x"}'
    transport = MockTransport(
        lambda req: Response(200, json={"choices": [{"message": {"content": content}}]})
    )

    async def run():
        return await extract_values(
            _cfg(), "Conceda 30 dias a João a partir de 1/10/2026.", "sk-test", transport=transport
        )

    values = _run(run())
    assert values == {"servidor": "João", "dias": "30", "inicio": "2026-10-01"}


def test_extract_discards_invalid_value_but_keeps_others():
    content = '{"servidor": "João", "dias": "trinta", "inicio": "2026-10-01"}'
    transport = MockTransport(
        lambda req: Response(200, json={"choices": [{"message": {"content": content}}]})
    )

    async def run():
        return await extract_values(_cfg(), "pedido", "sk-test", transport=transport)

    values = _run(run())
    assert "dias" not in values  # inválido descartado
    assert values.get("servidor") == "João"


def test_model_selector_rejects_ids_not_offered_to_ai():
    allowed = SimpleNamespace(id=uuid.uuid4())
    assert selected_model_id({"model_id": str(allowed.id)}, [allowed]) == allowed.id
    assert selected_model_id({"model_id": str(uuid.uuid4())}, [allowed]) is None


def _run(coro):
    import asyncio

    return asyncio.run(coro)
