"""Motor de workflow — avançar, devolver e cancelar etapas de um processo.

É a única porta de escrita de `ProcessoInstancia`/`ProcessoHistoricoEtapa`
(seção 130: um processo é uma sequência de responsabilidades e eventos, não
só documentos). Todo o SLA é calculado on-read — nada de coluna de status
persistida (seção 89-90).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import suporta_bloqueio_linha
from app.core.errors import AppError, PendenciasBloqueiam
from app.models.enums import (
    AcaoAuditoria,
    ResultadoEtapa,
    StatusGeralProcesso,
    StatusSLA,
    TipoNotificacao,
    TipoTransicao,
)
from app.models.organizacao import Setor, User
from app.models.processo import ProcessoHistoricoEtapa, ProcessoInstancia
from app.models.workflow import WorkflowEtapa, WorkflowEtapaRequisito, WorkflowTemplate, WorkflowTransicao
from app.services import auditoria, notificacoes, numeracao
from app.services.workflow_requisitos import resolver as resolver_requisito


def calcular_status_sla(iniciada_em: datetime, sla_dias: int, agora: datetime | None = None) -> StatusSLA:
    agora = agora or datetime.now(timezone.utc)
    if iniciada_em.tzinfo is None:
        iniciada_em = iniciada_em.replace(tzinfo=timezone.utc)
    dias_decorridos = (agora - iniciada_em).total_seconds() / 86400
    if sla_dias <= 0:
        return StatusSLA.DENTRO_DO_PRAZO
    percentual = dias_decorridos / sla_dias
    if percentual >= settings.SLA_LIMITE_CRITICO_PCT:
        return StatusSLA.CRITICO
    if percentual >= settings.SLA_LIMITE_ATRASADO_PCT:
        return StatusSLA.ATRASADO
    if percentual >= settings.SLA_LIMITE_ATENCAO_PCT:
        return StatusSLA.ATENCAO
    return StatusSLA.DENTRO_DO_PRAZO


def dias_na_etapa(iniciada_em: datetime, agora: datetime | None = None) -> int:
    agora = agora or datetime.now(timezone.utc)
    if iniciada_em.tzinfo is None:
        iniciada_em = iniciada_em.replace(tzinfo=timezone.utc)
    return max(int((agora - iniciada_em).total_seconds() // 86400), 0)


async def _resolver_responsavel(
    db: AsyncSession, processo: ProcessoInstancia, etapa: WorkflowEtapa
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    """Resolve setor responsável pela próxima etapa.

    `setor_papel_funcional == "solicitante"` volta a responsabilidade para o
    setor que abriu o processo; qualquer outro valor busca o setor da
    organização marcado com aquele papel funcional (seção 81 — um por área,
    conforme o seed).
    """
    if etapa.setor_papel_funcional == "solicitante":
        return processo.setor_id, None
    if etapa.setor_papel_funcional:
        setor = await db.scalar(
            select(Setor).where(
                Setor.secretaria.has(organizacao_id=processo.organizacao_id),
                Setor.papel_funcional == etapa.setor_papel_funcional,
            )
        )
        if setor is not None:
            return setor.id, None
    return None, None


async def pendencias_etapa(db: AsyncSession, processo: ProcessoInstancia) -> list[dict]:
    """Checklist completo (satisfeitos e não satisfeitos) da etapa atual —
    usado pela tela de "Pronto para avançar?" (seção 36, 109)."""
    if processo.etapa_atual_id is None:
        return []
    requisitos = (
        await db.scalars(
            select(WorkflowEtapaRequisito).where(WorkflowEtapaRequisito.etapa_id == processo.etapa_atual_id)
        )
    ).all()
    resultado = []
    for requisito in requisitos:
        if requisito.tipo == "manual_check":
            satisfeito = requisito.satisfeito_manual_em is not None
        else:
            satisfeito = await resolver_requisito(db, requisito.entidade_ref or "", processo.id)
        resultado.append(
            {
                "id": str(requisito.id),
                "descricao": requisito.descricao,
                "obrigatorio": requisito.obrigatorio,
                "satisfeito": satisfeito,
            }
        )
    return resultado


async def _requisitos_obrigatorios_pendentes(db: AsyncSession, processo: ProcessoInstancia) -> list[dict]:
    checklist = await pendencias_etapa(db, processo)
    return [item for item in checklist if item["obrigatorio"] and not item["satisfeito"]]


async def abrir_processo(
    db: AsyncSession,
    *,
    organizacao_id: uuid.UUID,
    tipo_processo: str,
    secretaria_id: uuid.UUID,
    setor_id: uuid.UUID | None,
    objeto: str,
    valor_estimado: float | None,
    usuario: User,
    solicitacao_id: uuid.UUID | None = None,
    processo_origem_id: uuid.UUID | None = None,
    origem_contrato_id: uuid.UUID | None = None,
    iniciada_em: datetime | None = None,
) -> ProcessoInstancia:
    """Instancia um novo processo a partir do template ativo do tipo informado."""
    template = await db.scalar(
        select(WorkflowTemplate)
        .options(selectinload(WorkflowTemplate.etapas))
        .where(
            WorkflowTemplate.organizacao_id == organizacao_id,
            WorkflowTemplate.tipo_processo == tipo_processo,
            WorkflowTemplate.ativo.is_(True),
        )
    )
    if template is None:
        raise AppError(
            f'Não há um fluxo de trabalho ativo configurado para "{tipo_processo}". '
            "Peça ao administrador para configurar o workflow em Administração > Workflows.",
            422,
            "workflow_nao_configurado",
        )
    primeira_etapa = min(template.etapas, key=lambda e: e.ordem) if template.etapas else None
    if primeira_etapa is None:
        raise AppError("O fluxo configurado não possui etapas.", 422, "workflow_sem_etapas")

    _, numero = await numeracao.numero_processo(db, organizacao_id, tipo_processo)

    processo = ProcessoInstancia(
        organizacao_id=organizacao_id,
        numero_processo=numero,
        exercicio=datetime.now(timezone.utc).year,
        tipo_processo=tipo_processo,
        template_id=template.id,
        status_geral=StatusGeralProcesso.EM_ANDAMENTO.value,
        solicitacao_id=solicitacao_id,
        secretaria_id=secretaria_id,
        setor_id=setor_id,
        objeto=objeto,
        valor_estimado=valor_estimado,
        processo_origem_id=processo_origem_id,
        origem_contrato_id=origem_contrato_id,
        created_by_id=usuario.id,
    )
    db.add(processo)
    await db.flush()

    inicio = iniciada_em or datetime.now(timezone.utc)
    setor_resp, usuario_resp = await _resolver_responsavel(db, processo, primeira_etapa)
    historico = ProcessoHistoricoEtapa(
        processo_id=processo.id,
        etapa_id=primeira_etapa.id,
        ordem_execucao=1,
        responsavel_setor_id=setor_resp,
        responsavel_usuario_id=usuario_resp,
        iniciada_em=inicio,
        resultado=ResultadoEtapa.EM_ANDAMENTO.value,
    )
    db.add(historico)

    processo.etapa_atual_id = primeira_etapa.id
    processo.etapa_atual_iniciada_em = inicio
    processo.etapa_atual_responsavel_setor_id = setor_resp
    processo.etapa_atual_responsavel_usuario_id = usuario_resp

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=usuario,
        entidade_tipo="processo",
        entidade_id=processo.id,
        entidade_descricao=f"Processo {numero} — {objeto[:200]}",
        organizacao_id=organizacao_id,
    )
    await notificacoes.notificar_usuario(
        db,
        organizacao_id=organizacao_id,
        usuario_id=usuario_resp,
        setor_id=setor_resp,
        tipo=TipoNotificacao.ETAPA_ATRIBUIDA.value,
        titulo=f"Novo processo {numero}",
        mensagem=f'O processo {numero} ("{objeto[:120]}") está na etapa "{primeira_etapa.nome}".',
        entidade_tipo="processo",
        entidade_id=processo.id,
    )
    return processo


async def _carregar_processo_travado(db: AsyncSession, processo_id: uuid.UUID) -> ProcessoInstancia:
    consulta = select(ProcessoInstancia).where(ProcessoInstancia.id == processo_id)
    if suporta_bloqueio_linha():
        consulta = consulta.with_for_update()
    processo = await db.scalar(consulta)
    if processo is None:
        raise AppError("Processo não encontrado.", 404, "nao_encontrado")
    return processo


async def _etapa_atual_aberta(db: AsyncSession, processo: ProcessoInstancia) -> ProcessoHistoricoEtapa:
    linha = await db.scalar(
        select(ProcessoHistoricoEtapa).where(
            ProcessoHistoricoEtapa.processo_id == processo.id,
            ProcessoHistoricoEtapa.encerrada_em.is_(None),
        )
    )
    if linha is None:
        raise AppError("Processo sem etapa aberta.", 409, "sem_etapa_aberta")
    return linha


async def _transicao(db: AsyncSession, etapa_id: uuid.UUID, tipo: TipoTransicao, transicao_id: uuid.UUID | None = None) -> WorkflowTransicao:
    consulta = select(WorkflowTransicao).where(
        WorkflowTransicao.etapa_origem_id == etapa_id, WorkflowTransicao.tipo == tipo.value
    )
    if transicao_id:
        consulta = consulta.where(WorkflowTransicao.id == transicao_id)
    transicoes = list((await db.scalars(consulta)).all())
    if not transicoes:
        raise AppError(
            f'Não há transição de "{tipo.value}" configurada para a etapa atual.',
            422,
            "transicao_nao_configurada",
        )
    return transicoes[0]


async def avancar_etapa(
    db: AsyncSession, *, processo_id: uuid.UUID, usuario: User, cliente: dict | None = None
) -> ProcessoInstancia:
    processo = await _carregar_processo_travado(db, processo_id)
    if processo.status_geral != StatusGeralProcesso.EM_ANDAMENTO.value:
        raise AppError("Este processo não está em andamento.", 409, "processo_nao_em_andamento")

    pendentes = await _requisitos_obrigatorios_pendentes(db, processo)
    if pendentes:
        raise PendenciasBloqueiam(pendentes)

    linha_atual = await _etapa_atual_aberta(db, processo)
    transicao = await _transicao(db, linha_atual.etapa_id, TipoTransicao.AVANCAR)

    agora = datetime.now(timezone.utc)
    linha_atual.encerrada_em = agora
    linha_atual.resultado = ResultadoEtapa.AVANCOU.value
    linha_atual.usuario_acao_id = usuario.id

    etapa_atual = await db.get(WorkflowEtapa, linha_atual.etapa_id)

    if etapa_atual.etapa_final or transicao.etapa_destino_id is None:
        processo.status_geral = StatusGeralProcesso.CONCLUIDO.value
        processo.etapa_atual_id = None
        processo.etapa_atual_iniciada_em = None
        processo.etapa_atual_responsavel_setor_id = None
        processo.etapa_atual_responsavel_usuario_id = None
    else:
        proxima_etapa = await db.get(WorkflowEtapa, transicao.etapa_destino_id)
        setor_resp, usuario_resp = await _resolver_responsavel(db, processo, proxima_etapa)
        nova_linha = ProcessoHistoricoEtapa(
            processo_id=processo.id,
            etapa_id=proxima_etapa.id,
            ordem_execucao=linha_atual.ordem_execucao + 1,
            responsavel_setor_id=setor_resp,
            responsavel_usuario_id=usuario_resp,
            iniciada_em=agora,
            resultado=ResultadoEtapa.EM_ANDAMENTO.value,
        )
        db.add(nova_linha)
        processo.etapa_atual_id = proxima_etapa.id
        processo.etapa_atual_iniciada_em = agora
        processo.etapa_atual_responsavel_setor_id = setor_resp
        processo.etapa_atual_responsavel_usuario_id = usuario_resp

        await notificacoes.notificar_usuario(
            db,
            organizacao_id=processo.organizacao_id,
            usuario_id=usuario_resp,
            setor_id=setor_resp,
            tipo=TipoNotificacao.ETAPA_ATRIBUIDA.value,
            titulo=f"Processo {processo.numero_processo} chegou até você",
            mensagem=f'Etapa atual: "{proxima_etapa.nome}".',
            entidade_tipo="processo",
            entidade_id=processo.id,
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.AVANCAR_ETAPA,
        usuario=usuario,
        entidade_tipo="processo",
        entidade_id=processo.id,
        entidade_descricao=f"Processo {processo.numero_processo}",
        organizacao_id=processo.organizacao_id,
        dados_antes={"etapa_id": str(etapa_atual.id), "etapa_nome": etapa_atual.nome},
        cliente=cliente,
    )
    await db.flush()
    return processo


async def devolver_etapa(
    db: AsyncSession,
    *,
    processo_id: uuid.UUID,
    transicao_id: uuid.UUID | None,
    justificativa: str,
    usuario: User,
    cliente: dict | None = None,
) -> ProcessoInstancia:
    if not justificativa or not justificativa.strip():
        raise AppError("Informe a justificativa da devolução.", 422, "justificativa_obrigatoria")

    processo = await _carregar_processo_travado(db, processo_id)
    if processo.status_geral != StatusGeralProcesso.EM_ANDAMENTO.value:
        raise AppError("Este processo não está em andamento.", 409, "processo_nao_em_andamento")

    linha_atual = await _etapa_atual_aberta(db, processo)
    transicao = await _transicao(db, linha_atual.etapa_id, TipoTransicao.DEVOLVER, transicao_id)
    if transicao.etapa_destino_id is None:
        raise AppError("Transição de devolução sem etapa de destino configurada.", 422, "transicao_invalida")

    agora = datetime.now(timezone.utc)
    etapa_atual = await db.get(WorkflowEtapa, linha_atual.etapa_id)
    linha_atual.encerrada_em = agora
    linha_atual.resultado = ResultadoEtapa.DEVOLVIDA.value
    linha_atual.justificativa = justificativa
    linha_atual.usuario_acao_id = usuario.id

    etapa_destino = await db.get(WorkflowEtapa, transicao.etapa_destino_id)
    setor_resp, usuario_resp = await _resolver_responsavel(db, processo, etapa_destino)
    nova_linha = ProcessoHistoricoEtapa(
        processo_id=processo.id,
        etapa_id=etapa_destino.id,
        ordem_execucao=linha_atual.ordem_execucao + 1,
        responsavel_setor_id=setor_resp,
        responsavel_usuario_id=usuario_resp,
        iniciada_em=agora,
        resultado=ResultadoEtapa.EM_ANDAMENTO.value,
    )
    db.add(nova_linha)
    processo.etapa_atual_id = etapa_destino.id
    processo.etapa_atual_iniciada_em = agora
    processo.etapa_atual_responsavel_setor_id = setor_resp
    processo.etapa_atual_responsavel_usuario_id = usuario_resp

    await notificacoes.notificar_usuario(
        db,
        organizacao_id=processo.organizacao_id,
        usuario_id=usuario_resp,
        setor_id=setor_resp,
        tipo=TipoNotificacao.DEVOLUCAO.value,
        titulo=f'Processo {processo.numero_processo} devolvido para "{etapa_destino.nome}"',
        mensagem=justificativa,
        entidade_tipo="processo",
        entidade_id=processo.id,
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.DEVOLVER_ETAPA,
        usuario=usuario,
        entidade_tipo="processo",
        entidade_id=processo.id,
        entidade_descricao=f"Processo {processo.numero_processo} — de {etapa_atual.nome} para {etapa_destino.nome}",
        organizacao_id=processo.organizacao_id,
        justificativa=justificativa,
        cliente=cliente,
    )
    await db.flush()
    return processo


async def cancelar_processo(
    db: AsyncSession, *, processo_id: uuid.UUID, justificativa: str, usuario: User, cliente: dict | None = None
) -> ProcessoInstancia:
    if not justificativa or not justificativa.strip():
        raise AppError("Informe o motivo do cancelamento.", 422, "justificativa_obrigatoria")

    processo = await _carregar_processo_travado(db, processo_id)
    if processo.status_geral != StatusGeralProcesso.EM_ANDAMENTO.value:
        raise AppError("Este processo não está em andamento.", 409, "processo_nao_em_andamento")

    linha_atual = await _etapa_atual_aberta(db, processo)
    etapa_atual = await db.get(WorkflowEtapa, linha_atual.etapa_id)
    if not etapa_atual.cancelavel:
        raise AppError("Esta etapa não permite cancelamento do processo.", 422, "etapa_nao_cancelavel")

    agora = datetime.now(timezone.utc)
    linha_atual.encerrada_em = agora
    linha_atual.resultado = ResultadoEtapa.CANCELADA.value
    linha_atual.justificativa = justificativa
    linha_atual.usuario_acao_id = usuario.id

    processo.status_geral = StatusGeralProcesso.CANCELADO.value

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CANCELAR_PROCESSO,
        usuario=usuario,
        entidade_tipo="processo",
        entidade_id=processo.id,
        entidade_descricao=f"Processo {processo.numero_processo}",
        organizacao_id=processo.organizacao_id,
        justificativa=justificativa,
        cliente=cliente,
    )
    await db.flush()
    return processo


async def marcar_requisito_manual(
    db: AsyncSession, *, requisito_id: uuid.UUID, usuario: User
) -> WorkflowEtapaRequisito:
    """Marca um requisito `MANUAL_CHECK` como cumprido (seção 109 — checklist
    de pendências)."""
    requisito = await db.get(WorkflowEtapaRequisito, requisito_id)
    if requisito is None:
        raise AppError("Requisito não encontrado.", 404, "nao_encontrado")
    if requisito.tipo != "manual_check":
        raise AppError("Este requisito é verificado automaticamente pelo sistema.", 422, "requisito_automatico")
    requisito.satisfeito_manual_em = datetime.now(timezone.utc)
    requisito.satisfeito_manual_por_id = usuario.id
    await db.flush()
    return requisito


async def reabrir_processo(
    db: AsyncSession, *, processo_id: uuid.UUID, usuario: User, cliente: dict | None = None
) -> ProcessoInstancia:
    """Reabertura (seção 111) — restrita a administrador na camada de rota."""
    processo = await _carregar_processo_travado(db, processo_id)
    if processo.status_geral not in {StatusGeralProcesso.CANCELADO.value, StatusGeralProcesso.SUSPENSO.value}:
        raise AppError("Só é possível reabrir processos cancelados ou suspensos.", 409, "nao_pode_reabrir")

    ultima_linha = await db.scalar(
        select(ProcessoHistoricoEtapa)
        .where(ProcessoHistoricoEtapa.processo_id == processo.id)
        .order_by(ProcessoHistoricoEtapa.iniciada_em.desc())
        .limit(1)
    )
    agora = datetime.now(timezone.utc)
    nova_linha = ProcessoHistoricoEtapa(
        processo_id=processo.id,
        etapa_id=ultima_linha.etapa_id,
        ordem_execucao=ultima_linha.ordem_execucao + 1,
        responsavel_setor_id=ultima_linha.responsavel_setor_id,
        responsavel_usuario_id=ultima_linha.responsavel_usuario_id,
        iniciada_em=agora,
        resultado=ResultadoEtapa.EM_ANDAMENTO.value,
    )
    db.add(nova_linha)
    processo.status_geral = StatusGeralProcesso.EM_ANDAMENTO.value
    processo.etapa_atual_iniciada_em = agora

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.REABRIR_PROCESSO,
        usuario=usuario,
        entidade_tipo="processo",
        entidade_id=processo.id,
        entidade_descricao=f"Processo {processo.numero_processo}",
        organizacao_id=processo.organizacao_id,
        cliente=cliente,
    )
    await db.flush()
    return processo
