import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.enums import TipoNotificacao
from app.models.notificacao import Notificacao
from app.models.notificacao_envio import NotificacaoEnvio
from app.models.notificacao_preferencia import NotificacaoPreferencia
from app.models.user import User
from app.schemas.notificacao import (
    NotificacaoOut,
    PreferenciaNotificacaoOut,
    PreferenciaNotificacaoUpdate,
)
from app.services import email, email_outbox
from app.services.notificacoes_canais import TIPOS_OBRIGATORIOS, obter_preferencia

router = APIRouter(tags=["notificacoes"])


@router.get("/notificacoes", response_model=list[NotificacaoOut])
async def listar_notificacoes(
    nao_lidas: bool = Query(False),
    tipo: TipoNotificacao | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(Notificacao)
        .where(Notificacao.destinatario_id == user.id)
    )
    if nao_lidas:
        query = query.where(Notificacao.lida.is_(False))
    if tipo:
        query = query.where(Notificacao.tipo == tipo)

    query = query.offset(skip).limit(limit).order_by(Notificacao.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/notificacoes/resumo")
async def resumo_notificacoes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Contagem exata para o sino, sem depender do limite da listagem."""
    total = (
        await db.execute(
            select(func.count())
            .select_from(Notificacao)
            .where(
                Notificacao.destinatario_id == user.id,
                Notificacao.lida.is_(False),
            )
        )
    ).scalar_one()
    return {"nao_lidas": total}


def _preferencia_out(pref: NotificacaoPreferencia | None) -> PreferenciaNotificacaoOut:
    return PreferenciaNotificacaoOut(
        email_ativo=bool(pref and pref.email_ativo),
        tipos_email=list(pref.tipos_email) if pref and pref.tipos_email else [],
        tipos_disponiveis=[t.value for t in TipoNotificacao],
        tipos_obrigatorios=sorted(t.value for t in TIPOS_OBRIGATORIOS),
        canal_configurado=email.configurado(),
    )


@router.get("/notificacoes/preferencias", response_model=PreferenciaNotificacaoOut)
async def obter_preferencias(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _preferencia_out(await obter_preferencia(db, user.id))


@router.put("/notificacoes/preferencias", response_model=PreferenciaNotificacaoOut)
async def atualizar_preferencias(
    payload: PreferenciaNotificacaoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    validos = {t.value for t in TipoNotificacao}
    invalidos = sorted(set(payload.tipos_email) - validos)
    if invalidos:
        raise HTTPException(
            status_code=422, detail=f"Tipos de notificação desconhecidos: {invalidos}"
        )

    pref = await obter_preferencia(db, user.id)
    if pref is None:
        pref = NotificacaoPreferencia(user_id=user.id)
        db.add(pref)
    pref.email_ativo = payload.email_ativo
    pref.tipos_email = sorted(set(payload.tipos_email))
    await db.commit()
    return _preferencia_out(pref)


@router.get("/notificacoes/envios")
async def listar_envios(
    status_envio: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    """Diagnóstico da outbox de e-mail (§41, §126): o que saiu, o que falhou."""
    query = (
        select(NotificacaoEnvio)
        .where(NotificacaoEnvio.organization_id == user.organization_id)
        .order_by(NotificacaoEnvio.created_at.desc())
        .limit(limit)
    )
    if status_envio:
        query = query.where(NotificacaoEnvio.status == status_envio)
    registros = (await db.execute(query)).scalars().all()
    return [
        {
            "id": str(e.id),
            "notificacao_id": str(e.notificacao_id),
            "destinatario": e.destinatario,
            "assunto": e.assunto,
            "status": e.status,
            "tentativas": e.tentativas,
            "ultimo_erro": e.ultimo_erro,
            "agendado_para": e.agendado_para,
            "enviado_em": e.enviado_em,
            "created_at": e.created_at,
        }
        for e in registros
    ]


@router.post("/notificacoes/envios/processar")
async def processar_envios(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    """Dispara a outbox sob demanda, para não esperar o ciclo do scheduler."""
    return await email_outbox.processar_pendentes(db)


@router.post("/notificacoes/{notificacao_id}/marcar-lida")
async def marcar_lida(
    notificacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notificacao).where(
            Notificacao.id == notificacao_id,
            Notificacao.destinatario_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notificação não encontrada")

    notif.lida = True
    notif.lida_em = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/notificacoes/marcar-todas-lidas")
async def marcar_todas_lidas(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notificacao)
        .where(
            Notificacao.destinatario_id == user.id,
            Notificacao.lida.is_(False),
        )
        .values(lida=True, lida_em=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"ok": True}
