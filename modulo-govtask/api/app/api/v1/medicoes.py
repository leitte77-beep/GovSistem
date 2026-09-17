import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.convenio import Convenio
from app.models.enums import StatusMedicao, TipoEvento
from app.models.medicao import Medicao
from app.models.user import User
from app.schemas.medicao import MedicaoCreate, MedicaoOut, MedicaoUpdate
from app.services.auditoria import registrar_auditoria
from app.services.timeline import registrar_evento

# Sem prefixo: o mesmo conjunto de rotas é montado duas vezes em `router.py`,
# sob o convênio (entidades anteriores à v2) e sob a demanda (§58). O pai vem do
# contexto e é autorizado por dependência, então nenhum id de medição alcança o
# acervo de outro município por um caminho que não valide o dono.
router = APIRouter(tags=["medicoes"])


@dataclass
class ContextoMedicao:
    """Pai autorizado da medição: um convênio ou uma demanda, nunca os dois."""

    convenio_id: uuid.UUID | None = None
    demanda_id: uuid.UUID | None = None

    @property
    def filtro(self):
        if self.demanda_id is not None:
            return Medicao.demanda_id == self.demanda_id
        return Medicao.convenio_id == self.convenio_id


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def contexto_medicao(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContextoMedicao:
    parametros = request.path_params
    if "demanda_id" in parametros:
        from app.core.auth import get_user_permissions
        from app.services.demandas import get_demanda_ou_404

        demanda = await get_demanda_ou_404(
            db, uuid.UUID(str(parametros["demanda_id"])), user, get_user_permissions(user)
        )
        return ContextoMedicao(demanda_id=demanda.id)

    convenio_id = uuid.UUID(str(parametros["convenio_id"]))
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    return ContextoMedicao(convenio_id=convenio_id)


async def _get_medicao(db, ctx: ContextoMedicao, medicao_id, user):
    result = await db.execute(
        select(Medicao).where(
            Medicao.id == medicao_id,
            ctx.filtro,
            Medicao.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[MedicaoOut])
async def listar_medicoes(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    ctx: ContextoMedicao = Depends(contexto_medicao),
):
    result = await db.execute(
        select(Medicao).where(ctx.filtro, Medicao.deleted_at.is_(None)).order_by(Medicao.numero)
    )
    return result.scalars().all()


@router.post("", response_model=MedicaoOut, status_code=201)
async def criar_medicao(
    request: Request,
    body: MedicaoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
    ctx: ContextoMedicao = Depends(contexto_medicao),
):
    medicao = Medicao(
        convenio_id=ctx.convenio_id,
        demanda_id=ctx.demanda_id,
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
        demanda_id=ctx.demanda_id,
        convenio_id=ctx.convenio_id,
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
        convenio_id=ctx.convenio_id,
        demanda_id=ctx.demanda_id,
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
    medicao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_APPROVE)),
    ctx: ContextoMedicao = Depends(contexto_medicao),
):
    medicao = await _get_medicao(db, ctx, medicao_id, user)
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")

    medicao.status = StatusMedicao.APROVADA
    medicao.aprovada_por_id = user.id
    medicao.data_aprovacao = datetime.now(timezone.utc)

    await registrar_evento(
        db,
        demanda_id=ctx.demanda_id,
        convenio_id=ctx.convenio_id,
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
        convenio_id=ctx.convenio_id,
        demanda_id=ctx.demanda_id,
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
    medicao_id: uuid.UUID,
    body: MedicaoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
    ctx: ContextoMedicao = Depends(contexto_medicao),
):
    medicao = await _get_medicao(db, ctx, medicao_id, user)
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
    medicao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_APPROVE)),
    ctx: ContextoMedicao = Depends(contexto_medicao),
):
    medicao = await _get_medicao(db, ctx, medicao_id, user)
    if not medicao:
        raise HTTPException(status_code=404, detail="Medição não encontrada")
    medicao.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
