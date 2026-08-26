import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.combustivel import Fornecedor, Oficina
from app.models.estoque import EntradaCombustivel
from app.schemas.schemas import (
    FornecedorCreate,
    FornecedorDetalheResponse,
    FornecedorResponse,
    FornecedorUpdate,
    OficinaCreate,
    OficinaResponse,
    OficinaUpdate,
)
from app.services.auditoria import registrar_auditoria

router = APIRouter(tags=["fornecedores e oficinas"])


async def _montar_fornecedor(
    db: AsyncSession,
    organization_id: uuid.UUID,
    fornecedor: Fornecedor,
    *,
    total_entradas: int = 0,
    litros_fornecidos: float = 0,
    valor_total: float = 0,
    ultima_compra: dict | None = None,
) -> FornecedorResponse:
    return FornecedorResponse(
        id=fornecedor.id,
        razao_social=fornecedor.razao_social,
        nome_fantasia=fornecedor.nome_fantasia,
        cpf_cnpj=fornecedor.cpf_cnpj,
        telefone=fornecedor.telefone,
        email=fornecedor.email,
        site=fornecedor.site,
        contato=fornecedor.contato,
        cep=fornecedor.cep,
        logradouro=fornecedor.logradouro,
        numero=fornecedor.numero,
        complemento=fornecedor.complemento,
        bairro=fornecedor.bairro,
        cidade=fornecedor.cidade,
        uf=fornecedor.uf,
        endereco=fornecedor.endereco,
        foto_url=fornecedor.foto_url,
        categoria=fornecedor.categoria,
        observacoes=fornecedor.observacoes,
        ativo=fornecedor.ativo,
        total_entradas=total_entradas,
        litros_fornecidos=litros_fornecidos,
        valor_total=valor_total,
        ultima_compra=ultima_compra,
    )


async def _agregados(
    db: AsyncSession, organization_id: uuid.UUID, fornecedor_id: uuid.UUID
) -> tuple[int, float, float, dict | None]:
    """Total de entradas, litros, valor e última compra do fornecedor."""
    row = (
        await db.execute(
            select(
                sa_func.count(EntradaCombustivel.id),
                sa_func.coalesce(sa_func.sum(EntradaCombustivel.quantidade_litros), 0),
                sa_func.coalesce(sa_func.sum(EntradaCombustivel.valor_total), 0),
            ).where(
                EntradaCombustivel.organization_id == organization_id,
                EntradaCombustivel.fornecedor_id == fornecedor_id,
                EntradaCombustivel.cancelada.is_(False),
            )
        )
    ).one()
    total_entradas = int(row[0] or 0)
    litros = float(row[1] or 0)
    valor = float(row[2] or 0)

    ultima = (
        await db.execute(
            select(EntradaCombustivel)
            .where(
                EntradaCombustivel.organization_id == organization_id,
                EntradaCombustivel.fornecedor_id == fornecedor_id,
            )
            .order_by(EntradaCombustivel.data_entrada.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    ultima_compra = None
    if ultima is not None:
        ultima_compra = {
            "id": str(ultima.id),
            "data": ultima.data_entrada.isoformat(),
            "litros": float(ultima.quantidade_litros),
            "valor": float(ultima.valor_total) if ultima.valor_total else None,
            "nota": ultima.numero_nota,
            "cancelada": ultima.cancelada,
        }
    return total_entradas, litros, valor, ultima_compra


# ── Fornecedores ────────────────────────────────────────────────────────────


@router.get("/fornecedores", response_model=list[FornecedorResponse])
async def listar_fornecedores(
    search: str | None = None,
    categoria: str | None = None,
    ativo: bool | None = None,
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    base = select(Fornecedor).where(
        Fornecedor.organization_id == user.organization_id,
        Fornecedor.deleted_at.is_(None),
    )
    if search:
        like = f"%{search}%"
        base = base.where(
            (Fornecedor.razao_social.ilike(like))
            | (Fornecedor.nome_fantasia.ilike(like))
            | (Fornecedor.cpf_cnpj.ilike(like))
            | (Fornecedor.cidade.ilike(like))
        )
    if categoria:
        base = base.where(Fornecedor.categoria == categoria.upper())
    if ativo is not None:
        base = base.where(Fornecedor.ativo == ativo)

    total = await db.scalar(
        select(sa_func.count()).select_from(base.order_by(None).subquery())
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(int(total or 0))

    stmt = base.order_by(Fornecedor.razao_social).offset(skip).limit(min(limit, 200))
    fornecedores = (await db.execute(stmt)).scalars().all()

    respostas = []
    for f in fornecedores:
        total_entradas, litros, valor, ultima = await _agregados(
            db, user.organization_id, f.id
        )
        respostas.append(
            await _montar_fornecedor(
                db,
                user.organization_id,
                f,
                total_entradas=total_entradas,
                litros_fornecidos=litros,
                valor_total=valor,
                ultima_compra=ultima,
            )
        )
    return respostas


@router.post("/fornecedores", response_model=FornecedorResponse, status_code=201)
async def criar_fornecedor(
    body: FornecedorCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    fornecedor = Fornecedor(**body.model_dump(), organization_id=user.organization_id)
    db.add(fornecedor)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="fornecedor.criar",
        entidade="fornecedor",
        entidade_id=fornecedor.id,
        usuario_id=user.id,
        dados_novos={"razao_social": body.razao_social},
    )
    await db.commit()
    await db.refresh(fornecedor)
    return await _montar_fornecedor(db, user.organization_id, fornecedor)


@router.get("/fornecedores/{fornecedor_id}", response_model=FornecedorDetalheResponse)
async def obter_fornecedor(
    fornecedor_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    fornecedor = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == user.organization_id,
                Fornecedor.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if fornecedor is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")

    total_entradas, litros, valor, ultima = await _agregados(db, user.organization_id, fornecedor.id)
    base = await _montar_fornecedor(
        db,
        user.organization_id,
        fornecedor,
        total_entradas=total_entradas,
        litros_fornecidos=litros,
        valor_total=valor,
        ultima_compra=ultima,
    )

    historico = (
        await db.execute(
            select(EntradaCombustivel)
            .where(
                EntradaCombustivel.organization_id == user.organization_id,
                EntradaCombustivel.fornecedor_id == fornecedor.id,
            )
            .order_by(EntradaCombustivel.data_entrada.desc())
            .limit(50)
        )
    ).scalars().all()

    dados = base.model_dump()
    dados["historico_entradas"] = [
        {
            "id": str(e.id),
            "data": e.data_entrada.isoformat(),
            "litros": float(e.quantidade_litros),
            "valor": float(e.valor_total) if e.valor_total else None,
            "nota": e.numero_nota,
            "cancelada": e.cancelada,
        }
        for e in historico
    ]
    return FornecedorDetalheResponse(**dados)


@router.patch("/fornecedores/{fornecedor_id}", response_model=FornecedorResponse)
async def atualizar_fornecedor(
    fornecedor_id: uuid.UUID,
    body: FornecedorUpdate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    fornecedor = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == user.organization_id,
                Fornecedor.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if fornecedor is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(fornecedor, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="fornecedor.atualizar",
        entidade="fornecedor",
        entidade_id=fornecedor.id,
        usuario_id=user.id,
    )
    await db.commit()
    await db.refresh(fornecedor)
    return await _montar_fornecedor(db, user.organization_id, fornecedor)


@router.delete("/fornecedores/{fornecedor_id}", status_code=204)
async def excluir_fornecedor(
    fornecedor_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    fornecedor = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if fornecedor is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    fornecedor.deleted_at = datetime.now(timezone.utc)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="fornecedor.inativar",
        entidade="fornecedor",
        entidade_id=fornecedor.id,
        usuario_id=user.id,
    )
    await db.commit()


# ── Oficinas ────────────────────────────────────────────────────────────────


@router.get("/oficinas", response_model=list[OficinaResponse])
async def listar_oficinas(
    search: str | None = None,
    ativo: bool | None = None,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Oficina).where(
        Oficina.organization_id == user.organization_id,
        Oficina.deleted_at.is_(None),
    )
    if search:
        like = f"%{search}%"
        stmt = stmt.where((Oficina.nome.ilike(like)) | (Oficina.cpf_cnpj.ilike(like)))
    if ativo is not None:
        stmt = stmt.where(Oficina.ativo == ativo)
    return (await db.execute(stmt.order_by(Oficina.nome))).scalars().all()


@router.post("/oficinas", response_model=OficinaResponse, status_code=201)
async def criar_oficina(
    body: OficinaCreate,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    oficina = Oficina(**body.model_dump(), organization_id=user.organization_id)
    db.add(oficina)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="oficina.criar",
        entidade="oficina",
        entidade_id=oficina.id,
        usuario_id=user.id,
    )
    await db.commit()
    await db.refresh(oficina)
    return oficina


@router.get("/oficinas/{oficina_id}", response_model=OficinaResponse)
async def obter_oficina(
    oficina_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    oficina = (
        await db.execute(
            select(Oficina).where(
                Oficina.id == oficina_id,
                Oficina.organization_id == user.organization_id,
                Oficina.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if oficina is None:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")
    return oficina


@router.patch("/oficinas/{oficina_id}", response_model=OficinaResponse)
async def atualizar_oficina(
    oficina_id: uuid.UUID,
    body: OficinaUpdate,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    oficina = (
        await db.execute(
            select(Oficina).where(
                Oficina.id == oficina_id,
                Oficina.organization_id == user.organization_id,
                Oficina.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if oficina is None:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(oficina, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="oficina.atualizar",
        entidade="oficina",
        entidade_id=oficina.id,
        usuario_id=user.id,
    )
    await db.commit()
    await db.refresh(oficina)
    return oficina


@router.delete("/oficinas/{oficina_id}", status_code=204)
async def excluir_oficina(
    oficina_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    oficina = (
        await db.execute(
            select(Oficina).where(
                Oficina.id == oficina_id,
                Oficina.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if oficina is None:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")
    oficina.deleted_at = datetime.now(timezone.utc)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="oficina.inativar",
        entidade="oficina",
        entidade_id=oficina.id,
        usuario_id=user.id,
    )
    await db.commit()


@router.get("/oficinas/{oficina_id}/resumo")
async def resumo_oficina(
    oficina_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.MAINTENANCE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Histórico da oficina (§52): serviços, veículos, valores."""
    from sqlalchemy import func as sa_func

    from app.models.manutencao import Manutencao

    oficina = (
        await db.execute(
            select(Oficina).where(
                Oficina.id == oficina_id,
                Oficina.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if oficina is None:
        raise HTTPException(status_code=404, detail="Oficina não encontrada.")

    stats = (
        await db.execute(
            select(
                sa_func.count(Manutencao.id),
                sa_func.coalesce(sa_func.sum(Manutencao.valor_total), 0),
            ).where(
                Manutencao.organization_id == user.organization_id,
                Manutencao.oficina_id == oficina.id,
                Manutencao.deleted_at.is_(None),
            )
        )
    ).one()

    ultimas = (
        await db.execute(
            select(Manutencao)
            .where(
                Manutencao.organization_id == user.organization_id,
                Manutencao.oficina_id == oficina.id,
            )
            .order_by(Manutencao.created_at.desc())
            .limit(10)
        )
    ).scalars().all()

    return {
        "total_manutencoes": stats[0],
        "valor_total": float(stats[1]),
        "ultimas_manutencoes": [
            {
                "id": str(m.id),
                "veiculo_id": str(m.veiculo_id),
                "tipo": m.tipo,
                "status": m.status,
                "valor_total": float(m.valor_total),
                "data_solicitacao": m.data_solicitacao.isoformat(),
            }
            for m in ultimas
        ],
    }
