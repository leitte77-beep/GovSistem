"""Estrutura organizacional: secretarias, setores e usuários (seção 81)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir, get_current_user
from app.core.database import get_db
from app.core.permissoes import P, mapa_perfis
from app.models.organizacao import Secretaria, Setor, User
from app.schemas.comuns import Criado
from app.schemas.organizacao import (
    SecretariaIn,
    SecretariaOut,
    SetorIn,
    SetorOut,
    UsuarioOut,
    UsuarioUpdate,
)

router = APIRouter(tags=["Estrutura organizacional"])


@router.get("/perfis", response_model=list[dict])
async def perfis(user: User = Depends(get_current_user)):
    return mapa_perfis()


@router.get("/secretarias", response_model=list[SecretariaOut])
async def listar_secretarias(
    db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.DASHBOARD_VISUALIZAR))
):
    resultado = await db.scalars(
        select(Secretaria)
        .where(Secretaria.organizacao_id == user.organizacao_id, Secretaria.deleted_at.is_(None))
        .order_by(Secretaria.nome)
    )
    return list(resultado.all())


@router.post("/secretarias", response_model=Criado, status_code=201)
async def criar_secretaria(
    payload: SecretariaIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.USUARIOS_GERENCIAR)),
):
    secretaria = Secretaria(organizacao_id=user.organizacao_id, **payload.model_dump())
    db.add(secretaria)
    await db.flush()
    await db.commit()
    return Criado(id=secretaria.id, mensagem="Secretaria criada com sucesso.")


@router.get("/setores", response_model=list[SetorOut])
async def listar_setores(
    secretaria_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.DASHBOARD_VISUALIZAR)),
):
    consulta = (
        select(Setor)
        .join(Secretaria, Secretaria.id == Setor.secretaria_id)
        .where(Secretaria.organizacao_id == user.organizacao_id, Setor.deleted_at.is_(None))
    )
    if secretaria_id:
        consulta = consulta.where(Setor.secretaria_id == secretaria_id)
    resultado = await db.scalars(consulta.order_by(Setor.nome))
    return list(resultado.all())


@router.post("/setores", response_model=Criado, status_code=201)
async def criar_setor(
    payload: SetorIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.USUARIOS_GERENCIAR)),
):
    await buscar_da_organizacao(db, Secretaria, payload.secretaria_id, user)
    setor = Setor(**payload.model_dump())
    db.add(setor)
    await db.flush()
    await db.commit()
    return Criado(id=setor.id, mensagem="Setor criado com sucesso.")


@router.get("/usuarios", response_model=list[UsuarioOut])
async def listar_usuarios(
    db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.USUARIOS_GERENCIAR))
):
    resultado = await db.scalars(
        select(User)
        .where(User.organizacao_id == user.organizacao_id, User.deleted_at.is_(None))
        .order_by(User.nome)
    )
    return list(resultado.all())


@router.patch("/usuarios/{usuario_id}", response_model=UsuarioOut)
async def atualizar_usuario(
    usuario_id: uuid.UUID,
    payload: UsuarioUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.USUARIOS_GERENCIAR)),
):
    alvo = await buscar_da_organizacao(db, User, usuario_id, user)
    dados = payload.model_dump(exclude_unset=True)
    for campo, valor in dados.items():
        setattr(alvo, campo, valor)
    await db.commit()
    await db.refresh(alvo)
    return alvo
