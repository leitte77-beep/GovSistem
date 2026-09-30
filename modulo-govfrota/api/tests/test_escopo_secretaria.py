"""Escopo por secretaria: o usuário vinculado só enxerga as suas secretarias.

A restrição é do backend — filtro por parâmetro, acesso direto por id e
endpoints não preparados para escopo (falha fechada) são todos cobertos.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from pydantic import SecretStr

from app.core.config import settings
from app.models.abastecimento import Abastecimento
from app.models.auth_models import Organization, UsuarioAcesso
from app.models.ocorrencia import Ocorrencia
from app.models.unidade import Unidade
from app.models.veiculo import Veiculo

API = "/api/govfrota"


async def _cenario(_db, make_tenant, setup_frota):
    admin = await make_tenant("ADMIN")
    org = admin["org"]
    f = await setup_frota(org)
    saude = Unidade(organization_id=org.id, nome="Saúde")
    educacao = Unidade(organization_id=org.id, nome="Educação")
    _db.add_all([saude, educacao])
    await _db.flush()

    carro_saude = f["veiculo"]
    carro_saude.unidade_id = saude.id
    carro_educ = Veiculo(
        organization_id=org.id, placa="EDU1A23", modelo="Onibus", marca="VW",
        tipo="ONIBUS", quilometragem_atual=1000, situacao="DISPONIVEL", unidade_id=educacao.id,
    )
    _db.add(carro_educ)
    await _db.flush()

    def _abast(veiculo, unidade, litros):
        return Abastecimento(
            organization_id=org.id, veiculo_id=veiculo.id, combustivel_id=f["combustivel"].id,
            modalidade="TANQUE_PROPRIO", tanque_id=f["tanque"].id, unidade_id=unidade.id,
            quantidade_litros=Decimal(litros), quilometragem=veiculo.quilometragem_atual + 100,
            data_abastecimento=datetime.now(timezone.utc), custo_total=Decimal(litros) * 6,
            origem="ADMIN", status="CONFIRMADO",
        )

    ab_saude = _abast(carro_saude, saude, "40")
    ab_educ = _abast(carro_educ, educacao, "100")
    _db.add_all([ab_saude, ab_educ])
    _db.add(Ocorrencia(
        organization_id=org.id, veiculo_id=carro_educ.id, descricao="Pneu furado",
        categoria="OUTRO", gravidade="CRITICA", status="ABERTA", origem="ADMIN",
        data_ocorrencia=datetime.now(timezone.utc).date(),
    ))
    await _db.commit()

    secretario = await make_tenant("CONSULTA", org=org)
    resp = await _definir(admin, secretario["user"].id, perfil="SECRETARIO", unidades=[saude.id])
    assert resp.status_code == 200, resp.text
    return {
        "admin": admin, "sec": secretario, "saude": saude, "educacao": educacao,
        "carro_saude": carro_saude, "carro_educ": carro_educ, "ab_saude": ab_saude, "ab_educ": ab_educ,
    }


_client = None


async def _definir(admin, user_id, perfil=None, unidades=(), cargo=None):
    return await _client.put(
        f"{API}/acessos/usuarios/{user_id}",
        json={"perfil": perfil, "cargo": cargo, "unidade_ids": [str(u) for u in unidades]},
        headers=admin["headers"],
    )


@pytest.fixture(autouse=True)
def _guarda_client(client):
    global _client
    _client = client
    yield


@pytest.mark.asyncio
async def test_secretario_ve_so_a_propria_secretaria(client, _db, make_tenant, setup_frota):
    c = await _cenario(_db, make_tenant, setup_frota)
    h = c["sec"]["headers"]

    me = (await client.get(f"{API}/auth/me", headers=h)).json()
    assert me["perfis"] == [{"name": "SECRETARIO", "label": "Secretário"}]
    assert [s["nome"] for s in me["secretarias"]] == ["Saúde"]

    veiculos = (await client.get(f"{API}/veiculos", headers=h)).json()
    assert [v["id"] for v in veiculos] == [str(c["carro_saude"].id)]
    assert (await client.get(f"{API}/veiculos/{c['carro_educ'].id}", headers=h)).status_code == 404
    assert (await client.get(f"{API}/veiculos/{c['carro_educ'].id}/documentos", headers=h)).status_code == 404

    abast = (await client.get(f"{API}/abastecimentos", headers=h)).json()
    assert [a["id"] for a in abast] == [str(c["ab_saude"].id)]
    # Pedir a outra secretaria pelo filtro ou pelo id não fura o escopo.
    filtrado = await client.get(f"{API}/abastecimentos", params={"unidade_id": str(c["educacao"].id)}, headers=h)
    assert filtrado.json() == []
    assert (await client.get(f"{API}/abastecimentos/{c['ab_educ'].id}", headers=h)).status_code == 404
    resumo = (await client.get(f"{API}/abastecimentos/resumo", headers=h)).json()
    assert resumo["mes_litros"] == 40.0

    ocorr = (await client.get(f"{API}/ocorrencias", headers=h)).json()
    assert ocorr == []

    unidades = (await client.get(f"{API}/unidades", headers=h)).json()
    assert [u["nome"] for u in unidades] == ["Saúde"]


@pytest.mark.asyncio
async def test_dashboard_e_relatorios_respeitam_o_escopo(client, _db, make_tenant, setup_frota):
    c = await _cenario(_db, make_tenant, setup_frota)
    h = c["sec"]["headers"]

    d = (await client.get(f"{API}/dashboard", headers=h)).json()
    assert d["frota"]["total"] == 1
    assert [a["id"] for a in d["ultimos_abastecimentos"]] == [str(c["ab_saude"].id)]
    assert d["tanques"] == [] and d["contratos_posto"] == []
    assert d["abastecimentos"]["mes_litros"] == 40.0
    assert [u["unidade"] for u in d["gasto_por_unidade_mes"]] == ["Saúde"]
    assert d["ocorrencias_criticas"] == 0
    assert d["onboarding"]["pendente"] is False

    rel = (await client.get(f"{API}/relatorios/abastecimentos", headers=h)).json()
    assert rel["total_registros"] == 1 and rel["total_litros"] == 40.0
    sec = (await client.get(f"{API}/relatorios/secretarias", headers=h)).json()
    assert [i["unidade"] for i in sec["itens"]] == ["Saúde"]
    consumo = (await client.get(f"{API}/relatorios/veiculos/consumo", headers=h)).json()
    assert {i["veiculo_id"] for i in consumo["itens"]} <= {str(c["carro_saude"].id)}
    assert (await client.get(f"{API}/relatorios/veiculos/{c['carro_educ'].id}", headers=h)).status_code == 404

    # O administrador continua vendo tudo.
    d_admin = (await client.get(f"{API}/dashboard", headers=c["admin"]["headers"])).json()
    assert d_admin["frota"]["total"] == 2


@pytest.mark.asyncio
async def test_endpoints_sem_escopo_ficam_fechados(client, _db, make_tenant, setup_frota):
    c = await _cenario(_db, make_tenant, setup_frota)
    h = c["sec"]["headers"]
    for url in (
        "/motoristas", "/tanques", "/entradas", "/fornecedores", "/auditoria", "/busca?q=EDU",
        "/relatorios/estoque", "/relatorios/movimentacoes", "/relatorios/motoristas/cnh",
        "/acessos/usuarios",
    ):
        resp = await client.get(f"{API}{url}", headers=h)
        assert resp.status_code == 403, (url, resp.status_code)
    # Escrita também: o perfil é de consulta.
    resp = await client.post(
        f"{API}/abastecimentos",
        json={"veiculo_id": str(c["carro_saude"].id), "quantidade_litros": "10"},
        headers=h,
    )
    assert resp.status_code == 403
    assert (await client.get(f"{API}/notificacoes", headers=h)).json() == []
    assert (await client.get(f"{API}/alertas", headers=h)).json()["itens"] == []


@pytest.mark.asyncio
async def test_perfil_de_secretaria_sem_vinculo_nao_ve_nada(client, _db, make_tenant, setup_frota):
    c = await _cenario(_db, make_tenant, setup_frota)
    outro = await make_tenant("CONSULTA", org=c["admin"]["org"])

    # A tela exige secretaria para o perfil…
    resp = await _definir(c["admin"], outro["user"].id, perfil="SECRETARIO")
    assert resp.status_code == 422
    # …e, se o vínculo sumir por outro caminho, o backend falha fechado.
    _db.add(UsuarioAcesso(organization_id=c["admin"]["org"].id, user_id=outro["user"].id, perfil="SECRETARIO"))
    await _db.commit()
    h = outro["headers"]
    assert (await client.get(f"{API}/veiculos", headers=h)).json() == []
    assert (await client.get(f"{API}/abastecimentos", headers=h)).json() == []
    assert (await client.get(f"{API}/dashboard", headers=h)).json()["frota"]["total"] == 0


@pytest.mark.asyncio
async def test_gestor_vinculado_a_secretaria_tambem_fica_restrito(client, _db, make_tenant, setup_frota):
    c = await _cenario(_db, make_tenant, setup_frota)
    gestor = await make_tenant("GESTOR_FROTA", org=c["admin"]["org"])
    assert len((await client.get(f"{API}/veiculos", headers=gestor["headers"])).json()) == 2

    resp = await _definir(c["admin"], gestor["user"].id, unidades=[c["educacao"].id])
    assert resp.status_code == 200, resp.text
    assert resp.json()["restrito"] is True
    veiculos = (await client.get(f"{API}/veiculos", headers=gestor["headers"])).json()
    assert [v["id"] for v in veiculos] == [str(c["carro_educ"].id)]


@pytest.mark.asyncio
async def test_gestao_de_acessos_valida_e_audita(client, _db, make_tenant, setup_frota):
    c = await _cenario(_db, make_tenant, setup_frota)
    admin = c["admin"]

    lista = (await client.get(f"{API}/acessos/usuarios", headers=admin["headers"])).json()
    sec = next(u for u in lista if u["id"] == str(c["sec"]["user"].id))
    assert sec["perfil_local"] == "SECRETARIO" and sec["restrito"] is True
    assert [s["nome"] for s in sec["secretarias"]] == ["Saúde"]

    # Não altera o próprio acesso; perfil e secretaria precisam ser válidos.
    assert (await _definir(admin, admin["user"].id, perfil="CONSULTA")).status_code == 403
    assert (await _definir(admin, c["sec"]["user"].id, perfil="DONO")).status_code == 422
    outra_org = Organization(name="Outra", slug=uuid.uuid4().hex)
    _db.add(outra_org)
    await _db.flush()
    alheia = Unidade(organization_id=outra_org.id, nome="Saúde de outra prefeitura")
    _db.add(alheia)
    await _db.commit()
    resp = await _definir(admin, c["sec"]["user"].id, perfil="SECRETARIO", unidades=[alheia.id])
    assert resp.status_code == 422

    # Usuário de outra prefeitura não é alcançável.
    estranho = await make_tenant("CONSULTA")
    assert (await _definir(admin, estranho["user"].id, perfil="CONSULTA")).status_code == 404

    audit = (await client.get(f"{API}/auditoria", headers=admin["headers"])).json()
    assert any(a["acao"] == "acesso.atualizar" for a in audit)

    # Voltar ao papel da plataforma e sem secretarias: acesso total de consulta.
    resp = await _definir(admin, c["sec"]["user"].id)
    assert resp.json()["restrito"] is False
    assert len((await client.get(f"{API}/veiculos", headers=c["sec"]["headers"])).json()) == 2


@pytest.mark.asyncio
async def test_sincronizacao_da_plataforma_nao_apaga_o_acesso_local(
    client, _db, make_tenant, setup_frota, monkeypatch
):
    c = await _cenario(_db, make_tenant, setup_frota)
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", SecretStr("chave-teste"))
    u = c["sec"]["user"]
    resp = await client.post(
        f"{API}/internal/sync-user",
        json={
            "user_id": str(u.id), "organization_id": str(u.organization_id),
            "name": u.name, "email": u.email, "roles": ["ORG_MEMBER"],
        },
        headers={"X-Internal-Key": "chave-teste"},
    )
    assert resp.status_code == 200, resp.text
    veiculos = (await client.get(f"{API}/veiculos", headers=c["sec"]["headers"])).json()
    assert [v["id"] for v in veiculos] == [str(c["carro_saude"].id)]


@pytest.mark.asyncio
async def test_fiscal_do_contrato_gerencia_contratos_sem_mexer_em_combustivel(
    client, _db, make_tenant, setup_frota
):
    c = await _cenario(_db, make_tenant, setup_frota)
    fiscal = await make_tenant("CONSULTA", org=c["admin"]["org"])
    assert (await _definir(c["admin"], fiscal["user"].id, perfil="FISCAL_CONTRATO")).status_code == 200
    posto = await client.post(
        f"{API}/fornecedores",
        json={"razao_social": "Posto", "categoria": "COMBUSTIVEL", "posto_credenciado": True},
        headers=c["admin"]["headers"],
    )
    pid = posto.json()["id"]
    comb = (await client.get(f"{API}/combustiveis", headers=c["admin"]["headers"])).json()[0]["id"]
    resp = await client.post(
        f"{API}/fornecedores/{pid}/contratos",
        json={"combustivel_id": comb, "preco_litro": "6.00", "litros_contratados": "100"},
        headers=fiscal["headers"],
    )
    assert resp.status_code == 201, resp.text
    resp = await client.patch(f"{API}/fornecedores/{pid}", json={"telefone": "1"}, headers=fiscal["headers"])
    assert resp.status_code == 403
