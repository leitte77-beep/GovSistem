import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.contrato import Aditivo, Contrato
from app.models.convenio import Convenio
from app.models.enums import TipoEvento
from app.models.user import User
from app.schemas.contrato import (
    AditivoCreate,
    AditivoOut,
    ContratoCreate,
    ContratoOut,
    ContratoUpdate,
)
from app.services.auditoria import registrar_auditoria
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/convenios/{convenio_id}/contratos", tags=["contratos"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_contrato(db, convenio_id, contrato_id, user):
    result = await db.execute(
        select(Contrato)
        .join(Convenio, Convenio.id == Contrato.convenio_id)
        .where(
            Contrato.id == contrato_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Contrato.deleted_at.is_(None),
        )
        .options(selectinload(Contrato.aditivos))
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[ContratoOut])
async def listar_contratos(
    request: Request,
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(Contrato)
        .where(Contrato.convenio_id == convenio_id, Contrato.deleted_at.is_(None))
        .options(selectinload(Contrato.aditivos))
    )
    return result.scalars().all()


@router.post("", response_model=ContratoOut, status_code=201)
async def criar_contrato(
    request: Request,
    convenio_id: uuid.UUID,
    body: ContratoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    contrato = Contrato(
        convenio_id=convenio_id,
        numero=body.numero,
        fornecedor=body.fornecedor,
        cnpj=body.cnpj,
        objeto=body.objeto,
        valor=body.valor,
        data_assinatura=body.data_assinatura,
        vigencia_inicio=body.vigencia_inicio,
        vigencia_fim=body.vigencia_fim,
        fiscal_id=body.fiscal_id,
        gestor_id=body.gestor_id,
    )
    db.add(contrato)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.CONTRATO_CADASTRADO,
        ator_id=user.id,
        descricao=f"Contrato {body.numero or ''} cadastrado",
        metadados={"numero": body.numero},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="contrato.criar",
        convenio_id=convenio_id,
        entidade="contrato",
        entidade_id=contrato.id,
        request=request,
    )
    await db.commit()
    result = await db.execute(
        select(Contrato).where(Contrato.id == contrato.id).options(selectinload(Contrato.aditivos))
    )
    return result.scalar_one()


@router.patch("/{contrato_id}", response_model=ContratoOut)
async def atualizar_contrato(
    request: Request,
    convenio_id: uuid.UUID,
    contrato_id: uuid.UUID,
    body: ContratoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    contrato = await _get_contrato(db, convenio_id, contrato_id, user)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")

    for field in ("numero", "fornecedor", "cnpj", "objeto", "valor", "data_assinatura",
                  "vigencia_inicio", "vigencia_fim", "fiscal_id", "gestor_id", "status"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(contrato, field, value)

    await db.commit()
    return await _get_contrato(db, convenio_id, contrato_id, user)


@router.post("/{contrato_id}/aditivos", response_model=AditivoOut, status_code=201)
async def criar_aditivo(
    request: Request,
    convenio_id: uuid.UUID,
    contrato_id: uuid.UUID,
    body: AditivoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    contrato = await _get_contrato(db, convenio_id, contrato_id, user)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")

    aditivo = Aditivo(
        contrato_id=contrato_id,
        numero=body.numero,
        tipo=body.tipo,
        motivo=body.motivo,
        valor=body.valor,
        prazo=body.prazo,
        data=body.data or datetime.now(timezone.utc),
        aprovado_por_id=user.id,
    )
    db.add(aditivo)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.ADITIVO_REGISTRADO,
        ator_id=user.id,
        descricao=f"Aditivo {body.numero or ''} registrado no contrato",
        metadados={"contrato_id": str(contrato_id), "numero": body.numero},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="contrato.aditivo",
        convenio_id=convenio_id,
        entidade="aditivo",
        entidade_id=aditivo.id,
        request=request,
    )
    await db.commit()
    await db.refresh(aditivo)
    return aditivo


@router.get("/{contrato_id}/aditivos", response_model=list[AditivoOut])
async def listar_aditivos(
    request: Request,
    convenio_id: uuid.UUID,
    contrato_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    contrato = await _get_contrato(db, convenio_id, contrato_id, user)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    return contrato.aditivos


@router.delete("/{contrato_id}", status_code=204)
async def excluir_contrato(
    request: Request,
    convenio_id: uuid.UUID,
    contrato_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    contrato = await _get_contrato(db, convenio_id, contrato_id, user)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    contrato.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
