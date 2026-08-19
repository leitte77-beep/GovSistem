"""Dashboard endpoint — role-aware metrics and action items."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.convenio import Convenio
from app.models.tarefa import Tarefa
from app.models.etapa import Etapa
from app.models.contestacao import Contestacao
from app.models.notificacao import Notificacao
from app.models.evento_timeline import EventoTimeline
from app.models.user_role import UserRole
from app.models.role import Role
from app.models.diligencia import Diligencia
from app.models.obra import Obra
from app.models.repasse import Repasse
from app.models.movimento_financeiro import MovimentoFinanceiro
from app.models.prestacao_contas import PrestacaoContas

from app.services.notifications import verificar_prazos


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def user_has_role(user: User, role_name: str) -> bool:
    return any(ur.role.name == role_name for ur in (user.user_roles or []) if ur.role)


@router.get("")
async def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    week_from_now = now + timedelta(days=7)
    tenant_id = current_user.organization_id
    tenant_task = Tarefa.convenio.has(Convenio.organization_id == tenant_id)
    tenant_stage = Etapa.convenio.has(Convenio.organization_id == tenant_id)
    tenant_contestation = Contestacao.tarefa.has(
        Tarefa.convenio.has(Convenio.organization_id == tenant_id)
    )
    tenant_event = EventoTimeline.convenio.has(Convenio.organization_id == tenant_id)

    # Verifica prazos e gera notificações
    try:
        await verificar_prazos(db, current_user.organization_id)
    except Exception:
        pass

    is_assessor = user_has_role(current_user, "ASSESSOR") or user_has_role(current_user, "ADMIN")
    is_engenheiro = user_has_role(current_user, "ENGENHEIRO_TECNICO")
    is_gestor = user_has_role(current_user, "GESTOR") and not is_assessor

    base = {
        "convenios_ativos": 0, "tarefas_abertas": 0, "tarefas_atrasadas": 0,
        "contestacoes_pendentes": 0, "aguardando_governo": 0,
        "tarefas_atribuidas": 0, "tarefas_entregues": 0,
        "prazos_proximos": [], "atividade_recente": [],
        "convenios_por_etapa": [], "acoes_necessarias": [],
        "valor_aprovado": 0, "valor_captado": 0, "valor_executado": 0,
        "obras_em_andamento": 0, "diligencias_abertas": 0,
        "prestacoes_pendentes": 0, "processos_por_situacao": [],
    }

    if is_assessor:
        # Convênios ativos
        base["convenios_ativos"] = (await db.execute(
            select(func.count(Convenio.id)).where(
                Convenio.organization_id == tenant_id,
                Convenio.status.in_(["EM_ANDAMENTO", "RASCUNHO"]),
                Convenio.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Tarefas em aberto (não concluídas nem canceladas)
        base["tarefas_abertas"] = (await db.execute(
            select(func.count(Tarefa.id)).where(
                tenant_task,
                Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "ENTREGUE", "DEVOLVIDA", "CONTESTADA"]),
                Tarefa.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Tarefas atrasadas (prazo < now, status aberto)
        base["tarefas_atrasadas"] = (await db.execute(
            select(func.count(Tarefa.id)).where(
                tenant_task,
                Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]),
                Tarefa.prazo < now,
                Tarefa.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Contestações pendentes
        base["contestacoes_pendentes"] = (await db.execute(
            select(func.count(Contestacao.id)).where(
                tenant_contestation,
                Contestacao.status == "PENDENTE",
                Contestacao.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Aguardando governo
        base["aguardando_governo"] = (await db.execute(
            select(func.count(Etapa.id)).where(
                tenant_stage,
                Etapa.status == "AGUARDANDO_GOVERNO",
                Etapa.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Prazos próximos (7 dias): tarefas e etapas
        tarefas_proximas = (await db.execute(
            select(Tarefa).options(
                selectinload(Tarefa.convenio), selectinload(Tarefa.atribuida_a)
            ).where(
                tenant_task,
                Tarefa.status.in_(["EM_ANDAMENTO", "AGUARDANDO_ACEITE"]),
                Tarefa.prazo.between(now, week_from_now),
                Tarefa.deleted_at.is_(None),
            ).order_by(Tarefa.prazo).limit(10)
        )).scalars().all()
        for t in tarefas_proximas:
            base["prazos_proximos"].append({
                "item": t.titulo,
                "prazo": t.prazo.isoformat() if t.prazo else None,
                "link": f"/tarefas/{t.id}",
            })

        # Convênios por status
        status_counts = (await db.execute(
            select(Convenio.status, func.count(Convenio.id)).where(
                Convenio.organization_id == tenant_id,
                Convenio.deleted_at.is_(None),
            ).group_by(Convenio.status)
        )).all()
        status_labels = {"RASCUNHO": "Rascunho", "EM_ANDAMENTO": "Em Andamento", "SUSPENSO": "Suspenso",
                         "CONCLUIDO": "Concluído", "CANCELADO": "Cancelado"}
        base["convenios_por_etapa"] = [{"nome": status_labels.get(s, s), "count": c} for s, c in status_counts]

        # Ações necessárias
        acoes = []
        # Tarefas entregues aguardando revisão
        tarefas_entregues = (await db.execute(
            select(Tarefa).options(selectinload(Tarefa.convenio)).where(
                tenant_task,
                Tarefa.status == "ENTREGUE", Tarefa.deleted_at.is_(None),
            ).limit(5)
        )).scalars().all()
        for t in tarefas_entregues:
            acoes.append({"tipo": "tarefa_entregue", "item": t.titulo, "descricao": f"Aguardando revisão", "link": f"/tarefas/{t.id}"})

        # Contestações pendentes
        conts = (await db.execute(
            select(Contestacao).options(selectinload(Contestacao.tarefa)).where(
                tenant_contestation,
                Contestacao.status == "PENDENTE", Contestacao.deleted_at.is_(None),
            ).limit(5)
        )).scalars().all()
        for c in conts:
            acoes.append({"tipo": "contestacao", "item": f"Contestação: {c.tarefa.titulo if c.tarefa else 'Tarefa'}", "descricao": c.motivo, "link": f"/contestacoes/{c.id}"})

        base["acoes_necessarias"] = acoes

        # Atividade recente
        eventos = (await db.execute(
            select(EventoTimeline).where(tenant_event).order_by(EventoTimeline.ocorrido_em.desc()).limit(10)
        )).scalars().all()
        base["atividade_recente"] = [{"descricao": e.descricao, "time": e.ocorrido_em.isoformat()} for e in eventos]

    elif is_engenheiro:
        base["tarefas_atribuidas"] = (await db.execute(
            select(func.count(Tarefa.id)).where(
                tenant_task,
                Tarefa.atribuida_a_id == current_user.id,
                Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]),
                Tarefa.deleted_at.is_(None),
            )
        )).scalar() or 0

        base["tarefas_atrasadas"] = (await db.execute(
            select(func.count(Tarefa.id)).where(
                tenant_task,
                Tarefa.atribuida_a_id == current_user.id,
                Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]),
                Tarefa.prazo < now,
                Tarefa.deleted_at.is_(None),
            )
        )).scalar() or 0

        base["tarefas_entregues"] = (await db.execute(
            select(func.count(Tarefa.id)).where(
                tenant_task,
                Tarefa.atribuida_a_id == current_user.id,
                Tarefa.status == "ENTREGUE",
                Tarefa.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Minhas tarefas por prazo
        minhas = (await db.execute(
            select(Tarefa).options(selectinload(Tarefa.convenio)).where(
                tenant_task,
                Tarefa.atribuida_a_id == current_user.id,
                Tarefa.status.in_(["EM_ANDAMENTO", "AGUARDANDO_ACEITE"]),
                Tarefa.deleted_at.is_(None),
            ).order_by(Tarefa.prazo.asc().nullslast()).limit(10)
        )).scalars().all()
        base["prazos_proximos"] = [{"item": t.titulo, "prazo": t.prazo.isoformat() if t.prazo else None, "link": f"/tarefas/{t.id}"} for t in minhas]

    elif is_gestor:
        base["convenios_ativos"] = (await db.execute(
            select(func.count(Convenio.id)).where(
                Convenio.organization_id == tenant_id,
                Convenio.status.in_(["EM_ANDAMENTO", "RASCUNHO"]),
                Convenio.deleted_at.is_(None),
            )
        )).scalar() or 0

        base["tarefas_atrasadas"] = (await db.execute(
            select(func.count(Tarefa.id)).where(
                tenant_task,
                Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]),
                Tarefa.prazo < now,
                Tarefa.deleted_at.is_(None),
            )
        )).scalar() or 0

        status_counts = (await db.execute(
            select(Convenio.status, func.count(Convenio.id)).where(
                Convenio.organization_id == tenant_id,
                Convenio.deleted_at.is_(None),
            ).group_by(Convenio.status)
        )).all()
        status_labels = {"RASCUNHO": "Rascunho", "EM_ANDAMENTO": "Em Andamento", "SUSPENSO": "Suspenso",
                         "CONCLUIDO": "Concluído", "CANCELADO": "Cancelado"}
        base["convenios_por_etapa"] = [{"nome": status_labels.get(s, s), "count": c} for s, c in status_counts]

        base["aguardando_governo"] = (await db.execute(
            select(func.count(Etapa.id)).where(tenant_stage, Etapa.status == "AGUARDANDO_GOVERNO", Etapa.deleted_at.is_(None))
        )).scalar() or 0

    # Métricas executivas (assessor/admin e gestor)
    if is_assessor or is_gestor:
        convenios_all = (await db.execute(
            select(Convenio).where(
                Convenio.organization_id == tenant_id,
                Convenio.deleted_at.is_(None),
                Convenio.status != "CANCELADO",
            )
        )).scalars().all()
        base["valor_aprovado"] = float(sum(c.valor_aprovado or c.valor or 0 for c in convenios_all))
        base["valor_captado"] = float(sum(c.valor_repasse or 0 for c in convenios_all))

        # Valor executado = soma dos pagamentos
        executado = (await db.execute(
            select(func.coalesce(func.sum(MovimentoFinanceiro.valor), 0)).where(
                MovimentoFinanceiro.convenio.has(Convenio.organization_id == tenant_id),
                MovimentoFinanceiro.tipo == "PAGAMENTO",
                MovimentoFinanceiro.deleted_at.is_(None),
            )
        )).scalar() or 0
        base["valor_executado"] = float(executado)

        # Obras em andamento
        base["obras_em_andamento"] = (await db.execute(
            select(func.count(Obra.id)).where(
                Obra.convenio.has(Convenio.organization_id == tenant_id),
                Obra.deleted_at.is_(None),
                or_(Obra.percentual_fisico.is_(None), Obra.percentual_fisico < 100),
            )
        )).scalar() or 0

        # Diligências abertas
        base["diligencias_abertas"] = (await db.execute(
            select(func.count(Diligencia.id)).where(
                Diligencia.convenio.has(Convenio.organization_id == tenant_id),
                Diligencia.status.in_(["RECEBIDA", "DISTRIBUIDA", "EM_ATENDIMENTO", "RESPONDIDA_INTERNAMENTE", "PROTOCOLADA"]),
                Diligencia.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Prestações pendentes
        base["prestacoes_pendentes"] = (await db.execute(
            select(func.count(PrestacaoContas.id)).where(
                PrestacaoContas.convenio.has(Convenio.organization_id == tenant_id),
                PrestacaoContas.status.in_(["EM_PREPARACAO", "PRONTA", "ENVIADA", "EM_ANALISE", "EM_DILIGENCIA"]),
                PrestacaoContas.deleted_at.is_(None),
            )
        )).scalar() or 0

        # Processos por situação
        situ_counts = (await db.execute(
            select(Convenio.situacao, func.count(Convenio.id)).where(
                Convenio.organization_id == tenant_id,
                Convenio.deleted_at.is_(None),
            ).group_by(Convenio.situacao)
        )).all()
        base["processos_por_situacao"] = [{"nome": s or "SEM_SITUACAO", "count": c} for s, c in situ_counts]

    return base
