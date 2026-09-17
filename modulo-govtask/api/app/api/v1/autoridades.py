"""Cadastro de autoridades, parlamentares e instituições (§7, §148).

O histórico da autoridade é informação administrativa: quanto foi indicado,
aprovado e executado. Não produz ranking, nota nem comparação entre autoridades
— seria transformar um cadastro de contato em material de propaganda.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.autoridade import Autoridade, AutoridadeContato
from app.models.demanda import Demanda
from app.models.enums import EsferaRecurso, TipoAutoridade
from app.models.user import User
from app.services.demandas import aplicar_escopo

router = APIRouter(prefix="/autoridades", tags=["Autoridades"])


class ContatoIn(BaseModel):
    nome: str = Field(min_length=2, max_length=255)
    funcao: str | None = Field(default=None, max_length=150)
    telefone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    observacoes: str | None = None


class ContatoOut(ContatoIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class AutoridadeIn(BaseModel):
    nome: str = Field(min_length=2, max_length=255)
    tipo: TipoAutoridade = TipoAutoridade.OUTRO
    cargo: str | None = Field(default=None, max_length=150)
    instituicao: str | None = Field(default=None, max_length=255)
    partido: str | None = Field(default=None, max_length=60)
    esfera: EsferaRecurso | None = None
    telefone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    assessor_nome: str | None = Field(default=None, max_length=255)
    assessor_telefone: str | None = Field(default=None, max_length=40)
    observacoes: str | None = None
    ativo: bool = True


class AutoridadeUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=2, max_length=255)
    tipo: TipoAutoridade | None = None
    cargo: str | None = None
    instituicao: str | None = None
    partido: str | None = None
    esfera: EsferaRecurso | None = None
    telefone: str | None = None
    email: str | None = None
    assessor_nome: str | None = None
    assessor_telefone: str | None = None
    observacoes: str | None = None
    ativo: bool | None = None


class AutoridadeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    tipo: TipoAutoridade
    cargo: str | None
    instituicao: str | None
    partido: str | None
    esfera: EsferaRecurso | None
    telefone: str | None
    email: str | None
    assessor_nome: str | None
    assessor_telefone: str | None
    observacoes: str | None
    ativo: bool
    contatos: list[ContatoOut] = []


async def _get_autoridade(
    db: AsyncSession, autoridade_id: uuid.UUID, user: User
) -> Autoridade:
    autoridade = (
        await db.execute(
            select(Autoridade)
            .where(
                Autoridade.id == autoridade_id,
                Autoridade.organization_id == user.organization_id,
                Autoridade.deleted_at.is_(None),
            )
            .options(selectinload(Autoridade.contatos))
        )
    ).scalar_one_or_none()
    if autoridade is None:
        raise HTTPException(404, "Autoridade não encontrada")
    return autoridade


@router.get("", response_model=list[AutoridadeOut])
async def listar(
    busca: str | None = None,
    tipo: TipoAutoridade | None = None,
    esfera: EsferaRecurso | None = None,
    apenas_ativas: bool = True,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    stmt = (
        select(Autoridade)
        .where(
            Autoridade.organization_id == user.organization_id,
            Autoridade.deleted_at.is_(None),
        )
        .options(selectinload(Autoridade.contatos))
        .order_by(Autoridade.nome)
        .limit(limit)
        .offset(offset)
    )
    if apenas_ativas:
        stmt = stmt.where(Autoridade.ativo.is_(True))
    if tipo is not None:
        stmt = stmt.where(Autoridade.tipo == tipo)
    if esfera is not None:
        stmt = stmt.where(Autoridade.esfera == esfera)
    if busca:
        alvo = f"%{busca.strip()}%"
        stmt = stmt.where(
            or_(
                Autoridade.nome.ilike(alvo),
                Autoridade.instituicao.ilike(alvo),
                Autoridade.cargo.ilike(alvo),
            )
        )
    return (await db.execute(stmt)).scalars().all()


@router.post("", response_model=AutoridadeOut, status_code=201)
async def criar(
    payload: AutoridadeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_CREATE)),
):
    autoridade = Autoridade(
        organization_id=user.organization_id, **payload.model_dump()
    )
    db.add(autoridade)
    await db.commit()
    return await _get_autoridade(db, autoridade.id, user)


@router.get("/{autoridade_id}", response_model=AutoridadeOut)
async def detalhe(
    autoridade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    return await _get_autoridade(db, autoridade_id, user)


@router.patch("/{autoridade_id}", response_model=AutoridadeOut)
async def editar(
    autoridade_id: uuid.UUID,
    payload: AutoridadeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    autoridade = await _get_autoridade(db, autoridade_id, user)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(autoridade, campo, valor)
    await db.commit()
    return await _get_autoridade(db, autoridade_id, user)


@router.delete("/{autoridade_id}", status_code=204)
async def inativar(
    autoridade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_DELETE)),
):
    """Exclusão lógica. Demandas já vinculadas continuam apontando para o cadastro."""
    autoridade = await _get_autoridade(db, autoridade_id, user)
    autoridade.ativo = False
    autoridade.deleted_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/{autoridade_id}/contatos", response_model=ContatoOut, status_code=201)
async def adicionar_contato(
    autoridade_id: uuid.UUID,
    payload: ContatoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    autoridade = await _get_autoridade(db, autoridade_id, user)
    contato = AutoridadeContato(autoridade_id=autoridade.id, **payload.model_dump())
    db.add(contato)
    await db.commit()
    await db.refresh(contato)
    return contato


@router.delete("/{autoridade_id}/contatos/{contato_id}", status_code=204)
async def remover_contato(
    autoridade_id: uuid.UUID,
    contato_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    autoridade = await _get_autoridade(db, autoridade_id, user)
    contato = (
        await db.execute(
            select(AutoridadeContato).where(
                AutoridadeContato.id == contato_id,
                AutoridadeContato.autoridade_id == autoridade.id,
            )
        )
    ).scalar_one_or_none()
    if contato is None:
        raise HTTPException(404, "Contato não encontrado")
    await db.delete(contato)
    await db.commit()


@router.get("/{autoridade_id}/historico")
async def historico(
    autoridade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Demandas relacionadas e valores consolidados (§148).

    Usa o mesmo escopo de visibilidade das demandas: uma demanda sigilosa que o
    usuário não pode abrir também não entra na soma, senão o total revelaria
    indiretamente o que a rota de detalhe recusa mostrar.
    """
    autoridade = await _get_autoridade(db, autoridade_id, user)
    stmt = aplicar_escopo(
        select(Demanda).where(Demanda.autoridade_id == autoridade.id),
        user,
        get_user_permissions(user),
        incluir_arquivadas=True,
    ).order_by(Demanda.created_at.desc())
    demandas = (await db.execute(stmt)).scalars().all()

    def soma(campo: str) -> float:
        return float(sum(getattr(d, campo) or 0 for d in demandas))

    return {
        "autoridade": {
            "id": str(autoridade.id),
            "nome": autoridade.nome,
            "cargo": autoridade.cargo,
            "instituicao": autoridade.instituicao,
            "esfera": autoridade.esfera,
        },
        "total_demandas": len(demandas),
        "em_andamento": sum(1 for d in demandas if not d.encerrada),
        "concluidas": sum(1 for d in demandas if d.concluida_em is not None),
        "valor_indicado": soma("valor_previsto"),
        "valor_aprovado": soma("valor_aprovado"),
        "valor_contratado": soma("valor_contratado"),
        "valor_executado": soma("valor_executado"),
        "valor_pago": soma("valor_pago"),
        "demandas": [
            {
                "id": str(d.id),
                "numero": d.numero,
                "titulo": d.titulo,
                "situacao": d.status.rotulo if d.status else None,
                "concluida_em": d.concluida_em,
                "valor_aprovado": float(d.valor_aprovado or 0),
            }
            for d in demandas
        ],
    }
