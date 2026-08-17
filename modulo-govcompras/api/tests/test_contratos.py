"""Contratos: geração a partir da homologação, saldo e decisão pré-vencimento
com criação automática de processo sucessor (seções 44-52)."""

from datetime import date, timedelta

import pytest

from app.models.compras import Fornecedor
from app.models.enums import TipoProcesso
from app.models.licitacao import Adjudicacao, Homologacao
from app.services import workflow

pytestmark = pytest.mark.asyncio


async def _processo_pronto_para_contrato(db, mundo):
    setores = mundo["setores"]
    processo = await workflow.abrir_processo(
        db,
        organizacao_id=mundo["organizacao"].id,
        tipo_processo=TipoProcesso.PREGAO.value,
        secretaria_id=setores["_secretaria_saude"].id,
        setor_id=setores["solicitante_saude"].id,
        objeto="Aquisição de material de teste para contrato",
        valor_estimado=50000.0,
        usuario=mundo["usuarios"]["solicitante"],
    )
    fornecedor = Fornecedor(
        organizacao_id=mundo["organizacao"].id, razao_social="Fornecedora de Testes Ltda", cnpj="11.111.111/0001-11"
    )
    db.add(fornecedor)
    await db.flush()
    return processo, fornecedor


async def test_gerar_contrato_sem_homologacao_falha(client, db, token, mundo):
    processo, _ = await _processo_pronto_para_contrato(db, mundo)
    await db.commit()

    resposta = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/gerar-contrato",
        json={
            "vigencia_inicio": str(date.today()),
            "vigencia_fim": str(date.today() + timedelta(days=365)),
        },
        headers=token("licitacao"),
    )
    assert resposta.status_code == 422
    assert resposta.json()["erro"] == "homologacao_pendente"


async def test_gerar_contrato_apos_homologacao(client, db, token, mundo):
    processo, fornecedor = await _processo_pronto_para_contrato(db, mundo)
    db.add(Adjudicacao(processo_id=processo.id, fornecedor_vencedor_id=fornecedor.id, valor_adjudicado=48000.0))
    db.add(
        Homologacao(
            processo_id=processo.id,
            autoridade_usuario_id=mundo["usuarios"]["administrador"].id,
            valor_homologado=48000.0,
        )
    )
    await db.commit()

    resposta = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/gerar-contrato",
        json={
            "vigencia_inicio": str(date.today()),
            "vigencia_fim": str(date.today() + timedelta(days=45)),
        },
        headers=token("licitacao"),
    )
    assert resposta.status_code == 201, resposta.text
    contrato = resposta.json()
    assert contrato["valor_global"] == 48000.0
    assert contrato["fornecedor_id"] == str(fornecedor.id)
    assert contrato["dias_para_vencer"] == 45

    saldo = await client.get(f"/api/govcompras/v1/contratos/{contrato['id']}/saldo", headers=token("licitacao"))
    assert saldo.status_code == 200
    assert saldo.json()["saldo_disponivel"] == 48000.0


async def test_decisao_vencimento_nova_contratacao_cria_processo_sucessor(client, db, token, mundo):
    processo, fornecedor = await _processo_pronto_para_contrato(db, mundo)
    db.add(Adjudicacao(processo_id=processo.id, fornecedor_vencedor_id=fornecedor.id, valor_adjudicado=48000.0))
    db.add(
        Homologacao(
            processo_id=processo.id,
            autoridade_usuario_id=mundo["usuarios"]["administrador"].id,
            valor_homologado=48000.0,
        )
    )
    await db.commit()
    gerado = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/gerar-contrato",
        json={"vigencia_inicio": str(date.today()), "vigencia_fim": str(date.today() + timedelta(days=45))},
        headers=token("licitacao"),
    )
    contrato_id = gerado.json()["id"]

    decisao = await client.post(
        f"/api/govcompras/v1/contratos/{contrato_id}/decisao-vencimento",
        json={"decisao": "nova_contratacao"},
        headers=token("licitacao"),
    )
    assert decisao.status_code == 200, decisao.text
    corpo = decisao.json()
    assert corpo["decisao"] == "nova_contratacao"
    assert "processo_sucessor_id" in corpo

    sucessor = await client.get(
        f"/api/govcompras/v1/processos/{corpo['processo_sucessor_id']}", headers=token("licitacao")
    )
    assert sucessor.status_code == 200
    assert sucessor.json()["origem_contrato_id"] == contrato_id


async def test_decisao_vencimento_encerramento(client, db, token, mundo):
    processo, fornecedor = await _processo_pronto_para_contrato(db, mundo)
    db.add(Adjudicacao(processo_id=processo.id, fornecedor_vencedor_id=fornecedor.id, valor_adjudicado=10000.0))
    db.add(
        Homologacao(
            processo_id=processo.id, autoridade_usuario_id=mundo["usuarios"]["administrador"].id, valor_homologado=10000.0
        )
    )
    await db.commit()
    gerado = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/gerar-contrato",
        json={"vigencia_inicio": str(date.today()), "vigencia_fim": str(date.today() + timedelta(days=10))},
        headers=token("licitacao"),
    )
    contrato_id = gerado.json()["id"]

    decisao = await client.post(
        f"/api/govcompras/v1/contratos/{contrato_id}/decisao-vencimento",
        json={"decisao": "encerramento"},
        headers=token("licitacao"),
    )
    assert decisao.status_code == 200
    detalhe = await client.get(f"/api/govcompras/v1/contratos/{contrato_id}", headers=token("licitacao"))
    assert detalhe.json()["status"] == "encerrado"
