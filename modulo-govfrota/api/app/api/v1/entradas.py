import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.combustivel import Combustivel, Fornecedor, Tanque
from app.models.estoque import EntradaCombustivel, MovimentacaoEstoque
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.schemas.schemas import EntradaCancelamento, EntradaCreate, EntradaResponse
from app.services.auditoria import registrar_auditoria
from app.services.abastecimento import get_configuracoes
from app.services.estoque import EstoqueError, aplicar_movimentacao

router = APIRouter(prefix="/entradas", tags=["entradas de combustível"])


async def _get_entrada(db: AsyncSession, user: User, entrada_id: uuid.UUID) -> EntradaCombustivel:
    result = await db.execute(
        select(EntradaCombustivel).where(
            EntradaCombustivel.id == entrada_id,
            EntradaCombustivel.organization_id == user.organization_id,
        )
    )
    entrada = result.scalar_one_or_none()
    if entrada is None:
        raise HTTPException(status_code=404, detail="Entrada não encontrada.")
    return entrada


@router.get("", response_model=list[EntradaResponse])
async def listar(
    tanque_id: uuid.UUID | None = None,
    fornecedor_id: uuid.UUID | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(EntradaCombustivel).where(
        EntradaCombustivel.organization_id == user.organization_id
    )
    if tanque_id:
        stmt = stmt.where(EntradaCombustivel.tanque_id == tanque_id)
    if fornecedor_id:
        stmt = stmt.where(EntradaCombustivel.fornecedor_id == fornecedor_id)
    if data_inicio:
        from datetime import date

        stmt = stmt.where(EntradaCombustivel.data_entrada >= date.fromisoformat(data_inicio))
    if data_fim:
        from datetime import date

        stmt = stmt.where(EntradaCombustivel.data_entrada <= date.fromisoformat(data_fim))
    stmt = (
        stmt.order_by(EntradaCombustivel.data_entrada.desc())
        .offset(skip)
        .limit(min(limit, 200))
    )
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=EntradaResponse, status_code=201)
async def criar(
    body: EntradaCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Registra compra/recebimento de combustível e credita o estoque do tanque."""
    config = await get_configuracoes(db, user.organization_id)

    tanque = (
        await db.execute(
            select(Tanque).where(
                Tanque.id == body.tanque_id,
                Tanque.organization_id == user.organization_id,
                Tanque.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if tanque is None:
        raise HTTPException(status_code=422, detail="Tanque inválido.")

    combustivel = (
        await db.execute(
            select(Combustivel).where(
                Combustivel.id == body.combustivel_id,
                Combustivel.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if combustivel is None:
        raise HTTPException(status_code=422, detail="Combustível inválido.")
    if combustivel.id != tanque.combustivel_id:
        raise HTTPException(
            status_code=422, detail="O combustível da entrada não corresponde ao combustível do tanque."
        )
    if config.exigir_nf_entrada and not body.numero_nota:
        raise HTTPException(status_code=422, detail="Número da nota fiscal é obrigatório.")
    if config.exigir_fornecedor_entrada and not body.fornecedor_id:
        raise HTTPException(status_code=422, detail="Fornecedor é obrigatório.")
    if body.fornecedor_id:
        fornecedor_ok = (
            await db.execute(
                select(Fornecedor.id).where(
                    Fornecedor.id == body.fornecedor_id,
                    Fornecedor.organization_id == user.organization_id,
                )
            )
        ).scalar_one_or_none()
        if fornecedor_ok is None:
            raise HTTPException(status_code=422, detail="Fornecedor inválido.")

    valor_por_litro = (
        (Decimal(body.valor_total) / Decimal(body.quantidade_litros)).quantize(Decimal("0.0001"))
        if body.valor_total and Decimal(body.quantidade_litros) > 0
        else None
    )

    entrada = EntradaCombustivel(
        **body.model_dump(),
        organization_id=user.organization_id,
        responsavel_usuario_id=user.id,
        valor_por_litro=valor_por_litro,
    )
    db.add(entrada)
    await db.flush()

    try:
        await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.ENTRADA.value,
            origem=OrigemMovimentacao.ENTRADA_COMPRA.value,
            sinal=1,
            quantidade=body.quantidade_litros,
            combustivel_id=body.combustivel_id,
            tanque_id=tanque.id,
            referencia_tipo="ENTRADA_COMBUSTIVEL",
            custo_unitario=valor_por_litro,
            descricao=f"NF {body.numero_nota or '-'}",
            responsavel_usuario_id=user.id,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)

    await db.flush()

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="entrada.registrar",
        entidade="entrada_combustivel",
        entidade_id=entrada.id,
        usuario_id=user.id,
        dados_novos={
            "tanque": str(tanque.id),
            "litros": str(body.quantidade_litros),
            "nota": body.numero_nota,
            "valor_total": str(body.valor_total) if body.valor_total else None,
        },
    )
    await db.commit()
    await db.refresh(entrada)
    return entrada


@router.post("/{entrada_id}/cancelar", status_code=200)
async def cancelar(
    entrada_id: uuid.UUID,
    body: EntradaCancelamento,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Cancela a entrada com justificativa — estorna o crédito do estoque.

    O registro original permanece para auditoria; nunca é apagado.
    """
    entrada = await _get_entrada(db, user, entrada_id)
    if entrada.cancelada:
        raise HTTPException(status_code=422, detail="Entrada já cancelada.")

    # Segurança (§11): o estorno não pode gerar estoque negativo. Se o saldo
    # atual do tanque for inferior ao volume da entrada, o cancelamento é
    # inviável e deve ser orientado um ajuste administrativo.
    tanque = (
        await db.execute(
            select(Tanque).where(
                Tanque.id == entrada.tanque_id,
                Tanque.organization_id == user.organization_id,
                Tanque.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if tanque is not None and Decimal(tanque.estoque_atual) < Decimal(entrada.quantidade_litros):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Não é possível cancelar esta entrada: o estoque atual do tanque "
                f"({tanque.estoque_atual} L) é inferior ao volume da entrada "
                f"({entrada.quantidade_litros} L). Se necessário, solicite um ajuste "
                "administrativo de estoque."
            ),
        )

    try:
        movimentacao_estorno = await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.ESTORNO.value,
            origem=OrigemMovimentacao.CANCELAMENTO_ENTRADA.value,
            sinal=-1,
            quantidade=entrada.quantidade_litros,
            combustivel_id=entrada.combustivel_id,
            tanque_id=entrada.tanque_id,
            referencia_tipo="CANCELAMENTO_ENTRADA",
            descricao=f"Estorno da NF {entrada.numero_nota or '-'}: {body.justificativa}",
            responsavel_usuario_id=user.id,
            permitir_negativo=False,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)

    entrada.cancelada = True
    entrada.cancelada_em = datetime.now(timezone.utc)
    entrada.cancelada_por_id = user.id
    entrada.motivo_cancelamento = body.justificativa

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="entrada.cancelar",
        entidade="entrada_combustivel",
        entidade_id=entrada.id,
        usuario_id=user.id,
        dados_anteriores={"cancelada": False, "litros": str(entrada.quantidade_litros)},
        dados_novos={"cancelada": True},
        justificativa=body.justificativa,
    )
    await db.commit()
    await db.refresh(entrada)
    return {"ok": True, "id": str(entrada.id), "mensagem": "Entrada cancelada e estoque estornado."}
