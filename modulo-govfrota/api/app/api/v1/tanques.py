import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.combustivel import Combustivel, Tanque
from app.models.estoque import InventarioTanque, MovimentacaoEstoque
from app.schemas.schemas import (
    AjusteRequest,
    InventarioConfirmacao,
    InventarioCreate,
    InventarioResponse,
    MovimentacaoResponse,
    TanqueCreate,
    TanqueResponse,
    TanqueUpdate,
    TransferenciaRequest,
)
from app.services.auditoria import registrar_auditoria
from app.services.estoque import EstoqueError, aplicar_movimentacao, transferir_estoque

router = APIRouter(prefix="/tanques", tags=["tanques"])


def _status_estoque(estoque_atual: Decimal, estoque_minimo: Decimal) -> str:
    if estoque_atual <= 0:
        return "CRITICO"
    if estoque_minimo > 0 and estoque_atual <= estoque_minimo:
        return "BAIXO"
    return "NORMAL"


async def _get_tanque(db: AsyncSession, user: User, tanque_id: uuid.UUID) -> Tanque:
    result = await db.execute(
        select(Tanque)
        .where(
            Tanque.id == tanque_id,
            Tanque.organization_id == user.organization_id,
            Tanque.deleted_at.is_(None),
        )
        .options(selectinload(Tanque.combustivel))
    )
    tanque = result.scalar_one_or_none()
    if tanque is None:
        raise HTTPException(status_code=404, detail="Tanque não encontrado.")
    return tanque


@router.get("", response_model=list[TanqueResponse])
async def listar(
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tanque)
        .where(
            Tanque.organization_id == user.organization_id,
            Tanque.deleted_at.is_(None),
        )
        .options(selectinload(Tanque.combustivel))
        .order_by(Tanque.nome)
    )
    tanques = []
    for t in result.scalars().all():
        percentual = None
        if t.capacidade_maxima and Decimal(t.capacidade_maxima) > 0:
            percentual = float(Decimal(t.estoque_atual) / Decimal(t.capacidade_maxima) * 100)
        tanques.append(
            TanqueResponse(
                id=t.id,
                nome=t.nome,
                codigo=t.codigo,
                localizacao=t.localizacao,
                combustivel_id=t.combustivel_id,
                combustivel_nome=t.combustivel.nome if t.combustivel else None,
                capacidade_maxima=t.capacidade_maxima,
                estoque_inicial=t.estoque_inicial,
                estoque_atual=t.estoque_atual,
                estoque_minimo=t.estoque_minimo,
                percentual_disponivel=percentual,
                status_estoque=_status_estoque(t.estoque_atual, t.estoque_minimo),
                ativo=t.ativo,
                observacoes=t.observacoes,
            )
        )
    return tanques


@router.post("", response_model=TanqueResponse, status_code=201)
async def criar(
    body: TanqueCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    combustivel = (
        await db.execute(
            select(Combustivel).where(
                Combustivel.id == body.combustivel_id,
                Combustivel.organization_id == user.organization_id,
                Combustivel.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if combustivel is None:
        raise HTTPException(status_code=422, detail="Combustível inválido.")
    if body.estoque_inicial > body.capacidade_maxima:
        raise HTTPException(
            status_code=422, detail="Estoque inicial não pode exceder a capacidade máxima."
        )

    tanque = Tanque(
        **body.model_dump(),
        organization_id=user.organization_id,
        estoque_atual=body.estoque_inicial,
    )
    db.add(tanque)
    await db.flush()

    # O estoque inicial também é registrado como movimentação rastreável
    if body.estoque_inicial > 0:
        await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo="ENTRADA",
            origem="ESTOQUE_INICIAL",
            sinal=1,
            quantidade=body.estoque_inicial - Decimal("0"),
            combustivel_id=body.combustivel_id,
            tanque_id=tanque.id,
            descricao="Estoque inicial do tanque",
            responsavel_usuario_id=user.id,
            permitir_negativo=True,
        )
        # corrige saldo para o valor exato (movimentação somou sobre zero)
        tanque.estoque_atual = body.estoque_inicial

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="tanque.criar",
        entidade="tanque",
        entidade_id=tanque.id,
        usuario_id=user.id,
        dados_novos={"nome": body.nome, "capacidade": str(body.capacidade_maxima)},
    )
    await db.commit()
    await db.refresh(tanque)
    return TanqueResponse(
        id=tanque.id,
        nome=tanque.nome,
        codigo=tanque.codigo,
        localizacao=tanque.localizacao,
        combustivel_id=tanque.combustivel_id,
        combustivel_nome=combustivel.nome,
        capacidade_maxima=tanque.capacidade_maxima,
        estoque_inicial=tanque.estoque_inicial,
        estoque_atual=tanque.estoque_atual,
        estoque_minimo=tanque.estoque_minimo,
        percentual_disponivel=float(tanque.estoque_atual / tanque.capacidade_maxima * 100),
        status_estoque=_status_estoque(tanque.estoque_atual, tanque.estoque_minimo),
        ativo=tanque.ativo,
        observacoes=tanque.observacoes,
    )


@router.get("/{tanque_id}", response_model=TanqueResponse)
async def obter(
    tanque_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    tanque = await _get_tanque(db, user, tanque_id)
    percentual = float(tanque.estoque_atual / tanque.capacidade_maxima * 100) if tanque.capacidade_maxima else None
    return TanqueResponse(
        id=tanque.id,
        nome=tanque.nome,
        codigo=tanque.codigo,
        localizacao=tanque.localizacao,
        combustivel_id=tanque.combustivel_id,
        combustivel_nome=tanque.combustivel.nome if tanque.combustivel else None,
        capacidade_maxima=tanque.capacidade_maxima,
        estoque_inicial=tanque.estoque_inicial,
        estoque_atual=tanque.estoque_atual,
        estoque_minimo=tanque.estoque_minimo,
        percentual_disponivel=percentual,
        status_estoque=_status_estoque(tanque.estoque_atual, tanque.estoque_minimo),
        ativo=tanque.ativo,
        observacoes=tanque.observacoes,
    )


@router.patch("/{tanque_id}", response_model=TanqueResponse)
async def atualizar(
    tanque_id: uuid.UUID,
    body: TanqueUpdate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    tanque = await _get_tanque(db, user, tanque_id)
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(tanque, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="tanque.atualizar",
        entidade="tanque",
        entidade_id=tanque.id,
        usuario_id=user.id,
    )
    await db.commit()
    await db.refresh(tanque)
    return await obter(tanque_id, user, db)


# ── Histórico de movimentações (§48 — "Por que o tanque tem X litros?") ──────


@router.get("/{tanque_id}/movimentacoes", response_model=list[MovimentacaoResponse])
async def movimentacoes_tanque(
    tanque_id: uuid.UUID,
    limit: int = 100,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    await _get_tanque(db, user, tanque_id)
    result = await db.execute(
        select(MovimentacaoEstoque)
        .where(
            MovimentacaoEstoque.organization_id == user.organization_id,
            (MovimentacaoEstoque.tanque_destino_id == tanque_id)
            | (MovimentacaoEstoque.tanque_origem_id == tanque_id),
        )
        .order_by(MovimentacaoEstoque.created_at.desc())
        .limit(min(limit, 500))
    )
    return result.scalars().all()


@router.get("/{tanque_id}/resumo")
async def resumo_tanque(
    tanque_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Página do tanque (§50): estoque, últimas entradas/abastecimentos e previsão."""
    tanque = await _get_tanque(db, user, tanque_id)

    entradas = (
        await db.execute(
            select(Abastecimento)
            .where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.tanque_id == tanque.id,
                Abastecimento.status == "CONFIRMADO",
            )
            .order_by(Abastecimento.data_abastecimento.desc())
            .limit(10)
        )
    ).scalars().all()

    # Consumo médio diário (últimos 30 dias) e previsão de duração
    inicio = date.today() - timedelta(days=30)
    consumido_30d = (
        await db.scalar(
            select(sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0)).where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.tanque_id == tanque.id,
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.data_abastecimento >= inicio,
            )
        )
    ) or 0

    consumo_medio_diario = float(consumido_30d) / 30 if consumido_30d else None
    dias_restantes = (
        float(tanque.estoque_atual) / consumo_medio_diario if consumo_medio_diario and consumo_medio_diario > 0 else None
    )

    return {
        "consumo_medio_diario_litros": consumo_medio_diario,
        "previsao_dias_restantes": dias_restantes,
        "ultimos_abastecimentos": [
            {
                "id": str(a.id),
                "data": a.data_abastecimento.isoformat(),
                "litros": float(a.quantidade_litros),
                "veiculo_id": str(a.veiculo_id),
            }
            for a in entradas
        ],
    }


# ── Ajustes de estoque (§13) ────────────────────────────────────────────────


@router.post("/ajuste", response_model=MovimentacaoResponse, status_code=201)
async def ajuste_manual(
    body: AjusteRequest,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    tanque = await _get_tanque(db, user, body.tanque_id)
    try:
        movimentacao = await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo="AJUSTE_POSITIVO" if body.positivo else "AJUSTE_NEGATIVO",
            origem="AJUSTE_MANUAL",
            sinal=1 if body.positivo else -1,
            quantidade=body.quantidade,
            combustivel_id=tanque.combustivel_id,
            tanque_id=tanque.id,
            descricao=f"Ajuste manual: {body.justificativa}",
            responsavel_usuario_id=user.id,
            permitir_negativo=True,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="estoque.ajuste",
        entidade="tanque",
        entidade_id=tanque.id,
        usuario_id=user.id,
        justificativa=body.justificativa,
        dados_novos={"tipo": movimentacao.tipo, "quantidade": str(body.quantidade)},
    )
    await db.commit()
    await db.refresh(movimentacao)
    return movimentacao


@router.post("/transferencia", response_model=list[MovimentacaoResponse], status_code=201)
async def transferencia(
    body: TransferenciaRequest,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    try:
        movs = await transferir_estoque(
            db,
            organization_id=user.organization_id,
            tanque_origem_id=body.tanque_origem_id,
            tanque_destino_id=body.tanque_destino_id,
            quantidade=body.quantidade,
            responsavel_usuario_id=user.id,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="estoque.transferencia",
        entidade="tanque",
        usuario_id=user.id,
        justificativa=body.justificativa,
        dados_novos={
            "origem": str(body.tanque_origem_id),
            "destino": str(body.tanque_destino_id),
            "quantidade": str(body.quantidade),
        },
    )
    await db.commit()
    for m in movs:
        await db.refresh(m)
    return movs


# ── Inventário físico (§49) ─────────────────────────────────────────────────


@router.get("/{tanque_id}/inventarios", response_model=list[InventarioResponse])
async def listar_inventarios(
    tanque_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    await _get_tanque(db, user, tanque_id)
    result = await db.execute(
        select(InventarioTanque)
        .where(
            InventarioTanque.organization_id == user.organization_id,
            InventarioTanque.tanque_id == tanque_id,
        )
        .order_by(InventarioTanque.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/inventario", response_model=InventarioResponse, status_code=201)
async def registrar_inventario(
    body: InventarioCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Conferência física: registra a diferença SEM alterar o estoque automaticamente.

    A correção exige confirmação com justificativa (endpoint `aplicar_inventario`).
    """
    tanque = await _get_tanque(db, user, body.tanque_id)
    inventario = InventarioTanque(
        organization_id=user.organization_id,
        tanque_id=tanque.id,
        estoque_sistema=tanque.estoque_atual,
        estoque_fisico=body.estoque_fisico,
        diferenca=Decimal(body.estoque_fisico) - Decimal(tanque.estoque_atual),
        data_conferencia=body.data_conferencia,
        justificativa=body.observacao,
        usuario_id=user.id,
    )
    db.add(inventario)
    await db.flush()
    await db.commit()
    await db.refresh(inventario)
    return inventario


@router.post("/inventario/{inventario_id}/aplicar", response_model=InventarioResponse)
async def aplicar_inventario(
    inventario_id: uuid.UUID,
    body: InventarioConfirmacao,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Confirma a diferença do inventário criando um ajuste auditável."""
    inventario = (
        await db.execute(
            select(InventarioTanque).where(
                InventarioTanque.id == inventario_id,
                InventarioTanque.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if inventario is None:
        raise HTTPException(status_code=404, detail="Inventário não encontrado.")
    if inventario.ajuste_aplicado:
        raise HTTPException(status_code=422, detail="Ajuste já aplicado.")
    if inventario.diferenca == 0:
        raise HTTPException(status_code=422, detail="Sem diferença para ajustar.")

    tanque = await _get_tanque(db, user, inventario.tanque_id)
    try:
        movimentacao = await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo="AJUSTE_POSITIVO" if inventario.diferenca > 0 else "AJUSTE_NEGATIVO",
            origem="INVENTARIO",
            sinal=1 if inventario.diferenca > 0 else -1,
            quantidade=abs(inventario.diferenca),
            combustivel_id=tanque.combustivel_id,
            tanque_id=tanque.id,
            descricao=f"Inventário físico: {body.justificativa}",
            responsavel_usuario_id=user.id,
            permitir_negativo=True,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)

    inventario.ajuste_aplicado = True
    inventario.justificativa = body.justificativa
    inventario.movimentacao_ajuste_id = movimentacao.id

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="estoque.inventario_aplicado",
        entidade="tanque",
        entidade_id=tanque.id,
        usuario_id=user.id,
        dados_anteriores={"estoque_sistema": str(inventario.estoque_sistema)},
        dados_novos={"estoque_fisico": str(inventario.estoque_fisico)},
        justificativa=body.justificativa,
    )
    await db.commit()
    await db.refresh(inventario)
    return inventario
