"""Unidades — secretarias (órgão público) ou centros de custo (empresa)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import filtro_escopo, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.unidade import Unidade
from app.models.veiculo import Veiculo
from app.schemas.schemas import UnidadeCreate, UnidadeResponse, UnidadeUpdate
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/unidades", tags=["unidades"])


async def _get(db: AsyncSession, user: User, unidade_id: uuid.UUID) -> Unidade:
    unidade = (
        await db.execute(
            select(Unidade).where(
                Unidade.id == unidade_id,
                Unidade.organization_id == user.organization_id,
                Unidade.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if unidade is None:
        raise HTTPException(status_code=404, detail="Unidade não encontrada.")
    return unidade


async def _nome_em_uso(
    db: AsyncSession, user: User, nome: str, exceto: uuid.UUID | None = None
) -> bool:
    conditions = [
        Unidade.organization_id == user.organization_id,
        Unidade.deleted_at.is_(None),
        sa_func.lower(Unidade.nome) == nome.strip().lower(),
    ]
    if exceto is not None:
        conditions.append(Unidade.id != exceto)
    return await db.scalar(select(Unidade.id).where(*conditions).limit(1)) is not None


async def _contagens(db: AsyncSession, user: User) -> dict[uuid.UUID, int]:
    return dict(
        (
            await db.execute(
                select(Veiculo.unidade_id, sa_func.count(Veiculo.id))
                .where(
                    Veiculo.organization_id == user.organization_id,
                    Veiculo.deleted_at.is_(None),
                    Veiculo.unidade_id.isnot(None),
                )
                .group_by(Veiculo.unidade_id)
            )
        ).all()
    )


def _resposta(u: Unidade, total: int = 0) -> UnidadeResponse:
    return UnidadeResponse(id=u.id, nome=u.nome, sigla=u.sigla, ativo=u.ativo, total_veiculos=total)


@router.get("", response_model=list[UnidadeResponse])
async def listar(
    ativo: bool | None = None,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Unidade).where(
        Unidade.organization_id == user.organization_id,
        Unidade.deleted_at.is_(None),
        filtro_escopo(user, Unidade.id),
    )
    if ativo is not None:
        stmt = stmt.where(Unidade.ativo.is_(ativo))
    unidades = (await db.execute(stmt.order_by(Unidade.nome))).scalars().all()
    contagens = await _contagens(db, user)
    return [_resposta(u, contagens.get(u.id, 0)) for u in unidades]


@router.post("", response_model=UnidadeResponse, status_code=201)
async def criar(
    body: UnidadeCreate,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    if await _nome_em_uso(db, user, body.nome):
        raise HTTPException(status_code=422, detail="Já existe uma unidade com este nome.")
    unidade = Unidade(
        organization_id=user.organization_id,
        nome=body.nome.strip(),
        sigla=(body.sigla or "").strip() or None,
        ativo=body.ativo,
    )
    db.add(unidade)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="unidade.criar",
        entidade="unidade",
        entidade_id=unidade.id,
        usuario_id=user.id,
        dados_novos={"nome": unidade.nome},
    )
    await db.commit()
    await db.refresh(unidade)
    return _resposta(unidade)


@router.patch("/{unidade_id}", response_model=UnidadeResponse)
async def atualizar(
    unidade_id: uuid.UUID,
    body: UnidadeUpdate,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    unidade = await _get(db, user, unidade_id)
    dados = body.model_dump(exclude_unset=True)
    if "nome" in dados:
        if await _nome_em_uso(db, user, dados["nome"], exceto=unidade.id):
            raise HTTPException(status_code=422, detail="Já existe uma unidade com este nome.")
        dados["nome"] = dados["nome"].strip()
    if "sigla" in dados:
        dados["sigla"] = (dados["sigla"] or "").strip() or None
    anteriores = {"nome": unidade.nome, "sigla": unidade.sigla, "ativo": unidade.ativo}
    for campo, valor in dados.items():
        setattr(unidade, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="unidade.atualizar",
        entidade="unidade",
        entidade_id=unidade.id,
        usuario_id=user.id,
        dados_anteriores=anteriores,
        dados_novos=dados,
    )
    await db.commit()
    await db.refresh(unidade)
    return _resposta(unidade, (await _contagens(db, user)).get(unidade.id, 0))


@router.delete("/{unidade_id}", status_code=204)
async def excluir(
    unidade_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Exclui a unidade — só se nenhum veículo estiver lotado nela. O histórico
    de abastecimentos/manutenções continua apontando para ela."""
    unidade = await _get(db, user, unidade_id)
    if (await _contagens(db, user)).get(unidade.id):
        raise HTTPException(
            status_code=422,
            detail="Há veículos lotados nesta unidade. Transfira-os ou inative a unidade.",
        )
    unidade.deleted_at = datetime.now(timezone.utc)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="unidade.excluir",
        entidade="unidade",
        entidade_id=unidade.id,
        usuario_id=user.id,
        dados_anteriores={"nome": unidade.nome},
    )
    await db.commit()
