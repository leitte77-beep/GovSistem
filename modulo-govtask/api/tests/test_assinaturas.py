"""Assinatura de documento: ciclo de vida e evidência do assinador (§78)."""

import pytest
from pydantic import SecretStr

BASE = "/api/govtask"
DEMANDAS = f"{BASE}/demandas"


async def _demanda(client, headers) -> dict:
    resp = await client.post(
        DEMANDAS, json={"titulo": "Aquisição de veículo por indicação parlamentar"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _documento(client, headers, demanda_id: str) -> dict:
    resp = await client.post(
        f"{DEMANDAS}/{demanda_id}/documentos",
        files={"arquivo": ("oficio.pdf", b"%PDF-1.4\nconteudo", "application/pdf")},
        data={"pasta": "02 Ofícios", "descricao": "Ofício ao governo"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _grupo(documento: dict) -> str:
    return documento.get("documento_grupo_id") or documento["id"]


@pytest.mark.asyncio
async def test_fluxo_de_assinatura_ate_a_evidencia_do_assinador(
    client, make_tenant, catalogo_padrao, monkeypatch
):
    from app.core.config import settings

    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SecretStr("chave-interna-teste"))

    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])
    documento = await _documento(client, t["headers"], demanda["id"])
    grupo = await _grupo(documento)

    inicial = await client.get(
        f"{DEMANDAS}/{demanda['id']}/documentos/{grupo}/assinatura", headers=t["headers"]
    )
    assert inicial.status_code == 200
    assert inicial.json() is None

    solicitada = await client.post(
        f"{DEMANDAS}/{demanda['id']}/documentos/{grupo}/assinatura/solicitar",
        json={},
        headers=t["headers"],
    )
    assert solicitada.status_code == 200, solicitada.text
    assert solicitada.json()["status"] == "AGUARDANDO_ASSINATURA"

    # Nenhuma rota de usuário produz "Assinado": a evidência vem da chave interna.
    sem_chave = await client.post(
        f"{BASE}/internal/assinaturas/registrar",
        json={
            "demanda_id": demanda["id"],
            "documento_grupo_id": grupo,
            "referencia": "SIGN-123",
            "hash_assinado": "abcdef1234567890",
        },
    )
    assert sem_chave.status_code in {401, 403}

    registrada = await client.post(
        f"{BASE}/internal/assinaturas/registrar",
        json={
            "demanda_id": demanda["id"],
            "documento_grupo_id": grupo,
            "referencia": "SIGN-123",
            "hash_assinado": "abcdef1234567890",
            "provedor": "govsign",
            "assinado_por_email": t["user"].email,
        },
        headers={"X-Internal-Key": "chave-interna-teste"},
    )
    assert registrada.status_code == 200, registrada.text
    corpo = registrada.json()
    assert corpo["status"] == "ASSINADO"
    assert corpo["referencia_externa"] == "SIGN-123"
    assert corpo["hash_assinado"] == "abcdef1234567890"
    assert corpo["assinado_por"]["id"] == str(t["user"].id)

    # Reenviar evidência para o mesmo grupo é conflito, não nova assinatura.
    repetida = await client.post(
        f"{BASE}/internal/assinaturas/registrar",
        json={
            "demanda_id": demanda["id"],
            "documento_grupo_id": grupo,
            "referencia": "SIGN-999",
            "hash_assinado": "outrohash123456",
        },
        headers={"X-Internal-Key": "chave-interna-teste"},
    )
    assert repetida.status_code == 409


@pytest.mark.asyncio
async def test_solicitacao_exige_documento_visivel_e_isolamento(
    client, make_tenant, catalogo_padrao
):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])
    documento = await _documento(client, a["headers"], demanda["id"])
    grupo = await _grupo(documento)

    # Outro município não enxerga o grupo nem a assinatura.
    assert (
        await client.get(
            f"{DEMANDAS}/{demanda['id']}/documentos/{grupo}/assinatura", headers=b["headers"]
        )
    ).status_code == 404
    assert (
        await client.post(
            f"{DEMANDAS}/{demanda['id']}/documentos/{grupo}/assinatura/solicitar",
            json={},
            headers=b["headers"],
        )
    ).status_code == 404
