"""Regras automáticas de encaminhamento (CRUD) e sugestão de destino."""

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import PAPEIS_LEITURA, get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.roteamento import RegraEncaminhamento
from app.models.unidade import Unidade
from app.models.user import User
from app.services import roteamento
from app.services.auditoria import registrar

router = APIRouter(tags=["roteamento"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


class CondicaoInput(BaseModel):
    campo: str
    operador: str = "IGUAL"
    valor: Optional[str] = None


class RegraInput(BaseModel):
    nome: str = Field(min_length=3, max_length=200)
    tipo_processo_id: Optional[uuid.UUID] = None
    condicoes: list[CondicaoInput] = []
    unidade_destino_id: uuid.UUID
    prioridade: int = 0
    ativa: bool = True
    observacao: Optional[str] = None


class RegraUpdate(BaseModel):
    nome: Optional[str] = None
    tipo_processo_id: Optional[uuid.UUID] = None
    condicoes: Optional[list[CondicaoInput]] = None
    unidade_destino_id: Optional[uuid.UUID] = None
    prioridade: Optional[int] = None
    ativa: Optional[bool] = None
    observacao: Optional[str] = None


def _out(r: RegraEncaminhamento) -> dict:
    return {
        "id": str(r.id),
        "nome": r.nome,
        "tipo_processo_id": str(r.tipo_processo_id) if r.tipo_processo_id else None,
        "condicoes": r.condicoes,
        "unidade_destino_id": str(r.unidade_destino_id),
        "prioridade": r.prioridade,
        "ativa": r.ativa,
        "observacao": r.observacao,
    }


async def _valida_destino(db: AsyncSession, tenant_id: uuid.UUID, unidade_id: uuid.UUID) -> Unidade:
    from fastapi import HTTPException, status

    unidade = await db.get(Unidade, unidade_id)
    if unidade is None or unidade.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unidade de destino não encontrada",
        )
    return unidade


@router.get("/regras-encaminhamento")
async def listar_regras(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(RegraEncaminhamento)
        .where(RegraEncaminhamento.tenant_id == tenant_id, RegraEncaminhamento.deleted_at.is_(None))
        .order_by(RegraEncaminhamento.prioridade.desc(), RegraEncaminhamento.created_at)
    )
    return [_out(r) for r in result.scalars()]


@router.post("/regras-encaminhamento", status_code=201)
async def criar_regra(
    payload: RegraInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(RoleName.ADMIN.value)),
):
    await _valida_destino(db, tenant_id, payload.unidade_destino_id)

    regra = RegraEncaminhamento(
        tenant_id=tenant_id,
        nome=payload.nome.strip(),
        tipo_processo_id=payload.tipo_processo_id,
        condicoes=[c.model_dump() for c in payload.condicoes],
        unidade_destino_id=payload.unidade_destino_id,
        prioridade=payload.prioridade,
        ativa=payload.ativa,
        observacao=payload.observacao,
    )
    db.add(regra)
    await db.flush()

    await registrar(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="regra_encaminhamento",
        entity_id=str(regra.id),
        actor_user_id=user.id,
        ip_address=get_client_info(request)["ip_address"],
        user_agent=get_client_info(request)["user_agent"],
        dados_depois=_out(regra),
    )
    await db.commit()
    await db.refresh(regra)
    return _out(regra)


@router.patch("/regras-encaminhamento/{regra_id}")
async def atualizar_regra(
    regra_id: uuid.UUID,
    payload: RegraUpdate,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(RoleName.ADMIN.value)),
):
    from fastapi import HTTPException, status

    regra = await db.get(RegraEncaminhamento, regra_id)
    if regra is None or regra.tenant_id != tenant_id or regra.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra não encontrada")

    antes = _out(regra)
    dados = payload.model_dump(exclude_unset=True)
    if "unidade_destino_id" in dados and dados["unidade_destino_id"] is not None:
        await _valida_destino(db, tenant_id, dados["unidade_destino_id"])

    for campo, valor in dados.items():
        setattr(regra, campo, valor)
    await db.flush()

    await registrar(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="regra_encaminhamento",
        entity_id=str(regra.id),
        actor_user_id=user.id,
        ip_address=get_client_info(request)["ip_address"],
        user_agent=get_client_info(request)["user_agent"],
        dados_antes=antes,
        dados_depois=_out(regra),
    )
    await db.commit()
    await db.refresh(regra)
    return _out(regra)


@router.delete("/regras-encaminhamento/{regra_id}", status_code=204)
async def excluir_regra(
    regra_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(RoleName.ADMIN.value)),
):
    from datetime import datetime, timezone

    from fastapi import HTTPException, status

    regra = await db.get(RegraEncaminhamento, regra_id)
    if regra is None or regra.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra não encontrada")

    regra.deleted_at = datetime.now(timezone.utc)
    await registrar(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="regra_encaminhamento",
        entity_id=str(regra.id),
        actor_user_id=user.id,
        ip_address=get_client_info(request)["ip_address"],
        user_agent=get_client_info(request)["user_agent"],
        detalhe={"removida": True},
    )
    await db.commit()


class SugestaoInput(BaseModel):
    tipo_processo_id: uuid.UUID
    especificacao: str = ""
    nivel_acesso: Optional[str] = None
    classe_id: Optional[uuid.UUID] = None


@router.post("/roteamento/sugerir")
async def sugerir_destino(
    payload: SugestaoInput,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    destino = await roteamento.resolver_destino(
        db,
        tenant_id,
        tipo_processo_id=payload.tipo_processo_id,
        especificacao=payload.especificacao,
        nivel_acesso=payload.nivel_acesso,
        classe_id=payload.classe_id,
    )
    if destino is None:
        result = await db.execute(
            select(Unidade)
            .where(Unidade.tenant_id == tenant_id, Unidade.protocolizadora.is_(True))
            .order_by(Unidade.created_at)
            .limit(1)
        )
        destino = result.scalar_one_or_none()
        origem = "protocolo_central"
    else:
        origem = "regra"

    if destino is None:
        return {"origem": origem, "unidade_id": None, "unidade_sigla": None}

    return {
        "origem": origem,
        "unidade_id": str(destino.id),
        "unidade_sigla": destino.sigla,
        "unidade_nome": destino.nome,
    }
