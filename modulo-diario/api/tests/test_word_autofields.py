"""A IA aponta os trechos variáveis; o documento é quem confirma.

Sem rede: o transporte é simulado. O ponto destes testes é a fronteira de
confiança — nada que a IA devolva vira campo sem existir no .docx.
"""

from __future__ import annotations

import json

import pytest
from httpx import MockTransport, Response

docx = pytest.importorskip("docx")

from app.document_model.word_autofields import (  # noqa: E402
    document_text, propose_fields, validate_fields,
)

TEXT = (
    "PORTARIA Nº 232/2026\n"
    "Exonerar, a pedido, a servidora ISABELE DIAS DUTRA, matrícula 6003804.\n"
    "Farol, 15 de setembro de 2026."
)


def _doc(tmp_path):
    document = docx.Document()
    document.add_paragraph("PORTARIA Nº 232/2026")
    document.add_paragraph(
        "Exonerar, a pedido, a servidora ISABELE DIAS DUTRA, matrícula 6003804.")
    table = document.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Valor"
    table.rows[0].cells[1].text = "R$ 7.000,00"
    path = tmp_path / "portaria.docx"
    document.save(path)
    return path


def _transport(payload: dict) -> MockTransport:
    def handler(request):
        return Response(200, json={
            "choices": [{"message": {"content": json.dumps(payload)}}],
            "model": "deepseek-v4-flash",
            "usage": {"total_tokens": 10},
        })
    return MockTransport(handler)


def test_document_text_includes_tables(tmp_path):
    text = document_text(_doc(tmp_path))
    assert "ISABELE DIAS DUTRA" in text
    assert "R$ 7.000,00" in text


def test_invented_snippets_are_rejected():
    fields = [
        {"snippet": "ISABELE DIAS DUTRA", "key": "nome_servidor"},
        {"snippet": "JOSÉ QUE NÃO EXISTE", "key": "outro_nome"},
    ]
    assert validate_fields(fields, TEXT) == {"ISABELE DIAS DUTRA": "nome_servidor"}


def test_short_snippets_are_rejected():
    """"1" casaria dentro de 232/2026 e corromperia o documento."""
    assert validate_fields([{"snippet": "1", "key": "numero"}], TEXT) == {}


def test_repeated_snippets_are_rejected():
    text = "a servidora fulana " * 10
    assert validate_fields([{"snippet": "servidora", "key": "x"}], text) == {}


def test_keys_are_normalised_and_unique():
    fields = [
        {"snippet": "ISABELE DIAS DUTRA", "key": "Nomé Servidor"},
        {"snippet": "6003804", "key": "Nomé Servidor"},
    ]
    keys = list(validate_fields(fields, TEXT).values())
    assert keys == ["nome_servidor", "nome_servidor_2"]


@pytest.mark.asyncio
async def test_proposal_is_filtered_against_the_document(tmp_path):
    path = _doc(tmp_path)
    transport = _transport({
        "document_type": "portaria",
        "document_title": "PORTARIA Nº {{numero_ato}}/{{ano}}",
        "purpose": "Exoneração de servidor",
        "fields": [
            {"snippet": "ISABELE DIAS DUTRA", "key": "nome_servidor"},
            {"snippet": "6003804", "key": "matricula"},
            {"snippet": "R$ 7.000,00", "key": "valor"},
            {"snippet": "NOME INVENTADO PELA IA", "key": "fantasma"},
        ],
    })
    replacements, meta = await propose_fields(path, "k", transport=transport)
    assert replacements == {
        "ISABELE DIAS DUTRA": "nome_servidor",
        "6003804": "matricula",
        "R$ 7.000,00": "valor",
    }
    assert meta["document_type"] == "portaria"
    assert meta["proposed"] == 4 and meta["accepted"] == 3


@pytest.mark.asyncio
async def test_title_markers_become_declared_fields(tmp_path):
    """Marcador no título sem campo declarado invalidaria o modelo."""
    from app.document_model.word_template import convert

    path = _doc(tmp_path)
    transport = _transport({
        "document_type": "portaria",
        "document_title": "PORTARIA Nº {{numero_ato}}/{{ano}}",
        "purpose": "Exoneração",
        "fields": [{"snippet": "ISABELE DIAS DUTRA", "key": "nome_servidor"}],
    })
    replacements, meta = await propose_fields(path, "k", transport=transport)
    config = convert(path, replacements, meta["purpose"],
                     document_type=meta["document_type"],
                     document_title=meta["document_title"])
    keys = {f.key for f in config.fields}
    assert {"nome_servidor", "numero_ato", "ano"} <= keys


@pytest.mark.parametrize("proposto,esperado", [
    ("portaria", "portaria"),
    ("Licitação", "licitacao"),
    ("aviso", "licitacao"),
    ("termo de fomento", "contrato"),
    ("laudo técnico", "relatorio"),
    ("bilhete", "outro"),
])
def test_document_type_is_mapped_to_a_declared_scope(proposto, esperado):
    """Um rótulo aproximado da IA não pode invalidar a importação inteira."""
    from app.document_model.word_autofields import normalize_document_type

    assert normalize_document_type(proposto) == esperado
