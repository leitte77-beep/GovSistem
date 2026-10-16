"""Pontos de atenção do conteúdo (app/services/matter_checks.py).

Casos tirados de matérias reais publicadas em Farol antes desta conferência.
"""

from app.services.matter_checks import check_matter_content

AVISO = (
    '<p style="text-align: center;"><strong>Aviso de dispensa de licitação</strong></p>'
    "<p><strong>Município de Farol, torna público, o seguinte processo de contratação:</strong></p>"
    "<table><tr><td>N° PROCESSO</td><td>125/2026</td></tr>"
    "<tr><td>OBJETO</td><td>Locação, montagem e desmontagem de pavilhão móvel tipo galpão.</td></tr></table>"
)

PORTARIA = (
    "<p><strong>PORTARIA Nº 229/2026</strong></p>"
    "<p>O PREFEITO DO MUNICÍPIO DE FAROL, no uso de suas atribuições legais,</p>"
    "<p>RESOLVE:</p>"
    "<p>I – Conceder férias à servidora ROSELI APARECIDA MENDES, matrícula 123, "
    "referente ao período aquisitivo 2025/2026.</p>"
    "<p>Farol, 15 de setembro de 2026.</p>"
)


def codes(warnings):
    return [w["code"] for w in warnings]


def test_portaria_with_body_of_a_procurement_notice_is_flagged():
    # Edição 50/2026: "PORTARIA – concede férias" publicada com um aviso de dispensa.
    warnings = check_matter_content(
        title="PORTARIA", summary="concede férias a Alisson Leite",
        act_type_name="Portaria", content_html=AVISO,
    )
    assert "type_mismatch" in codes(warnings)
    assert "summary_mismatch" in codes(warnings)
    mismatch = next(w for w in warnings if w["code"] == "type_mismatch")
    assert "Portaria" in mismatch["message"]
    assert mismatch["excerpt"] == "Aviso de dispensa de licitação"
    assert "indicam outra coisa" in mismatch["message"]  # tipo E título em conflito


def test_consistent_portaria_has_no_warnings():
    assert check_matter_content(
        title="PORTARIA", summary="Concede férias à servidora Roseli Aparecida Mendes.",
        act_type_name="Portaria", act_number="229", content_html=PORTARIA,
    ) == []


def test_wrong_act_type_selected_is_flagged_even_with_correct_title():
    warnings = check_matter_content(
        title="DECRETO Nº 001/2026", summary="Abertura de crédito adicional especial.",
        act_type_name="Ata",
        content_html="<p>DECRETO Nº 001/2026</p><p>Abre crédito adicional especial.</p><p>DECRETA:</p>",
    )
    mismatch = next(w for w in warnings if w["code"] == "type_mismatch")
    assert "“Ata”" in mismatch["message"]
    assert "título" not in mismatch["message"]


def test_number_in_text_different_from_act_number():
    warnings = check_matter_content(
        title="PORTARIA", act_type_name="Portaria", act_number="229",
        content_html=PORTARIA.replace("229/2026", "225/2026"),
    )
    number = next(w for w in warnings if w["code"] == "number_mismatch")
    assert "225" in number["message"] and "229" in number["message"]


def test_text_cut_by_procurement_portal_is_flagged():
    html = (
        "<table><tr><th>Item</th><th>Descrição</th></tr>"
        "<tr><td>13</td><td>Fórmula infantil para lactentes até o 1 ano. Conforme... Ver Mais</td></tr>"
        "<tr><td>14</td><td>Suplemento nutricional enteral ou oral, hipercalórico…</td></tr></table>"
    )
    warnings = check_matter_content(title="Termo de Homologação", content_html=html)
    truncated = next(w for w in warnings if w["code"] == "truncated_text")
    assert truncated["message"].startswith("2 trecho")


def test_legal_ellipsis_in_parentheses_is_not_truncation():
    html = "<p>“Art. 5º. (...)</p><p>§ 1º Os imóveis situados em logradouros...</p>"
    assert "truncated_text" not in codes(check_matter_content(title="LEI", content_html=html))


def test_unfilled_model_field_is_flagged():
    html = "<p>Fica nomeado {{servidor_nome}} para o cargo de ASSESSOR.</p>"
    warnings = check_matter_content(title="PORTARIA", content_html=html)
    assert "unfilled_field" in codes(warnings)


def test_pasted_masthead_is_informative_only():
    html = (
        "<h1>DIÁRIO OFICIAL ELETRÔNICO<br>ANO:<br>EDIÇÃO Nº: Pág.(s)<br>MUNICÍPIO DE Farol</h1>"
        "<p>OBJETO: Prestação de serviços.</p>"
    )
    warnings = check_matter_content(title="Termo de Adjudicação", content_html=html)
    masthead = next(w for w in warnings if w["code"] == "pasted_masthead")
    assert masthead["level"] == "info"


def test_summary_with_generic_words_only_is_not_flagged():
    warnings = check_matter_content(
        title="LEI", summary="Dispõe sobre o Município e dá outras providências.",
        content_html="<p>LEI Nº 1014/2026</p><p>Art. 1º Fica instituído o programa.</p>",
    )
    assert "summary_mismatch" not in codes(warnings)


def test_empty_content_has_no_warnings():
    assert check_matter_content(title="PORTARIA", summary="x y z", content_html="") == []


# ── Endpoint usado pelo formulário da matéria ────────────────────────────────

import uuid  # noqa: E402

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.auth import get_current_user  # noqa: E402
from app.core.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.act_type import ActType  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.user import User  # noqa: E402


@pytest.mark.asyncio
async def test_content_check_endpoint_resolves_act_type_and_returns_warnings(db_session):
    org = Organization(name="Prefeitura Conferência", slug="pf-conf", cnpj="12345678000196")
    db_session.add(org)
    await db_session.flush()
    user = User(name="Operador", email=f"op_{uuid.uuid4().hex[:8]}@test",
                organization_id=org.id, is_active=True)
    act_type = ActType(name="Portaria", description="Portaria", config=None)
    db_session.add_all([user, act_type])
    await db_session.flush()

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post("/api/v1/matters/content-check", json={
                "title": "PORTARIA",
                "summary": "concede férias a Alisson Leite",
                "act_type_id": str(act_type.id),
                "content_html": AVISO,
            })
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200, response.text
    found = [w["code"] for w in response.json()["warnings"]]
    assert "type_mismatch" in found and "summary_mismatch" in found
    assert "“Portaria”" in response.json()["warnings"][0]["message"]
