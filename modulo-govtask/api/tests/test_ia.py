"""Camada de IA: sugestão, não informação oficial (§92)."""

import pytest
from pydantic import SecretStr

BASE = "/api/govtask"
DEMANDAS = f"{BASE}/demandas"


async def _demanda(client, headers) -> dict:
    resp = await client.post(
        DEMANDAS, json={"titulo": "Aquisição de ambulância para a Saúde"}, headers=headers
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_ia_desligada_responde_503(client, make_tenant, catalogo_padrao, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "AI_ENABLED", False)
    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])

    status = await client.get(f"{DEMANDAS}/{demanda['id']}/ia/status", headers=t["headers"])
    assert status.status_code == 200
    assert status.json()["disponivel"] is False

    resumo = await client.post(f"{DEMANDAS}/{demanda['id']}/ia/resumo", headers=t["headers"])
    assert resumo.status_code == 503


@pytest.mark.asyncio
async def test_ia_devolve_sugestao_sem_gravar(client, make_tenant, catalogo_padrao, monkeypatch):
    from app.core.config import settings
    from app.services import ia

    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_API_KEY", SecretStr("chave-teste"))

    async def fake_provedor(prompt: str) -> str:
        assert "Aquisição de ambulância" in prompt
        return "Resumo sugerido pela IA."

    monkeypatch.setattr(ia, "_chamar_provedor", fake_provedor)

    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])

    assert (await client.get(f"{DEMANDAS}/{demanda['id']}/ia/status", headers=t["headers"])).json()["disponivel"] is True

    resumo = await client.post(f"{DEMANDAS}/{demanda['id']}/ia/resumo", headers=t["headers"])
    assert resumo.status_code == 200, resumo.text
    assert resumo.json()["sugestao"] == "Resumo sugerido pela IA."

    # A sugestão não alterou a demanda: o resumo executivo continua vazio.
    detalhe = (await client.get(f"{DEMANDAS}/{demanda['id']}", headers=t["headers"])).json()
    assert detalhe["resumo_executivo"] in (None, "")


@pytest.mark.asyncio
async def test_documentos_faltantes_interpreta_a_resposta(client, make_tenant, catalogo_padrao, monkeypatch):
    from app.core.config import settings
    from app.services import ia

    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_API_KEY", SecretStr("chave-teste"))

    t = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, t["headers"])

    async def lista(prompt: str) -> str:
        return "Plano de Trabalho\n- Certidão negativa\n2. Projeto básico"

    async def nenhum(prompt: str) -> str:
        return "NENHUM"

    monkeypatch.setattr(ia, "_chamar_provedor", lista)
    resp = await client.post(
        f"{DEMANDAS}/{demanda['id']}/ia/documentos-faltantes", headers=t["headers"]
    )
    assert resp.json()["sugestoes"] == ["Plano de Trabalho", "Certidão negativa", "Projeto básico"]

    monkeypatch.setattr(ia, "_chamar_provedor", nenhum)
    resp = await client.post(
        f"{DEMANDAS}/{demanda['id']}/ia/documentos-faltantes", headers=t["headers"]
    )
    assert resp.json()["sugestoes"] == []


@pytest.mark.asyncio
async def test_ia_respeita_isolamento_entre_municipios(client, make_tenant, catalogo_padrao):
    a = await make_tenant("ASSESSOR")
    b = await make_tenant("ASSESSOR")
    demanda = await _demanda(client, a["headers"])

    assert (
        await client.post(f"{DEMANDAS}/{demanda['id']}/ia/resumo", headers=b["headers"])
    ).status_code == 404
