"""Núcleo do sistema: consulta e movimentação de processos (seções 11-13, 36,
88-91, 109-111, 130-134)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Paginacao, buscar_da_organizacao, cliente, pagina_payload
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.enums import StatusGeralProcesso
from app.models.organizacao import Secretaria, Setor, User
from app.models.processo import ProcessoHistoricoEtapa, ProcessoInstancia
from app.models.workflow import WorkflowEtapa, WorkflowTransicao
from app.schemas.comuns import HistoricoEtapaOut, Mensagem, Pagina
from app.schemas.processo import (
    AbrirProcessoIn,
    CancelarIn,
    DevolverIn,
    EtapaFluxoOut,
    HistoricoOut,
    ProcessoDetalheOut,
    ProcessoResumoOut,
    TransicaoDisponivelOut,
)
from app.services import workflow
from app.services.workflow import calcular_status_sla, dias_na_etapa

router = APIRouter(prefix="/processos", tags=["Processos"])


async def _nome_secretaria(db: AsyncSession, secretaria_id: uuid.UUID | None) -> str | None:
    if secretaria_id is None:
        return None
    secretaria = await db.get(Secretaria, secretaria_id)
    return secretaria.nome if secretaria else None


async def _nome_setor(db: AsyncSession, setor_id: uuid.UUID | None) -> str | None:
    if setor_id is None:
        return None
    setor = await db.get(Setor, setor_id)
    return setor.nome if setor else None


async def _nome_usuario(db: AsyncSession, usuario_id: uuid.UUID | None) -> str | None:
    if usuario_id is None:
        return None
    usuario = await db.get(User, usuario_id)
    return usuario.nome if usuario else None


async def _resumo(db: AsyncSession, processo: ProcessoInstancia) -> ProcessoResumoOut:
    etapa = await db.get(WorkflowEtapa, processo.etapa_atual_id) if processo.etapa_atual_id else None
    status_sla = None
    dias = None
    if etapa and processo.etapa_atual_iniciada_em:
        status_sla = calcular_status_sla(processo.etapa_atual_iniciada_em, etapa.sla_dias).value
        dias = dias_na_etapa(processo.etapa_atual_iniciada_em)
    return ProcessoResumoOut(
        id=processo.id,
        numero_processo=processo.numero_processo,
        exercicio=processo.exercicio,
        tipo_processo=processo.tipo_processo,
        status_geral=processo.status_geral,
        secretaria_id=processo.secretaria_id,
        secretaria_nome=await _nome_secretaria(db, processo.secretaria_id),
        objeto=processo.objeto,
        valor_estimado=processo.valor_estimado,
        etapa_atual_nome=etapa.nome if etapa else None,
        etapa_atual_codigo=etapa.codigo if etapa else None,
        responsavel_setor=await _nome_setor(db, processo.etapa_atual_responsavel_setor_id),
        responsavel_usuario=await _nome_usuario(db, processo.etapa_atual_responsavel_usuario_id),
        dias_na_etapa=dias,
        status_sla=status_sla,
        favorito=processo.favorito,
        created_at=processo.created_at,
    )


async def _detalhe(db: AsyncSession, processo: ProcessoInstancia) -> ProcessoDetalheOut:
    resumo = await _resumo(db, processo)
    proxima_nome = None
    pendencias = []
    if processo.status_geral == StatusGeralProcesso.EM_ANDAMENTO.value and processo.etapa_atual_id:
        transicao = await db.scalar(
            select(WorkflowTransicao).where(
                WorkflowTransicao.etapa_origem_id == processo.etapa_atual_id,
                WorkflowTransicao.tipo == "avancar",
            )
        )
        if transicao and transicao.etapa_destino_id:
            proxima_etapa = await db.get(WorkflowEtapa, transicao.etapa_destino_id)
            proxima_nome = proxima_etapa.nome if proxima_etapa else None
        pendencias = await workflow.pendencias_etapa(db, processo)
    return ProcessoDetalheOut(
        **resumo.model_dump(),
        solicitacao_id=processo.solicitacao_id,
        processo_origem_id=processo.processo_origem_id,
        origem_contrato_id=processo.origem_contrato_id,
        template_id=processo.template_id,
        proxima_etapa_nome=proxima_nome,
        pendencias=pendencias,
    )


@router.get("", response_model=Pagina[ProcessoResumoOut])
async def listar_processos(
    paginacao: Paginacao = Depends(),
    status_geral: str | None = None,
    tipo_processo: str | None = None,
    secretaria_id: uuid.UUID | None = None,
    apenas_atrasados: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR)),
):
    consulta = select(ProcessoInstancia).where(ProcessoInstancia.organizacao_id == user.organizacao_id)
    if status_geral:
        consulta = consulta.where(ProcessoInstancia.status_geral == status_geral)
    if tipo_processo:
        consulta = consulta.where(ProcessoInstancia.tipo_processo == tipo_processo)
    if secretaria_id:
        consulta = consulta.where(ProcessoInstancia.secretaria_id == secretaria_id)

    todos = list((await db.scalars(consulta.order_by(ProcessoInstancia.created_at.desc()))).all())
    resumos = [await _resumo(db, p) for p in todos]
    if apenas_atrasados:
        resumos = [r for r in resumos if r.status_sla in {"atrasado", "critico"}]

    total = len(resumos)
    pagina_itens = resumos[paginacao.offset : paginacao.offset + paginacao.por_pagina]
    return pagina_payload(pagina_itens, total, paginacao)


@router.post("", response_model=ProcessoDetalheOut, status_code=201)
async def abrir_processo(
    payload: AbrirProcessoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_ENVIAR)),
):
    processo = await workflow.abrir_processo(
        db,
        organizacao_id=user.organizacao_id,
        usuario=user,
        **payload.model_dump(),
    )
    await db.commit()
    await db.refresh(processo)
    return await _detalhe(db, processo)


@router.get("/{processo_id}", response_model=ProcessoDetalheOut)
async def obter_processo(
    processo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR)),
):
    processo = await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    return await _detalhe(db, processo)


@router.get("/{processo_id}/historico", response_model=HistoricoOut)
async def historico_processo(
    processo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    linhas = list(
        (
            await db.scalars(
                select(ProcessoHistoricoEtapa)
                .where(ProcessoHistoricoEtapa.processo_id == processo_id)
                .order_by(ProcessoHistoricoEtapa.iniciada_em)
            )
        ).all()
    )
    itens = []
    for linha in linhas:
        etapa = await db.get(WorkflowEtapa, linha.etapa_id)
        dias = None
        if linha.encerrada_em is None:
            dias = dias_na_etapa(linha.iniciada_em)
        itens.append(
            HistoricoEtapaOut(
                id=linha.id,
                etapa_id=linha.etapa_id,
                etapa_nome=etapa.nome if etapa else "—",
                ordem_execucao=linha.ordem_execucao,
                responsavel_setor=await _nome_setor(db, linha.responsavel_setor_id),
                responsavel_usuario=await _nome_usuario(db, linha.responsavel_usuario_id),
                iniciada_em=linha.iniciada_em,
                encerrada_em=linha.encerrada_em,
                resultado=linha.resultado,
                justificativa=linha.justificativa,
                dias_na_etapa=dias,
            )
        )
    return HistoricoOut(itens=itens)


@router.get("/{processo_id}/etapas-fluxo", response_model=list[EtapaFluxoOut])
async def etapas_fluxo(
    processo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR)),
):
    """Todas as etapas do workflow do processo, em ordem — alimenta a linha
    do tempo visual (seção 11)."""
    processo = await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    etapas = list(
        (
            await db.scalars(
                select(WorkflowEtapa)
                .where(WorkflowEtapa.template_id == processo.template_id)
                .order_by(WorkflowEtapa.ordem)
            )
        ).all()
    )
    return [EtapaFluxoOut(codigo=e.codigo, nome=e.nome, ordem=e.ordem) for e in etapas]


@router.get("/{processo_id}/transicoes-disponiveis", response_model=list[TransicaoDisponivelOut])
async def transicoes_disponiveis(
    processo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR)),
):
    """Opções de devolução configuradas para a etapa atual — a tela usa isto
    para deixar quem devolve escolher o destino, quando há mais de um."""
    processo = await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    if processo.etapa_atual_id is None:
        return []
    transicoes = list(
        (
            await db.scalars(
                select(WorkflowTransicao).where(
                    WorkflowTransicao.etapa_origem_id == processo.etapa_atual_id,
                    WorkflowTransicao.tipo == "devolver",
                )
            )
        ).all()
    )
    resultado = []
    for t in transicoes:
        destino = await db.get(WorkflowEtapa, t.etapa_destino_id) if t.etapa_destino_id else None
        resultado.append(
            TransicaoDisponivelOut(
                id=t.id, tipo=t.tipo, rotulo=t.rotulo,
                etapa_destino_nome=destino.nome if destino else None,
                exige_justificativa=t.exige_justificativa,
            )
        )
    return resultado


@router.post("/{processo_id}/avancar", response_model=ProcessoDetalheOut)
async def avancar(
    processo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_AVANCAR)),
    dados_cliente: dict = Depends(cliente),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    processo = await workflow.avancar_etapa(db, processo_id=processo_id, usuario=user, cliente=dados_cliente)
    await db.commit()
    await db.refresh(processo)
    return await _detalhe(db, processo)


@router.post("/{processo_id}/devolver", response_model=ProcessoDetalheOut)
async def devolver(
    processo_id: uuid.UUID,
    payload: DevolverIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_DEVOLVER)),
    dados_cliente: dict = Depends(cliente),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    processo = await workflow.devolver_etapa(
        db,
        processo_id=processo_id,
        transicao_id=payload.transicao_id,
        justificativa=payload.justificativa,
        usuario=user,
        cliente=dados_cliente,
    )
    await db.commit()
    await db.refresh(processo)
    return await _detalhe(db, processo)


@router.post("/{processo_id}/cancelar", response_model=ProcessoDetalheOut)
async def cancelar(
    processo_id: uuid.UUID,
    payload: CancelarIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_CANCELAR)),
    dados_cliente: dict = Depends(cliente),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    processo = await workflow.cancelar_processo(
        db, processo_id=processo_id, justificativa=payload.justificativa, usuario=user, cliente=dados_cliente
    )
    await db.commit()
    await db.refresh(processo)
    return await _detalhe(db, processo)


@router.post("/{processo_id}/reabrir", response_model=ProcessoDetalheOut)
async def reabrir(
    processo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_REABRIR)),
    dados_cliente: dict = Depends(cliente),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    processo = await workflow.reabrir_processo(db, processo_id=processo_id, usuario=user, cliente=dados_cliente)
    await db.commit()
    await db.refresh(processo)
    return await _detalhe(db, processo)


@router.post("/{processo_id}/favoritar", response_model=Mensagem)
async def favoritar(
    processo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR)),
):
    processo = await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    processo.favorito = not processo.favorito
    await db.commit()
    return Mensagem(mensagem="Favorito atualizado." if processo.favorito else "Removido dos favoritos.")


@router.post("/requisitos/{requisito_id}/marcar", response_model=Mensagem)
async def marcar_requisito(
    requisito_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_AVANCAR)),
):
    await workflow.marcar_requisito_manual(db, requisito_id=requisito_id, usuario=user)
    await db.commit()
    return Mensagem(mensagem="Requisito marcado como cumprido.")
