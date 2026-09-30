import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.combustivel import Combustivel, ContratoPosto, Tanque
from app.models.veiculo import Veiculo, VeiculoTanque
from app.schemas.schemas import CombustivelCreate, CombustivelResponse
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/combustiveis", tags=["combustíveis"])


def _normalizar_categoria(categoria: str | None) -> str:
    valor = (categoria or "COMBUSTIVEL").strip().upper()
    if valor not in {"COMBUSTIVEL", "FLUIDO_AUXILIAR"}:
        raise HTTPException(
            status_code=422, detail="Categoria inválida. Use COMBUSTIVEL ou FLUIDO_AUXILIAR."
        )
    return valor


async def _montar_resposta(
    db: AsyncSession, user: User, combustivel: Combustivel, response: Response | None = None
) -> CombustivelResponse:
    """Conta tanques e veículos associados ao combustível (evita N+1 no frontend)."""
    total_tanques = int(
        await db.scalar(
            select(sa_func.count())
            .select_from(Tanque)
            .where(
                Tanque.organization_id == user.organization_id,
                Tanque.combustivel_id == combustivel.id,
                Tanque.deleted_at.is_(None),
            )
        )
        or 0
    )
    total_veiculos = (await _veiculos_por_combustivel(db, user, [combustivel.id])).get(combustivel.id, 0)
    precos = await _precos_referencia(db, user.organization_id, [combustivel.id])
    return CombustivelResponse(
        id=combustivel.id,
        nome=combustivel.nome,
        unidade=combustivel.unidade,
        categoria=combustivel.categoria,
        codigo_anp=combustivel.codigo_anp,
        especificacao=combustivel.especificacao,
        descricao=combustivel.descricao,
        foto_url=combustivel.foto_url,
        ativo=combustivel.ativo,
        simam_informar=combustivel.simam_informar,
        simam_categoria=combustivel.simam_categoria,
        simam_objeto=combustivel.simam_objeto,
        total_tanques=total_tanques,
        total_veiculos=total_veiculos,
        preco_referencia=precos.get(combustivel.id),
    )


async def _precos_referencia(
    db: AsyncSession, organization_id: uuid.UUID, ids: list[uuid.UUID]
) -> dict[uuid.UUID, Decimal]:
    """Preço vigente (R$/L) do contrato/ata ativo mais recente por combustível."""
    if not ids:
        return {}
    rows = (
        await db.execute(
            select(ContratoPosto.combustivel_id, ContratoPosto.preco_litro)
            .where(
                ContratoPosto.organization_id == organization_id,
                ContratoPosto.combustivel_id.in_(ids),
                ContratoPosto.ativo.is_(True),
                ContratoPosto.deleted_at.is_(None),
            )
            .order_by(
                ContratoPosto.data_inicio.desc().nulls_last(),
                ContratoPosto.created_at.desc(),
            )
        )
    ).all()
    precos: dict[uuid.UUID, Decimal] = {}
    for combustivel_id, preco_litro in rows:
        # Como estão ordenados do mais recente para o mais antigo, o primeiro
        # preço de cada combustível é o vigente.
        precos.setdefault(combustivel_id, preco_litro)
    return precos


async def _veiculos_por_combustivel(
    db: AsyncSession, user: User, ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Veículos que aceitam cada produto em algum reservatório (principal,
    alternativo/flex ou auxiliar). Cada veículo conta uma vez por produto."""
    contagem: dict[uuid.UUID, set] = {cid: set() for cid in ids}
    rows = (
        await db.execute(
            select(
                VeiculoTanque.veiculo_id,
                VeiculoTanque.combustivel_id,
                VeiculoTanque.combustivel_alternativo_id,
            )
            .join(Veiculo, Veiculo.id == VeiculoTanque.veiculo_id)
            .where(
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
                VeiculoTanque.deleted_at.is_(None),
                or_(
                    VeiculoTanque.combustivel_id.in_(ids),
                    VeiculoTanque.combustivel_alternativo_id.in_(ids),
                ),
            )
        )
    ).all()
    for veiculo_id, principal, alternativo in rows:
        for cid in (principal, alternativo):
            if cid in contagem:
                contagem[cid].add(veiculo_id)
    return {cid: len(v) for cid, v in contagem.items()}


@router.get("", response_model=list[CombustivelResponse])
async def listar(
    ativo: bool | None = None,
    categoria: str | None = None,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Combustivel).where(
        Combustivel.organization_id == user.organization_id,
        Combustivel.deleted_at.is_(None),
    )
    if ativo is not None:
        stmt = stmt.where(Combustivel.ativo == ativo)
    if categoria:
        stmt = stmt.where(Combustivel.categoria == _normalizar_categoria(categoria))
    stmt = stmt.order_by(Combustivel.nome)
    combustiveis = (await db.execute(stmt)).scalars().all()

    if combustiveis:
        ids = [c.id for c in combustiveis]
        tanques = dict(
            (
                await db.execute(
                    select(Tanque.combustivel_id, sa_func.count())
                    .where(
                        Tanque.organization_id == user.organization_id,
                        Tanque.combustivel_id.in_(ids),
                        Tanque.deleted_at.is_(None),
                    )
                    .group_by(Tanque.combustivel_id)
                )
            ).all()
        )
        veiculos = await _veiculos_por_combustivel(db, user, ids)
        precos = await _precos_referencia(db, user.organization_id, ids)
    else:
        tanques, veiculos, precos = {}, {}, {}

    return [
        CombustivelResponse(
            id=c.id,
            nome=c.nome,
            unidade=c.unidade,
            categoria=c.categoria,
            codigo_anp=c.codigo_anp,
            especificacao=c.especificacao,
            descricao=c.descricao,
            foto_url=c.foto_url,
            ativo=c.ativo,
            simam_informar=c.simam_informar,
            simam_categoria=c.simam_categoria,
            simam_objeto=c.simam_objeto,
            total_tanques=int(tanques.get(c.id, 0)),
            total_veiculos=int(veiculos.get(c.id, 0)),
            preco_referencia=precos.get(c.id),
        )
        for c in combustiveis
    ]


@router.get("/{combustivel_id}", response_model=CombustivelResponse)
async def obter(
    combustivel_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    combustivel = (
        await db.execute(
            select(Combustivel).where(
                Combustivel.id == combustivel_id,
                Combustivel.organization_id == user.organization_id,
                Combustivel.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if combustivel is None:
        raise HTTPException(status_code=404, detail="Combustível não encontrado.")
    return await _montar_resposta(db, user, combustivel)


@router.post("", response_model=CombustivelResponse, status_code=201)
async def criar(
    body: CombustivelCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    existente = await db.execute(
        select(Combustivel.id).where(
            Combustivel.organization_id == user.organization_id,
            sa_lower(Combustivel.nome) == body.nome.strip().lower(),
            Combustivel.deleted_at.is_(None),
        )
    )
    if existente.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Já existe um combustível com este nome.")
    dados = body.model_dump()
    dados["categoria"] = _normalizar_categoria(dados.get("categoria"))
    combustivel = Combustivel(**dados, organization_id=user.organization_id)
    db.add(combustivel)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="combustivel.criar",
        entidade="combustivel",
        entidade_id=combustivel.id,
        usuario_id=user.id,
        dados_novos={"nome": body.nome},
    )
    await db.commit()
    await db.refresh(combustivel)
    return await _montar_resposta(db, user, combustivel)


@router.patch("/{combustivel_id}", response_model=CombustivelResponse)
async def atualizar(
    combustivel_id: uuid.UUID,
    body: CombustivelCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Combustivel).where(
            Combustivel.id == combustivel_id,
            Combustivel.organization_id == user.organization_id,
            Combustivel.deleted_at.is_(None),
        )
    )
    combustivel = result.scalar_one_or_none()
    if combustivel is None:
        raise HTTPException(status_code=404, detail="Combustível não encontrado.")
    dados = body.model_dump(exclude_unset=True)
    if "categoria" in dados:
        dados["categoria"] = _normalizar_categoria(dados["categoria"])
    for campo, valor in dados.items():
        setattr(combustivel, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="combustivel.atualizar",
        entidade="combustivel",
        entidade_id=combustivel.id,
        usuario_id=user.id,
    )
    await db.commit()
    await db.refresh(combustivel)
    return await _montar_resposta(db, user, combustivel)


def sa_lower(col):  # pragma: no cover
    from sqlalchemy import func as sa_func

    return sa_func.lower(col)
