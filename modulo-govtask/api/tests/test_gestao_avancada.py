"""Gestão avançada: relacionamentos, marcos, riscos, campos, SLA, webhooks e lote.

Cobre §152–§154, §188–§189, §196, §205–§206, §211, §213 e §220–§222.
"""

import uuid

import pytest

from app.core import config as config_module

BASE = "/api/govtask/demandas"


async def _criar_demanda(client, headers, **extra):
    payload = {"titulo": "Demanda de teste", **extra}
    resp = await client.post(BASE, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Relacionamentos / hierarquia (§220–§222) ────────────────────────────────

@pytest.mark.asyncio
async def test_pai_filha_e_progresso_agregado(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    pai = await _criar_demanda(client, t["headers"], titulo="Revitalização Municipal")
    filha = await _criar_demanda(client, t["headers"], titulo="Praça central")

    resp = await client.put(
        f"{BASE}/{filha['id']}/pai",
        json={"demanda_pai_id": pai["id"]},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    corpo = resp.json()
    assert corpo["pai"]["id"] == pai["id"]

    hierarquia = (
        await client.get(f"{BASE}/{pai['id']}/hierarquia", headers=t["headers"])
    ).json()
    assert hierarquia["tem_filhas"] is True
    assert hierarquia["total_filhas"] == 1
    assert hierarquia["filhas"][0]["id"] == filha["id"]


@pytest.mark.asyncio
async def test_ciclo_de_pai_e_recusado(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    a = await _criar_demanda(client, t["headers"], titulo="Demanda A")
    b = await _criar_demanda(client, t["headers"], titulo="Demanda B")
    await client.put(f"{BASE}/{b['id']}/pai", json={"demanda_pai_id": a["id"]}, headers=t["headers"])

    resp = await client.put(
        f"{BASE}/{a['id']}/pai", json={"demanda_pai_id": b["id"]}, headers=t["headers"]
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_relacionadas_e_remocao(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    a = await _criar_demanda(client, t["headers"], titulo="Demanda A")
    b = await _criar_demanda(client, t["headers"], titulo="Demanda B")
    resp = await client.post(
        f"{BASE}/{a['id']}/relacionamentos",
        json={"relacionada_id": b["id"], "tipo": "DEPENDENTE"},
        headers=t["headers"],
    )
    assert resp.status_code == 201, resp.text
    vinculo = resp.json()
    assert vinculo["relacionada"]["id"] == b["id"]

    # Duplicar o mesmo vínculo é recusado.
    repetido = await client.post(
        f"{BASE}/{a['id']}/relacionamentos",
        json={"relacionada_id": b["id"], "tipo": "DEPENDENTE"},
        headers=t["headers"],
    )
    assert repetido.status_code == 409

    removido = await client.delete(
        f"{BASE}/{a['id']}/relacionamentos/{vinculo['id']}", headers=t["headers"]
    )
    assert removido.status_code == 204


@pytest.mark.asyncio
async def test_vinculo_recusa_demanda_de_outro_tenant(client, make_tenant, catalogo_padrao):
    t1 = await make_tenant("ASSESSOR")
    t2 = await make_tenant("ASSESSOR")
    a = await _criar_demanda(client, t1["headers"], titulo="Demanda do município A")
    b = await _criar_demanda(client, t2["headers"], titulo="Demanda do município B")
    resp = await client.post(
        f"{BASE}/{a['id']}/relacionamentos",
        json={"relacionada_id": b["id"]},
        headers=t1["headers"],
    )
    assert resp.status_code == 404


# ── Marcos (§213) ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_marcos_criar_concluir_e_listar(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar_demanda(client, t["headers"])
    criado = await client.post(
        f"{BASE}/{demanda['id']}/marcos",
        json={"titulo": "Convênio assinado", "data_prevista": "2026-12-01T00:00:00Z"},
        headers=t["headers"],
    )
    assert criado.status_code == 201, criado.text
    marco = criado.json()
    assert marco["status"] == "PENDENTE"

    concluido = await client.post(
        f"{BASE}/{demanda['id']}/marcos/{marco['id']}/concluir",
        json={"observacao": "Assinado no gabinete"},
        headers=t["headers"],
    )
    assert concluido.status_code == 200
    assert concluido.json()["status"] == "CONCLUIDO"

    lista = (await client.get(f"{BASE}/{demanda['id']}/marcos", headers=t["headers"])).json()
    assert len(lista) == 1


# ── Riscos (§211) ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_risco_score_nivel_e_encerramento(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar_demanda(client, t["headers"])
    criado = await client.post(
        f"{BASE}/{demanda['id']}/riscos",
        json={"descricao": "Atraso na licitação", "probabilidade": 5, "impacto": 5},
        headers=t["headers"],
    )
    assert criado.status_code == 201, criado.text
    risco = criado.json()
    assert risco["score"] == 25
    assert risco["nivel"] == "CRITICO"

    mitigado = await client.patch(
        f"{BASE}/{demanda['id']}/riscos/{risco['id']}",
        json={"status": "MITIGADO", "mitigacao": "Antecipamos o edital"},
        headers=t["headers"],
    )
    assert mitigado.status_code == 200
    assert mitigado.json()["resolvido_em"] is not None


# ── Campos customizados (§205, §206) ────────────────────────────────────────

@pytest.mark.asyncio
async def test_campo_customizado_valida_obrigatorio_e_tipo(
    client, make_tenant, catalogo_padrao
):
    t = await make_tenant("ADMIN")
    tipo_id = str(catalogo_padrao["tipos"]["VEICULO"].id)

    definicao = await client.post(
        "/api/govtask/campos-customizados",
        json={
            "chave": "placa",
            "rotulo": "Placa do veículo",
            "tipo": "TEXTO",
            "tipo_demanda_id": tipo_id,
            "obrigatorio": True,
            "validacao": {"max_len": 10},
        },
        headers=t["headers"],
    )
    assert definicao.status_code == 201, definicao.text

    # Falta o campo obrigatório.
    sem_placa = await client.post(
        BASE, json={"titulo": "Veículo novo", "tipo_id": tipo_id}, headers=t["headers"]
    )
    assert sem_placa.status_code == 422

    # Preenchido corretamente.
    ok = await client.post(
        BASE,
        json={"titulo": "Veículo novo", "tipo_id": tipo_id, "campos_extras": {"placa": "ABC1D23"}},
        headers=t["headers"],
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["campos_extras"]["placa"] == "ABC1D23"

    # Chave não configurada é recusada.
    chave_errada = await client.post(
        BASE,
        json={"titulo": "Veículo 2", "tipo_id": tipo_id, "campos_extras": {"outro": "x"}},
        headers=t["headers"],
    )
    assert chave_errada.status_code == 422


@pytest.mark.asyncio
async def test_campo_customizado_leitura_por_demanda(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ADMIN")
    await client.post(
        "/api/govtask/campos-customizados",
        json={"chave": "chassi", "rotulo": "Chassi", "tipo": "TEXTO"},
        headers=t["headers"],
    )
    demanda = await _criar_demanda(client, t["headers"])
    resp = await client.get(
        f"{BASE}/{demanda['id']}/campos-customizados", headers=t["headers"]
    )
    assert resp.status_code == 200
    assert [c["chave"] for c in resp.json()["campos"]] == ["chassi"]


# ── SLA (§152–§154) ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_sla_config_e_painel(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ADMIN")
    criado = await client.post(
        "/api/govtask/sla/config",
        json={"valor": 2, "contagem": "DIAS_UTEIS", "descricao": "Meta do Jurídico"},
        headers=t["headers"],
    )
    assert criado.status_code == 201, criado.text

    demanda = await _criar_demanda(client, t["headers"])
    sla = await client.get(f"{BASE}/{demanda['id']}/sla", headers=t["headers"])
    assert sla.status_code == 200
    assert sla.json()["situacao"] in {"DENTRO", "PROXIMO", "VENCIDO"}

    painel = await client.get("/api/govtask/sla/painel", headers=t["headers"])
    assert painel.status_code == 200
    assert "DENTRO" in painel.json()["resumo"]


# ── Webhooks (§196) ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_webhook_cria_segredo_e_lista(client, make_tenant):
    t = await make_tenant("ADMIN")
    criado = await client.post(
        "/api/govtask/webhooks",
        json={"url": "https://example.com/hook", "eventos": ["DEMANDA_CRIADA"]},
        headers=t["headers"],
    )
    assert criado.status_code == 201, criado.text
    assert criado.json()["secret"]

    lista = (await client.get("/api/govtask/webhooks", headers=t["headers"])).json()
    assert len(lista) == 1
    assert "secret" not in lista[0]


@pytest.mark.asyncio
async def test_webhook_enfileira_e_entrega(client, make_tenant, catalogo_padrao, monkeypatch):
    t = await make_tenant("ADMIN")
    monkeypatch.setattr(config_module.settings, "WEBHOOKS_ENABLED", True)

    await client.post(
        "/api/govtask/webhooks",
        json={"url": "https://example.com/hook"},
        headers=t["headers"],
    )
    demanda = await _criar_demanda(client, t["headers"])
    assert demanda["id"]

    endpoints = (await client.get("/api/govtask/webhooks", headers=t["headers"])).json()
    entregas = (
        await client.get(
            f"/api/govtask/webhooks/{endpoints[0]['id']}/entregas", headers=t["headers"]
        )
    ).json()
    assert any(e["evento"] == "DEMANDA_CRIADA" for e in entregas)

    # Substitui o cliente HTTP por um dublê: nenhum teste deve tocar a rede.
    class _Resposta:
        status_code = 204
        text = ""

    class _Cliente:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            return _Resposta()

    import app.services.webhooks as svc_webhooks

    monkeypatch.setattr(svc_webhooks.httpx, "AsyncClient", _Cliente)
    resultado = await client.post("/api/govtask/webhooks/processar", headers=t["headers"])
    assert resultado.status_code == 200
    assert resultado.json()["sucesso"] >= 1


# ── Ações em lote (§188, §189) ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_lote_prioridade_atribuir_e_tags(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    a = await _criar_demanda(client, t["headers"], titulo="Demanda A")
    b = await _criar_demanda(client, t["headers"], titulo="Demanda B")

    prioridade = await client.post(
        f"{BASE}/lote/prioridade",
        json={"demanda_ids": [a["id"], b["id"]], "prioridade": "URGENTE", "motivo": "Mutirão"},
        headers=t["headers"],
    )
    assert prioridade.status_code == 200, prioridade.text
    assert prioridade.json()["atualizadas"] == 2

    outro = await make_tenant("ASSESSOR", org=t["org"])
    atribuir = await client.post(
        f"{BASE}/lote/atribuir",
        json={"demanda_ids": [a["id"]], "responsavel_id": str(outro["user"].id), "motivo": "Férias"},
        headers=t["headers"],
    )
    assert atribuir.status_code == 200
    assert atribuir.json()["atualizadas"] == 1

    tags = await client.post(
        f"{BASE}/lote/tags",
        json={"demanda_ids": [a["id"], b["id"]], "tags": ["urgencia"], "motivo": "Triagem"},
        headers=t["headers"],
    )
    assert tags.status_code == 200
    assert tags.json()["atualizadas"] == 2

    # A demanda atribuída precisa pertencer ao mesmo tenant do responsável.
    estranho = await make_tenant("ASSESSOR")
    invalido = await client.post(
        f"{BASE}/lote/atribuir",
        json={"demanda_ids": [a["id"]], "responsavel_id": str(estranho["user"].id), "motivo": "Teste"},
        headers=t["headers"],
    )
    assert invalido.status_code == 422


@pytest.mark.asyncio
async def test_lote_ignora_demanda_de_outro_tenant(client, make_tenant, catalogo_padrao):
    t1 = await make_tenant("ASSESSOR")
    t2 = await make_tenant("ASSESSOR")
    minha = await _criar_demanda(client, t1["headers"], titulo="Minha")
    alheia = await _criar_demanda(client, t2["headers"], titulo="Alheia")
    resp = await client.post(
        f"{BASE}/lote/prioridade",
        json={"demanda_ids": [minha["id"], alheia["id"]], "prioridade": "ALTA", "motivo": "x y z"},
        headers=t1["headers"],
    )
    assert resp.status_code == 200
    assert resp.json()["atualizadas"] == 1
    assert uuid.UUID(alheia["id"]) in [uuid.UUID(str(i)) for i in resp.json()["ignoradas"]]


# ── QR code (§139) ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_qrcode_da_demanda(client, make_tenant, catalogo_padrao):
    t = await make_tenant("ASSESSOR")
    demanda = await _criar_demanda(client, t["headers"])
    resp = await client.get(f"{BASE}/{demanda['id']}/qrcode", headers=t["headers"])
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("image/svg+xml")
    assert b"<svg" in resp.content
