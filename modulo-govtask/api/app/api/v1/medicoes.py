import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.permissions import Perm
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.enums import StatusMedicao, TipoEvento
from app.models.medicao import Medicao
from app.models.user import User
from app.schemas.medicao import MedicaoCreate, MedicaoOut, MedicaoUpdate
from app.services.auditoria import registrar_auditoria
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/convenios/{convenio_id}/medicoes", tags=["medicoes"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_medicao(db, convenio_id, medicao_id, user):
    result = await db.execute(
        select(Medicao)
        .join(Convenio, Convenio.id == Medicao.convenio_id)
        .where(
            Medicao.id == medicao_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Medicao.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[MedicaoOut])
async def listar_medicoes(
    request: Request,
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(Medicao)
        .where(Medicao.convenio_id == convenio_id, Medicao.deleted_at.is_(None))
        .order_by(Medicao.numero)
    )
    return result.scalars().all()


@router.post("", response_model=MedicaoOut, status_code=201)
async def criar_medicao(
    request: Request,
    convenio_id: uuid.UUID,
    body: MedicaoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    medicao = Medicao(
        convenio_id=convenio_id,
        numero=body.numero,
        periodo_inicio=body.periodo_inicio,
        periodo_fim=body.periodo_fim,
        data=body.data or datetime.now(timezone.utc),
        valor=body.valor,
        percentual=body.percentual,
        percentual_acumulado=body.percentual_acumulado,
        responsavel_id=body.responsavel_id or user.id,
        observacao=body.observacao,
        status=StatusMedicao.REGISTRADA,
    )
    db.add(medicao)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.MEDICAO_REGISTRADA,
        ator_id=user.id,
        descricao=f"Medição nº {body.numero} registrada",
        metadados={"numero": body.numero, "valor": str(body.valor) if body.valor else None},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="medicao.criar",
        convenio_id=convenio_id,
        entidade="medicao",
        entidade_id=medicao.id,
        request=request,
    )
    await db.commit()
    await db.refresh(medicao)
    return medicao


@router.post("/{medicao_id}/aprovar", response_model=MedicaoOut)
async def aprovar_medicao(
    request: Request,
    convenio_id: uuid.UUID,
    medicao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_APPROVE)),
):
    medicao = await _get_medicao(db, convenio_id, medicao_id, user)
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")

    medicao.status = StatusMedicao.APROVADA
    medicao.aprovada_por_id = user.id
    medicao.data_aprovacao = datetime.now(timezone.utc)

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.MEDICAO_APROVADA,
        ator_id=user.id,
        descricao=f"Medição nº {medicao.numero} aprovada",
        metadados={"numero": medicao.numero},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="medicao.aprovar",
        convenio_id=convenio_id,
        entidade="medicao",
        entidade_id=medicao.id,
        request=request,
    )
    await db.commit()
    await db.refresh(medicao)
    return medicao


@router.patch("/{medicao_id}", response_model=MedicaoOut)
async def atualizar_medicao(
    request: Request,
    convenio_id: uuid.UUID,
    medicao_id: uuid.UUID,
    body: MedicaoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    medicao = await _get_medicao(db, convenio_id, medicao_id, user)
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")

    for field in ("valor", "percentual", "percentual_acumulado", "observacao",
                  "periodo_inicio", "periodo_fim", "data"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(medicao, field, value)

    await db.commit()
    await db.refresh(medicao)
    return medicao


@router.delete("/{medicao_id}", status_code=204)
async def excluir_medicao(
    request: Request,
    convenio_id: uuid.UUID,
    medicao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_APPROVE)),
):
    medicao = await _get_medicao(db, convenio_id, medicao_id, user)
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    medicao.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
