"""Posto credenciado, horímetro, envio offline, secretarias e alertas de conferência.

Cobre o fluxo público (motorista abastece no posto vencedor da licitação, sem
tanque próprio), máquinas por horímetro, registros feitos sem internet e
sincronizados depois, relatório por secretaria e os alertas que não bloqueiam
o lançamento mas pedem conferência.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.abastecimento import Abastecimento
from app.models.auditoria import Notificacao
from app.models.combustivel import Combustivel, Fornecedor, Tanque
from app.models.configuracoes import ConfiguracaoGovFrota
from app.models.estoque import MovimentacaoEstoque
from app.models.veiculo import Veiculo, VeiculoTanque

API = "/api/govfrota"


async def _login(client, login, pin="1234"):
    resp = await client.post(f"{API}/app/motorista/login", json={"login": login, "pin": pin})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _posto(db, org, nome="Posto Farol Ltda", credenciado=True):
    posto = Fornecedor(
        organization_id=org.id,
        razao_social=nome,
        nome_fantasia=nome,
        categoria="COMBUSTIVEL",
        posto_credenciado=credenciado,
    )
    db.add(posto)
    await db.commit()
    return posto


async def _sem_tanques(db, org):
    for t in (await db.execute(select(Tanque).where(Tanque.organization_id == org.id))).scalars():
        t.ativo = False
    await db.commit()


async def _config(db, org, **campos):
    config = await db.scalar(
        select(ConfiguracaoGovFrota).where(ConfiguracaoGovFrota.organization_id == org.id)
    )
    if config is None:
        config = ConfiguracaoGovFrota(organization_id=org.id)
        db.add(config)
    for k, v in campos.items():
        setattr(config, k, v)
    await db.commit()


async def _abastecer(client, headers, veiculo_id, litros, km=None, **extra):
    body = {"veiculo_id": str(veiculo_id), "quantidade_litros": str(litros), **extra}
    if km is not None:
        body["quilometragem"] = km
    return await client.post(f"{API}/app/motorista/abastecimentos", json=body, headers=headers)


# ── Posto credenciado ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prefeitura_sem_tanque_abastece_no_posto(client, _db, make_tenant, setup_frota):
    """Cenário de Farol: nenhum tanque próprio, só o posto da licitação."""
    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _sem_tanques(_db, t["org"])
    posto = await _posto(_db, t["org"])
    headers = await _login(client, f["acesso"].login)

    await _contrato(client, t["headers"], posto, f["combustivel"], "6.19", "1000")

    locais = (await client.get(f"{API}/app/motorista/locais", headers=headers)).json()
    assert locais["tanques"] == []
    assert [p["id"] for p in locais["postos"]] == [str(posto.id)]
    assert locais["postos"][0]["precos"] == [
        {"combustivel_id": str(f["combustivel"].id), "preco_litro": 6.19}
    ]

    # Sem informar o local: única opção → posto escolhido automaticamente.
    # Preço enviado pelo app (versão antiga) é ignorado: vale o do contrato.
    resp = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, preco_litro="9.99", numero_nf="1234")
    assert resp.status_code == 201, resp.text
    dados = resp.json()
    assert dados["modalidade"] == "POSTO_CREDENCIADO"
    assert dados["tanque_id"] is None
    assert dados["fornecedor_id"] == str(posto.id)
    assert Decimal(dados["preco_litro"]) == Decimal("6.19")
    assert Decimal(dados["custo_total"]) == Decimal("247.60")
    assert dados["numero_nf"] == "1234"
    assert dados["alertas"] == []

    # Posto não movimenta o estoque da organização.
    movs = (await _db.execute(select(MovimentacaoEstoque))).scalars().all()
    assert movs == []


@pytest.mark.asyncio
async def test_posto_sem_contrato_estima_pelo_ultimo_preco_e_alerta(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _sem_tanques(_db, t["org"])
    posto = await _posto(_db, t["org"])
    headers = await _login(client, f["acesso"].login)

    # Histórico lançado pelo painel com o preço da nota.
    r1 = await client.post(
        f"{API}/abastecimentos",
        json={
            "veiculo_id": str(f["veiculo"].id),
            "modalidade": "POSTO_CREDENCIADO",
            "fornecedor_id": str(posto.id),
            "combustivel_id": str(f["combustivel"].id),
            "quantidade_litros": "40",
            "quilometragem": 50100,
            "preco_litro": "6.00",
            "data_abastecimento": datetime.now(timezone.utc).isoformat(),
        },
        headers=t["headers"],
    )
    assert r1.status_code == 201, r1.text
    assert r1.json()["preco_litro"] is None
    # Preço conferido depois, pela nota (correção auditada).
    resp = await client.post(
        f"{API}/abastecimentos/{r1.json()['id']}/corrigir",
        json={"preco_litro": "6.00", "justificativa": "Valor conforme NF"},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text

    r2 = await _abastecer(
        client, headers, f["veiculo"].id, "30", 50400, fornecedor_id=str(posto.id), preco_litro="9.99"
    )
    assert r2.status_code == 201, r2.text
    assert r2.json()["preco_litro"] is None  # motorista não define preço
    assert Decimal(r2.json()["custo_total"]) == Decimal("180.00")  # estimado
    assert "SEM_CONTRATO" in r2.json()["alertas"]


async def _contrato(client, headers, posto, combustivel, preco, litros, **extra):
    resp = await client.post(
        f"{API}/fornecedores/{posto.id}/contratos",
        json={
            "combustivel_id": str(combustivel.id),
            "preco_litro": preco,
            "litros_contratados": litros,
            **extra,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_saldo_do_contrato_baixa_alerta_ao_exceder_e_volta_ao_cancelar(
    client, _db, make_tenant, setup_frota
):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _sem_tanques(_db, t["org"])
    posto = await _posto(_db, t["org"])
    contrato = await _contrato(client, t["headers"], posto, f["combustivel"], "5.50", "100", numero="Ata 12/2026")
    assert Decimal(contrato["saldo_litros"]) == Decimal("100")
    assert Decimal(contrato["saldo_valor"]) == Decimal("550.00")
    headers = await _login(client, f["acesso"].login)

    r1 = await _abastecer(client, headers, f["veiculo"].id, "60", 50100)
    assert r1.status_code == 201, r1.text
    assert r1.json()["alertas"] == []

    # 50 L com só 40 L de saldo: registra (já abasteceu) mas alerta o gestor.
    r2 = await _abastecer(client, headers, f["veiculo"].id, "50", 50500)
    assert r2.status_code == 201, r2.text
    assert "SALDO_EXCEDIDO" in r2.json()["alertas"]
    assert Decimal(r2.json()["custo_total"]) == Decimal("275.00")
    notif = (
        await _db.execute(select(Notificacao).where(Notificacao.link == f"/abastecimentos/{r2.json()['id']}"))
    ).scalar_one()
    assert "saldo do contrato" in notif.descricao

    lista = (await client.get(f"{API}/fornecedores/{posto.id}/contratos", headers=t["headers"])).json()
    assert Decimal(lista[0]["litros_consumidos"]) == Decimal("110")
    assert Decimal(lista[0]["saldo_litros"]) == Decimal("-10")

    resp = await client.post(
        f"{API}/abastecimentos/{r2.json()['id']}/cancelar",
        json={"justificativa": "Lançado errado"},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    lista = (await client.get(f"{API}/fornecedores/{posto.id}/contratos", headers=t["headers"])).json()
    assert Decimal(lista[0]["saldo_litros"]) == Decimal("40")


@pytest.mark.asyncio
async def test_contrato_fora_da_vigencia_ou_inativo_nao_vale(client, _db, make_tenant, setup_frota):
    from datetime import date

    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _sem_tanques(_db, t["org"])
    posto = await _posto(_db, t["org"])
    hoje = date.today()
    vencido = await _contrato(
        client, t["headers"], posto, f["combustivel"], "4.00", "500",
        data_inicio=(hoje - timedelta(days=400)).isoformat(),
        data_fim=(hoje - timedelta(days=35)).isoformat(),
    )
    atual = await _contrato(
        client, t["headers"], posto, f["combustivel"], "6.50", "500",
        data_inicio=(hoje - timedelta(days=30)).isoformat(),
    )
    headers = await _login(client, f["acesso"].login)

    r = await _abastecer(client, headers, f["veiculo"].id, "10", 50100)
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["preco_litro"]) == Decimal("6.50")

    resp = await client.patch(
        f"{API}/fornecedores/{posto.id}/contratos/{atual['id']}", json={"ativo": False}, headers=t["headers"]
    )
    assert resp.status_code == 200, resp.text
    r = await _abastecer(client, headers, f["veiculo"].id, "10", 50300)
    assert r.json()["preco_litro"] is None
    assert "SEM_CONTRATO" in r.json()["alertas"]

    # Vigência invertida é recusada; excluir tira da listagem.
    resp = await client.patch(
        f"{API}/fornecedores/{posto.id}/contratos/{vencido['id']}",
        json={"data_fim": (hoje - timedelta(days=500)).isoformat()},
        headers=t["headers"],
    )
    assert resp.status_code == 422
    resp = await client.delete(f"{API}/fornecedores/{posto.id}/contratos/{vencido['id']}", headers=t["headers"])
    assert resp.status_code == 204
    lista = (await client.get(f"{API}/fornecedores/{posto.id}/contratos", headers=t["headers"])).json()
    assert [c["id"] for c in lista] == [atual["id"]]


@pytest.mark.asyncio
async def test_painel_usa_sempre_o_preco_do_contrato(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    posto = await _posto(_db, t["org"])
    await _contrato(client, t["headers"], posto, f["combustivel"], "6.00", "1000")
    base = {
        "veiculo_id": str(f["veiculo"].id),
        "modalidade": "POSTO_CREDENCIADO",
        "fornecedor_id": str(posto.id),
        "combustivel_id": str(f["combustivel"].id),
        "quantidade_litros": "10",
        "data_abastecimento": datetime.now(timezone.utc).isoformat(),
    }
    r = await client.post(f"{API}/abastecimentos", json={**base, "quilometragem": 50100}, headers=t["headers"])
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["preco_litro"]) == Decimal("6.00")
    # Preço digitado no painel é ignorado: vale o contrato.
    r = await client.post(
        f"{API}/abastecimentos", json={**base, "quilometragem": 50300, "preco_litro": "6.05"}, headers=t["headers"]
    )
    assert Decimal(r.json()["preco_litro"]) == Decimal("6.00")


@pytest.mark.asyncio
async def test_fornecedor_nao_credenciado_e_recusado(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    outro = await _posto(_db, t["org"], nome="Posto Qualquer", credenciado=False)
    headers = await _login(client, f["acesso"].login)

    resp = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, fornecedor_id=str(outro.id))
    assert resp.status_code == 422
    assert "credenciado" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_tanque_e_posto_juntos_pede_escolha(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _posto(_db, t["org"])
    headers = await _login(client, f["acesso"].login)

    resp = await _abastecer(client, headers, f["veiculo"].id, "40", 50100)
    assert resp.status_code == 422
    assert "Selecione onde" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_admin_corrige_preco_pela_nf_e_cancela_sem_mexer_estoque(
    client, _db, make_tenant, setup_frota
):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    posto = await _posto(_db, t["org"])
    resp = await client.post(
        f"{API}/abastecimentos",
        json={
            "veiculo_id": str(f["veiculo"].id),
            "modalidade": "POSTO_CREDENCIADO",
            "fornecedor_id": str(posto.id),
            "combustivel_id": str(f["combustivel"].id),
            "quantidade_litros": "50",
            "quilometragem": 50200,
            "data_abastecimento": datetime.now(timezone.utc).isoformat(),
        },
        headers=t["headers"],
    )
    assert resp.status_code == 201, resp.text
    abast_id = resp.json()["id"]
    assert resp.json()["custo_total"] is None  # sem preço e sem histórico

    resp = await client.post(
        f"{API}/abastecimentos/{abast_id}/corrigir",
        json={"preco_litro": "6.10", "numero_nf": "998", "justificativa": "Valor conforme NF 998"},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    assert Decimal(resp.json()["custo_total"]) == Decimal("305.00")
    assert resp.json()["numero_nf"] == "998"

    estoque_antes = Decimal(str((await _db.get(Tanque, f["tanque"].id)).estoque_atual))
    resp = await client.post(
        f"{API}/abastecimentos/{abast_id}/cancelar",
        json={"justificativa": "Lançado em duplicidade"},
        headers=t["headers"],
    )
    assert resp.status_code == 200, resp.text
    await _db.refresh(f["tanque"])
    assert Decimal(str(f["tanque"].estoque_atual)) == estoque_antes


# ── Horímetro ────────────────────────────────────────────────────────────────


async def _maquina(db, org, combustivel):
    v = Veiculo(
        organization_id=org.id,
        placa=f"MAQ{uuid.uuid4().hex[:4].upper()}",
        modelo="Patrola 120K",
        tipo="MAQUINA",
        usa_horimetro=True,
        horimetro_atual=Decimal("1000.0"),
        quilometragem_atual=0,
    )
    db.add(v)
    await db.flush()
    db.add(VeiculoTanque(
        organization_id=org.id, veiculo_id=v.id, combustivel_id=combustivel.id,
        tank_type="PRIMARY", capacidade=Decimal("300"),
    ))
    await db.commit()
    return v


@pytest.mark.asyncio
async def test_horimetro_e_gravado_e_calcula_litros_por_hora(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    maquina = await _maquina(_db, t["org"], f["combustivel"])
    headers = await _login(client, f["acesso"].login)

    r1 = await _abastecer(client, headers, maquina.id, "100", 0, horimetro="1010.0")
    assert r1.status_code == 201, r1.text
    assert Decimal(r1.json()["horimetro"]) == Decimal("1010.0")

    r2 = await _abastecer(client, headers, maquina.id, "80", 0, horimetro="1020.0")
    assert r2.status_code == 201, r2.text
    assert Decimal(r2.json()["consumo_l_h"]) == Decimal("8.00")  # 80 L em 10 h
    assert r2.json()["consumo_km_l"] is None

    await _db.refresh(maquina)
    assert maquina.horimetro_atual == Decimal("1020.0")


@pytest.mark.asyncio
async def test_horimetro_obrigatorio_e_nao_pode_voltar(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    maquina = await _maquina(_db, t["org"], f["combustivel"])
    headers = await _login(client, f["acesso"].login)

    sem = await _abastecer(client, headers, maquina.id, "50", 0)
    assert sem.status_code == 422
    assert "horímetro" in sem.json()["detail"].lower()

    volta = await _abastecer(client, headers, maquina.id, "50", 0, horimetro="100")
    assert volta.status_code == 422
    assert "Horímetro informado" in volta.json()["detail"]


# ── Offline ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_registro_offline_mantem_hora_do_celular_e_reenvio_nao_duplica(
    client, _db, make_tenant, setup_frota
):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login)
    quando = datetime.now(timezone.utc) - timedelta(hours=5)
    body = dict(data_abastecimento=quando.isoformat(), idempotency_key="offline-1")

    r1 = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, **body)
    assert r1.status_code == 201, r1.text
    registrado = datetime.fromisoformat(r1.json()["data_abastecimento"])
    assert abs((registrado.replace(tzinfo=timezone.utc) - quando).total_seconds()) < 2

    r2 = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, **body)
    assert r2.status_code in (200, 201)
    assert r2.json()["id"] == r1.json()["id"]
    total = (await _db.execute(select(Abastecimento))).scalars().all()
    assert len(total) == 1


@pytest.mark.asyncio
async def test_registro_offline_antigo_demais_ou_no_futuro_e_recusado(
    client, make_tenant, setup_frota
):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login)

    velho = datetime.now(timezone.utc) - timedelta(hours=80)
    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, data_abastecimento=velho.isoformat())
    assert r.status_code == 422

    futuro = datetime.now(timezone.utc) + timedelta(hours=2)
    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, data_abastecimento=futuro.isoformat())
    assert r.status_code == 422


# ── Configurações que passaram a valer ───────────────────────────────────────


@pytest.mark.asyncio
async def test_exigir_tanque_cheio(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _config(_db, t["org"], exigir_tanque_cheio=True)
    headers = await _login(client, f["acesso"].login)

    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100)
    assert r.status_code == 422
    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, completou_tanque=False)
    assert r.status_code == 201, r.text


# ── Alertas de conferência ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fora_do_horario_gera_alerta_e_notificacao(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _config(_db, t["org"], horario_abastecimento_inicio="06:00", horario_abastecimento_fim="18:00")
    headers = await _login(client, f["acesso"].login)
    # 02:00 no horário de Brasília = 05:00 UTC, dentro da janela offline de 72 h
    ontem = (datetime.now(timezone.utc) - timedelta(days=1)).replace(hour=5, minute=0, second=0, microsecond=0)

    r = await _abastecer(client, headers, f["veiculo"].id, "40", 50100, data_abastecimento=ontem.isoformat())
    assert r.status_code == 201, r.text
    assert "FORA_DO_HORARIO" in r.json()["alertas"]

    notif = (await _db.execute(select(Notificacao))).scalars().all()
    assert len(notif) == 1 and notif[0].tipo == "ABASTECIMENTO_ALERTA"

    alertas = (await client.get(f"{API}/alertas", headers=t["headers"])).json()
    assert alertas["notificacoes_nao_lidas"] == 1
    assert any(a["tipo"] == "ABASTECIMENTO" for a in alertas["itens"])

    lista = await client.get(f"{API}/abastecimentos?com_alerta=true", headers=t["headers"])
    assert lista.json()[0]["id"] == r.json()["id"]


@pytest.mark.asyncio
async def test_sem_deslocamento_ignora_arla_no_mesmo_km(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    arla = Combustivel(organization_id=t["org"].id, nome="ARLA 32", categoria="FLUIDO_AUXILIAR", ativo=True)
    _db.add(arla)
    await _db.flush()
    _db.add(VeiculoTanque(
        organization_id=t["org"].id, veiculo_id=f["veiculo"].id, combustivel_id=arla.id,
        tank_type="AUXILIARY", capacidade=Decimal("40"),
    ))
    _db.add(Tanque(
        organization_id=t["org"].id, nome="Tanque ARLA", combustivel_id=arla.id,
        capacidade_maxima=Decimal("1000"), estoque_inicial=Decimal("500"), estoque_atual=Decimal("500"),
    ))
    await _db.commit()
    headers = await _login(client, f["acesso"].login)

    diesel = await _abastecer(client, headers, f["veiculo"].id, "40", 50100)
    assert diesel.status_code == 201, diesel.text
    r_arla = await _abastecer(client, headers, f["veiculo"].id, "10", 50100, combustivel_id=str(arla.id))
    assert r_arla.status_code == 201, r_arla.text
    assert "SEM_DESLOCAMENTO" not in r_arla.json()["alertas"]

    de_novo = await _abastecer(client, headers, f["veiculo"].id, "35", 50100)
    assert de_novo.status_code == 201, de_novo.text
    assert "SEM_DESLOCAMENTO" in de_novo.json()["alertas"]


@pytest.mark.asyncio
async def test_litros_acima_da_media(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    headers = await _login(client, f["acesso"].login)
    km = 50000
    for _ in range(3):
        km += 300
        r = await _abastecer(client, headers, f["veiculo"].id, "40", km)
        assert r.status_code == 201, r.text
        assert "LITROS_ACIMA_MEDIA" not in r.json()["alertas"]
    r = await _abastecer(client, headers, f["veiculo"].id, "70", km + 300)
    assert r.status_code == 201, r.text
    assert "LITROS_ACIMA_MEDIA" in r.json()["alertas"]


# ── Secretarias ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_secretaria_gravada_no_lancamento_e_relatorio(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    h = t["headers"]
    saude = (await client.post(f"{API}/unidades", json={"nome": "Secretaria de Saúde"}, headers=h)).json()
    obras = (await client.post(f"{API}/unidades", json={"nome": "Secretaria de Obras"}, headers=h)).json()
    dup = await client.post(f"{API}/unidades", json={"nome": "secretaria de saúde"}, headers=h)
    assert dup.status_code == 422

    r = await client.patch(f"{API}/veiculos/{f['veiculo'].id}", json={"unidade_id": saude["id"]}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["unidade_nome"] == "Secretaria de Saúde"

    motorista = await _login(client, f["acesso"].login)
    r = await _abastecer(client, motorista, f["veiculo"].id, "40", 50100)
    assert r.status_code == 201, r.text
    assert r.json()["unidade_id"] == saude["id"]

    # Transferir o veículo não reescreve o histórico.
    await client.patch(f"{API}/veiculos/{f['veiculo'].id}", json={"unidade_id": obras["id"]}, headers=h)
    rel = (await client.get(f"{API}/relatorios/secretarias", headers=h)).json()
    por_nome = {i["unidade"]: i for i in rel["itens"]}
    assert por_nome["Secretaria de Saúde"]["litros"] == 40.0
    assert por_nome["Secretaria de Obras"]["veiculos"] == 1
    assert por_nome["Secretaria de Obras"]["litros"] == 0

    bloqueada = await client.delete(f"{API}/unidades/{obras['id']}", headers=h)
    assert bloqueada.status_code == 422


# ── Oficina = fornecedor ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_manutencao_usa_fornecedor_como_oficina(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    h = t["headers"]
    oficina = (await client.post(
        f"{API}/fornecedores",
        json={"razao_social": "Mecânica do Zé", "categoria": "MECANICA"},
        headers=h,
    )).json()
    r = await client.post(
        f"{API}/manutencoes",
        json={
            "veiculo_id": str(f["veiculo"].id),
            "data_solicitacao": datetime.now().date().isoformat(),
            "fornecedor_id": oficina["id"],
            "itens": [{"descricao": "Troca de óleo", "quantidade": 1, "valor_unitario": "250"}],
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    detalhe = (await client.get(f"{API}/fornecedores/{oficina['id']}", headers=h)).json()
    assert detalhe["total_manutencoes"] == 1
    assert detalhe["valor_manutencoes"] == 250.0
    assert detalhe["historico_manutencoes"][0]["placa"] == f["veiculo"].placa

    oficinas = (await client.get(f"{API}/fornecedores?oficina=true", headers=h)).json()
    assert [o["id"] for o in oficinas] == [oficina["id"]]
    assert (await client.get(f"{API}/oficinas", headers=h)).status_code == 404


# ── Flex ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_veiculo_flex_aceita_combustivel_alternativo(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    h = t["headers"]
    gasolina = (await client.post(f"{API}/combustiveis", json={"nome": "Gasolina"}, headers=h)).json()
    etanol = (await client.post(f"{API}/combustiveis", json={"nome": "Etanol"}, headers=h)).json()
    r = await client.post(
        f"{API}/veiculos",
        json={
            "placa": "FLX1A23",
            "tipo": "CARRO",
            "combustivel_principal_id": gasolina["id"],
            "combustivel_secundario_id": etanol["id"],
            "capacidade_tanque_litros": "50",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    v = r.json()
    assert v["combustivel_secundario_id"] == etanol["id"]
    principal = next(x for x in v["tanques"] if x["tank_type"] == "PRIMARY")
    assert principal["combustivel_alternativo_id"] == etanol["id"]

    motorista = await _login(client, f["acesso"].login)
    app_v = next(
        x for x in (await client.get(f"{API}/app/motorista/veiculos", headers=motorista)).json()
        if x["id"] == v["id"]
    )
    assert {c["nome"] for c in app_v["combustiveis"]} == {"Gasolina", "Etanol"}


# ── Alertas atuais (configurações que passaram a valer) ──────────────────────


@pytest.mark.asyncio
async def test_alertas_autonomia_de_estoque_e_preventiva_por_horimetro(
    client, _db, make_tenant, setup_frota
):
    from app.models.manutencao import PlanoPreventivo

    t = await make_tenant()
    f = await setup_frota(t["org"], estoque_inicial="3000")
    await _config(_db, t["org"], alerta_estoque_minimo_dias=30)
    f["tanque"].estoque_minimo = Decimal("0")  # isola o alerta por dias de autonomia
    await _db.commit()
    headers = await _login(client, f["acesso"].login)
    # 300 L em 30 dias = 10 L/dia; tanque com ~2700 L restantes → dura ~270 dias: sem alerta
    r = await _abastecer(client, headers, f["veiculo"].id, "300", 50100)
    assert r.status_code == 201, r.text
    itens = (await client.get(f"{API}/alertas", headers=t["headers"])).json()["itens"]
    assert not any(a["tipo"] == "ESTOQUE" for a in itens)

    # Ritmo alto: mais 2400 L → sobram ~300 L para 90 L/dia → ~3 dias < 30
    for km in (50600, 51100, 51600, 52100, 52600, 53100):
        r = await _abastecer(client, headers, f["veiculo"].id, "400", km)
        assert r.status_code == 201, r.text
    itens = (await client.get(f"{API}/alertas", headers=t["headers"])).json()["itens"]
    assert any(a["tipo"] == "ESTOQUE" and "dia(s)" in a["titulo"] for a in itens)

    maquina = await _maquina(_db, t["org"], f["combustivel"])
    _db.add(PlanoPreventivo(
        organization_id=t["org"].id, veiculo_id=maquina.id, nome="Troca de óleo do motor",
        base="HORIMETRO", intervalo_horimetro=Decimal("250"), ultima_execucao_horimetro=Decimal("760"),
    ))
    await _db.commit()
    itens = (await client.get(f"{API}/alertas", headers=t["headers"])).json()["itens"]
    prev = next(a for a in itens if a["tipo"] == "PREVENTIVA")
    # 760 h + 250 h = 1010 h; máquina está com 1000 h → faltam 10 h (aviso a 10% do intervalo)
    assert prev["descricao"] == "Faltam 10 h."


@pytest.mark.asyncio
async def test_alterar_km_auditado_responde_com_veiculo(client, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    r = await client.post(
        f"{API}/veiculos/{f['veiculo'].id}/quilometragem",
        json={"quilometragem_atual": 60000, "justificativa": "Hodômetro conferido no pátio"},
        headers=t["headers"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["quilometragem_atual"] == 60000
    assert r.json()["combustivel_principal_id"] == str(f["combustivel"].id)


@pytest.mark.asyncio
async def test_dashboard_sem_tanque_mostra_saldo_do_posto(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    posto = await _posto(_db, t["org"])
    await _contrato(client, t["headers"], posto, f["combustivel"], "6.00", "1000", numero="Ata 1/2026")

    # Com tanque ativo, o painel mostra o tanque e não os contratos.
    d = (await client.get(f"{API}/dashboard", headers=t["headers"])).json()
    assert d["tanques"] and d["contratos_posto"] == []

    await _sem_tanques(_db, t["org"])
    headers = await _login(client, f["acesso"].login)
    assert (await _abastecer(client, headers, f["veiculo"].id, "250", 50100)).status_code == 201

    d = (await client.get(f"{API}/dashboard", headers=t["headers"])).json()
    assert d["tanques"] == []
    [c] = d["contratos_posto"]
    assert c["posto"] == "Posto Farol Ltda" and c["numero"] == "Ata 1/2026"
    assert c["saldo_litros"] == 750.0 and c["saldo_valor"] == 4500.0 and c["percentual"] == 75.0


@pytest.mark.asyncio
async def test_intervalo_curto_entre_abastecimentos(client, _db, make_tenant, setup_frota):
    t = await make_tenant()
    f = await setup_frota(t["org"])
    await _sem_tanques(_db, t["org"])
    posto = await _posto(_db, t["org"])
    await _contrato(client, t["headers"], posto, f["combustivel"], "6.00", "1000")
    headers = await _login(client, f["acesso"].login)
    r1 = await _abastecer(client, headers, f["veiculo"].id, "30", 50100)
    assert r1.status_code == 201 and r1.json()["alertas"] == []
    r2 = await _abastecer(client, headers, f["veiculo"].id, "20", 50180)
    assert r2.status_code == 201, r2.text
    assert "INTERVALO_CURTO" in r2.json()["alertas"]
