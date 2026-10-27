"""Fase 11 — central de integrações (LEDI/SIAPS, RNDS, BNAFAR).

Os manifestos usados aqui são **sintéticos** (marcados ``sintetico: true``),
escritos em diretório temporário só para exercitar o motor: não representam
o layout oficial de nenhum sistema. Sem manifesto, nada é transmitido.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import select, update

from app.core.config import settings
from app.core.encryption import criptografar
from app.integracoes import transporte
from app.models.integracoes import IntegracaoEnvio
from app.models.nucleo import Profissional
from tests.conftest import gerar_cns, gerar_cpf

V1 = "/api/govsaude/v1"
API = f"{V1}/integracoes"
IMU = f"{V1}/imunizacao"
COMP = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y%m")  # competência local

RNDS_SINTETICO = {
    "sistema": "RNDS",
    "versao_layout": "teste-1",
    "fonte": "Manifesto sintético de teste — não é o modelo RIA oficial",
    "sintetico": True,
    "transporte": {
        "tipo": "HTTP_JSON",
        "metodo": "POST",
        "caminho": "/registros",
        "protocolo_em": "id",
        "mensagens_em": "issue",
    },
    "registros": {
        "aplicacao_vacina": {
            "operacoes": ["INCLUSAO", "ALTERACAO", "EXCLUSAO"],
            "envelope": {"tipo": "imunizacao"},
            "campos": [
                {"destino": "operacao", "origem": "$operacao"},
                {"destino": "paciente.cns", "origem": "cidadao.cns", "obrigatorio": True, "rotulo": "CNS do cidadão"},
                {"destino": "paciente.cpf", "origem": "cidadao.cpf"},
                {"destino": "vacina", "origem": "vacina.codigo", "obrigatorio": True, "max": 20},
                {"destino": "lote", "origem": "lote.numero", "obrigatorio": True},
                {"destino": "data", "origem": "aplicada_em", "formato": "data_hora", "obrigatorio": True},
                {"destino": "cnes", "origem": "estabelecimento.cnes", "obrigatorio": True},
                {"destino": "profissional", "origem": "profissional.cns", "obrigatorio": True},
                {"destino": "versao_modelo", "constante": "SINTETICO"},
            ],
        }
    },
}

BNAFAR_SINTETICO = {
    "sistema": "BNAFAR",
    "versao_layout": "teste-1",
    "fonte": "Manifesto sintético de teste — não é o layout BNAFAR oficial",
    "sintetico": True,
    "transporte": {"tipo": "ARQUIVO"},
    "registros": {
        "movimentacao_estoque": {
            "operacoes": ["INCLUSAO"],
            "campos": [
                {"destino": "catmat", "origem": "produto.catmat", "obrigatorio": True},
                {"destino": "lote", "origem": "lote.numero", "obrigatorio": True},
                {"destino": "quantidade", "origem": "quantidade", "formato": "numero"},
                {"destino": "cnes", "origem": "estabelecimento.cnes", "obrigatorio": True},
            ],
        }
    },
}


@pytest.fixture
def especificacoes(tmp_path, monkeypatch):
    def _escrever(manifesto):
        pasta = tmp_path / manifesto["sistema"] / manifesto["versao_layout"]
        pasta.mkdir(parents=True)
        (pasta / "manifest.json").write_text(json.dumps(manifesto), encoding="utf-8")

    monkeypatch.setattr(settings, "INTEGRACOES_ESPECIFICACOES_DIR", str(tmp_path))
    return _escrever


@pytest.fixture
def oficial():
    """Servidor oficial falso: respostas enfileiradas por teste."""
    respostas: list[httpx.Response] = []
    recebidos: list[dict] = []

    def _handler(request: httpx.Request) -> httpx.Response:
        recebidos.append({"json": json.loads(request.content), "chave": request.headers.get("Idempotency-Key")})
        return respostas.pop(0) if respostas else httpx.Response(201, json={"id": f"P{len(recebidos)}"})

    transporte.definir_transporte_teste(httpx.MockTransport(_handler))
    yield respostas, recebidos
    transporte.definir_transporte_teste(None)


async def _profissional(db, mundo, usuario="gestor"):
    db.add(
        Profissional(
            tenant_id=mundo["org_a"].id,
            usuario_id=mundo["usuarios"][usuario].id,
            nome="Vacinadora Teste",
            cbo="322205",
            cns_cifrado=criptografar(gerar_cns()),
        )
    )
    await db.commit()


async def _aplicacao(client, token, mundo, cpf=None, cns=None, sufixo="I"):
    cid = await client.post(
        f"{V1}/cidadaos",
        json={"nome": "Cidadã Integração", "sexo": "FEMININO", "data_nascimento": "1990-04-02", **({"cpf": cpf} if cpf else {}), **({"cns": cns} if cns else {})},
        headers=token("admin"),
    )
    assert cid.status_code == 201, cid.text
    prod = await client.post(f"{V1}/estoque/produtos", json={"codigo": f"VAC-{sufixo}", "nome": f"Vacina {sufixo}", "tipo": "VACINA", "unidade": "FR"}, headers=token("admin"))
    loc = await client.post(f"{V1}/estoque/locais", json={"estabelecimento_id": str(mundo["estab_a"].id), "nome": f"Sala {sufixo}", "tipo": "SALA_VACINA"}, headers=token("admin"))
    ent = await client.post(f"{V1}/estoque/movimentacoes", json={"local_id": loc.json()["id"], "produto_id": prod.json()["id"], "tipo": "ENTRADA", "quantidade": 5, "lote_numero": f"L{sufixo}-1", "validade": (date.today() + timedelta(days=200)).isoformat(), "custo_unitario": 1}, headers=token("admin"))
    vac = await client.post(f"{IMU}/vacinas", json={"codigo": f"VAC-{sufixo}", "nome": f"Vacina {sufixo}", "produto_id": prod.json()["id"], "codigo_referencia": "99"}, headers=token("gestor"))
    apl = await client.post(f"{IMU}/aplicacoes", json={"cidadao_id": cid.json()["id"], "vacina_id": vac.json()["id"], "dose": "D1", "local_id": loc.json()["id"], "lote_id": ent.json()[0]["lote_id"]}, headers=token("gestor"))
    assert apl.status_code == 201, apl.text
    return cid.json()["id"], apl.json()


async def _configurar(client, token, sistema, **extra):
    corpo = {"versao_layout": "teste-1", "ambiente": "HOMOLOGACAO", "ativo": True, "credenciais_ref": "env:RNDS_CERT_DIR", "parametros": {"url_base": "https://rnds.homologacao.teste"}, **extra}
    r = await client.put(f"{API}/configuracoes/{sistema}", json=corpo, headers=token("gestor"))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_b12_060_sem_manifesto_oficial_nada_e_transmitido(client, token, mundo, db):
    await _profissional(db, mundo)
    await _aplicacao(client, token, mundo, cns=gerar_cns())
    r = await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))
    assert r.status_code == 200, r.text
    assert r.json()["geracao"]["novos"] == 1 and r.json()["validacao"]["aguardando_especificacao"] == 1
    assert r.json()["transmissao"]["motivo"] == "PENDENTE_ESPECIFICACAO_OFICIAL"
    fila = (await client.get(f"{API}/envios", params={"sistema": "RNDS"}, headers=token("gestor"))).json()
    assert fila[0]["situacao"] == "PENDENTE" and fila[0]["mensagens"][0]["codigo"] == "PENDENTE_ESPECIFICACAO_OFICIAL"
    painel = (await client.get(f"{API}/painel", headers=token("gestor"))).json()
    rnds = next(s for s in painel["sistemas"] if s["sistema"] == "RNDS")
    assert rnds["adaptador"] == "PENDENTE" and any(a["codigo"] == "PENDENTE_ESPECIFICACAO_OFICIAL" for a in rnds["alertas"])
    assert (await client.post(f"{API}/RNDS/lotes", params={"competencia": COMP}, headers=token("gestor"))).status_code == 409
    sem_layout = await client.put(f"{API}/configuracoes/RNDS", json={"versao_layout": "4.0.0"}, headers=token("gestor"))
    assert sem_layout.status_code == 422
    assert (await client.get(f"{API}/painel", headers=token("recepcao"))).status_code == 403
    assert (await client.get(f"{API}/envios", headers=token("admin_b"))).json() == []


@pytest.mark.asyncio
async def test_b7_016_020_021_b1_035_validacao_previa_correcao_e_configuracao(client, token, mundo, db, especificacoes, oficial):
    especificacoes(RNDS_SINTETICO)
    producao = await client.put(f"{API}/configuracoes/RNDS", json={"versao_layout": "teste-1", "ambiente": "PRODUCAO", "parametros": {"homologacao_aprovada_em": "2026-01-10"}}, headers=token("gestor"))
    assert producao.json()["codigo"] == "layout_sintetico", "manifesto de teste nunca vai à produção"
    sem_homolog = await client.put(f"{API}/configuracoes/RNDS", json={"ambiente": "PRODUCAO"}, headers=token("gestor"))
    assert sem_homolog.json()["codigo"] == "homologacao_pendente"
    http = await client.put(f"{API}/configuracoes/RNDS", json={"parametros": {"url_base": "http://inseguro"}}, headers=token("gestor"))
    assert http.status_code == 422
    cfg = await _configurar(client, token, "RNDS")
    assert cfg["adaptador"] == "teste-1" and cfg["layout_sintetico"] is True

    cidadao, _ = await _aplicacao(client, token, mundo)  # sem CPF/CNS e sem profissional
    exe = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert exe["validacao"]["invalidos"] == 1 and exe["transmissao"].get("transmitidos", 0) == 0
    inc = (await client.get(f"{API}/inconsistencias", params={"sistema": "RNDS", "cidadao_id": cidadao}, headers=token("gestor"))).json()["linhas"]
    motivos = {linha["motivo"] for linha in inc}
    assert {"SEM_IDENTIFICADOR", "SEM_PROFISSIONAL", "CAMPO_OBRIGATORIO_LAYOUT"} <= motivos
    assert all(linha["texto"] for linha in inc), "mensagens compreensíveis"
    so_motivo = (await client.get(f"{API}/inconsistencias", params={"motivo": "SEM_IDENTIFICADOR", "estabelecimento_id": str(mundo["estab_a"].id)}, headers=token("gestor"))).json()["linhas"]
    assert len(so_motivo) == 1
    csv = await client.get(f"{API}/inconsistencias", params={"formato": "csv"}, headers=token("gestor"))
    assert csv.status_code == 200 and b"SEM_IDENTIFICADOR" in csv.content
    assert (await client.get(f"{API}/inconsistencias", params={"formato": "pdf"}, headers=token("gestor"))).status_code == 200

    envio = (await client.get(f"{API}/envios", params={"situacao": "INVALIDO"}, headers=token("gestor"))).json()[0]
    await client.patch(f"{V1}/cidadaos/{cidadao}", json={"cpf": gerar_cpf(), "cns": gerar_cns()}, headers=token("admin"))
    ainda = (await client.post(f"{API}/envios/{envio['id']}/reprocessar", headers=token("gestor"))).json()
    assert ainda["situacao"] == "INVALIDO" and {m["codigo"] for m in ainda["mensagens"]} >= {"SEM_PROFISSIONAL"}
    assert (await client.post(f"{API}/envios/{envio['id']}/reprocessar", headers=token("consulta"))).status_code == 403


@pytest.mark.asyncio
async def test_b7_013_017_018_019_b12_061_transmissao_retentativa_alteracao_e_exclusao(client, token, mundo, db, especificacoes, oficial):
    respostas, recebidos = oficial
    especificacoes(RNDS_SINTETICO)
    await _configurar(client, token, "RNDS")
    await _profissional(db, mundo)
    _, apl = await _aplicacao(client, token, mundo, cpf=gerar_cpf(), cns=gerar_cns())

    respostas.append(httpx.Response(503, text="indisponível"))
    exe = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert exe["validacao"]["validados"] == 1 and exe["transmissao"]["erros_transitorios"] == 1
    envio = (await client.get(f"{API}/envios", params={"sistema": "RNDS"}, headers=token("gestor"))).json()[0]
    assert envio["situacao"] == "ERRO_TRANSITORIO" and envio["proxima_tentativa_em"] and envio["tentativas"] == 1
    assert recebidos[0]["json"]["paciente"]["cns"] and recebidos[0]["json"]["versao_modelo"] == "SINTETICO"
    assert recebidos[0]["json"]["operacao"] == "INCLUSAO" and recebidos[0]["chave"].startswith(envio["id"])

    de_novo = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert de_novo["geracao"] == {"em_fila": 1} and de_novo["transmissao"] == {}, "respeita o backoff"
    await db.execute(update(IntegracaoEnvio).values(proxima_tentativa_em=datetime.now(timezone.utc) - timedelta(minutes=1)))
    await db.commit()
    ok = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert ok["transmissao"]["transmitidos"] == 1
    envio = (await client.get(f"{API}/envios", params={"sistema": "RNDS"}, headers=token("gestor"))).json()[0]
    assert envio["situacao"] == "ENVIADO" and envio["protocolo"] == "P2"
    ret = (await client.post(f"{API}/RNDS/retornos", json={"itens": [{"protocolo": "P2", "situacao": "ACEITO"}]}, headers=token("gestor"))).json()
    assert ret["aceito"] == 1
    repetido = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert repetido["geracao"] == {"ja_enviados": 1}, "exportação múltipla não duplica"

    ret_apl = await client.post(f"{IMU}/aplicacoes/{apl['id']}/retificar", json={"estrategia": "ROTINA", "justificativa": "Estratégia corrigida após conferência do registro"}, headers=token("gestor"))
    assert ret_apl.status_code == 201, ret_apl.text
    alt = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert alt["geracao"] == {"alterados": 1} and alt["transmissao"]["transmitidos"] == 1
    assert recebidos[-1]["json"]["operacao"] == "ALTERACAO"
    await client.post(f"{IMU}/aplicacoes/{ret_apl.json()['id']}/invalidar", json={"motivo": "Registro em duplicidade"}, headers=token("gestor"))
    exc = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert exc["geracao"] == {"exclusoes": 1} and recebidos[-1]["json"]["operacao"] == "EXCLUSAO"
    hist = (await client.get(f"{API}/registros/aplicacao_vacina/{apl['id']}", headers=token("gestor"))).json()
    assert [h["operacao"] for h in hist] == ["INCLUSAO", "ALTERACAO", "EXCLUSAO"], "versões preservadas"

    respostas.append(httpx.Response(422, json={"issue": [{"diagnostics": "Lote não reconhecido"}]}))
    _, outra = await _aplicacao(client, token, mundo, cns=gerar_cns(), sufixo="X")
    rej = (await client.post(f"{API}/RNDS/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert rej["transmissao"]["rejeitados"] == 1
    linhas = (await client.get(f"{API}/inconsistencias", params={"sistema": "RNDS"}, headers=token("gestor"))).json()["linhas"]
    assert linhas[0]["texto"] == "Lote não reconhecido" and linhas[0]["situacao"] == "REJEITADO"
    resumo = (await client.get(f"{API}/RNDS/competencias/{COMP}", headers=token("gestor"))).json()
    assert resumo["tipos"]["aplicacao_vacina"]["INCLUSAO:REJEITADO"] == 1
    painel = next(s for s in (await client.get(f"{API}/painel", headers=token("gestor"))).json()["sistemas"] if s["sistema"] == "RNDS")
    assert any(a["codigo"] == "REJEICOES" for a in painel["alertas"]) and painel["ultima_execucao"]["origem"] == "MANUAL"
    assert outra


@pytest.mark.asyncio
async def test_b4_030_031_032_b1_033_envio_por_arquivo_lote_e_retorno(client, token, mundo, especificacoes):
    especificacoes(BNAFAR_SINTETICO)
    await _configurar(client, token, "BNAFAR", credenciais_ref=None, parametros={})
    prod = await client.post(f"{V1}/estoque/produtos", json={"codigo": "DIP", "nome": "Dipirona", "tipo": "MEDICAMENTO", "unidade": "CP", "catmat": "123456"}, headers=token("admin"))
    sem = await client.post(f"{V1}/estoque/produtos", json={"codigo": "SEM", "nome": "Sem catmat", "tipo": "MEDICAMENTO", "unidade": "CP"}, headers=token("admin"))
    loc = await client.post(f"{V1}/estoque/locais", json={"estabelecimento_id": str(mundo["estab_a"].id), "nome": "Farmácia", "tipo": "FARMACIA"}, headers=token("admin"))
    for p in (prod, sem):
        r = await client.post(f"{V1}/estoque/movimentacoes", json={"local_id": loc.json()["id"], "produto_id": p.json()["id"], "tipo": "ENTRADA", "quantidade": 10, "lote_numero": "F1", "validade": (date.today() + timedelta(days=100)).isoformat(), "custo_unitario": 1}, headers=token("admin"))
        assert r.status_code == 201, r.text
    exe = (await client.post(f"{API}/BNAFAR/execucoes", params={"competencia": COMP}, headers=token("gestor"))).json()
    assert exe["validacao"] == {"validados": 1, "invalidos": 1}
    assert exe["transmissao"]["motivo"].startswith("ENVIO_POR_ARQUIVO")
    lote = await client.post(f"{API}/BNAFAR/lotes", params={"competencia": COMP}, headers=token("gestor"))
    assert lote.status_code == 200 and lote.headers["content-type"].startswith("application/x-ndjson")
    linhas = [json.loads(x) for x in lote.content.decode().splitlines()]
    assert linhas == [{"catmat": "123456", "cnes": "1234567", "lote": "F1", "quantidade": 10.0}]
    lote_id = lote.headers["x-lote-id"]
    enviado = (await client.get(f"{API}/envios", params={"sistema": "BNAFAR", "situacao": "ENVIADO"}, headers=token("gestor"))).json()[0]
    assert enviado["lote_id"] == lote_id
    assert (await client.post(f"{API}/BNAFAR/lotes", params={"competencia": COMP}, headers=token("gestor"))).status_code == 404
    ret = (await client.post(f"{API}/BNAFAR/retornos", json={"itens": [{"lote_id": lote_id, "registro_id": enviado["registro_id"], "situacao": "REJEITADO", "mensagens": [{"codigo": "R01", "texto": "Estoque divergente"}]}, {"protocolo": "NAO-EXISTE", "situacao": "ACEITO"}]}, headers=token("gestor"))).json()
    assert ret["rejeitado"] == 1 and ret["nao_encontrados"] == ["NAO-EXISTE"]
    reproc = (await client.post(f"{API}/envios/{enviado['id']}/reprocessar", headers=token("gestor"))).json()
    assert reproc["situacao"] == "VALIDADO", "reenvio após rejeição"
    invalido = (await client.get(f"{API}/envios", params={"sistema": "BNAFAR", "situacao": "INVALIDO"}, headers=token("gestor"))).json()[0]
    assert invalido["mensagens"][0]["codigo"] == "PRODUTO_SEM_CATMAT"
    canc = await client.post(f"{API}/envios/{invalido['id']}/cancelar", json={"motivo": "Item fora do escopo BNAFAR"}, headers=token("gestor"))
    assert canc.json()["situacao"] == "CANCELADO"


@pytest.mark.asyncio
async def test_b7_022_023_execucao_automatica_por_periodicidade(client, token, mundo, db, especificacoes, oficial):
    from app.services.integracoes import competencias_abertas, executar_automaticas

    especificacoes(RNDS_SINTETICO)
    await _configurar(client, token, "RNDS", parametros={"url_base": "https://rnds.homologacao.teste", "transmissao_automatica": True, "periodicidade_minutos": 60})
    await _profissional(db, mundo)
    await _aplicacao(client, token, mundo, cns=gerar_cns())
    assert (await executar_automaticas(db)) == {"configuracoes_executadas": 1}
    assert (await executar_automaticas(db)) == {"configuracoes_executadas": 0}, "respeita a periodicidade"
    envio = (await db.scalars(select(IntegracaoEnvio))).one()
    assert envio.situacao == "ENVIADO"
    painel = next(s for s in (await client.get(f"{API}/painel", headers=token("gestor"))).json()["sistemas"] if s["sistema"] == "RNDS")
    assert painel["ultima_execucao"]["origem"] == "AUTOMATICA"
    assert competencias_abertas(date(2026, 1, 15), 2) == ["202601", "202512"]
