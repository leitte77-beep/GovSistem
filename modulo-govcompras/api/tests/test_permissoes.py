"""RBAC: cada operação sensível exige a permissão certa, nunca "confiar" no
perfil sozinho (seção 82 — segregação de funções)."""

import pytest

from app.core.permissoes import Perfil, permissoes_efetivas

pytestmark = pytest.mark.asyncio


async def test_administrador_tem_todas_as_permissoes():
    from app.core.permissoes import TODAS

    efetivas = permissoes_efetivas(Perfil.ADMINISTRADOR.value)
    assert efetivas == {p.value for p in TODAS}


async def test_permissao_extra_e_revogada_funcionam():
    efetivas = permissoes_efetivas(
        Perfil.CONSULTA.value, extras=["govcompras.solicitacoes.criar"], revogadas=["govcompras.dashboard.visualizar"]
    )
    assert "govcompras.solicitacoes.criar" in efetivas
    assert "govcompras.dashboard.visualizar" not in efetivas


async def test_fiscal_nao_pode_criar_dotacao(client, token, mundo):
    """Fiscal enxerga dotações (leitura básica), mas não pode confirmá-las —
    essa é uma atribuição exclusiva da Contabilidade."""
    leitura = await client.get("/api/govcompras/v1/dotacoes", headers=token("fiscal"))
    assert leitura.status_code == 200

    escrita = await client.post(
        "/api/govcompras/v1/dotacoes",
        json={
            "exercicio": 2026, "orgao": "Prefeitura", "unidade": "Unidade Teste",
            "elemento_despesa": "3.3.90.30", "valor_total": 1000.0,
        },
        headers=token("fiscal"),
    )
    assert escrita.status_code == 403


async def test_solicitante_nao_pode_decidir_autorizacao(client, db, token, mundo):
    from app.models.enums import TipoProcesso
    from app.services import workflow

    setores = mundo["setores"]
    processo = await workflow.abrir_processo(
        db,
        organizacao_id=mundo["organizacao"].id,
        tipo_processo=TipoProcesso.PREGAO.value,
        secretaria_id=setores["_secretaria_saude"].id,
        setor_id=setores["solicitante_saude"].id,
        objeto="Processo de teste de permissão",
        valor_estimado=1000.0,
        usuario=mundo["usuarios"]["solicitante"],
    )
    await db.commit()

    resposta = await client.post(
        f"/api/govcompras/v1/processos/{processo.id}/autorizacao",
        json={"decisao": "autorizado"},
        headers=token("solicitante"),
    )
    assert resposta.status_code == 403


async def test_contabilidade_pode_confirmar_dotacao(client, token, mundo):
    resposta = await client.post(
        "/api/govcompras/v1/dotacoes",
        json={
            "exercicio": 2026,
            "orgao": "Prefeitura",
            "unidade": "Unidade Teste",
            "elemento_despesa": "3.3.90.30",
            "valor_total": 100000.0,
        },
        headers=token("contabilidade"),
    )
    assert resposta.status_code == 201, resposta.text


async def test_usuarios_gerenciar_restrito_ao_administrador(client, token, mundo):
    negado = await client.get("/api/govcompras/v1/usuarios", headers=token("compras"))
    assert negado.status_code == 403

    permitido = await client.get("/api/govcompras/v1/usuarios", headers=token("administrador"))
    assert permitido.status_code == 200
    assert len(permitido.json()) == 7
