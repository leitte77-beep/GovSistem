import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.permissions import Perm
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.enums import TipoEvento, TipoMovimento
from app.models.movimento_financeiro import MovimentoFinanceiro
from app.models.repasse import Repasse
from app.models.user import User
from app.schemas.movimento_financeiro import (
    MovimentoCreate,
    MovimentoOut,
    ResumoFinanceiro,
)
from app.services.auditoria import registrar_auditoria
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/convenios/{convenio_id}/financeiro", tags=["financeiro"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


@router.get("/resumo", response_model=ResumoFinanceiro)
async def resumo_financeiro(
    request: Request,
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.FINANCIAL_VIEW, Perm.FINANCIAL_MANAGE)),
):
    convenio = await _get_convenio(db, convenio_id, user)
    if not convenio:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    repasses = (await db.execute(
        select(func.coalesce(func.sum(Repasse.valor_recebido), 0)).where(
            Repasse.convenio_id == convenio_id, Repasse.deleted_at.is_(None)
        )
    )).scalar_one()
    valor_recebido = Decimal(repasses)

    empenhado = (await db.execute(
        select(func.coalesce(func.sum(MovimentoFinanceiro.valor), 0)).where(
            MovimentoFinanceiro.convenio_id == convenio_id,
            MovimentoFinanceiro.tipo == TipoMovimento.EMPENHO,
            MovimentoFinanceiro.deleted_at.is_(None),
        )
    )).scalar_one()
    liquidado = (await db.execute(
        select(func.coalesce(func.sum(MovimentoFinanceiro.valor), 0)).where(
            MovimentoFinanceiro.convenio_id == convenio_id,
            MovimentoFinanceiro.tipo == TipoMovimento.LIQUIDACAO,
            MovimentoFinanceiro.deleted_at.is_(None),
        )
    )).scalar_one()
    pago = (await db.execute(
        select(func.coalesce(func.sum(MovimentoFinanceiro.valor), 0)).where(
            MovimentoFinanceiro.convenio_id == convenio_id,
            MovimentoFinanceiro.tipo == TipoMovimento.PAGAMENTO,
            MovimentoFinanceiro.deleted_at.is_(None),
        )
    )).scalar_one()

    rendimentos = (await db.execute(
        select(func.coalesce(func.sum(MovimentoFinanceiro.valor), 0)).where(
            MovimentoFinanceiro.convenio_id == convenio_id,
            MovimentoFinanceiro.tipo == TipoMovimento.RENDIMENTO,
            MovimentoFinanceiro.deleted_at.is_(None),
        )
    )).scalar_one()

    valor_aprovado = convenio.valor or Decimal(0)
    total_disponivel = valor_recebido + Decimal(rendimentos) - Decimal(pago)
    saldo = valor_recebido + Decimal(rendimentos) - Decimal(pago)

    percentual_executado = None
    if valor_aprovado:
        percentual_executado = round((Decimal(empenhado) / valor_aprovado) * 100, 2)
    percentual_pago = None
    if valor_aprovado:
        percentual_pago = round((Decimal(pago) / valor_aprovado) * 100, 2)

    return {
        "valor_aprovado": valor_aprovado,
        "valor_recebido": valor_recebido,
        "contrapartida": None,
        "rendimentos": Decimal(rendimentos),
        "total_disponivel": total_disponivel,
        "empenhado": Decimal(empenhado),
        "liquidado": Decimal(liquidado),
        "pago": Decimal(pago),
        "saldo": saldo,
        "percentual_executado": percentual_executado,
        "percentual_pago": percentual_pago,
    }


@router.get("/movimentos", response_model=list[MovimentoOut])
async def listar_movimentos(
    request: Request,
    convenio_id: uuid.UUID,
    tipo: TipoMovimento | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.FINANCIAL_VIEW, Perm.FINANCIAL_MANAGE)),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    query = select(MovimentoFinanceiro).where(
        MovimentoFinanceiro.convenio_id == convenio_id,
        MovimentoFinanceiro.deleted_at.is_(None),
    )
    if tipo:
        query = query.where(MovimentoFinanceiro.tipo == tipo)
    query = query.order_by(MovimentoFinanceiro.data.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/movimentos", response_model=MovimentoOut, status_code=201)
async def criar_movimento(
    request: Request,
    convenio_id: uuid.UUID,
    body: MovimentoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.FINANCIAL_MANAGE)),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    movimento = MovimentoFinanceiro(
        convenio_id=convenio_id,
        tipo=body.tipo,
        numero=body.numero,
        data=body.data or datetime.now(timezone.utc),
        valor=body.valor,
        favorecido=body.favorecido,
        descricao=body.descricao,
        medicao_id=body.medicao_id,
        contrato_id=body.contrato_id,
        registro_por_id=user.id,
    )
    db.add(movimento)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.MOVIMENTO_FINANCEIRO,
        ator_id=user.id,
        descricao=f"{body.tipo.value} {body.numero or ''} registrado",
        metadados={"tipo": body.tipo.value, "valor": str(body.valor) if body.valor else None},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="financeiro.movimento",
        convenio_id=convenio_id,
        entidade="movimento_financeiro",
        entidade_id=movimento.id,
        request=request,
    )
    await db.commit()
    await db.refresh(movimento)
    return movimento


@router.delete("/movimentos/{movimento_id}", status_code=204)
async def excluir_movimento(
    request: Request,
    convenio_id: uuid.UUID,
    movimento_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.FINANCIAL_MANAGE)),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(MovimentoFinanceiro).where(
            MovimentoFinanceiro.id == movimento_id,
            MovimentoFinanceiro.convenio_id == convenio_id,
            MovimentoFinanceiro.deleted_at.is_(None),
        )
    )
    movimento = result.scalar_one_or_none()
    if not movimento:
        raise HTTPException(status_code=404, detail="Movimento não encontrado")
    movimento.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
