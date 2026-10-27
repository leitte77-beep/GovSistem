"""Fase 10 — laboratório (B.8) e SISCAN (B.5).

Configuração versionada (referências e críticos sintéticos, não valores
clínicos oficiais), autorização/carência/exame recente, recepção por código,
etiqueta e reimpressão auditada, coleta por leitura, problemas, resultado com
limites, liberação por CBO habilitado e assinatura, entrega, sigilo, laudo na
unidade e no portal com limite de tentativas, equipamentos, contingência,
produção e relatórios; SISCAN com modelos versionados, ciclo, resultado
alterado, busca ativa restrita. Inclui negativos de tenant e RBAC.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.auditoria import AuditTrail
from app.models.nucleo import Profissional
from tests.conftest import _criar_usuario

V1 = "/api/govsaude/v1"
API = f"{V1}/laboratorio"
SIS = f"{V1}/siscan"
NASC = date(1980, 5, 17)

GLICOSE = {
    "codigo": "GLI",
    "nome": "Glicose (teste)",
    "material": "SORO",
    "bancada": "BIOQUIMICA",
    "metodo": "Enzimático",
    "procedimento_sigtap": "0000000001",
    "valor_unitario": 1.85,
    "prazo_entrega_dias": 2,
    "campos": [
        {
            "codigo": "glicose",
            "nome": "Glicose",
            "unidade": "mg/dL",
            "referencia_min": 70,
            "referencia_max": 99,
            "critico_min": 40,
            "critico_max": 400,
            "limite_min": 0,
            "limite_max": 2000,
        },
        {"codigo": "obs", "nome": "Observação", "tipo": "TEXTO", "obrigatorio": False},
    ],
}


@pytest.fixture
async def lab(db, mundo):
    """Técnico, responsável (CBO habilitado) e regulador lotados na UBS A."""
    ids = {}
    for chave, grupo in (
        ("tecnico", "laboratorio_tecnico"),
        ("responsavel", "laboratorio_responsavel"),
        ("regulador", "regulador"),
    ):
        u = await _criar_usuario(
            db,
            tenant_id=mundo["org_a"].id,
            nome=f"Lab {chave}",
            email=f"lab-{chave}@teste.local",
            grupo=grupo,
            estabelecimento_id=mundo["estab_a"].id,
        )
        mundo["usuarios"][chave] = u
        ids[chave] = u
    db.add(
        Profissional(
            tenant_id=mundo["org_a"].id,
            usuario_id=ids["responsavel"].id,
            nome="Bioquímica Responsável",
            cbo="221810",
        )
    )
    await db.commit()
    return ids


async def _cidadao(client, token, nome="Paciente Lab", sexo="FEMININO", nascimento=NASC):
    r = await client.post(
        f"{V1}/cidadaos",
        json={"nome": nome, "sexo": sexo, "data_nascimento": nascimento.isoformat()},
        headers=token("admin"),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _exame(client, token, **extra):
    r = await client.post(f"{API}/exames", json={**GLICOSE, **extra}, headers=token("gestor"))
    assert r.status_code == 201, r.text
    return r.json()


async def _requisicao(client, token, mundo, cidadao, exames, chave="medico", **extra):
    r = await client.post(
        f"{API}/requisicoes",
        json={
            "cidadao_id": cidadao,
            "estabelecimento_origem_id": str(mundo["estab_a"].id),
            "exames": [e["id"] for e in exames],
            **extra,
        },
        headers=token(chave),
    )
    return r


async def _coletado(client, token, mundo, cidadao, exame):
    req = await _requisicao(client, token, mundo, cidadao, [exame])
    assert req.status_code == 201, req.text
    item = req.json()["itens"][0]
    r = await client.post(
        f"{API}/coleta",
        json={"etiqueta": item["etiqueta"], "material": exame["material"] or "SORO"},
        headers=token("tecnico"),
    )
    assert r.status_code == 200, r.text
    return req.json(), r.json()


@pytest.mark.asyncio
async def test_b8_001_003_004_configuracao_versionada_e_copia(client, token, mundo, lab):
    assert (await client.post(f"{API}/exames", json=GLICOSE, headers=token("tecnico"))).status_code == 403
    sem_campo = {**GLICOSE, "campos": []}
    assert (await client.post(f"{API}/exames", json=sem_campo, headers=token("gestor"))).status_code == 422
    v1 = await _exame(client, token)
    assert v1["numero_versao"] == 1 and v1["procedimento_sigtap"] == "0000000001"
    v2 = await _exame(client, token, prazo_entrega_dias=3)
    assert v2["numero_versao"] == 2
    todas = (await client.get(f"{API}/exames", params={"todas": True}, headers=token("tecnico"))).json()
    assert {(e["numero_versao"], e["ativo"]) for e in todas} == {(1, False), (2, True)}
    copia = await client.post(
        f"{API}/exames/{v2['id']}/copiar",
        json={"estabelecimento_id": str(mundo["estab_b"].id)},
        headers=token("responsavel"),
    )
    assert copia.status_code == 201, copia.text
    assert copia.json()["copiado_de_id"] == v2["id"] and copia.json()["prazo_entrega_dias"] == 3
    assert copia.json()["estabelecimento_id"] == str(mundo["estab_b"].id)
    assert (await client.get(f"{API}/exames", headers=token("admin_b"))).json() == []


@pytest.mark.asyncio
async def test_b8_005_021_autorizacao_carencia_e_exame_recente(client, token, mundo, lab):
    alto = await _exame(client, token, codigo="TSH", nome="TSH (teste)", alto_custo=True, validade_autorizacao_dias=30, carencia_dias=90)
    cidadao = await _cidadao(client, token)
    req = await _requisicao(client, token, mundo, cidadao, [alto])
    item = req.json()["itens"][0]
    assert item["situacao"] == "AGUARDANDO_AUTORIZACAO" and item["autorizacao_situacao"] == "PENDENTE"
    bloqueada = await client.post(f"{API}/coleta", json={"etiqueta": item["etiqueta"], "material": "SORO"}, headers=token("tecnico"))
    assert bloqueada.json()["codigo"] == "aguardando_autorizacao"
    assert (await client.post(f"{API}/itens/{item['id']}/autorizacao", json={"autorizado": True}, headers=token("tecnico"))).status_code == 403
    ok = await client.post(f"{API}/itens/{item['id']}/autorizacao", json={"autorizado": True}, headers=token("regulador"))
    assert ok.status_code == 200 and ok.json()["situacao"] == "REQUISITADO" and ok.json()["autorizacao_valida_ate"]

    carencia = await _requisicao(client, token, mundo, cidadao, [alto])
    assert carencia.status_code == 409 and carencia.json()["codigo"] == "carencia"
    justificada = await _requisicao(client, token, mundo, cidadao, [alto], justificativa="Controle pós-ajuste de dose solicitado")
    assert justificada.status_code == 201 and justificada.json()["itens"][0]["alertas"][0]["codigo"] == "CARENCIA"

    gli = await _exame(client, token, validade_resultado_dias=60)
    _, coletado = await _coletado(client, token, mundo, cidadao, gli)
    await client.post(f"{API}/itens/{coletado['id']}/resultado", json={"valores": {"glicose": 90}}, headers=token("tecnico"))
    await client.post(f"{API}/itens/{coletado['id']}/liberacao", json={}, headers=token("responsavel"))
    recente = await _requisicao(client, token, mundo, cidadao, [gli])
    assert recente.status_code == 201
    assert recente.json()["itens"][0]["alertas"][0]["codigo"] == "EXAME_RECENTE_VALIDO", "alerta, não bloqueia"


@pytest.mark.asyncio
async def test_b8_006_010_011_012_013_014_requisicao_recepcao_etiqueta_coleta(client, token, mundo, lab):
    restrito = await _exame(client, token, codigo="RES", estabelecimentos_requisitantes=[str(mundo["estab_b"].id)])
    gli = await _exame(client, token)
    cidadao = await _cidadao(client, token)
    negado = await _requisicao(client, token, mundo, cidadao, [restrito])
    assert negado.status_code == 403 and negado.json()["codigo"] == "exame_nao_permitido_na_unidade"
    assert (await _requisicao(client, token, mundo, cidadao, [gli], chave="recepcao")).status_code == 403
    assert (await _requisicao(client, token, mundo, cidadao, [gli], origem="PRONTUARIO")).status_code == 422

    req = await _requisicao(client, token, mundo, cidadao, [gli], urgente=True, gestante=True, observacoes="Jejum de 8h")
    assert req.status_code == 201, req.text
    dados = req.json()
    assert dados["urgente"] and dados["gestante"] and dados["codigo_acesso"]
    assert dados["previsao_retirada"] == (date.today() + timedelta(days=2)).isoformat()
    item = dados["itens"][0]

    recebida = await client.post(f"{API}/recepcao", json={"codigo": dados["protocolo"]}, headers=token("tecnico"))
    assert recebida.status_code == 200 and recebida.json()["recebida_em"]
    assert (await client.post(f"{API}/recepcao", json={"codigo": dados["protocolo"]}, headers=token("admin_b"))).status_code == 404

    et = await client.post(f"{API}/itens/{item['id']}/etiqueta", headers=token("tecnico"))
    assert et.status_code == 200 and et.json()["etiqueta"] == item["etiqueta"]
    sem_motivo = await client.post(f"{API}/itens/{item['id']}/etiqueta", headers=token("tecnico"))
    assert sem_motivo.json()["codigo"] == "motivo_reimpressao"
    re = await client.post(f"{API}/itens/{item['id']}/etiqueta", params={"formato": "pdf"}, json={"motivo": "Etiqueta danificada"}, headers=token("tecnico"))
    assert re.status_code == 200 and re.headers["content-type"] == "application/pdf"

    errado = await client.post(f"{API}/coleta", json={"etiqueta": item["etiqueta"], "material": "URINA"}, headers=token("tecnico"))
    assert errado.json()["codigo"] == "material_divergente"
    coleta = await client.post(f"{API}/coleta", json={"etiqueta": item["etiqueta"], "material": "SORO"}, headers=token("tecnico"))
    assert coleta.status_code == 200 and coleta.json()["situacao"] == "COLETADO" and coleta.json()["coletado_em"]
    repetida = await client.post(f"{API}/coleta", json={"etiqueta": item["etiqueta"], "material": "SORO"}, headers=token("tecnico"))
    assert repetida.status_code == 409

    comp = await client.post(f"{API}/requisicoes/{dados['id']}/comprovante", headers=token("tecnico"))
    assert comp.json()["previsao_retirada"] and comp.json()["codigo_acesso"] != dados["codigo_acesso"]
    pdf = await client.post(f"{API}/requisicoes/{dados['id']}/comprovante", params={"formato": "pdf"}, headers=token("tecnico"))
    assert pdf.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_b8_002_015_016_017_020_029_resultado_limites_mapa_e_historico(client, token, mundo, lab):
    gli = await _exame(client, token)
    cidadao = await _cidadao(client, token)
    req, item = await _coletado(client, token, mundo, cidadao, gli)
    prob = await client.post(f"{API}/itens/{item['id']}/problemas", json={"categoria": "AMOSTRA", "motivo": "Amostra hemolisada", "nova_coleta": True}, headers=token("tecnico"))
    assert prob.status_code == 200 and prob.json()["situacao"] == "REQUISITADO"
    await client.post(f"{API}/coleta", json={"etiqueta": item["etiqueta"], "material": "SORO"}, headers=token("tecnico"))
    assert (await client.post(f"{API}/itens/{item['id']}/processamento", headers=token("tecnico"))).json()["situacao"] == "EM_PROCESSAMENTO"

    mapa = (await client.get(f"{API}/estabelecimentos/{mundo['estab_a'].id}/mapa-trabalho", params={"bancada": "BIOQUIMICA"}, headers=token("tecnico"))).json()
    assert [linha["etiqueta"] for linha in mapa["linhas"]] == [item["etiqueta"]]
    assert (await client.get(f"{API}/estabelecimentos/{mundo['estab_a'].id}/mapa-trabalho", params={"bancada": "HEMATO"}, headers=token("tecnico"))).json()["linhas"] == []

    url = f"{API}/itens/{item['id']}/resultado"
    assert (await client.post(url, json={"valores": {"glicose": 5000}}, headers=token("tecnico"))).json()["codigo"] == "valor_fora_do_limite"
    assert (await client.post(url, json={"valores": {"xpto": 1}}, headers=token("tecnico"))).json()["codigo"] == "campo_desconhecido"
    assert (await client.post(url, json={"valores": {}}, headers=token("tecnico"))).json()["codigo"] == "campos_obrigatorios"
    parcial = await client.post(url, json={"valores": {}, "parcial": True}, headers=token("tecnico"))
    assert parcial.json()["incompleto"] is True
    pend = (await client.get(f"{API}/estabelecimentos/{mundo['estab_a'].id}/pendencias", headers=token("tecnico"))).json()
    assert [x["etiqueta"] for x in pend["incompletos"]] == [item["etiqueta"]]
    assert (await client.post(f"{API}/itens/{item['id']}/liberacao", json={}, headers=token("responsavel"))).json()["codigo"] == "resultado_incompleto"

    critico = await client.post(url, json={"valores": {"glicose": 450, "obs": "Repetido"}, "texto_livre": "Confirmado em duplicata"}, headers=token("tecnico"))
    assert critico.status_code == 200, critico.text
    corpo = critico.json()
    assert corpo["critico"] and corpo["fora_referencia"] and corpo["avaliacao"][0]["fora_referencia"] == "ALTO"
    assert any(a["codigo"] == "VALOR_CRITICO" for a in corpo["alertas"])
    pend = (await client.get(f"{API}/estabelecimentos/{mundo['estab_a'].id}/pendencias", headers=token("tecnico"))).json()
    assert pend["criticos"] and pend["pendentes_liberacao"] and not pend["incompletos"]

    etapas = (await client.get(f"{API}/itens/{item['id']}/etapas", headers=token("tecnico"))).json()
    concluidas = [e["etapa"] for e in etapas["etapas"] if e["concluida"]]
    assert concluidas == ["REQUISITADO", "RECEBIDO", "COLETADO", "EM_PROCESSAMENTO", "RESULTADO"]
    hist = (await client.get(f"{API}/requisicoes/{req['id']}/historico", headers=token("tecnico"))).json()
    assert any(h["tipo"] == "PROBLEMA" and h["categoria"] == "AMOSTRA" for h in hist)
    assert any(h["tipo"] == "ALTERACAO_RESULTADO" for h in hist)
    assert (await client.get(f"{API}/requisicoes/{req['id']}/historico", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b8_007_022_023_024_026_032_liberacao_entrega_laudo_e_portal(client, token, mundo, lab, db):
    gli = await _exame(client, token, cbos_liberacao=["221810"], layout_laudo="<p>Laboratório municipal — {{ exame }}</p>")
    cidadao = await _cidadao(client, token)
    req, item = await _coletado(client, token, mundo, cidadao, gli)
    await client.post(f"{API}/itens/{item['id']}/resultado", json={"valores": {"glicose": 85}}, headers=token("tecnico"))
    assert (await client.post(f"{API}/itens/{item['id']}/liberacao", json={}, headers=token("tecnico"))).status_code == 403
    sem_cbo = await client.post(f"{API}/itens/{item['id']}/liberacao", json={}, headers=token("admin"))
    assert sem_cbo.status_code == 403 and sem_cbo.json()["codigo"] == "profissional_nao_habilitado"
    digital = await client.post(f"{API}/itens/{item['id']}/liberacao", json={"assinatura": "DIGITAL"}, headers=token("responsavel"))
    assert digital.json()["codigo"] == "assinatura_digital_indisponivel"
    lib = await client.post(f"{API}/itens/{item['id']}/liberacao", json={}, headers=token("responsavel"))
    assert lib.status_code == 200, lib.text
    assert lib.json()["situacao"] == "LIBERADO" and len(lib.json()["assinatura_hash"]) == 64
    sem_motivo = await client.post(f"{API}/itens/{item['id']}/resultado", json={"valores": {"glicose": 86}}, headers=token("tecnico"))
    assert sem_motivo.json()["codigo"] == "resultado_liberado"

    laudo = await client.get(f"{API}/requisicoes/{req['id']}/laudo", headers=token("medico"))
    assert laudo.status_code == 200 and laudo.headers["content-type"] == "application/pdf"
    assert (await client.get(f"{API}/requisicoes/{req['id']}/laudo", headers=token("admin_b"))).status_code == 404
    decl = await client.get(f"{API}/requisicoes/{req['id']}/declaracao-comparecimento", headers=token("recepcao"))
    assert decl.status_code == 200

    portal = f"{API}/portal/prefeitura-a/laudo"
    corpo = {"protocolo": req["protocolo"], "codigo_acesso": req["codigo_acesso"], "data_nascimento": NASC.isoformat()}
    ok = await client.post(portal, json=corpo)
    assert ok.status_code == 200 and ok.headers["content-type"] == "application/pdf"
    assert (await client.post(f"{API}/portal/prefeitura-b/laudo", json=corpo)).status_code == 404
    errado = {**corpo, "data_nascimento": "1999-01-01"}
    for _ in range(5):
        assert (await client.post(portal, json=errado)).status_code == 404
    assert (await client.post(portal, json=corpo)).status_code == 423, "bloqueado após 5 tentativas"

    ent = await client.post(f"{API}/itens/{item['id']}/entrega", json={"recebedor": "Maria Paciente", "documento": "123.456.789-09"}, headers=token("recepcao"))
    assert ent.status_code == 200 and ent.json()["situacao"] == "ENTREGUE" and ent.json()["entregue_a"] == "Maria Paciente"

    acoes = set(
        (
            await db.scalars(
                select(AuditTrail.acao).where(AuditTrail.recurso.in_(["laudo_exame", "item_exame", "laudo_portal", "declaracao_comparecimento"]))
            )
        ).all()
    )
    assert {"IMPRIMIR", "ASSINAR", "ATUALIZAR", "DOWNLOAD", "LER"} <= acoes


@pytest.mark.asyncio
async def test_b8_025_018_019_sigilo_anexo_e_radiologia(client, token, mundo, lab):
    hiv = await _exame(client, token, codigo="HIV", nome="Anti-HIV (teste)", sigiloso=True, campos=[{"codigo": "res", "nome": "Resultado", "tipo": "OPCAO", "opcoes": ["REAGENTE", "NAO_REAGENTE"]}])
    cidadao = await _cidadao(client, token)
    req, item = await _coletado(client, token, mundo, cidadao, hiv)
    assert (await client.post(f"{API}/itens/{item['id']}/resultado", json={"valores": {"res": "TALVEZ"}}, headers=token("tecnico"))).json()["codigo"] == "valor_invalido"
    await client.post(f"{API}/itens/{item['id']}/resultado", json={"valores": {"res": "REAGENTE"}}, headers=token("tecnico"))
    await client.post(f"{API}/itens/{item['id']}/liberacao", json={}, headers=token("responsavel"))
    pela_recepcao = (await client.get(f"{API}/requisicoes/{req['id']}", headers=token("recepcao"))).json()["itens"][0]
    assert pela_recepcao["velado"] is True and pela_recepcao["valores"] is None
    pelo_medico = (await client.get(f"{API}/requisicoes/{req['id']}", headers=token("medico"))).json()["itens"][0]
    assert pelo_medico["velado"] is False and pelo_medico["valores"] == {"res": "REAGENTE"}
    assert (await client.get(f"{API}/requisicoes/{req['id']}/laudo", headers=token("recepcao"))).status_code == 404
    assert (await client.post(f"{API}/itens/{item['id']}/entrega", json={"recebedor": "Fulano", "documento": "1234"}, headers=token("recepcao"))).status_code == 403
    portal = {"protocolo": req["protocolo"], "codigo_acesso": req["codigo_acesso"], "data_nascimento": NASC.isoformat()}
    assert (await client.post(f"{API}/portal/prefeitura-a/laudo", json=portal)).status_code == 404, "sigiloso não vai ao portal"

    rx = await _exame(client, token, codigo="RX", nome="RX de tórax (teste)", tipo="RADIOLOGIA", campos=[], material=None)
    _, item_rx = await _coletado(client, token, mundo, cidadao, rx)
    assert (await client.post(f"{API}/itens/{item_rx['id']}/resultado", json={}, headers=token("tecnico"))).json()["codigo"] == "laudo_vazio"
    outro = await _cidadao(client, token, nome="Outro Paciente")
    anexo_alheio = "00000000-0000-0000-0000-000000000001"
    assert (await client.post(f"{API}/itens/{item_rx['id']}/resultado", json={"texto_livre": "Sem alterações", "anexos": [anexo_alheio]}, headers=token("tecnico"))).status_code == 404
    laudo = await client.post(f"{API}/itens/{item_rx['id']}/resultado", json={"texto_livre": "Campos pulmonares sem alterações."}, headers=token("tecnico"))
    assert laudo.status_code == 200 and laudo.json()["texto_livre"].startswith("Campos")
    assert outro


@pytest.mark.asyncio
async def test_b8_008_009_034_equipamento_e_contingencia(client, token, mundo, lab):
    gli = await _exame(client, token, integrado_equipamento=True, equipamento_codigo="BIO-01")
    cidadao = await _cidadao(client, token)
    _, item = await _coletado(client, token, mundo, cidadao, gli)
    url = f"{API}/equipamentos/mensagens"
    falha = await client.post(url, json={"equipamento": "BIO-01", "id_mensagem": "m1", "etiqueta": "L000", "valores": {"glicose": 90}}, headers=token("tecnico"))
    assert falha.status_code == 200 and falha.json()["situacao"] == "ERRO" and "etiqueta_desconhecida" in falha.json()["erro"]
    outro = await client.post(url, json={"equipamento": "OUTRO", "id_mensagem": "m2", "etiqueta": item["etiqueta"], "valores": {"glicose": 90}}, headers=token("tecnico"))
    assert "exame_nao_integrado" in outro.json()["erro"]
    ok = await client.post(url, json={"equipamento": "BIO-01", "id_mensagem": "m3", "etiqueta": item["etiqueta"], "valores": {"glicose": 91}}, headers=token("tecnico"))
    assert ok.json()["situacao"] == "PROCESSADA", ok.text
    dup = await client.post(url, json={"equipamento": "BIO-01", "id_mensagem": "m3", "etiqueta": item["etiqueta"], "valores": {"glicose": 91}}, headers=token("tecnico"))
    assert dup.json()["duplicada"] is True
    erros = (await client.get(url, params={"situacao": "ERRO"}, headers=token("tecnico"))).json()
    assert {e["id_mensagem"] for e in erros} == {"m1", "m2"}
    assert (await client.post(f"{url}/{erros[0]['id']}/reprocessar", headers=token("tecnico"))).json()["situacao"] == "ERRO"
    assert (await client.post(url, json={"equipamento": "BIO-01", "id_mensagem": "m9", "etiqueta": item["etiqueta"], "valores": {}}, headers=token("recepcao"))).status_code == 403

    base = {"cidadao_id": cidadao, "estabelecimento_origem_id": str(mundo["estab_a"].id), "exames": [gli["id"]], "registrada_em": (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()}
    lote = {"requisicoes": [{**base, "id_cliente": "off-1"}, {**base, "id_cliente": "off-2", "exames": ["00000000-0000-0000-0000-000000000009"]}]}
    sync = (await client.post(f"{API}/contingencia/sincronizar", json=lote, headers=token("tecnico"))).json()
    assert len(sync["aceitos"]) == 1 and len(sync["rejeitados"]) == 1
    de_novo = (await client.post(f"{API}/contingencia/sincronizar", json=lote, headers=token("tecnico"))).json()
    assert len(de_novo["duplicados"]) == 1 and not de_novo["aceitos"], "sem duplicação"
    req = (await client.get(f"{API}/requisicoes/{sync['aceitos'][0]['requisicao_id']}", headers=token("tecnico"))).json()
    assert req["contingencia"] and req["origem"] == "CONTINGENCIA"


@pytest.mark.asyncio
async def test_b8_027_028_030_producao_e_relatorios(client, token, mundo, lab):
    gli = await _exame(client, token)
    sem_sigtap = await _exame(client, token, codigo="SEM", procedimento_sigtap=None)
    cidadao = await _cidadao(client, token)
    for exame in (gli, gli, sem_sigtap):
        _, item = await _coletado(client, token, mundo, cidadao, exame)
        await client.post(f"{API}/itens/{item['id']}/resultado", json={"valores": {"glicose": 80}}, headers=token("tecnico"))
        await client.post(f"{API}/itens/{item['id']}/liberacao", json={}, headers=token("responsavel"))
    comp = date.today().strftime("%Y-%m")
    prod = (await client.get(f"{API}/producao", params={"competencia": comp}, headers=token("faturista"))).json()
    assert prod["linhas"][0]["procedimento"] == "0000000001" and prod["linhas"][0]["quantidade"] == 2
    assert prod["linhas"][0]["valor"] == 3.7 and prod["inconsistencias"][0]["erro"] == "SEM_PROCEDIMENTO_SIGTAP"
    params = {"inicio": (date.today() - timedelta(days=1)).isoformat(), "fim": date.today().isoformat(), "agrupar_por": "exame", "comparar": True}
    rel = (await client.get(f"{API}/relatorios/exames", params=params, headers=token("gestor"))).json()
    linhas = {linha["chave"]: linha for linha in rel["linhas"]}
    assert linhas["GLI"]["quantidade"] == 2 and linhas["GLI"]["liberados"] == 2 and "quantidade_anterior" in linhas["GLI"]
    xlsx = await client.get(f"{API}/relatorios/exames", params={**params, "formato": "xlsx"}, headers=token("gestor"))
    assert xlsx.status_code == 200
    assert (await client.get(f"{API}/relatorios/exames", params=params, headers=token("admin_b"))).json()["linhas"] == []


# ── SISCAN ──────────────────────────────────────────────────────────────────
MODELO_CITO = {
    "tipo": "CITO_COLO",
    "nome": "Requisição citopatológico colo (modelo sintético)",
    "campos_requisicao": [
        {"codigo": "motivo", "nome": "Motivo do exame", "tipo": "OPCAO", "opcoes": ["RASTREAMENTO", "REPETICAO", "SEGUIMENTO"], "obrigatorio": True},
        {"codigo": "ultimo_exame", "nome": "Data do último exame", "tipo": "DATA"},
    ],
    "campos_resultado": [
        {"codigo": "adequabilidade", "nome": "Adequabilidade", "tipo": "OPCAO", "opcoes": ["SATISFATORIA", "INSATISFATORIA"], "obrigatorio": True},
        {"codigo": "conclusao", "nome": "Conclusão", "tipo": "OPCAO", "opcoes": ["NEGATIVO", "ALTERADO"], "obrigatorio": True},
    ],
    "valores_alterados": {"conclusao": ["ALTERADO"]},
    "procedimento_coleta_sigtap": "0000000002",
    "prazo_resultado_dias": 30,
    "intervalo_rastreamento_meses": 36,
}


async def _modelo(client, token, **extra):
    r = await client.post(f"{SIS}/modelos", json={**MODELO_CITO, **extra}, headers=token("gestor"))
    assert r.status_code == 201, r.text
    a = await client.post(f"{SIS}/modelos/{r.json()['id']}/ativacao", json={"fonte_normativa": "Layout de teste (sintético)"}, headers=token("gestor"))
    assert a.status_code == 200, a.text
    return a.json()


@pytest.mark.asyncio
async def test_b5_005_018_modelos_versionados(client, token, mundo, lab):
    r = await client.post(f"{SIS}/modelos", json=MODELO_CITO, headers=token("gestor"))
    assert r.json()["ativo"] is False
    sem_fonte = await client.post(f"{SIS}/modelos/{r.json()['id']}/ativacao", json={}, headers=token("gestor"))
    assert sem_fonte.json()["codigo"] == "fonte_normativa_obrigatoria"
    cidadao = await _cidadao(client, token)
    inativo = await client.post(f"{SIS}/exames", json={"tipo": "CITO_COLO", "cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "dados": {"motivo": "RASTREAMENTO"}}, headers=token("medico"))
    assert inativo.json()["codigo"] == "modelo_siscan_inativo"
    v2 = await _modelo(client, token)
    assert v2["numero_versao"] == 2
    await _modelo(client, token, nome="Versão 3")
    versoes = {m["numero_versao"]: m["ativo"] for m in (await client.get(f"{SIS}/modelos", params={"tipo": "CITO_COLO"}, headers=token("tecnico"))).json()}
    assert versoes == {1: False, 2: False, 3: True}
    assert (await client.post(f"{SIS}/modelos", json=MODELO_CITO, headers=token("medico"))).status_code == 403


@pytest.mark.asyncio
async def test_b5_001_004_006_011_012_016_ciclo_resultado_e_historico(client, token, mundo, lab):
    await _modelo(client, token)
    cidadao = await _cidadao(client, token)
    corpo = {"tipo": "CITO_COLO", "cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "especialidade": "Ginecologia", "material": "Esfregaço cervical", "informacoes_clinicas": "Sem queixas", "dados": {"motivo": "INVALIDO"}}
    invalida = await client.post(f"{SIS}/exames", json=corpo, headers=token("medico"))
    assert invalida.status_code == 422 and invalida.json()["errors"][0]["campo"] == "motivo"
    assert (await client.post(f"{SIS}/exames", json={**corpo, "dados": {"motivo": "RASTREAMENTO", "x": 1}}, headers=token("medico"))).status_code == 422
    assert (await client.post(f"{SIS}/exames", json={**corpo, "dados": {"motivo": "RASTREAMENTO"}}, headers=token("tecnico"))).status_code == 403
    ex = await client.post(f"{SIS}/exames", json={**corpo, "dados": {"motivo": "RASTREAMENTO", "ultimo_exame": "2020-03-01"}}, headers=token("medico"))
    assert ex.status_code == 201 and ex.json()["situacao"] == "REQUISITADO"
    eid = ex.json()["id"]
    pulo = await client.post(f"{SIS}/exames/{eid}/situacao", json={"situacao": "ENVIADO"}, headers=token("medico"))
    assert pulo.json()["codigo"] == "transicao_invalida"
    assert (await client.post(f"{SIS}/exames/{eid}/resultado", json={"dados": {"adequabilidade": "SATISFATORIA", "conclusao": "NEGATIVO"}}, headers=token("tecnico"))).json()["codigo"] == "situacao_invalida"
    await client.post(f"{SIS}/exames/{eid}/situacao", json={"situacao": "COLETADO"}, headers=token("medico"))
    env = await client.post(f"{SIS}/exames/{eid}/situacao", json={"situacao": "ENVIADO", "prestador": "Laboratório de citopatologia"}, headers=token("medico"))
    assert env.json()["enviado_em"]
    res = await client.post(f"{SIS}/exames/{eid}/resultado", json={"dados": {"adequabilidade": "SATISFATORIA", "conclusao": "NEGATIVO"}}, headers=token("tecnico"))
    assert res.status_code == 200 and res.json()["resultado_alterado"] is False
    assert res.json()["proximo_exame_em"][:4] == str(date.today().year + 3), "rastreamento pelo intervalo do modelo"
    assert (await client.post(f"{SIS}/exames/{eid}/assinatura", headers=token("tecnico"))).status_code == 403
    ass = await client.post(f"{SIS}/exames/{eid}/assinatura", headers=token("responsavel"))
    assert ass.status_code == 200 and len(ass.json()["assinatura_hash"]) == 64
    assert (await client.post(f"{SIS}/exames/{eid}/resultado", json={"dados": {"adequabilidade": "SATISFATORIA", "conclusao": "ALTERADO"}}, headers=token("tecnico"))).json()["codigo"] == "ja_assinado"
    com = await client.post(f"{SIS}/exames/{eid}/situacao", json={"situacao": "COMUNICADO", "meio": "Visita ACS"}, headers=token("medico"))
    assert com.json()["comunicado_em"]
    guia = await client.get(f"{SIS}/exames/{eid}/guia", headers=token("medico"))
    assert guia.status_code == 200 and guia.headers["content-type"] == "application/pdf"
    hist = (await client.get(f"{SIS}/cidadaos/{cidadao}/historico", params={"tipo": "CITO_COLO"}, headers=token("medico"))).json()
    assert len(hist["exames"]) == 1 and hist["proximo_exame_em"] == res.json()["proximo_exame_em"]
    assert (await client.get(f"{SIS}/exames/{eid}/guia", headers=token("admin_b"))).status_code == 404


@pytest.mark.asyncio
async def test_b5_013_014_017_busca_ativa_producao_e_relatorios(client, token, mundo, lab):
    await _modelo(client, token)
    cidadao = await _cidadao(client, token)
    base = {"tipo": "CITO_COLO", "cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "dados": {"motivo": "RASTREAMENTO"}}
    atrasado = await client.post(f"{SIS}/exames", json={**base, "coletado_em": (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()}, headers=token("medico"))
    assert atrasado.json()["situacao"] == "COLETADO"
    alterado = await client.post(f"{SIS}/exames", json={**base, "coletado_em": datetime.now(timezone.utc).isoformat()}, headers=token("medico"))
    await client.post(f"{SIS}/exames/{alterado.json()['id']}/resultado", json={"dados": {"adequabilidade": "SATISFATORIA", "conclusao": "ALTERADO"}}, headers=token("tecnico"))

    assert (await client.get(f"{SIS}/busca-ativa", headers=token("recepcao"))).status_code == 403, "acesso restrito"
    assert (await client.get(f"{SIS}/busca-ativa", headers=token("tecnico"))).status_code == 403
    busca = (await client.get(f"{SIS}/busca-ativa", headers=token("medico"))).json()
    assert [b["exame_id"] for b in busca["resultado_atrasado"]] == [atrasado.json()["id"]]
    assert [b["exame_id"] for b in busca["alterado_sem_seguimento"]] == [alterado.json()["id"]]

    comp = date.today().strftime("%Y-%m")
    prod = (await client.get(f"{SIS}/producao", params={"competencia": comp}, headers=token("gestor"))).json()
    assert prod["linhas"] == [{"estabelecimento_id": str(mundo["estab_a"].id), "procedimento": "0000000002", "quantidade": 1}]
    params = {"inicio": (date.today() - timedelta(days=1)).isoformat(), "fim": date.today().isoformat(), "agrupar_por": "resultado"}
    rel = {linha["chave"]: linha for linha in (await client.get(f"{SIS}/relatorios", params=params, headers=token("gestor"))).json()["linhas"]}
    assert rel["ALTERADO"]["requisicoes"] == 1 and rel["SEM_RESULTADO"]["requisicoes"] == 1
    for agrupar in ("faixa_etaria", "territorio", "estabelecimento"):
        assert (await client.get(f"{SIS}/relatorios", params={**params, "agrupar_por": agrupar}, headers=token("gestor"))).status_code == 200
    assert (await client.get(f"{SIS}/relatorios", params=params, headers=token("admin_b"))).json()["linhas"] == []
