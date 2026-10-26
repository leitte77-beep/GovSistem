"""Auditoria append-only, diff mascarado e leitura por tenant."""

from __future__ import annotations

import uuid

import pytest

from app.models.enums import AcaoAuditoria
from app.services.auditoria import registrar


async def test_auditoria_append_only_no_orm(db, mundo):
    evento = await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=mundo["usuarios"]["admin"],
        tenant_id=mundo["org_a"].id,
        recurso="teste",
        recurso_id=uuid.uuid4(),
        dados_antes={"cpf": "52998224725", "anamnese": "texto"},
        dados_depois={"cpf": "52998224726", "anamnese": "novo texto"},
    )
    await db.commit()
    evento.detalhe = "tentativa de alteração"
    with pytest.raises(ValueError):
        await db.commit()


async def test_diff_nao_grava_conteudo_clinico(db, mundo):
    evento = await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=mundo["usuarios"]["medico"],
        tenant_id=mundo["org_a"].id,
        recurso="evolucao",
        recurso_id=uuid.uuid4(),
        dados_antes={"anamnese": "HIV positivo", "cpf": "52998224725"},
        dados_depois={"anamnese": "HIV positivo", "cpf": "52998224726"},
    )
    await db.commit()
    assert "HIV" not in str(evento.dados_antes)
    assert "HIV" not in str(evento.diff)
    assert evento.dados_antes["cpf"].startswith("***")


async def test_listar_auditoria_e_isolar_tenant(client, db, mundo, token):
    evento = await registrar(
        db,
        acao=AcaoAuditoria.LOGIN,
        usuario=mundo["usuarios"]["admin"],
        tenant_id=mundo["org_a"].id,
        recurso="sessao",
    )
    await db.commit()
    resposta = await client.get("/api/govsaude/v1/auditoria", headers=token("dpo"))
    assert resposta.status_code == 200, resposta.text
    ids = [item["id"] for item in resposta.json()["itens"]]
    assert str(evento.id) in ids

    resposta_b = await client.get(
        f"/api/govsaude/v1/auditoria/{evento.id}", headers=token("admin_b")
    )
    assert resposta_b.status_code == 404


async def test_trigger_sql_no_postgres_quando_disponivel():
    pytest.skip("coberto por test_postgres_auditoria.py quando o banco real está configurado")
