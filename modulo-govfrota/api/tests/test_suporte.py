"""Suporte: o posto abre chamados pelo portal; a equipe responde pelo painel."""

import pytest

from tests.cenario_posto import _cenario
from tests.test_portal_posto import API, P, _criar_acesso, _entrar


@pytest.mark.asyncio
async def test_chamado_do_posto_ate_a_resposta(client, _db, make_tenant, setup_frota):
    admin, saude, educ, posto, itens, filtro = await _cenario(client, _db, make_tenant, setup_frota)
    from app.models.combustivel import Fornecedor
    outro = (await _db.execute(__import__("sqlalchemy").select(Fornecedor).where(Fornecedor.razao_social == "Outro Posto"))).scalar_one()
    h1 = await _entrar(client, "posto.um", (await _criar_acesso(client, admin, posto, "posto.um"))["senha_provisoria"])
    h2 = await _entrar(client, "posto.dois", (await _criar_acesso(client, admin, outro, "posto.dois"))["senha_provisoria"])

    meu = (await client.get(f"{P}/abastecimentos", params={"nota": "PENDENTE"}, headers=h1)).json()[0]
    r = await client.post(f"{P}/suporte", json={
        "tipo": "CORRECAO", "assunto": "Litros errados", "descricao": "Foram 50 litros e não 60.",
        "abastecimento": meu["numero"], "contato": "(44) 99999-0000",
    }, headers=h1)
    assert r.status_code == 201, r.text
    c = r.json()
    assert c["protocolo"].endswith("/00001") and c["status"] == "ABERTO"
    assert c["abastecimento_numero"] == meu["numero"] and c["aberto_por"] == "Maria do Posto"

    # Abastecimento de outro posto não pode ser citado; outro posto não vê o chamado.
    r = await client.post(f"{P}/suporte", json={"tipo": "CORRECAO", "assunto": "Teste", "descricao": "Abastecimento alheio.",
                                                 "abastecimento": meu["numero"]}, headers=h2)
    assert r.status_code == 422
    assert (await client.get(f"{P}/suporte", headers=h2)).json() == []

    # A equipe vê, recebe notificação e responde.
    lista = (await client.get(f"{API}/suporte", headers=admin["headers"])).json()
    assert [x["id"] for x in lista] == [c["id"]] and lista[0]["posto"] == "Posto Pinhalzinho"
    notifs = (await client.get(f"{API}/notificacoes", headers=admin["headers"])).json()
    assert any(n["tipo"] == "SUPORTE_CHAMADO" for n in notifs)
    r = await client.post(f"{API}/suporte/{c['id']}/responder", json={"status": "RESOLVIDO", "resposta": "Corrigido para 50 L."}, headers=admin["headers"])
    assert r.status_code == 200, r.text

    visto = (await client.get(f"{P}/suporte", headers=h1)).json()[0]
    assert visto["status"] == "RESOLVIDO" and visto["resposta"] == "Corrigido para 50 L." and visto["respondido_em"]

    # Token do posto não abre a área da equipe.
    assert (await client.get(f"{API}/suporte", headers=h1)).status_code in (401, 403)
