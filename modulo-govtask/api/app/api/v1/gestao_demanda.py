"""Follow-up, contatos, reuniões, recorrência e relatórios da Demanda."""

import csv
import io
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.demanda import Demanda
from app.models.registro_demanda import RegistroDemanda
from app.models.user import User
from app.services.demandas import get_demanda_ou_404

router = APIRouter(tags=["Gestão da demanda"])


class RegistroIn(BaseModel):
    tipo: str = Field(pattern="^(TELEFONE|REUNIAO|EMAIL|WHATSAPP|VISITA|OUTRO)$")
    ocorrido_em: datetime
    resumo: str = Field(min_length=3)
    contato: str | None = None
    proxima_acao: str | None = None
    proximo_followup: datetime | None = None
    participantes: list[str] | None = None
    decisoes: str | None = None


@router.get("/demandas/{demanda_id}/registros")
async def registros(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return (
        (
            await db.execute(
                select(RegistroDemanda)
                .where(RegistroDemanda.demanda_id == demanda.id)
                .order_by(RegistroDemanda.ocorrido_em.desc())
            )
        )
        .scalars()
        .all()
    )


@router.post("/demandas/{demanda_id}/registros", status_code=201)
async def criar_registro(
    demanda_id: uuid.UUID,
    payload: RegistroIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    r = RegistroDemanda(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        registrado_por_id=user.id,
        **payload.model_dump(),
    )
    db.add(r)
    if payload.proximo_followup:
        demanda.proximo_followup = payload.proximo_followup.date()
    await db.commit()
    await db.refresh(r)
    return r


@router.get("/relatorios/demandas/resumo")
async def resumo(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.EXPORT)),
):
    agora = datetime.now(timezone.utc)
    inicio = agora - timedelta(days=7)
    ds = (
        (
            await db.execute(
                select(Demanda)
                .where(
                    Demanda.organization_id == user.organization_id,
                    Demanda.deleted_at.is_(None),
                )
                .options(
                    selectinload(Demanda.setor_atual), selectinload(Demanda.categoria)
                )
            )
        )
        .scalars()
        .all()
    )
    abertas = [d for d in ds if not d.encerrada]
    concl = [d for d in ds if d.concluida_em]
    por_setor = {}
    heatmap = {}
    for d in abertas:
        s = d.setor_atual.nome if d.setor_atual else "Sem setor"
        por_setor[s] = por_setor.get(s, 0) + 1
        if d.prazo_final and d.prazo_final <= agora + timedelta(days=7):
            heatmap[s] = heatmap.get(s, 0) + 1
    return {
        "ativas": len(abertas),
        "novas_semana": sum(1 for d in ds if d.created_at >= inicio),
        "movimentadas_semana": sum(1 for d in ds if d.ultima_movimentacao_em >= inicio),
        "concluidas_semana": sum(1 for d in concl if d.concluida_em >= inicio),
        "atrasadas": sum(d.atrasada for d in abertas),
        "sem_movimentacao": sum(d.dias_sem_movimentacao >= 7 for d in abertas),
        "valor_andamento": float(
            sum(d.valor_aprovado or d.valor_previsto or 0 for d in abertas)
        ),
        "backlog_por_setor": por_setor,
        "heatmap_prazos": heatmap,
        "idade_media_dias": round(
            sum(d.dias_sem_movimentacao for d in abertas) / len(abertas), 1
        )
        if abertas
        else 0,
    }


@router.get("/relatorios/demandas/exportar.csv")
async def exportar(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.EXPORT)),
):
    ds = (
        (
            await db.execute(
                select(Demanda)
                .where(
                    Demanda.organization_id == user.organization_id,
                    Demanda.deleted_at.is_(None),
                )
                .options(
                    selectinload(Demanda.setor_atual), selectinload(Demanda.status)
                )
            )
        )
        .scalars()
        .all()
    )
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(
        ["Número", "Título", "Status", "Setor", "Prazo", "Progresso", "Atrasada"]
    )
    for d in ds:
        w.writerow(
            [
                d.numero,
                d.titulo,
                d.status.rotulo if d.status else "",
                d.setor_atual.nome if d.setor_atual else "",
                d.prazo_final.isoformat() if d.prazo_final else "",
                d.progresso,
                "Sim" if d.atrasada else "Não",
            ]
        )
    return StreamingResponse(
        iter([out.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=relatorio-demandas.csv"},
    )
