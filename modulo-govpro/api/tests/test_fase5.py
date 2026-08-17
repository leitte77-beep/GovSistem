"""Testes da Fase 5 — arquivo: TTD, ciclo de vida, eliminação, integridade e exportação."""

from sqlalchemy import select

from app.models.dominio import PlanoClassificacao, TipoProcesso
from app.models.enums import StatusEliminacao
from app.services import arquivo, captura, eliminacao, integridade
from app.services.autuacao import autuar

PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


async def _autuar_processo(cenario):
    db = cenario["db"]
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == cenario["tenant_id"], TipoProcesso.codigo == "REQ_GERAL"
        )
    )
    tipo = result.scalar_one()
    return await autuar(
        db,
        cenario["tenant_id"],
        cenario["user"],
        tipo_processo_id=tipo.id,
        especificacao="Processo Fase 5",
        interessados=[{"nome": "X"}],
    )


async def _classe(db, tenant_id, codigo="050"):
    result = await db.execute(
        select(PlanoClassificacao).where(
            PlanoClassificacao.tenant_id == tenant_id, PlanoClassificacao.codigo == codigo
        )
    )
    return result.scalar_one()


async def test_ttd_seed_e_listagem(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]

    # O seed já cria TTD para classes do plano (050, 110, 120, 130).
    ttds = await arquivo.listar_ttd(db, tenant_id)
    assert len(ttds) >= 3


async def test_transferir_recolher(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    ciclo = await arquivo.transferir(db, tenant_id, cenario["user"], processo_id=processo.id)
    assert ciclo.fase == "INTERMEDIARIA"

    ciclo = await arquivo.recolher(db, tenant_id, cenario["user"], processo_id=processo.id)
    assert ciclo.fase == "PERMANENTE"


async def test_eliminacao_rito_completo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)
    classe = await _classe(db, tenant_id)
    processo.classe_id = classe.id
    await db.commit()

    e = await eliminacao.criar_eliminacao(
        db,
        tenant_id,
        cenario["user"],
        titulo="Eliminação de licenças",
        processos=[{"processo_id": processo.id, "justificativa": "Prazo vencido (TTD)"}],
    )
    assert e.status == StatusEliminacao.ELABORACAO.value

    e = await eliminacao.aprovar(db, tenant_id, cenario["user"], eliminacao_id=e.id)
    assert e.status == StatusEliminacao.APROVADA.value

    edital = await eliminacao.publicar_edital(db, tenant_id, cenario["user"], eliminacao_id=e.id)
    assert edital.codigo is not None

    termo = await eliminacao.registrar_termo(db, tenant_id, cenario["user"], eliminacao_id=e.id)
    assert termo.hash_termo is not None

    resultado = await eliminacao.executar(db, tenant_id, cenario["user"], eliminacao_id=e.id)
    assert resultado["status"] == StatusEliminacao.ELIMINADA.value
    assert resultado["processos_eliminados"] == 1

    await db.refresh(processo)
    assert processo.eliminado_em is not None


async def test_eliminacao_exige_termo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    e = await eliminacao.criar_eliminacao(
        db, tenant_id, cenario["user"], titulo="x", processos=[{"processo_id": processo.id}]
    )
    await eliminacao.aprovar(db, tenant_id, cenario["user"], eliminacao_id=e.id)
    await eliminacao.publicar_edital(db, tenant_id, cenario["user"], eliminacao_id=e.id)

    import pytest
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await eliminacao.executar(db, tenant_id, cenario["user"], eliminacao_id=e.id)
    assert exc.value.status_code == 409


async def test_verificar_integridade(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    await captura.capturar_documento_externo(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Comprovante",
        nome_original="comprovante.pdf",
        mime="application/pdf",
        conteudo=PDF,
    )

    v = await integridade.verificar_integridade(db, tenant_id)
    assert v.total_verificados >= 1
    assert v.divergencias is None


async def test_exportar_acervo_e_dados_abertos(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    await _autuar_processo(cenario)

    pacote = await arquivo.exportar_acervo(db, tenant_id)
    assert pacote["formato"] == "SIP-AIP"
    assert pacote["total_processos"] >= 1

    abertos = await arquivo.dados_abertos(db, tenant_id)
    assert abertos["total_processos"] >= 1
    assert abertos["anonimizado"] is True
