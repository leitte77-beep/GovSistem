"""Filtros salvos e visões pessoais (§49, §50).

A visão guarda filtros, nunca resultados: o escopo de visibilidade é reavaliado
a cada consulta. Uma visão compartilhada, portanto, mostra a cada pessoa o que
aquela pessoa poderia ver de todo modo.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.user import User
from app.models.visao_salva import VisaoSalva

router = APIRouter(prefix="/visoes", tags=["Visões salvas"])

RECURSOS = {"DEMANDAS", "TAREFAS", "OBRAS", "PROTOCOLOS"}
LAYOUTS = {"LISTA", "CARDS", "KANBAN", "CALENDARIO", "AGENDA"}

# Chaves de filtro aceitas. A lista branca existe para que uma visão não possa
# injetar um campo arbitrário na consulta de demandas nem carregar payload que
# outro usuário receberia ao abrir uma visão compartilhada.
FILTROS_PERMITIDOS = {
    "busca", "status_id", "tipo_id", "categoria_id", "subcategoria_id",
    "prioridade", "criticidade", "impacto", "confidencialidade", "origem",
    "setor_atual_id", "setor_solicitante_id", "responsavel_geral_id",
    "responsavel_atual_id", "gestor_id", "solicitante_id", "autoridade_id",
    "esfera", "fonte_recurso", "orgao_concedente", "programa", "exercicio",
    "tag", "atrasada", "sem_movimentacao_dias", "bloqueada",
    "aguardando_terceiro", "prazo_ate", "prazo_de", "criada_de", "criada_ate",
    "valor_min", "valor_max", "encerradas", "arquivadas", "seguindo",
    "ordenar_por", "ordem",
}


class VisaoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    filtros: dict = Field(default_factory=dict)
    descricao: str | None = Field(default=None, max_length=400)
    recurso: str = "DEMANDAS"
    layout: str = "LISTA"
    compartilhada: bool = False
    padrao: bool = False


class VisaoUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=120)
    descricao: str | None = None
    filtros: dict | None = None
    layout: str | None = None
    compartilhada: bool | None = None
    padrao: bool | None = None


class VisaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    descricao: str | None
    recurso: str
    filtros: dict
    layout: str
    compartilhada: bool
    padrao: bool
    user_id: uuid.UUID
    minha: bool = False


def _validar(recurso: str, layout: str, filtros: dict) -> dict:
    if recurso not in RECURSOS:
        raise HTTPException(422, f"Recurso inválido. Use um de: {sorted(RECURSOS)}")
    if layout not in LAYOUTS:
        raise HTTPException(422, f"Layout inválido. Use um de: {sorted(LAYOUTS)}")
    desconhecidos = set(filtros) - FILTROS_PERMITIDOS
    if desconhecidos:
        raise HTTPException(422, f"Filtros não suportados: {sorted(desconhecidos)}")
    return filtros


def _saida(v: VisaoSalva, user: User) -> VisaoOut:
    return VisaoOut(
        id=v.id,
        nome=v.nome,
        descricao=v.descricao,
        recurso=v.recurso,
        filtros=v.filtros,
        layout=v.layout,
        compartilhada=v.compartilhada,
        padrao=v.padrao,
        user_id=v.user_id,
        minha=v.user_id == user.id,
    )


async def _minha_visao(
    db: AsyncSession, visao_id: uuid.UUID, user: User
) -> VisaoSalva:
    visao = (
        await db.execute(
            select(VisaoSalva).where(
                VisaoSalva.id == visao_id,
                VisaoSalva.organization_id == user.organization_id,
                VisaoSalva.user_id == user.id,
                VisaoSalva.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if visao is None:
        # 404 e não 403: uma visão de outra pessoa não deve ter sua existência
        # confirmada a quem não pode alterá-la.
        raise HTTPException(404, "Visão não encontrada")
    return visao


@router.get("", response_model=list[VisaoOut])
async def listar(
    recurso: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """As minhas visões, mais as que a organização compartilhou."""
    stmt = (
        select(VisaoSalva)
        .where(
            VisaoSalva.organization_id == user.organization_id,
            VisaoSalva.deleted_at.is_(None),
            or_(VisaoSalva.user_id == user.id, VisaoSalva.compartilhada.is_(True)),
        )
        .order_by(VisaoSalva.padrao.desc(), VisaoSalva.nome)
    )
    if recurso:
        stmt = stmt.where(VisaoSalva.recurso == recurso)
    return [_saida(v, user) for v in (await db.execute(stmt)).scalars().all()]


@router.post("", response_model=VisaoOut, status_code=201)
async def criar(
    payload: VisaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    _validar(payload.recurso, payload.layout, payload.filtros)
    existente = (
        await db.execute(
            select(VisaoSalva.id).where(
                VisaoSalva.organization_id == user.organization_id,
                VisaoSalva.user_id == user.id,
                VisaoSalva.nome == payload.nome,
                VisaoSalva.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existente is not None:
        raise HTTPException(409, "Você já tem uma visão com esse nome")

    if payload.padrao:
        await _limpar_padrao(db, user, payload.recurso)
    visao = VisaoSalva(
        organization_id=user.organization_id, user_id=user.id, **payload.model_dump()
    )
    db.add(visao)
    await db.commit()
    await db.refresh(visao)
    return _saida(visao, user)


async def _limpar_padrao(db: AsyncSession, user: User, recurso: str) -> None:
    """Só uma visão padrão por recurso, senão a tela não saberia qual abrir."""
    anteriores = (
        (
            await db.execute(
                select(VisaoSalva).where(
                    VisaoSalva.organization_id == user.organization_id,
                    VisaoSalva.user_id == user.id,
                    VisaoSalva.recurso == recurso,
                    VisaoSalva.padrao.is_(True),
                    VisaoSalva.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for anterior in anteriores:
        anterior.padrao = False


@router.patch("/{visao_id}", response_model=VisaoOut)
async def editar(
    visao_id: uuid.UUID,
    payload: VisaoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    visao = await _minha_visao(db, visao_id, user)
    alterados = payload.model_dump(exclude_unset=True)
    _validar(
        visao.recurso,
        alterados.get("layout", visao.layout),
        alterados.get("filtros", visao.filtros),
    )
    if alterados.get("padrao"):
        await _limpar_padrao(db, user, visao.recurso)
    for campo, valor in alterados.items():
        setattr(visao, campo, valor)
    await db.commit()
    await db.refresh(visao)
    return _saida(visao, user)


@router.delete("/{visao_id}", status_code=204)
async def excluir(
    visao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    visao = await _minha_visao(db, visao_id, user)
    visao.deleted_at = datetime.now(timezone.utc)
    await db.commit()
