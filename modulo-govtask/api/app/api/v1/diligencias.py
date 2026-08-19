import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.diligencia import Diligencia
from app.models.enums import StatusDiligencia, TipoEvento
from app.models.setor import Setor
from app.models.user import User
from app.schemas.diligencia import (
    DiligenciaCreate,
    DiligenciaListItem,
    DiligenciaOut,
    DiligenciaProtocolar,
    DiligenciaResponder,
    DiligenciaUpdate,
)
from app.services.auditoria import registrar_auditoria
from app.services.notifications import (
    notificar_diligencia_recebida,
    notificar_diligencia_respondida,
)
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/diligencias", tags=["diligencias"])


async def _get_diligencia(db, diligencia_id, user, *, include_convenio=False):
    query = (
        select(Diligencia)
        .join(Convenio, Convenio.id == Diligencia.convenio_id)
        .where(
            Diligencia.id == diligencia_id,
            Convenio.organization_id == user.organization_id,
            Diligencia.deleted_at.is_(None),
        )
    )
    if include_convenio:
        query = query.options(selectinload(Diligencia.convenio))
    result = await db.execute(query)
    return result.scalar_one_or_none()


@router.post("/convenios/{convenio_id}", response_model=DiligenciaOut, status_code=201)
async def criar_diligencia(
    request: Request,
    convenio_id: uuid.UUID,
    body: DiligenciaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    if body.setor_destino_id:
        setor_result = await db.execute(
            select(Setor).where(
                Setor.id == body.setor_destino_id,
                Setor.deleted_at.is_(None),
            )
        )
        if not setor_result.scalar_one_or_none():
            raise HTTPException(status_code=422, detail="Setor de destino não encontrado")

    diligencias = Diligencia(
        convenio_id=convenio_id,
        origem=body.origem,
        origem_descricao=body.origem_descricao,
        data_recebimento=body.data_recebimento or datetime.now(timezone.utc),
        protocolo=body.protocolo,
        descricao=body.descricao,
        prazo=body.prazo,
        responsavel_id=body.responsavel_id,
        setor_destino_id=body.setor_destino_id,
        tarefa_id=body.tarefa_id,
        etapa_id=body.etapa_id,
        status=StatusDiligencia.RECEBIDA,
    )
    db.add(diligencias)
    await db.flush()

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.DILIGENCIA_RECEBIDA,
        ator_id=user.id,
        descricao=f"Diligência recebida: {body.descricao[:120]}",
        metadados={"diligencia_id": str(diligencias.id)},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="diligencia.criar",
        convenio_id=convenio_id,
        entidade="diligencia",
        entidade_id=diligencias.id,
        request=request,
    )

    # Notifica responsável/coordenador, se informado.
    destinatario = body.responsavel_id or convenio.responsavel_id
    if destinatario:
        await notificar_diligencia_recebida(
            db, convenio_id=convenio_id, destinatario_id=destinatario, descricao=body.descricao
        )

    await db.commit()
    result = await db.execute(
        select(Diligencia)
        .where(Diligencia.id == diligencias.id)
        .options(selectinload(Diligencia.convenio))
    )
    return result.scalar_one()


@router.get("/convenios/{convenio_id}", response_model=list[DiligenciaListItem])
async def listar_diligencias(
    request: Request,
    convenio_id: uuid.UUID,
    status: StatusDiligencia | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = (
        select(Diligencia)
        .join(Convenio, Convenio.id == Diligencia.convenio_id)
        .where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Diligencia.deleted_at.is_(None),
        )
    )
    if status:
        query = query.where(Diligencia.status == status)
    query = query.order_by(Diligencia.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{diligencia_id}", response_model=DiligenciaOut)
async def obter_diligencia(
    request: Request,
    diligencia_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    diligencias = await _get_diligencia(db, diligencia_id, user)
    if not diligencias:
        raise HTTPException(status_code=404, detail="Diligência não encontrada")
    return diligencias


@router.patch("/{diligencia_id}", response_model=DiligenciaOut)
async def atualizar_diligencia(
    request: Request,
    diligencia_id: uuid.UUID,
    body: DiligenciaUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    diligencias = await _get_diligencia(db, diligencia_id, user)
    if not diligencias:
        raise HTTPException(status_code=404, detail="Diligência não encontrada")

    if body.status is not None and body.status != diligencias.status:
        diligencias.status.assert_transition(body.status)
        diligencias.status = body.status
        if body.status == StatusDiligencia.ENCERRADA:
            diligencias.data_encerramento = datetime.now(timezone.utc)
            await registrar_evento(
                db,
                convenio_id=diligencias.convenio_id,
                tipo_evento=TipoEvento.DILIGENCIA_ENCERRADA,
                ator_id=user.id,
                descricao="Diligência encerrada",
                metadados={"diligencia_id": str(diligencias.id)},
            )
    if body.responsavel_id is not None:
        diligencias.responsavel_id = body.responsavel_id
    if body.setor_destino_id is not None:
        diligencias.setor_destino_id = body.setor_destino_id
    if body.prazo is not None:
        diligencias.prazo = body.prazo
    if body.protocolo is not None:
        diligencias.protocolo = body.protocolo

    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="diligencia.atualizar",
        convenio_id=diligencias.convenio_id,
        entidade="diligencia",
        entidade_id=diligencias.id,
        request=request,
    )
    await db.commit()
    await db.refresh(diligencias)
    return diligencias


@router.post("/{diligencia_id}/responder", response_model=DiligenciaOut)
async def responder_diligencia(
    request: Request,
    diligencia_id: uuid.UUID,
    body: DiligenciaResponder,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    diligencias = await _get_diligencia(db, diligencia_id, user, include_convenio=True)
    if not diligencias:
        raise HTTPException(status_code=404, detail="Diligência não encontrada")

    diligencias.resposta_interna = body.resposta_interna
    diligencias.resposta_data = datetime.now(timezone.utc)
    diligencias.resposta_protocolo = body.resposta_protocolo
    diligencias.status = StatusDiligencia.RESPONDIDA_INTERNAMENTE

    await registrar_evento(
        db,
        convenio_id=diligencias.convenio_id,
        tipo_evento=TipoEvento.DILIGENCIA_RESPONDIDA,
        ator_id=user.id,
        descricao="Diligência respondida internamente",
        metadados={"diligencia_id": str(diligencias.id)},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="diligencia.responder",
        convenio_id=diligencias.convenio_id,
        entidade="diligencia",
        entidade_id=diligencias.id,
        request=request,
    )
    if diligencias.convenio:
        await notificar_diligencia_respondida(
            db,
            convenio_id=diligencias.convenio_id,
            destinatario_id=diligencias.convenio.responsavel_id,
            descricao=diligencias.descricao,
        )

    await db.commit()
    await db.refresh(diligencias)
    return diligencias


@router.post("/{diligencia_id}/protocolar", response_model=DiligenciaOut)
async def protocolar_resposta(
    request: Request,
    diligencia_id: uuid.UUID,
    body: DiligenciaProtocolar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    diligencias = await _get_diligencia(db, diligencia_id, user, include_convenio=True)
    if not diligencias:
        raise HTTPException(status_code=404, detail="Diligência não encontrada")

    diligencias.resposta_protocolo = body.resposta_protocolo
    diligencias.status = StatusDiligencia.PROTOCOLADA
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="diligencia.protocolar",
        convenio_id=diligencias.convenio_id,
        entidade="diligencia",
        entidade_id=diligencias.id,
        request=request,
    )
    await db.commit()
    await db.refresh(diligencias)
    return diligencias


@router.delete("/{diligencia_id}", status_code=204)
async def excluir_diligencia(
    request: Request,
    diligencia_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    diligencias = await _get_diligencia(db, diligencia_id, user)
    if not diligencias:
        raise HTTPException(status_code=404, detail="Diligência não encontrada")
    diligencias.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
