import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.tarefa import Tarefa
from app.models.diligencia import Diligencia
from app.models.contrato import Contrato
from app.models.obra import Obra
from app.models.prestacao_contas import PrestacaoContas
from app.models.evento_timeline import EventoTimeline
from app.models.user import User

router = APIRouter(prefix="/alertas", tags=["alertas"])


def _calc_risco(processo, tarefas_atrasadas, diligencias_abertas, obras_atrasadas, prestacoes_pendentes, sem_movimentacao_dias):
    """Calcula um índice de risco simples e transparente (mostra os motivos)."""
    score = 0
    motivos = []

    if tarefas_atrasadas > 0:
        score += 2
        motivos.append(f"{tarefas_atrasadas} tarefa(s) atrasada(s)")
    if diligencias_abertas > 0:
        score += 2
        motivos.append(f"{diligencias_abertas} diligência(s) em aberto")
    if obras_atrasadas > 0:
        score += 2
        motivos.append(f"{obras_atrasadas} obra(s) atrasada(s)")
    if prestacoes_pendentes > 0:
        score += 1
        motivos.append(f"{prestacoes_pendentes} prestação(ões) pendente(s)")

    if processo.vigencia_fim:
        dias_vig = (processo.vigencia_fim - datetime.now(timezone.utc)).days
        if dias_vig <= 30:
            score += 2
            motivos.append(f"instrumento vence em {dias_vig} dias")
        elif dias_vig <= 90:
            score += 1
            motivos.append(f"instrumento vence em {dias_vig} dias")

    if sem_movimentacao_dias >= 10:
        score += 1
        motivos.append(f"{sem_movimentacao_dias} dias sem movimentação")

    if score <= 1:
        nivel = "Baixo"
    elif score <= 3:
        nivel = "Médio"
    elif score <= 5:
        nivel = "Alto"
    else:
        nivel = "Crítico"

    return {"nivel": nivel, "score": score, "motivos": motivos}


@router.get("")
async def listar_alertas(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    org = user.organization_id

    # Alertas de tarefas atrasadas
    tarefas_atrasadas = (await db.execute(
        select(Tarefa).options(selectinload(Tarefa.convenio)).where(
            Tarefa.convenio.has(Convenio.organization_id == org),
            Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]),
            Tarefa.prazo < now,
            Tarefa.deleted_at.is_(None),
        ).order_by(Tarefa.prazo)
    )).scalars().all()

    # Alertas de diligências abertas
    diligencias = (await db.execute(
        select(Diligencia).options(selectinload(Diligencia.convenio)).where(
            Diligencia.convenio.has(Convenio.organization_id == org),
            Diligencia.status.in_(["RECEBIDA", "DISTRIBUIDA", "EM_ATENDIMENTO", "RESPONDIDA_INTERNAMENTE", "PROTOCOLADA"]),
            Diligencia.deleted_at.is_(None),
        )
    )).scalars().all()

    # Alertas de prestações pendentes
    prestacoes = (await db.execute(
        select(PrestacaoContas).options(selectinload(PrestacaoContas.convenio)).where(
            PrestacaoContas.convenio.has(Convenio.organization_id == org),
            PrestacaoContas.status.in_(["EM_PREPARACAO", "PRONTA", "ENVIADA", "EM_ANALISE", "EM_DILIGENCIA"]),
            PrestacaoContas.deleted_at.is_(None),
        )
    )).scalars().all()

    # Contratos perto do vencimento
    contratos = (await db.execute(
        select(Contrato).options(selectinload(Contrato.convenio)).where(
            Contrato.convenio.has(Convenio.organization_id == org),
            Contrato.status.in_(["ASSINADO", "EM_VIGENCIA"]),
            Contrato.vigencia_fim.isnot(None),
            Contrato.deleted_at.is_(None),
        )
    )).scalars().all()

    # Processos sem movimentação
    processos = (await db.execute(
        select(Convenio).where(
            Convenio.organization_id == org,
            Convenio.status.in_(["EM_ANDAMENTO", "RASCUNHO"]),
            Convenio.deleted_at.is_(None),
        )
    )).scalars().all()

    alertas = []

    # Categoria: Tarefas
    for t in tarefas_atrasadas:
        dias = (now - t.prazo).days
        alertas.append({
            "categoria": "TAREFAS", "severidade": "ALTA", "titulo": f"Tarefa atrasada: {t.titulo}",
            "descricao": f"Atrasada há {dias} dia(s). Prazo era {t.prazo.strftime('%d/%m/%Y')}.",
            "processo_id": str(t.convenio_id), "processo": t.convenio.titulo if t.convenio else None,
            "link": f"/tarefas/{t.id}",
        })

    # Categoria: Diligências
    for d in diligencias:
        dias = (now - (d.data_recebimento or d.created_at)).days
        alertas.append({
            "categoria": "DILIGENCIAS", "severidade": "MEDIA", "titulo": "Diligência pendente",
            "descricao": f"{d.descricao[:120]}. Em aberto há {dias} dia(s).",
            "processo_id": str(d.convenio_id), "processo": d.convenio.titulo if d.convenio else None,
            "link": None,
        })

    # Categoria: Prestações
    for p in prestacoes:
        alertas.append({
            "categoria": "PRESTACAO", "severidade": "MEDIA", "titulo": "Prestação de contas pendente",
            "descricao": f"Status: {p.status}. {p.percentual_preparacao}% preparada.",
            "processo_id": str(p.convenio_id), "processo": p.convenio.titulo if p.convenio else None,
            "link": None,
        })

    # Categoria: Contratos
    for c in contratos:
        if c.vigencia_fim:
            dias = (c.vigencia_fim - now).days
            if dias <= 30:
                alertas.append({
                    "categoria": "CONTRATOS", "severidade": "ALTA", "titulo": f"Contrato vence em {dias} dias",
                    "descricao": f"Contrato {c.numero or ''} do processo vence em {dias} dia(s).",
                    "processo_id": str(c.convenio_id), "processo": c.convenio.titulo if c.convenio else None,
                    "link": None,
                })

    # Índice de risco por processo
    riscos = []
    for p in processos:
        ultimo_evento = (await db.execute(
            select(EventoTimeline).where(
                EventoTimeline.convenio_id == p.id,
            ).order_by(EventoTimeline.ocorrido_em.desc()).limit(1)
        )).scalar_one_or_none()

        sem_mov_dias = 999
        if ultimo_evento:
            sem_mov_dias = (now - ultimo_evento.ocorrido_em).days

        t_atrasadas = sum(1 for t in tarefas_atrasadas if t.convenio_id == p.id)
        d_abertas = sum(1 for d in diligencias if d.convenio_id == p.id)
        p_pend = sum(1 for p2 in prestacoes if p2.convenio_id == p.id)

        risco = _calc_risco(p, t_atrasadas, d_abertas, 0, p_pend, sem_mov_dias)
        riscos.append({
            "processo_id": str(p.id), "processo": p.titulo,
            "nivel": risco["nivel"], "score": risco["score"], "motivos": risco["motivos"],
            "sem_movimentacao_dias": sem_mov_dias if sem_mov_dias < 999 else None,
            "link": f"/convenios/{p.id}",
        })

    riscos.sort(key=lambda r: r["score"], reverse=True)

    return {"alertas": alertas, "riscos": riscos}
