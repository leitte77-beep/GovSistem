import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.motorista import Motorista
from app.models.combustivel import Combustivel, Tanque
from app.models.estoque import EntradaCombustivel, InventarioTanque, MovimentacaoEstoque
from app.schemas.schemas import (
    AjusteRequest,
    InventarioConfirmacao,
    InventarioCreate,
    InventarioResponse,
    MovimentacaoResponse,
    TanqueCreate,
    TanqueResponse,
    TanqueUpdate,
    TanqueEvolucaoResponse,
    TanqueResumoResponse,
    TransferenciaRequest,
)
from app.services.auditoria import registrar_auditoria
from app.services.estoque import EstoqueError, aplicar_movimentacao, custo_medio_combustivel, status_estoque, transferir_estoque

router = APIRouter(prefix="/tanques", tags=["tanques"])


def _status_estoque(estoque_atual: Decimal, estoque_minimo: Decimal) -> str:
    return status_estoque(estoque_atual, estoque_minimo)


def _montar_tanque(t: Tanque, percentual: float | None = None) -> TanqueResponse:
    if percentual is None:
        percentual = None
        if t.capacidade_maxima and Decimal(t.capacidade_maxima) > 0:
            percentual = float(Decimal(t.estoque_atual) / Decimal(t.capacidade_maxima) * 100)
    return TanqueResponse(
        id=t.id,
        nome=t.nome,
        codigo=t.codigo,
        localizacao=t.localizacao,
        combustivel_id=t.combustivel_id,
        combustivel_nome=t.combustivel.nome if t.combustivel else None,
        combustivel_unidade=t.combustivel.unidade if t.combustivel else None,
        capacidade_maxima=t.capacidade_maxima,
        estoque_inicial=t.estoque_inicial,
        estoque_atual=t.estoque_atual,
        estoque_minimo=t.estoque_minimo,
        percentual_disponivel=percentual,
        status_estoque=_status_estoque(t.estoque_atual, t.estoque_minimo),
        foto_url=t.foto_url,
        ativo=t.ativo,
        observacoes=t.observacoes,
    )


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
    tanques = list(result.scalars().all())
    if not tanques:
        return []
    ids = [t.id for t in tanques]

    # Última movimentação de cada tanque (para o card).
    ultimas = (
        await db.execute(
            select(MovimentacaoEstoque.tanque_destino_id, MovimentacaoEstoque)
            .where(
                MovimentacaoEstoque.organization_id == user.organization_id,
                MovimentacaoEstoque.tanque_destino_id.in_(ids),
            )
            .order_by(MovimentacaoEstoque.created_at.desc())
        )
    ).all()
    ultima_por_tanque: dict[uuid.UUID, dict] = {}
    for tanque_id, mov in ultimas:
        if tanque_id not in ultima_por_tanque:
            ultima_por_tanque[tanque_id] = {
                "id": str(mov.id),
                "tipo": mov.tipo,
                "sinal": mov.sinal,
                "quantidade": float(mov.quantidade),
                "descricao": mov.descricao,
                "created_at": mov.created_at.isoformat(),
            }

    respostas = [_montar_tanque(t) for t in tanques]
    for r in respostas:
        r.ultima_movimentacao = ultima_por_tanque.get(r.id)
    return respostas


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
    return _montar_tanque(tanque)


@router.get("/{tanque_id}", response_model=TanqueResponse)
async def obter(
    tanque_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    tanque = await _get_tanque(db, user, tanque_id)
    return _montar_tanque(tanque)


@router.patch("/{tanque_id}", response_model=TanqueResponse)
async def atualizar(
    tanque_id: uuid.UUID,
    body: TanqueUpdate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    tanque = await _get_tanque(db, user, tanque_id)
    dados = body.model_dump(exclude_unset=True)
    if "combustivel_id" in dados and dados["combustivel_id"] != tanque.combustivel_id:
        novo = (
            await db.execute(
                select(Combustivel).where(
                    Combustivel.id == dados["combustivel_id"],
                    Combustivel.organization_id == user.organization_id,
                    Combustivel.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if novo is None:
            raise HTTPException(status_code=422, detail="Combustível inválido.")
    for campo, valor in dados.items():
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
    await db.refresh(tanque, attribute_names=["combustivel"])
    return _montar_tanque(tanque)


# ── Histórico de movimentações (paginado + responsável + filtros) ───────────


@router.get("/{tanque_id}/movimentacoes", response_model=list[MovimentacaoResponse])
async def movimentacoes_tanque(
    tanque_id: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
    tipo: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    await _get_tanque(db, user, tanque_id)
    base = select(MovimentacaoEstoque).where(
        MovimentacaoEstoque.organization_id == user.organization_id,
        (MovimentacaoEstoque.tanque_destino_id == tanque_id)
        | (MovimentacaoEstoque.tanque_origem_id == tanque_id),
    )
    if tipo:
        base = base.where(MovimentacaoEstoque.tipo == tipo.upper())
    if data_inicio:
        base = base.where(MovimentacaoEstoque.created_at >= datetime.fromisoformat(data_inicio))
    if data_fim:
        fim = datetime.fromisoformat(data_fim) + timedelta(days=1)
        base = base.where(MovimentacaoEstoque.created_at < fim)

    total = await db.scalar(
        select(sa_func.count()).select_from(base.order_by(None).subquery())
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(int(total or 0))

    stmt = base.order_by(MovimentacaoEstoque.created_at.desc()).offset(skip).limit(min(limit, 200))
    movs = (await db.execute(stmt)).scalars().all()
    return await _enriquecer_movimentacoes(db, user.organization_id, list(movs))


async def _enriquecer_movimentacoes(
    db: AsyncSession, organization_id: uuid.UUID, movs: list[MovimentacaoEstoque]
) -> list[MovimentacaoResponse]:
    """Adiciona nomes de responsável e tanques às movimentações (evita N+1)."""
    if not movs:
        return []
    user_ids = {m.responsavel_usuario_id for m in movs if m.responsavel_usuario_id}
    motorista_ids = {m.responsavel_motorista_id for m in movs if m.responsavel_motorista_id}
    tanque_ids = {m.tanque_destino_id for m in movs} | {
        m.tanque_origem_id for m in movs if m.tanque_origem_id
    }

    nomes_user: dict[uuid.UUID, str] = {}
    if user_ids:
        nomes_user = dict(
            (await db.execute(select(User.id, User.name).where(User.id.in_(user_ids)))).all()
        )
    nomes_motorista: dict[uuid.UUID, str] = {}
    if motorista_ids:
        nomes_motorista = dict(
            (await db.execute(select(Motorista.id, Motorista.nome).where(Motorista.id.in_(motorista_ids)))).all()
        )
    nomes_tanque: dict[uuid.UUID, str] = {}
    if tanque_ids:
        nomes_tanque = dict(
            (await db.execute(select(Tanque.id, Tanque.nome).where(Tanque.id.in_(tanque_ids)))).all()
        )

    respostas = []
    for m in movs:
        respostas.append(
            MovimentacaoResponse(
                id=m.id,
                tipo=m.tipo,
                origem=m.origem,
                sinal=m.sinal,
                quantidade=m.quantidade,
                combustivel_id=m.combustivel_id,
                tanque_destino_id=m.tanque_destino_id,
                tanque_origem_id=m.tanque_origem_id,
                referencia_id=m.referencia_id,
                referencia_tipo=m.referencia_tipo,
                descricao=m.descricao,
                custo_unitario=m.custo_unitario,
                saldo_apos=m.saldo_apos,
                responsavel_usuario_id=m.responsavel_usuario_id,
                responsavel_motorista_id=m.responsavel_motorista_id,
                created_at=m.created_at,
                responsavel_nome=(
                    nomes_user.get(m.responsavel_usuario_id)
                    or nomes_motorista.get(m.responsavel_motorista_id)
                ),
                tanque_destino_nome=nomes_tanque.get(m.tanque_destino_id),
                tanque_origem_nome=nomes_tanque.get(m.tanque_origem_id) if m.tanque_origem_id else None,
            )
        )
    return respostas


# ── Ficha do tanque: indicadores e evolução ────────────────────────────────


@router.get("/{tanque_id}/resumo", response_model=TanqueResumoResponse)
async def resumo_tanque(
    tanque_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Ficha do tanque: consumo, autonomia, custo médio e valor do estoque."""
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

    # Consumo médio diário (últimos 30 dias) e autonomia
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
        float(tanque.estoque_atual) / consumo_medio_diario
        if consumo_medio_diario and consumo_medio_diario > 0
        else None
    )

    # Custo médio por litro + valor estimado do estoque (só se houver dado confiável)
    custo_medio = await custo_medio_combustivel(db, user.organization_id, tanque.combustivel_id)
    valor_estoque = None
    if custo_medio is not None:
        valor_estoque = float(Decimal(tanque.estoque_atual) * custo_medio)

    return TanqueResumoResponse(
        consumo_medio_diario_litros=round(consumo_medio_diario, 2) if consumo_medio_diario else None,
        previsao_dias_restantes=round(dias_restantes, 1) if dias_restantes else None,
        autonomia_dias=round(dias_restantes, 1) if dias_restantes else None,
        custo_medio_por_litro=float(custo_medio) if custo_medio else None,
        valor_estoque=round(valor_estoque, 2) if valor_estoque is not None else None,
        ultimos_abastecimentos=[
            {
                "id": str(a.id),
                "data": a.data_abastecimento.isoformat(),
                "litros": float(a.quantidade_litros),
                "veiculo_id": str(a.veiculo_id),
            }
            for a in entradas
        ],
    )


@router.get("/{tanque_id}/evolucao", response_model=TanqueEvolucaoResponse)
async def evolucao_tanque(
    tanque_id: uuid.UUID,
    dias: int = 30,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Evolução do saldo do tanque para o gráfico (7/30/90 dias).

    Agrega as movimentações por dia (soma do sinal) e acumula o saldo partindo
    do estoque atual para trás. Retorna um ponto por dia (data, saldo).
    """
    if dias not in (7, 30, 90):
        dias = 30
    await _get_tanque(db, user, tanque_id)

    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    dialect = (db.bind.dialect.name if db.bind is not None else "postgresql")
    if dialect == "sqlite":
        agrupar = sa_func.strftime("%Y-%m-%d", MovimentacaoEstoque.created_at)
    else:
        agrupar = sa_func.date_trunc("day", MovimentacaoEstoque.created_at)
    rows = (
        await db.execute(
            select(
                agrupar,
                sa_func.sum(MovimentacaoEstoque.sinal * MovimentacaoEstoque.quantidade),
            )
            .where(
                MovimentacaoEstoque.organization_id == user.organization_id,
                (MovimentacaoEstoque.tanque_destino_id == tanque_id)
                | (MovimentacaoEstoque.tanque_origem_id == tanque_id),
                MovimentacaoEstoque.created_at >= desde,
            )
            .group_by(agrupar)
        )
    ).all()

    # delta diário por data
    delta: dict[date, Decimal] = {}
    for dia, soma in rows:
        if dia is not None and soma is not None:
            if isinstance(dia, str):
                key = date.fromisoformat(dia[:10])
            elif hasattr(dia, "date"):
                key = dia.date()
            else:
                key = dia
            delta[key] = Decimal(soma)

    tanque = await _get_tanque(db, user, tanque_id)
    saldo = Decimal(tanque.estoque_atual)

    # Pontos em ordem cronológica com o saldo ao FIM de cada dia. Partimos do
    # saldo atual (fim de hoje) e retrocedemos: saldo_fim_(d-1) = saldo_fim_d − delta_d.
    hoje = date.today()
    pontos_rev: list[dict] = []
    pontos_rev.append({"data": hoje.isoformat(), "saldo": float(saldo)})
    for i in range(1, dias):
        d = hoje - timedelta(days=i)
        amanha = hoje - timedelta(days=i - 1)
        if amanha in delta:
            saldo -= delta[amanha]
        pontos_rev.append({"data": d.isoformat(), "saldo": float(saldo)})
    pontos_rev.reverse()

    return TanqueEvolucaoResponse(periodo_dias=dias, pontos=pontos_rev)


# ── Ajustes de estoque ──────────────────────────────────────────────────────


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
    return (await _enriquecer_movimentacoes(db, user.organization_id, [movimentacao]))[0]


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
    return await _enriquecer_movimentacoes(db, user.organization_id, movs)


# ── Inventário físico ───────────────────────────────────────────────────────


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
