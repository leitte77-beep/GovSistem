"""Lacunas da revisão das Fases 1–8 (docs/revisao-fases-1-8.md).

Anexos clínicos (B.12-054, B.6-029, B.3-012), relatórios e comparativos em
formatos abertos (B.12-055, B.6-047/048/049, B.3-019/021, B.4-028), ficha
odontológica (B.3-017), rastreabilidade por lote (B.4-036), prescrições para a
farmácia (B.4-019) e visita estruturada do ACS (B.1-019).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.models.auditoria import AuditTrail


def _hoje() -> date:
    """Dia local do município: os relatórios recortam o período no fuso do tenant."""
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()

V1 = "/api/govsaude/v1"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def _agora(**delta) -> str:
    return (datetime.now(timezone.utc) - timedelta(**delta)).isoformat()


async def _cidadao(client, token, nome="Paciente Lacunas"):
    r = await client.post(f"{V1}/cidadaos", json={"nome": nome, "sexo": "FEMININO", "data_nascimento": "1985-03-03"}, headers=token("admin"))
    assert r.status_code == 201, r.text
    return r.json()["id"]


async def _atendimento(client, token, mundo, cidadao, **extra):
    r = await client.post(f"{V1}/prontuarios/atendimentos", json={"cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "iniciado_em": _agora(minutes=5), **extra}, headers=token("medico"))
    assert r.status_code == 201, r.text
    return r.json()


async def _anexar(client, token, quem="medico", conteudo=PDF, nome="laudo.pdf", **form):
    return await client.post(f"{V1}/anexos", data=form, files={"arquivo": (nome, conteudo, "application/pdf")}, headers=token(quem))


@pytest.mark.asyncio
async def test_b12_054_b6_029_anexos_com_sigilo_herdado_e_auditoria(client, token, mundo, db):
    cidadao = await _cidadao(client, token)
    normal = await _atendimento(client, token, mundo, cidadao)
    sigiloso = await _atendimento(client, token, mundo, cidadao, sigiloso=True)

    a1 = await _anexar(client, token, cidadao_id=cidadao, contexto="PRONTUARIO", contexto_id=normal["id"], classificacao="LAUDO_EXTERNO")
    assert a1.status_code == 201, a1.text
    assert a1.json()["nivel_sigilo"] == "NORMAL" and a1.json()["criado_por_id"]
    a2 = await _anexar(client, token, cidadao_id=cidadao, contexto="PRONTUARIO", contexto_id=sigiloso["id"], classificacao="EXAME")
    assert a2.json()["nivel_sigilo"] == "SIGILOSO", "herda o sigilo do atendimento"

    falso = await _anexar(client, token, conteudo=b"MZ\x90\x00executavel", cidadao_id=cidadao, contexto="CIDADAO", classificacao="X1")
    assert falso.status_code == 422
    assert (await _anexar(client, token, quem="recepcao", cidadao_id=cidadao, contexto="CIDADAO", classificacao="X1")).status_code == 403
    outro = await _cidadao(client, token, nome="Outro")
    assert (await _anexar(client, token, cidadao_id=outro, contexto="PRONTUARIO", contexto_id=normal["id"], classificacao="X1")).status_code == 404

    lista_gestor = (await client.get(f"{V1}/anexos/cidadaos/{cidadao}", headers=token("gestor"))).json()
    assert sorted(x["velado"] for x in lista_gestor) == [False, True]
    assert (await client.get(f"{V1}/anexos/{a2.json()['id']}/conteudo", headers=token("gestor"))).status_code == 404
    baixado = await client.get(f"{V1}/anexos/{a1.json()['id']}/conteudo", headers=token("gestor"))
    assert baixado.status_code == 200 and baixado.content == PDF
    assert await db.scalar(select(AuditTrail.id).where(AuditTrail.recurso == "anexo_clinico", AuditTrail.acao == "DOWNLOAD"))
    assert (await client.get(f"{V1}/anexos/{a1.json()['id']}/conteudo", headers=token("admin_b"))).status_code == 404

    assert (await client.post(f"{V1}/anexos/{a1.json()['id']}/baixar", json={"motivo": "curto"}, headers=token("medico"))).status_code == 422
    assert (await client.post(f"{V1}/anexos/{a1.json()['id']}/baixar", json={"motivo": "Anexado no paciente errado"}, headers=token("medico"))).status_code == 200
    assert len((await client.get(f"{V1}/anexos/cidadaos/{cidadao}", headers=token("medico"))).json()) == 1


@pytest.mark.asyncio
async def test_b6_048_049_b12_055_relatorio_pec_formatos_e_comparativo(client, token, mundo):
    cidadao = await _cidadao(client, token)
    at = await _atendimento(client, token, mundo, cidadao)
    await client.post(f"{V1}/prontuarios/atendimentos/{at['id']}/prescricoes", json={"itens": [{"descricao": "Item", "posologia": "1x"}]}, headers=token("medico"))
    await client.post(f"{V1}/prontuarios/registros", json={"cidadao_id": cidadao, "atendimento_id": at["id"], "tipo": "EXAME", "dados": {"exame": "hemograma"}}, headers=token("medico"))
    await client.post(f"{V1}/cidadaos/{cidadao}/condicoes", json={"tipo_codigo": "CID10", "codigo": "I10"}, headers=token("medico"))
    hoje = _hoje().isoformat()
    url = f"{V1}/relatorios/prontuario/atendimentos"
    r = await client.get(url, params={"inicio": hoje, "fim": hoje, "agrupar_por": "tipo", "comparar": True}, headers=token("gestor"))
    assert r.status_code == 200, r.text
    linha = r.json()["linhas"][0]
    assert linha["atendimentos"] == 1 and linha["prescricoes"] == 1 and linha["registros_exame"] == 1
    assert linha["atendimentos_anterior"] == 0 and linha["atendimentos_variacao_pct"] is None
    diag = await client.get(url, params={"inicio": hoje, "fim": hoje, "agrupar_por": "diagnostico"}, headers=token("gestor"))
    assert diag.json()["linhas"] == [{"chave": "CID10:I10", "diagnosticos": 1}]
    csv = await client.get(url, params={"inicio": hoje, "fim": hoje, "formato": "csv"}, headers=token("gestor"))
    assert csv.headers["content-type"].startswith("text/csv") and "atendimentos" in csv.content.decode("utf-8-sig")
    xlsx = await client.get(url, params={"inicio": hoje, "fim": hoje, "formato": "xlsx"}, headers=token("gestor"))
    assert xlsx.content[:2] == b"PK"
    pdf = await client.get(url, params={"inicio": hoje, "fim": hoje, "formato": "pdf", "orientacao": "paisagem"}, headers=token("gestor"))
    assert pdf.content[:5] == b"%PDF-"
    assert (await client.get(url, params={"inicio": hoje, "fim": "2020-01-01"}, headers=token("gestor"))).status_code == 422
    assert (await client.get(url, params={"inicio": hoje, "fim": hoje}, headers=token("admin_b"))).json()["linhas"] == []
    assert (await client.get(url, params={"inicio": hoje, "fim": hoje}, headers=token("recepcao"))).status_code == 403


@pytest.mark.asyncio
async def test_b3_017_019_021_ficha_e_relatorio_odontologico(client, token, mundo):
    cidadao = await _cidadao(client, token)
    cond = await client.post(f"{V1}/odontologia/condicoes", json={"codigo": "REST", "nome": "Restauração", "tipo": "PROCEDIMENTO", "aplicavel_a": ["DENTE", "FACE"]}, headers=token("admin"))
    at = await client.post(f"{V1}/odontologia/atendimentos", json={"cidadao_id": cidadao, "estabelecimento_id": str(mundo["estab_a"].id), "tipo": "PRIMEIRA_CONSULTA"}, headers=token("medico"))
    assert at.status_code == 201, at.text
    proc = await client.post(f"{V1}/odontologia/procedimentos", json={"cidadao_id": cidadao, "condicao_id": cond.json()["id"], "dente": 16, "faces": ["O"], "programado_para": _hoje().isoformat()}, headers=token("medico"))
    await client.post(f"{V1}/odontologia/procedimentos/{proc.json()['id']}/realizar", json={"atendimento_id": at.json()["id"]}, headers=token("medico"))
    await client.post(f"{V1}/odontologia/atendimentos/{at.json()['id']}/documentos", json={"tipo": "ENCAMINHAMENTO", "titulo": "Encaminhamento", "conteudo": "Endodontia"}, headers=token("medico"))

    ficha = await client.get(f"{V1}/odontologia/atendimentos/{at.json()['id']}/ficha", headers=token("medico"))
    assert ficha.status_code == 200, ficha.text
    assert ficha.json()["procedimentos"][0]["condicao"] == "Restauração"
    assert ficha.json()["documentos"][0]["tipo"] == "ENCAMINHAMENTO"
    pdf = await client.get(f"{V1}/odontologia/atendimentos/{at.json()['id']}/ficha", params={"formato": "pdf"}, headers=token("medico"))
    assert pdf.content[:5] == b"%PDF-"
    assert (await client.get(f"{V1}/odontologia/atendimentos/{at.json()['id']}/ficha", headers=token("admin_b"))).status_code == 404

    hoje = _hoje().isoformat()
    rel = await client.get(f"{V1}/relatorios/odontologia/atendimentos", params={"inicio": hoje, "fim": hoje, "agrupar_por": "faixa_etaria", "comparar": True}, headers=token("gestor"))
    assert rel.status_code == 200, rel.text
    assert rel.json()["linhas"][0]["chave"] == "40-59" and rel.json()["linhas"][0]["procedimentos"] == 1


@pytest.mark.asyncio
async def test_b4_019_028_036_farmacia_rastreabilidade_e_relatorio(client, token, mundo, db):
    from tests.conftest import _criar_usuario

    mundo["usuarios"]["farma"] = await _criar_usuario(db, tenant_id=mundo["org_a"].id, nome="Farma Lacunas", email="farma-lac@teste.local", grupo="farmaceutico", estabelecimento_id=mundo["estab_a"].id)
    await db.commit()
    prod = await client.post(f"{V1}/estoque/produtos", json={"codigo": "LOS50", "nome": "Losartana 50", "tipo": "MEDICAMENTO", "unidade": "CP", "codigo_obm": "OBM-LOS"}, headers=token("admin"))
    loc = await client.post(f"{V1}/estoque/locais", json={"estabelecimento_id": str(mundo["estab_a"].id), "nome": "Farmácia lacunas", "tipo": "FARMACIA"}, headers=token("admin"))
    ent = await client.post(f"{V1}/estoque/movimentacoes", json={"local_id": loc.json()["id"], "produto_id": prod.json()["id"], "tipo": "ENTRADA", "quantidade": 60, "lote_numero": "LOS-1", "validade": (_hoje() + timedelta(days=300)).isoformat(), "custo_unitario": 0.2, "documento": {"tipo": "NF", "numero": "123"}}, headers=token("admin"))
    lote_id = ent.json()[0]["lote_id"]

    cidadao = await _cidadao(client, token)
    at = await _atendimento(client, token, mundo, cidadao)
    presc = await client.post(f"{V1}/prontuarios/atendimentos/{at['id']}/prescricoes", json={"itens": [{"medicamento_codigo": "OBM-LOS", "descricao": "Losartana 50", "posologia": "1x ao dia", "quantidade": "30", "uso_continuo": True}]}, headers=token("medico"))
    assert (await client.get(f"{V1}/prontuarios/cidadaos/{cidadao}/prescricoes", headers=token("farma"))).status_code == 403, "farmácia não lê o prontuário"
    fila = await client.get(f"{V1}/estoque/cidadaos/{cidadao}/prescricoes", params={"local_id": loc.json()["id"]}, headers=token("farma"))
    assert fila.status_code == 200, fila.text
    item = fila.json()[0]["itens"][0]
    assert item["saldo_no_local"] == 60 and item["ja_dispensado"] == 0 and "subjetivo" not in fila.text

    disp = await client.post(f"{V1}/estoque/dispensacoes", json={"cidadao_id": cidadao, "local_id": loc.json()["id"], "prescricao_id": presc.json()["id"], "itens": [{"produto_id": prod.json()["id"], "quantidade": 30}]}, headers=token("farma"))
    assert disp.status_code == 201, disp.text
    item = (await client.get(f"{V1}/estoque/cidadaos/{cidadao}/prescricoes", params={"local_id": loc.json()["id"]}, headers=token("farma"))).json()[0]["itens"][0]
    assert item["ja_dispensado"] == 30 and item["saldo_no_local"] == 30
    assert (await client.get(f"{V1}/estoque/cidadaos/{cidadao}/prescricoes", params={"local_id": loc.json()["id"]}, headers=token("medico"))).status_code == 403

    rast = await client.get(f"{V1}/estoque/lotes/{lote_id}/rastreabilidade", headers=token("farma"))
    assert rast.status_code == 200, rast.text
    tipos = [e["tipo"] for e in rast.json()["eventos"]]
    assert tipos == ["ENTRADA", "DISPENSACAO"]
    assert rast.json()["eventos"][0]["documento"]["numero"] == "123"
    assert rast.json()["eventos"][1]["cidadao_id"] == cidadao
    mundo["usuarios"]["asb"] = await _criar_usuario(db, tenant_id=mundo["org_a"].id, nome="ASB Lacunas", email="asb-lac@teste.local", grupo="asb_tsb", estabelecimento_id=mundo["estab_a"].id)
    await db.commit()
    sem_disp = await client.get(f"{V1}/estoque/lotes/{lote_id}/rastreabilidade", headers=token("asb"))
    assert sem_disp.status_code == 200 and "cidadao_id" not in sem_disp.text, "sem dispensacao:ler não vê o cidadão"
    assert (await client.get(f"{V1}/estoque/lotes/{lote_id}/rastreabilidade", headers=token("admin_b"))).status_code == 404

    hoje = _hoje().isoformat()
    rel = await client.get(f"{V1}/relatorios/estoque/locais/{loc.json()['id']}/movimentacoes", params={"inicio": hoje, "fim": hoje, "agrupar_por": "tipo"}, headers=token("gestor"))
    assert rel.status_code == 200, rel.text
    linhas = {l["chave"]: l for l in rel.json()["linhas"]}
    assert linhas["ENTRADA"]["entradas"] == 60 and linhas["DISPENSACAO"]["dispensacoes"] == 30
    assert linhas["ENTRADA"]["valor_entradas"] == 12.0


@pytest.mark.asyncio
async def test_b6_047_relatorio_de_tempos_da_fila(client, token, mundo, db):
    from app.models.nucleo import Setor

    setor = Setor(tenant_id=mundo["org_a"].id, estabelecimento_id=mundo["estab_a"].id, nome="Setor tempos", tipo="ATENDIMENTO", ativo=True, versao=1)
    db.add(setor)
    await db.commit()
    cidadao = await _cidadao(client, token)
    fila = await client.post(f"{V1}/filas", json={"estabelecimento_id": str(mundo["estab_a"].id), "setor_id": str(setor.id), "cidadao_id": cidadao, "origem": "DEMANDA_ESPONTANEA"}, headers=token("admin"))
    assert fila.status_code == 201, fila.text
    hoje = _hoje().isoformat()
    r = await client.get(f"{V1}/relatorios/filas/tempos", params={"inicio": hoje, "fim": hoje, "agrupar_por": "setor"}, headers=token("gestor"))
    assert r.status_code == 200, r.text
    assert r.json()["linhas"] == [{"chave": str(setor.id), "registros": 1, "media_espera_chamada_min": None, "media_triagem_min": None, "media_espera_consulta_min": None, "media_consulta_min": None, "media_permanencia_min": None}]


@pytest.mark.asyncio
async def test_b1_019_visita_estruturada_com_dominios_do_tenant(client, token, mundo):
    dom = await client.post(f"{V1}/territorios/domicilios", json={"logradouro": "Rua A", "numero": "10"}, headers=token("admin"))
    assert dom.status_code == 201, dom.text
    corpo = {"domicilio_id": dom.json()["id"], "realizada_em": _agora(), "motivos": ["CADASTRO"], "busca_ativa": True, "medicoes": {"peso_kg": 80, "altura_cm": 200, "glicemia_capilar_mg_dl": 110, "glicemia_momento": "JEJUM"}, "desfecho": "REALIZADA"}
    ok = await client.post(f"{V1}/territorios/visitas", json=corpo, headers=token("admin"))
    assert ok.status_code == 201, ok.text
    assert ok.json()["medicoes"]["imc"] == 20.0 and ok.json()["busca_ativa"] is True
    invalida = await client.post(f"{V1}/territorios/visitas", json={**corpo, "medicoes": {"saturacao_o2": 120}}, headers=token("admin"))
    assert invalida.status_code == 422
    atual = await client.get(f"{V1}/configuracoes/territorio.motivos_visita", headers=token("admin"))
    await client.put(f"{V1}/configuracoes/territorio.motivos_visita", json={"valor": {"valor": ["MOTIVO_A"]}}, headers={**token("admin"), "If-Match": f'"{atual.json()["versao"]}"'})
    fora = await client.post(f"{V1}/territorios/visitas", json=corpo, headers=token("admin"))
    assert fora.status_code == 422 and fora.json()["codigo"] == "dominio_visita"
