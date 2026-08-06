"""Fluxo do Porteira Adentro (itens 19 a 35): programa, beneficiário, saldo,
solicitação, vistoria, aprovação, ordem de serviço, execução e horas adicionais.
"""

from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


def proximo_dia_util(partir: date) -> date:
    dia = partir
    while dia.weekday() >= 5:
        dia += timedelta(days=1)
    return dia


async def _criar_produtor(client, token, cpf_unico, indice=1):
    resposta = await client.post(
        "/api/govinfra/v1/pessoas",
        json={
            "nome": f"Produtor de Teste {indice}",
            "documento": cpf_unico(),
            "telefone": f"4999999{indice:04d}",
            "tipos": ["produtor_rural", "proprietario"],
        },
        headers=token("atendente"),
    )
    detalhe = await client.get(
        f"/api/govinfra/v1/pessoas/{resposta.json()['id']}", headers=token("atendente")
    )
    return detalhe.json()


async def _criar_propriedade(client, token, produtor):
    resposta = await client.post(
        "/api/govinfra/v1/imoveis",
        json={
            "nome": "Sítio de teste",
            "tipo": "rural",
            "logradouro": "Linha Teste",
            "bairro": "Linha Teste",
            "municipio": "Testópolis",
            "uf": "SC",
            "latitude": -27.19,
            "longitude": -52.04,
            "proprietario_id": produtor["id"],
            "solicitante_id": produtor["id"],
        },
        headers=token("atendente"),
    )
    detalhe = await client.get(
        f"/api/govinfra/v1/imoveis/{resposta.json()['id']}", headers=token("atendente")
    )
    return detalhe.json()


async def _criar_tipo_servico(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/porteira/tipos-servico",
        json={
            "chave": "manutencao_estrada_teste",
            "nome": "Manutenção de estrada interna",
            "categorias_compativeis": ["retroescavadeira"],
            "exige_vistoria": False,
            "horas_medias": 4,
            "consumo_medio_litros": 12,
            "usa_banco_horas": True,
            "permite_caminhoes": True,
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    lista = await client.get("/api/govinfra/v1/porteira/tipos-servico", headers=token("atendente"))
    return next(t for t in lista.json() if t["chave"] == "manutencao_estrada_teste")


async def _criar_categoria_maquina(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/categorias-maquina",
        json={"chave": "retroescavadeira", "nome": "Retroescavadeira", "exige_cnh_categoria": "C"},
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    lista = await client.get("/api/govinfra/v1/categorias-maquina", headers=token("gestor"))
    return next(c for c in lista.json() if c["chave"] == "retroescavadeira")


async def _criar_maquina(client, token, categoria):
    resposta = await client.post(
        "/api/govinfra/v1/maquinas",
        json={
            "codigo": "MAQ-TESTE-01",
            "nome": "Retroescavadeira de teste",
            "categoria_id": categoria["id"],
            "tipo_combustivel": "diesel_s10",
            "horimetro_atual": 1000,
            "localizacao_atual": "Pátio",
        },
        headers=token("gestor"),
    )
    assert resposta.status_code == 201, resposta.text
    lista = await client.get(
        "/api/govinfra/v1/maquinas", params={"termo": "MAQ-TESTE-01"}, headers=token("gestor")
    )
    return next(m for m in lista.json()["itens"] if m["codigo"] == "MAQ-TESTE-01")


async def _criar_programa(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/porteira/programas",
        json={
            "chave": "porteira-teste",
            "nome": "Porteira Adentro de Teste",
            "vigencia_inicio": str(date.today() - timedelta(days=30)),
            "vigencia_fim": str(date.today() + timedelta(days=300)),
            "horas_por_beneficiario": 20,
            "regra_limite": "cpf",
            "metodo_desconto": "geral",
            "validade_saldo_dias": 365,
            "permite_horas_adicionais": True,
            "limite_horas_adicionais": 5,
            "exige_vistoria": False,
            "exige_aprovacao_gestor": True,
            "documentos_obrigatorios": ["Comprovante de atividade"],
            "servicos_permitidos": ["manutencao_estrada_teste"],
            "equipamentos_permitidos": ["retroescavadeira"],
        },
        headers=token("admin"),
    )
    assert resposta.status_code == 201, resposta.text
    lista = await client.get("/api/govinfra/v1/porteira/programas", headers=token("atendente"))
    return next(p for p in lista.json() if p["chave"] == "porteira-teste")


async def test_fluxo_completo_porteira(client, token, cpf_unico):
    produtor = await _criar_produtor(client, token, cpf_unico)
    propriedade = await _criar_propriedade(client, token, produtor)
    tipo = await _criar_tipo_servico(client, token)
    categoria = await _criar_categoria_maquina(client, token)
    maquina = await _criar_maquina(client, token, categoria)
    programa = await _criar_programa(client, token)

    # Beneficiário com horas iniciais.
    beneficiario = await client.post(
        "/api/govinfra/v1/porteira/beneficiarios",
        json={
            "programa_id": programa["id"],
            "pessoa_id": produtor["id"],
            "classificacao": "produtor_rural",
            "horas_iniciais": 20,
        },
        headers=token("atendente"),
    )
    assert beneficiario.status_code == 201, beneficiario.text
    detalhe_ben = await client.get(
        f"/api/govinfra/v1/porteira/beneficiarios/{beneficiario.json()['id']}",
        headers=token("atendente"),
    )
    assert detalhe_ben.status_code == 200, detalhe_ben.text
    ben = detalhe_ben.json()
    assert ben["saldo_total_disponivel"] == 20

    # Solicitação de serviço.
    solicitacao = await client.post(
        "/api/govinfra/v1/porteira/solicitacoes",
        json={
            "programa_id": programa["id"],
            "beneficiario_id": ben["id"],
            "imovel_id": propriedade["id"],
            "tipo_servico_id": tipo["id"],
            "descricao": "Manutenção da estrada de acesso à propriedade",
            "motivo": "Estrada danificada pelas chuvas",
            "horas_estimadas": 6,
            "data_desejada": str(proximo_dia_util(date.today() + timedelta(days=3))),
            "prioridade": "normal",
        },
        headers=token("atendente"),
    )
    assert solicitacao.status_code == 201, solicitacao.text
    sol = solicitacao.json()
    assert sol["protocolo"]

    # Vistoria pelo técnico.
    vistoria = await client.post(
        f"/api/govinfra/v1/porteira/solicitacoes/{sol['id']}/vistorias",
        json={
            "data_agendada": str(proximo_dia_util(date.today() + timedelta(days=1))),
            "condicoes_acesso": "Acesso por estrada de terra, em bom estado",
            "medidas_aproximadas": "150 m lineares",
            "tipo_solo": "argiloso",
            "maquinas_recomendadas": ["retroescavadeira"],
            "horas_estimadas": 5,
            "viagens_estimadas": 2,
            "parecer": "Execução viável com a retroescavadeira",
            "favoravel": True,
        },
        headers=token("tecnico"),
    )
    assert vistoria.status_code == 201, vistoria.text

    # Aprovação exige gestor — atendente não pode.
    sem_perm = await client.post(
        f"/api/govinfra/v1/porteira/solicitacoes/{sol['id']}/situacao",
        json={"situacao": "em_analise"},
        headers=token("atendente"),
    )
    assert sem_perm.status_code == 403

    # Fluxo de análise: protocolada → em análise → aguardando aprovação → aprovada.
    em_analise = await client.post(
        f"/api/govinfra/v1/porteira/solicitacoes/{sol['id']}/situacao",
        json={"situacao": "em_analise"},
        headers=token("gestor"),
    )
    assert em_analise.status_code == 200, em_analise.text

    aguardando = await client.post(
        f"/api/govinfra/v1/porteira/solicitacoes/{sol['id']}/situacao",
        json={"situacao": "aguardando_aprovacao"},
        headers=token("gestor"),
    )
    assert aguardando.status_code == 200, aguardando.text

    aprovada = await client.post(
        f"/api/govinfra/v1/porteira/solicitacoes/{sol['id']}/situacao",
        json={"situacao": "aprovada"},
        headers=token("gestor"),
    )
    assert aprovada.status_code == 200, aprovada.text

    # Emissão da ordem de serviço.
    ordem = await client.post(
        "/api/govinfra/v1/ordens",
        json={
            "solicitacao_id": sol["id"],
            "data_prevista": str(proximo_dia_util(date.today() + timedelta(days=4))),
            "hora_prevista_inicio": "08:00",
            "hora_prevista_fim": "13:00",
            "maquinas": [{"maquina_id": maquina["id"], "principal": True}],
            "horas_autorizadas": 5,
        },
        headers=token("gestor"),
    )
    assert ordem.status_code == 201, ordem.text
    ordem_dados = ordem.json()
    assert ordem_dados["numero"]
    assert ordem_dados["url_consulta"]

    # Consulta pública via token do QR Code.
    token_url = ordem_dados["url_consulta"].rsplit("/", 1)[-1]
    consulta = await client.get(f"/api/govinfra/v1/consulta/{token_url}")
    assert consulta.status_code == 200
    assert consulta.json()["ordem"]["numero"] == ordem_dados["numero"]

    # Início da execução pelo operador.
    iniciada = await client.post(
        f"/api/govinfra/v1/ordens/{ordem_dados['id']}/iniciar",
        json={"maquina_id": maquina["id"], "horimetro_inicial": 1000},
        headers=token("operador"),
    )
    assert iniciada.status_code == 200, iniciada.text

    # Pausa e retomada.
    pausada = await client.post(
        f"/api/govinfra/v1/ordens/{ordem_dados['id']}/pausar",
        json={"motivo": "Chuva"},
        headers=token("operador"),
    )
    assert pausada.status_code == 200, pausada.text

    retomada = await client.post(
        f"/api/govinfra/v1/ordens/{ordem_dados['id']}/retomar",
        headers=token("operador"),
    )
    assert retomada.status_code == 200, retomada.text

    # Conclusão: as horas vêm dos apontamentos de execução; o fim no futuro
    # representa 5 horas de trabalho registradas pelo operador.

    concluida = await client.post(
        f"/api/govinfra/v1/ordens/{ordem_dados['id']}/concluir",
        json={
            "maquina_id": maquina["id"],
            "horimetro_final": 1005,
            "fim_em": (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat(),
            "servico_realizado": "Manutenção concluída",
        },
        headers=token("operador"),
    )
    assert concluida.status_code == 200, concluida.text

    # O saldo foi descontado (5h autorizadas → geral).
    detalhe_ben = await client.get(
        f"/api/govinfra/v1/porteira/beneficiarios/{ben['id']}", headers=token("atendente")
    )
    ben_final = detalhe_ben.json()
    assert ben_final["saldo_total_disponivel"] < 20


async def test_saldo_insuficiente_bloqueia_solicitacao(client, token, cpf_unico):
    produtor = await _criar_produtor(client, token, cpf_unico, indice=2)
    propriedade = await _criar_propriedade(client, token, produtor)
    tipo = await _criar_tipo_servico(client, token)
    programa = await _criar_programa(client, token)

    beneficiario = await client.post(
        "/api/govinfra/v1/porteira/beneficiarios",
        json={
            "programa_id": programa["id"],
            "pessoa_id": produtor["id"],
            "classificacao": "produtor_rural",
            "horas_iniciais": 2,
        },
        headers=token("atendente"),
    )
    assert beneficiario.status_code == 201

    solicitacao = await client.post(
        "/api/govinfra/v1/porteira/solicitacoes",
        json={
            "programa_id": programa["id"],
            "beneficiario_id": beneficiario.json()["id"],
            "imovel_id": propriedade["id"],
            "tipo_servico_id": tipo["id"],
            "descricao": "Serviço com horas acima do saldo",
            "horas_estimadas": 10,
            "data_desejada": str(proximo_dia_util(date.today() + timedelta(days=3))),
        },
        headers=token("atendente"),
    )
    assert solicitacao.status_code == 422
    assert solicitacao.json()["erro"] == "impedimento_elegibilidade"


async def test_concessao_e_extrato_horas(client, token, cpf_unico):
    produtor = await _criar_produtor(client, token, cpf_unico, indice=3)
    programa = await _criar_programa(client, token)
    beneficiario = await client.post(
        "/api/govinfra/v1/porteira/beneficiarios",
        json={
            "programa_id": programa["id"],
            "pessoa_id": produtor["id"],
            "classificacao": "produtor_rural",
            "horas_iniciais": 0,
        },
        headers=token("atendente"),
    )
    ben = beneficiario.json()

    concedidas = await client.post(
        f"/api/govinfra/v1/porteira/beneficiarios/{ben['id']}/horas",
        json={"quantidade": 10, "motivo": "Concessão de teste"},
        headers=token("gestor"),
    )
    assert concedidas.status_code == 200, concedidas.text

    detalhe = await client.get(
        f"/api/govinfra/v1/porteira/beneficiarios/{ben['id']}", headers=token("atendente")
    )
    assert detalhe.json()["saldo_total_disponivel"] == 10

    # Extrato mostra a concessão.
    saldo_id = detalhe.json()["saldos"][0]["id"]
    extrato = await client.get(
        f"/api/govinfra/v1/porteira/saldos/{saldo_id}/extrato", headers=token("atendente")
    )
    assert extrato.status_code == 200
    assert any(m["tipo"] == "concessao" for m in extrato.json()["movimentos"])
