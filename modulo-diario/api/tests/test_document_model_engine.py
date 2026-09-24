"""Testes do motor de modelos documentais (Incremento 2).

Cobrem as garantias de aceite que não dependem de banco/rede:
  * renderização determinística e idêntica para os mesmos modelo+versão+dados;
  * textos fixos preservados literalmente entre preenchimentos com dados
    diferentes;
  * pendências por dados obrigatórios ausentes (rascunho recuperável, sem fingir
    sucesso);
  * rejeição de chaves inesperadas e valores inválidos por tipo;
  * condicionais declarativas (when_field == when_value);
  * config rejeita marcador de campo inexistente / estrutura inválida.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.document_model.errors import (
    InvalidFieldValueError,
    UnknownFieldError,
)
from app.document_model.fill import interpolate
from app.document_model.renderer import render
from app.document_model.schemas import (
    DocumentField,
    DocumentModelConfig,
    FieldType,
    SectionKind,
    SectionSpec,
    SignatureEntrySpec,
)
from app.semantic.schemas import SemanticDocument, TableBlock


def _base_fields() -> list[DocumentField]:
    return [
        DocumentField(key="servidor", label="Servidor", type=FieldType.TEXT, required=True),
        DocumentField(key="matricula", label="Matrícula", type=FieldType.TEXT),
        DocumentField(
            key="dias",
            label="Dias",
            type=FieldType.INTEGER,
            required=True,
            min_value=1,
            max_value=90,
        ),
        DocumentField(key="inicio", label="Início", type=FieldType.DATE, required=True),
        DocumentField(key="municipio", label="Município", type=FieldType.TEXT, required=True),
        DocumentField(key="autoridade", label="Autoridade", type=FieldType.TEXT, required=True),
        DocumentField(
            key="unidade",
            label="Unidade",
            type=FieldType.SELECT,
            options=["Gabinete", "Secretaria"],
        ),
    ]


def portaria_ferias_config(*, with_condicional: bool = True) -> DocumentModelConfig:
    sections = [
        SectionSpec(id="titulo", kind=SectionKind.HEADING, text="PORTARIA Nº 001/2026"),
        SectionSpec(
            id="preambulo",
            kind=SectionKind.PREAMBLE,
            text=(
                "O PREFEITO MUNICIPAL DE {{municipio}}, no uso de suas atribuições "
                "legais, resolve expedir a presente PORTARIA:"
            ),
        ),
        SectionSpec(id="comando", kind=SectionKind.COMMAND, text="RESOLVE:"),
        SectionSpec(
            id="art1",
            kind=SectionKind.ARTICLE,
            text=(
                "Conceder ao servidor {{servidor}}, matrícula {{matricula}}, "
                "{{dias}} dias de férias a contar de {{inicio}}."
            ),
        ),
    ]
    if with_condicional:
        sections.append(
            SectionSpec(
                id="considerando",
                kind=SectionKind.PARAGRAPH,
                when_field="motivo_especial",
                when_value="sim",
                text="Considerando a situação especial informada pela unidade.",
            )
        )
    sections.append(
        SectionSpec(
            id="assinatura",
            kind=SectionKind.SIGNATURE_BLOCK,
            entries=[
                SignatureEntrySpec(
                    name="{{autoridade}}", role="Prefeito Municipal", location="Farol"
                )
            ],
        )
    )
    fields = _base_fields()
    if with_condicional:
        fields.append(
            DocumentField(
                key="motivo_especial",
                label="Motivo especial",
                type=FieldType.SELECT,
                options=["sim", "nao"],
            )
        )
    return DocumentModelConfig(
        purpose="Concessão de férias",
        scope_document_type="portaria",
        document_title="PORTARIA Nº 001/2026",
        summary="Concede {{dias}} dias de férias ao servidor {{servidor}}.",
        fields=fields,
        sections=sections,
    )


def _values(**overrides) -> dict[str, str]:
    base = {
        "servidor": "João da Silva",
        "matricula": "123",
        "dias": "30",
        "inicio": "2026-10-01",
        "municipio": "Farol",
        "autoridade": "Maria Prefeita",
        "motivo_especial": "nao",
    }
    base.update(overrides)
    return base


def test_render_produces_semantic_document():
    outcome = render(portaria_ferias_config(), _values())
    assert isinstance(outcome.document, SemanticDocument)
    assert outcome.document.document_type == "portaria"
    assert outcome.document.title == "PORTARIA Nº 001/2026"
    assert outcome.complete


def test_render_is_deterministic_and_identical():
    cfg = portaria_ferias_config()
    first = render(cfg, _values())
    second = render(cfg, _values())
    assert first.canonical_text == second.canonical_text
    # Os blocos estruturantes têm hash de conteúdo idêntico.
    assert [b.content_hash for b in first.document.blocks] == [
        b.content_hash for b in second.document.blocks
    ]


def test_fixed_texts_preserved_across_different_data():
    cfg = portaria_ferias_config()
    a = render(cfg, _values(servidor="João da Silva", dias="10"))
    b = render(cfg, _values(servidor="Ana Souza", dias="25"))
    # Texto fixo literal preservado em ambos.
    assert "no uso de suas atribuições legais" in a.canonical_text
    assert "no uso de suas atribuições legais" in b.canonical_text
    assert "RESOLVE:" in a.canonical_text and "RESOLVE:" in b.canonical_text
    # Conteúdos variáveis distintos.
    assert "Conceder ao servidor João da Silva" in a.canonical_text
    assert "Conceder ao servidor Ana Souza" in b.canonical_text
    assert a.canonical_text != b.canonical_text


def test_missing_required_yields_pending_not_fake_success():
    outcome = render(portaria_ferias_config(), _values(servidor=""))
    assert outcome.complete is False
    codes = {p.code for p in outcome.fill.pending}
    assert "missing_required" in codes
    assert any(p.field == "servidor" for p in outcome.fill.pending)
    # O trabalho parcial é recuperável e o documento ainda é produzido.
    assert outcome.document is not None


def test_unknown_field_is_rejected():
    cfg = portaria_ferias_config()
    with pytest.raises(UnknownFieldError):
        render(cfg, {**_values(), "chave_maliciosa": "x"})


def test_invalid_integer_rejected():
    with pytest.raises(InvalidFieldValueError):
        render(portaria_ferias_config(), _values(dias="trinta"))


def test_invalid_date_rejected():
    with pytest.raises(InvalidFieldValueError):
        render(portaria_ferias_config(), _values(inicio="2026-02-31"))


def test_select_outside_options_rejected():
    with pytest.raises(InvalidFieldValueError):
        render(portaria_ferias_config(), _values(unidade="Prefeitura"))


def test_conditional_section_only_when_matches():
    cfg = portaria_ferias_config()
    sem = render(cfg, _values(motivo_especial="nao"))
    assert "situação especial" not in sem.canonical_text
    com = render(cfg, _values(motivo_especial="sim"))
    assert "situação especial" in com.canonical_text


def test_render_table_section_interpolates_cells_without_losing_geometry():
    cfg = DocumentModelConfig(
        purpose="Aviso de licitação",
        scope_document_type="edital",
        document_title="AVISO DE LICITAÇÃO",
        fields=[DocumentField(key="processo", label="Processo", type=FieldType.TEXT, required=True)],
        sections=[
            SectionSpec(
                id="dados_gerais",
                kind="table",
                table_headers=["Campo", "Valor"],
                table_rows=[["Nº PROCESSO", "{{processo}}"]],
                table_column_widths=[30, 70],
            )
        ],
    )

    outcome = render(cfg, {"processo": "18/2026"})

    table = next(block for block in outcome.document.blocks if block.type == "table")
    assert isinstance(table, TableBlock)
    assert [cell.content for cell in table.rows[0]] == ["Nº PROCESSO", "18/2026"]
    assert table.column_widths == [30.0, 70.0]


def test_config_rejects_unknown_marker():
    fields = [DocumentField(key="nome", label="Nome", type=FieldType.TEXT)]
    with pytest.raises(ValidationError):
        DocumentModelConfig(
            purpose="teste",
            scope_document_type="portaria",
            fields=fields,
            sections=[
                SectionSpec(id="h", kind=SectionKind.HEADING, text="PORTARIA DE {{inexistente}}")
            ],
        )


def test_config_rejects_inciso_at_root():
    with pytest.raises(ValidationError):
        DocumentModelConfig(
            purpose="teste",
            scope_document_type="lei",
            fields=[],
            sections=[SectionSpec(id="i1", kind=SectionKind.INCISO, number="I", text="X")],
        )


def test_interpolate_substitutes_resolved_values():
    assert interpolate("Olá {{nome}}!", {"nome": "Farol"}) == "Olá Farol!"
    assert interpolate("Olá {{nome}}!", {}) == "Olá !"
