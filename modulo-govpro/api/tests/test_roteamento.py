"""Testes do motor de regras de encaminhamento automático (Fase 6)."""

from sqlalchemy import select

from app.models.dominio import TipoProcesso
from app.models.enums import EstadoProcessoUnidade
from app.models.processo import ProcessoUnidade
from app.models.roteamento import RegraEncaminhamento
from app.models.unidade import Unidade
from app.services import autuacao, roteamento


async def _unidade(db, tenant_id, sigla):
    return (
        await db.execute(select(Unidade).where(Unidade.tenant_id == tenant_id, Unidade.sigla == sigla))
    ).scalar_one()


async def _tipo(db, tenant_id, codigo):
    return (
        await db.execute(
            select(TipoProcesso).where(TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == codigo)
        )
    ).scalar_one()


async def test_resolver_destino_por_assunto(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    obras = await _unidade(db, tenant_id, "SEC_OBRAS")
    tipo = await _tipo(db, tenant_id, "LICENCA_OBRA")

    db.add(
        RegraEncaminhamento(
            tenant_id=tenant_id,
            nome="Alvará → Obras",
            tipo_processo_id=tipo.id,
            condicoes=[{"campo": "especificacao", "operador": "CONTEM", "valor": "alvará"}],
            unidade_destino_id=obras.id,
            prioridade=10,
        )
    )
    await db.commit()

    destino = await roteamento.resolver_destino(
        db, tenant_id, tipo_processo_id=tipo.id, especificacao="Pedido de alvará de construção"
    )
    assert destino is not None and destino.id == obras.id

    sem_match = await roteamento.resolver_destino(
        db, tenant_id, tipo_processo_id=tipo.id, especificacao="Pedido de certidão"
    )
    assert sem_match is None


async def test_prioridade_maior_vence(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    obras = await _unidade(db, tenant_id, "SEC_OBRAS")
    adm = await _unidade(db, tenant_id, "SEC_ADM")
    tipo = await _tipo(db, tenant_id, "REQ_GERAL")

    db.add(
        RegraEncaminhamento(
            tenant_id=tenant_id,
            nome="Geral → Adm",
            tipo_processo_id=tipo.id,
            condicoes=[],
            unidade_destino_id=adm.id,
            prioridade=0,
        )
    )
    db.add(
        RegraEncaminhamento(
            tenant_id=tenant_id,
            nome="Obras específico",
            tipo_processo_id=tipo.id,
            condicoes=[{"campo": "especificacao", "operador": "CONTEM", "valor": "obra"}],
            unidade_destino_id=obras.id,
            prioridade=50,
        )
    )
    await db.commit()

    destino = await roteamento.resolver_destino(
        db, tenant_id, tipo_processo_id=tipo.id, especificacao="Solicitação de obra pública"
    )
    assert destino is not None and destino.id == obras.id

    generico = await roteamento.resolver_destino(
        db, tenant_id, tipo_processo_id=tipo.id, especificacao="Solicitação qualquer"
    )
    assert generico is not None and generico.id == adm.id


async def test_autuar_externo_rota_para_setor(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    obras = await _unidade(db, tenant_id, "SEC_OBRAS")
    tipo = await _tipo(db, tenant_id, "LICENCA_OBRA")

    db.add(
        RegraEncaminhamento(
            tenant_id=tenant_id,
            nome="Licença → Obras",
            tipo_processo_id=tipo.id,
            condicoes=[],
            unidade_destino_id=obras.id,
            prioridade=10,
        )
    )
    await db.commit()

    processo = await autuacao.autuar_externo(
        db,
        tenant_id,
        tipo_processo_id=tipo.id,
        especificacao="Alvará de funcionamento",
        interessados=[{"nome": "Maria"}],
    )

    unidades = (
        await db.execute(
            select(ProcessoUnidade).where(ProcessoUnidade.processo_id == processo.id)
        )
    ).scalars().all()
    ids = {u.unidade_id for u in unidades}
    assert obras.id in ids
    assert all(u.estado in (EstadoProcessoUnidade.RECEBIDO.value, EstadoProcessoUnidade.EM_ANALISE.value) for u in unidades)


async def test_autuar_externo_sem_regra_cai_no_protocolo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    protocolo = await _unidade(db, tenant_id, "PROTOCOLO")
    tipo = await _tipo(db, tenant_id, "LICENCA_OBRA")

    processo = await autuacao.autuar_externo(
        db,
        tenant_id,
        tipo_processo_id=tipo.id,
        especificacao="Pedido sem regra",
        interessados=[{"nome": "João"}],
    )

    # Sem regra e sem destino padrão: permanece na protocolizadora (Protocolo Central).
    assert processo.unidade_protocolizadora_id == protocolo.id
    unidades = (
        await db.execute(
            select(ProcessoUnidade).where(ProcessoUnidade.processo_id == processo.id)
        )
    ).scalars().all()
    assert len(unidades) == 1
    assert unidades[0].unidade_id == protocolo.id
