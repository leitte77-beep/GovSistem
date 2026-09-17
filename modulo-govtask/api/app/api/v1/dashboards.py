"""Painéis operacionais da entidade Demanda, por perfil (§8–11, §156–158)."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.alerta import Alerta
from app.models.demanda import Demanda
from app.models.enums import StatusTarefa
from app.models.tarefa import Tarefa
from app.models.user import User

router = APIRouter(prefix="/dashboards", tags=["Dashboards"])
PERFIS = {"prefeito", "assessor", "secretario", "departamento"}


def _demanda(item: Demanda) -> dict:
    return {
        "id": str(item.id), "numero": item.numero, "titulo": item.titulo,
        "prazo": item.prazo_final.isoformat() if item.prazo_final else None,
        "progresso": item.progresso, "atrasada": item.atrasada,
        "setor": item.setor_atual.nome if item.setor_atual else None,
        "status": item.status.rotulo if item.status else "Sem situação",
        "valor": float(item.valor_aprovado or item.valor_previsto or 0),
        "concluida_em": item.concluida_em.isoformat() if item.concluida_em else None,
    }


@router.get("/{perfil}")
async def obter_dashboard(
    perfil: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    if perfil not in PERFIS:
        raise HTTPException(404, "Perfil de dashboard inválido")
    agora, semana = datetime.now(timezone.utc), datetime.now(timezone.utc) + timedelta(days=7)
    demandas = (await db.execute(
        select(Demanda).where(
            Demanda.organization_id == user.organization_id,
            Demanda.deleted_at.is_(None),
        ).options(
            selectinload(Demanda.status), selectinload(Demanda.setor_atual),
        ).order_by(Demanda.ultima_movimentacao_em.desc())
    )).scalars().all()
    abertas = [d for d in demandas if not d.encerrada and not d.is_rascunho]
    concluidas = [d for d in demandas if d.concluida_em]
    tarefas = (await db.execute(
        select(Tarefa).join(Demanda, Tarefa.demanda_id == Demanda.id).where(
            Demanda.organization_id == user.organization_id,
            Demanda.deleted_at.is_(None), Tarefa.deleted_at.is_(None),
        ).options(selectinload(Tarefa.demanda), selectinload(Tarefa.setor_destino))
    )).scalars().all()
    abertas_tarefa = [t for t in tarefas if StatusTarefa.is_aberta(StatusTarefa(t.status))]
    minhas = [t for t in abertas_tarefa if t.atribuida_a_id == user.id]
    alertas = (await db.execute(select(Alerta).where(
        Alerta.organization_id == user.organization_id, Alerta.resolvido_em.is_(None),
    ).order_by(Alerta.created_at.desc()).limit(12))).scalars().all()
    aguardando_externo = [d for d in abertas if d.status and d.status.is_aguardando_externo]
    vencendo = [d for d in abertas if d.prazo_final and agora <= d.prazo_final <= semana]
    sem_movimento = [d for d in abertas if d.dias_sem_movimentacao >= 7]
    atrasadas = [d for d in abertas if d.atrasada]
    por_setor: dict[str, int] = {}
    for demanda in abertas:
        nome = demanda.setor_atual.nome if demanda.setor_atual else "Sem setor"
        por_setor[nome] = por_setor.get(nome, 0) + 1

    foco = abertas
    if perfil == "assessor":
        foco = [d for d in abertas if d.responsavel_geral_id == user.id] or abertas
    elif perfil == "departamento":
        foco = [t.demanda for t in minhas if t.demanda] or abertas
    elif perfil == "secretario":
        setores = {d.setor_atual_id for d in abertas if d.setor_atual_id}
        foco = [d for d in abertas if d.setor_atual_id in setores]

    atencao = [
        {"id": str(a.demanda_id or a.tarefa_id or a.id), "titulo": a.titulo,
         "detalhe": a.detalhe, "severidade": a.severidade,
         "demanda_id": str(a.demanda_id) if a.demanda_id else None}
        for a in alertas
    ]
    fila_tarefas = [{
        "id": str(t.id), "titulo": t.titulo, "demanda": t.demanda.titulo if t.demanda else None,
        "demanda_id": str(t.demanda_id) if t.demanda_id else None,
        "prazo": t.prazo.isoformat() if t.prazo else None, "status": t.status,
        "setor": t.setor_destino.nome if t.setor_destino else None,
    } for t in sorted(minhas, key=lambda t: (t.prazo is None, t.prazo))[:12]]
    return {
        "perfil": perfil,
        "gerado_em": agora.isoformat(),
        "metricas": {
            "abertas": len(abertas), "em_andamento": len(abertas), "atrasadas": len(atrasadas),
            "vencendo": len(vencendo), "aguardando_terceiros": len(aguardando_externo),
            "sem_movimentacao": len(sem_movimento), "minha_acao": len(minhas),
            "concluidas_mes": len([d for d in concluidas if d.concluida_em and d.concluida_em.month == agora.month]),
            "concluidas_ano": len([d for d in concluidas if d.concluida_em and d.concluida_em.year == agora.year]),
            "recursos_andamento": sum(float(d.valor_aprovado or d.valor_previsto or 0) for d in abertas),
        },
        "atencao": atencao,
        "demandas": [_demanda(d) for d in foco[:12]],
        "conquistas": [_demanda(d) for d in sorted(concluidas, key=lambda d: d.concluida_em or agora, reverse=True)[:8]],
        "por_setor": [{"nome": nome, "total": total} for nome, total in sorted(por_setor.items(), key=lambda x: x[1], reverse=True)[:8]],
        "tarefas": fila_tarefas,
    }
