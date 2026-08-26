"""Testes de manutenção e transferência de estoque entre tanques (§59)."""

from datetime import date
from decimal import Decimal

import pytest

from app.models import Combustivel, Tanque


@pytest.mark.asyncio
async def test_fluxo_manutencao_abertura_conclusao_custos(client, make_tenant, setup_frota):
    """Manutenção: abertura → itens/custos → conclusão (status + valor)."""
    t = await make_tenant()
    base = await setup_frota(t["org"])
    headers = t["headers"]

    # Abertura
    resp = await client.post(
        "/api/govfrota/manutencoes",
        json={
            "veiculo_id": str(base["veiculo"].id),
            "tipo": "CORRETIVA",
            "descricao_problema": "Barulho no motor",
            "data_solicitacao": date.today().isoformat(),
            "prioridade": "ALTA",
            "itens": [
                {"categoria": "MAO_DE_OBRA", "descricao": "Serviço geral", "quantidade": 2, "valor_unitario": "150.00"},
                {"categoria": "PECA", "descricao": "Correia dentada", "quantidade": 1, "valor_unitario": "320.50"},
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    manut = resp.json()
    assert manut["status"] == "ABERTA"
    assert Decimal(str(manut["valor_total"])) == Decimal("620.50")  # 2*150 + 320.50
    manut_id = manut["id"]

    # Adicionar item posteriormente
    resp = await client.post(
        f"/api/govfrota/manutencoes/{manut_id}/itens",
        json={"categoria": "OUTRO", "descricao": "Lavagem", "quantidade": 1, "valor_unitario": "40.00"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert Decimal(str(resp.json()["valor_total"])) == Decimal("660.50")

    # Mudança de status: EM_MANUTENCAO
    resp = await client.patch(
        f"/api/govfrota/manutencoes/{manut_id}",
        json={"status": "EM_MANUTENCAO"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "EM_MANUTENCAO"

    # Conclusão exige data de conclusão — serviço deve validar
    resp = await client.patch(
        f"/api/govfrota/manutencoes/{manut_id}",
        json={"status": "CONCLUIDA"},
        headers=headers,
    )
    assert resp.status_code == 422, f"concluir sem data deveria falhar: {resp.status_code} {resp.text}"

    resp = await client.patch(
        f"/api/govfrota/manutencoes/{manut_id}",
        json={"status": "CONCLUIDA", "data_conclusao": date.today().isoformat()},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "CONCLUIDA"
    assert resp.json()["data_conclusao"] == date.today().isoformat()


@pytest.mark.asyncio
async def test_plano_preventivo_calcula_proxima_execucao(client, make_tenant, setup_frota):
    """Plano preventivo por quilometragem: próxima execução e alerta."""
    t = await make_tenant()
    base = await setup_frota(t["org"])
    headers = t["headers"]

    resp = await client.post(
        "/api/govfrota/planos-preventivos",
        json={
            "veiculo_id": str(base["veiculo"].id),
            "nome": "Troca de óleo",
            "base": "QUILOMETRAGEM",
            "intervalo_km": 10000,
            "ultima_execucao_km": 50000,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    plano = resp.json()
    assert plano["proxima_execucao_km"] == 60000
    # Veículo está em 50.000 km — distante da próxima (sem alerta crítico)
    assert plano["situacao_alerta"] in (None, "OK", "PROXIMA")


@pytest.mark.asyncio
async def test_manutencao_isolada_por_tenant(client, make_tenant, setup_frota):
    """Manutenção criada na org A não é visível pela org B."""
    ta = await make_tenant()
    base = await setup_frota(ta["org"])

    tb = await make_tenant()
    headers_b = tb["headers"]

    resp = await client.post(
        "/api/govfrota/manutencoes",
        json={
            "veiculo_id": str(base["veiculo"].id),
            "tipo": "PREVENTIVA",
            "data_solicitacao": date.today().isoformat(),
        },
        headers=ta["headers"],
    )
    assert resp.status_code == 201, resp.text
    manut_id = resp.json()["id"]

    # Org B não consegue ver nem alterar
    resp = await client.get(f"/api/govfrota/manutencoes/{manut_id}", headers=headers_b)
    assert resp.status_code == 404, resp.status_code
    resp = await client.patch(
        f"/api/govfrota/manutencoes/{manut_id}",
        json={"status": "CANCELADA"},
        headers=headers_b,
    )
    assert resp.status_code == 404, resp.status_code


@pytest.mark.asyncio
async def test_transferencia_entre_tanques_mesmo_combustivel(client, make_tenant, _db):
    """Transferência de estoque entre tanques do mesmo combustível."""
    t = await make_tenant()
    org = t["org"]
    headers = t["headers"]

    comb = Combustivel(organization_id=org.id, nome="Diesel S10", unidade="litro", ativo=True)
    _db.add(comb)
    await _db.flush()
    origem = Tanque(
        organization_id=org.id, nome="T1", combustivel_id=comb.id,
        capacidade_maxima="15000", estoque_inicial="5000", estoque_atual="5000", estoque_minimo="0",
    )
    destino = Tanque(
        organization_id=org.id, nome="T2", combustivel_id=comb.id,
        capacidade_maxima="15000", estoque_inicial="1000", estoque_atual="1000", estoque_minimo="0",
    )
    _db.add(origem)
    _db.add(destino)
    await _db.commit()

    resp = await client.post(
        "/api/govfrota/tanques/transferencia",
        json={
            "tanque_origem_id": str(origem.id),
            "tanque_destino_id": str(destino.id),
            "quantidade": "2000",
            "justificativa": "Balanceamento entre tanques",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    movs = resp.json()
    assert len(movs) == 2

    resp = await client.get(f"/api/govfrota/tanques/{origem.id}", headers=headers)
    assert Decimal(str(resp.json()["estoque_atual"])) == Decimal("3000")
    resp = await client.get(f"/api/govfrota/tanques/{destino.id}", headers=headers)
    assert Decimal(str(resp.json()["estoque_atual"])) == Decimal("3000")


@pytest.mark.asyncio
async def test_transferencia_exige_mesmo_combustivel(client, make_tenant, _db):
    """Não é possível transferir entre tanques de combustíveis diferentes."""
    t = await make_tenant()
    org = t["org"]
    headers = t["headers"]

    c1 = Combustivel(organization_id=org.id, nome="Diesel", unidade="litro", ativo=True)
    c2 = Combustivel(organization_id=org.id, nome="Gasolina", unidade="litro", ativo=True)
    _db.add(c1)
    _db.add(c2)
    await _db.flush()
    t1 = Tanque(organization_id=org.id, nome="T1", combustivel_id=c1.id, capacidade_maxima="1000", estoque_inicial="500", estoque_atual="500", estoque_minimo="0")
    t2 = Tanque(organization_id=org.id, nome="T2", combustivel_id=c2.id, capacidade_maxima="1000", estoque_inicial="500", estoque_atual="500", estoque_minimo="0")
    _db.add(t1)
    _db.add(t2)
    await _db.commit()

    resp = await client.post(
        "/api/govfrota/tanques/transferencia",
        json={
            "tanque_origem_id": str(t1.id),
            "tanque_destino_id": str(t2.id),
            "quantidade": "100",
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.text
    assert "mesmo combustível" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_transferencia_sem_estoque_falha(client, make_tenant, _db):
    """Transferência acima do estoque disponível é bloqueada."""
    t = await make_tenant()
    org = t["org"]
    headers = t["headers"]

    comb = Combustivel(organization_id=org.id, nome="Diesel", unidade="litro", ativo=True)
    _db.add(comb)
    await _db.flush()
    origem = Tanque(organization_id=org.id, nome="T1", combustivel_id=comb.id, capacidade_maxima="1000", estoque_inicial="50", estoque_atual="50", estoque_minimo="0")
    destino = Tanque(organization_id=org.id, nome="T2", combustivel_id=comb.id, capacidade_maxima="1000", estoque_inicial="0", estoque_atual="0", estoque_minimo="0")
    _db.add(origem)
    _db.add(destino)
    await _db.commit()

    resp = await client.post(
        "/api/govfrota/tanques/transferencia",
        json={
            "tanque_origem_id": str(origem.id),
            "tanque_destino_id": str(destino.id),
            "quantidade": "200",
        },
        headers=headers,
    )
    assert resp.status_code == 422, resp.text
