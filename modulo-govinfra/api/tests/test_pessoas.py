"""Testes de pessoas, imóveis e vínculos (itens 8 e 9)."""

import pytest

pytestmark = pytest.mark.asyncio


async def test_criar_pessoa(client, token, cpf_unico):
    resposta = await client.post(
        "/api/govinfra/v1/pessoas",
        json={
            "nome": "Maria da Silva",
            "documento": cpf_unico(),
            "telefone": "49999990001",
            "tipos": ["cidadao"],
        },
        headers=token("atendente"),
    )
    assert resposta.status_code == 201, resposta.text
    criado = resposta.json()
    detalhe = await client.get(f"/api/govinfra/v1/pessoas/{criado['id']}", headers=token("gestor"))
    assert detalhe.status_code == 200
    dados = detalhe.json()
    assert dados["nome"] == "Maria da Silva"
    assert dados["documento_mascarado"] is False


async def test_pessoa_sem_permissao(client, token, cpf_unico):
    resposta = await client.post(
        "/api/govinfra/v1/pessoas",
        json={"nome": "Sem Permissão", "documento": cpf_unico()},
        headers=token("consulta"),
    )
    assert resposta.status_code == 403
    assert resposta.json()["erro"] == "permissao_negada"


async def test_cpf_invalido_rejeitado(client, token):
    resposta = await client.post(
        "/api/govinfra/v1/pessoas",
        json={"nome": "CPF Ruim", "documento": "11111111111"},
        headers=token("atendente"),
    )
    assert resposta.status_code == 422


async def test_duplicidade_cpf_alerta(client, token, cpf_unico):
    cpf = cpf_unico()
    await client.post(
        "/api/govinfra/v1/pessoas",
        json={"nome": "Primeira", "documento": cpf},
        headers=token("atendente"),
    )
    resposta = await client.post(
        "/api/govinfra/v1/pessoas",
        json={"nome": "Segunda", "documento": cpf},
        headers=token("atendente"),
    )
    assert resposta.status_code == 409
    assert "cpf" in resposta.json()["mensagem"].lower()


async def test_atualizar_pessoa(client, token, pessoa):
    resposta = await client.put(
        f"/api/govinfra/v1/pessoas/{pessoa['id']}",
        json={"nome": "Nome Atualizado", "situacao": "ativo"},
        headers=token("atendente"),
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["mensagem"]


async def test_cpf_mascarado_sem_permissao(client, token, cpf_unico):
    cpf = cpf_unico()
    criada = await client.post(
        "/api/govinfra/v1/pessoas",
        json={"nome": "Mascarada", "documento": cpf},
        headers=token("atendente"),
    )
    resposta = await client.get(
        f"/api/govinfra/v1/pessoas/{criada.json()['id']}", headers=token("consulta")
    )
    assert resposta.status_code == 200
    dados = resposta.json()
    assert dados["documento"] != cpf
    assert "***" in dados["documento"] or dados["documento_mascarado"] is True


async def test_criar_imovel_urbano(client, token, pessoa):
    resposta = await client.post(
        "/api/govinfra/v1/imoveis",
        json={
            "nome": "Casa do centro",
            "tipo": "urbano",
            "logradouro": "Rua Principal",
            "numero": "10",
            "bairro": "Centro",
            "municipio": "Testópolis",
            "uf": "SC",
            "latitude": -27.2,
            "longitude": -52.03,
            "proprietario_id": pessoa["id"],
            "solicitante_id": pessoa["id"],
        },
        headers=token("atendente"),
    )
    assert resposta.status_code == 201, resposta.text
    detalhe = await client.get(
        f"/api/govinfra/v1/imoveis/{resposta.json()['id']}", headers=token("atendente")
    )
    assert detalhe.status_code == 200, detalhe.text
    dados = detalhe.json()
    assert dados["tipo"] == "urbano"
    assert dados["latitude"] == -27.2


async def test_imovel_rural_com_regiao(client, token, pessoa):
    resposta = await client.post(
        "/api/govinfra/v1/imoveis",
        json={
            "nome": "Sítio teste",
            "tipo": "rural",
            "logradouro": "Linha Teste",
            "bairro": "Linha Teste",
            "municipio": "Testópolis",
            "uf": "SC",
            "comunidade": "Linha Teste",
            "area_hectares": 12.5,
            "atividade_produtiva": "grãos",
        },
        headers=token("atendente"),
    )
    assert resposta.status_code == 201, resposta.text
    detalhe = await client.get(
        f"/api/govinfra/v1/imoveis/{resposta.json()['id']}", headers=token("atendente")
    )
    assert detalhe.status_code == 200, detalhe.text
    assert detalhe.json()["tipo"] == "rural"


async def test_geocodificar_sem_provedor_falha_graciosa(client, token):
    """Sem provedor configurado, o endpoint devolve erro claro — o cadastro
    manual continua sendo o caminho normal."""
    resposta = await client.post(
        "/api/govinfra/v1/geocodificar",
        json={"endereco": "Rua Qualquer, 123"},
        headers=token("atendente"),
    )
    assert resposta.status_code in (200, 422, 503)
