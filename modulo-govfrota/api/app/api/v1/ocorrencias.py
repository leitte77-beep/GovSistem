import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.manutencao import Manutencao
from app.models.ocorrencia import Ocorrencia
from app.models.veiculo import Veiculo
from app.schemas.schemas import OcorrenciaCreate, OcorrenciaResponse, OcorrenciaUpdate
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/ocorrencias", tags=["ocorrências"])


@router.get("", response_model=list[OcorrenciaResponse])
async def listar(
    veiculo_id: uuid.UUID | None = None,
    gravidade: str | None = None,
    status: str | None = None,
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Ocorrencia).where(
        Ocorrencia.organization_id == user.organization_id,
        Ocorrencia.deleted_at.is_(None),
    )
    if veiculo_id:
        stmt = stmt.where(Ocorrencia.veiculo_id == veiculo_id)
    if gravidade:
        stmt = stmt.where(Ocorrencia.gravidade == gravidade.upper())
    if status:
        stmt = stmt.where(Ocorrencia.status == status.upper())
    return (
        await db.execute(
            stmt.order_by(Ocorrencia.created_at.desc()).offset(skip).limit(min(limit, 200))
        )
    ).scalars().all()


@router.post("", response_model=OcorrenciaResponse, status_code=201)
async def criar(
    body: OcorrenciaCreate,
    user: User = Depends(require_permission(Perm.OCCURRENCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as date_cls

    veiculo_ok = (
        await db.execute(
            select(Veiculo.id).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo_ok is None:
        raise HTTPException(status_code=422, detail="Veículo inválido.")

    ocorrencia = Ocorrencia(
        **{k: v for k, v in body.model_dump().items() if k != "data_ocorrencia"},
        organization_id=user.organization_id,
        data_ocorrencia=body.data_ocorrencia or date_cls.today(),
    )
    db.add(ocorrencia)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="ocorrencia.registrar",
        entidade="ocorrencia",
        entidade_id=ocorrencia.id,
        usuario_id=user.id,
        dados_novos={
            "veiculo": str(body.veiculo_id),
            "categoria": body.categoria,
            "gravidade": body.gravidade,
        },
    )
    await db.commit()
    await db.refresh(ocorrencia)
    return ocorrencia


@router.patch("/{ocorrencia_id}", response_model=OcorrenciaResponse)
async def atualizar(
    ocorrencia_id: uuid.UUID,
    body: OcorrenciaUpdate,
    user: User = Depends(require_permission(Perm.OCCURRENCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    ocorrencia = (
        await db.execute(
            select(Ocorrencia).where(
                Ocorrencia.id == ocorrencia_id,
                Ocorrencia.organization_id == user.organization_id,
                Ocorrencia.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if ocorrencia is None:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(ocorrencia, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="ocorrencia.atualizar",
        entidade="ocorrencia",
        entidade_id=ocorrencia.id,
        usuario_id=user.id,
        dados_novos=body.model_dump(exclude_unset=True),
    )
    await db.commit()
    await db.refresh(ocorrencia)
    return ocorrencia


@router.post("/{ocorrencia_id}/converter-manutencao", status_code=201)
async def converter_em_manutencao(
    ocorrencia_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Converte uma ocorrência aberta em manutenção corretiva."""
    from datetime import date

    ocorrencia = (
        await db.execute(
            select(Ocorrencia).where(
                Ocorrencia.id == ocorrencia_id,
                Ocorrencia.organization_id == user.organization_id,
                Ocorrencia.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if ocorrencia is None:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
    if ocorrencia.manutencao_id:
        raise HTTPException(status_code=422, detail="Ocorrência já convertida em manutenção.")

    manutencao = Manutencao(
        organization_id=user.organization_id,
        veiculo_id=ocorrencia.veiculo_id,
        tipo="CORRETIVA",
        descricao_problema=f"[{ocorrencia.categoria}] {ocorrencia.descricao}",
        quilometragem=ocorrencia.quilometragem,
        data_solicitacao=date.today(),
        prioridade={"CRITICA": "URGENTE", "ALTA": "ALTA"}.get(ocorrencia.gravidade, "NORMAL"),
        status="ABERTA",
        ocorrencia_origem_id=ocorrencia.id,
    )
    db.add(manutencao)
    await db.flush()

    ocorrencia.manutencao_id = manutencao.id
    ocorrencia.status = "CONVERTIDA_EM_MANUTENCAO"

    # Veículo entra em manutenção quando a ocorrência é grave/crítica
    if ocorrencia.gravidade in ("ALTA", "CRITICA"):
        veiculo = await db.get(Veiculo, ocorrencia.veiculo_id)
        if veiculo and veiculo.organization_id == user.organization_id:
            veiculo.situacao = "EM_MANUTENCAO"

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="ocorrencia.converter_manutencao",
        entidade="manutencao",
        entidade_id=manutencao.id,
        usuario_id=user.id,
        dados_novos={"origem_ocorrencia": str(ocorrencia.id)},
    )
    await db.commit()
    return {"id": str(manutencao.id)}
