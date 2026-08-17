"""Blocos de assinatura — assinatura em lote de peças."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_ATUANTES,
    PAPEIS_LEITURA,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.documento import BlocoAssinatura, BlocoAssinaturaDocumento, Documento
from app.models.processo import Processo
from app.models.user import User
from app.services import bloco_assinatura

router = APIRouter(tags=["blocos-assinatura"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


@router.get("/blocos-assinatura")
async def listar_blocos(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(
            BlocoAssinatura.id,
            BlocoAssinatura.nome,
            BlocoAssinatura.created_at,
            func.count(BlocoAssinaturaDocumento.documento_id),
        )
        .outerjoin(
            BlocoAssinaturaDocumento, BlocoAssinaturaDocumento.bloco_id == BlocoAssinatura.id
        )
        .where(BlocoAssinatura.tenant_id == tenant_id, BlocoAssinatura.deleted_at.is_(None))
        .group_by(BlocoAssinatura.id)
        .order_by(BlocoAssinatura.created_at.desc())
    )
    return [
        {
            "id": str(bloco_id),
            "nome": nome,
            "created_at": created_at.isoformat(),
            "total_documentos": total,
        }
        for bloco_id, nome, created_at, total in result.all()
    ]


@router.get("/blocos-assinatura/{bloco_id}")
async def detalhar_bloco(
    bloco_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    bloco = await db.get(BlocoAssinatura, bloco_id)
    if bloco is None or bloco.tenant_id != tenant_id or bloco.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bloco não encontrado")

    result = await db.execute(
        select(Documento.id, Documento.titulo, Documento.situacao, Processo.nup)
        .join(Processo, Processo.id == Documento.processo_id)
        .join(BlocoAssinaturaDocumento, BlocoAssinaturaDocumento.documento_id == Documento.id)
        .where(BlocoAssinaturaDocumento.bloco_id == bloco_id)
        .order_by(BlocoAssinaturaDocumento.ordem)
    )
    return {
        "id": str(bloco.id),
        "nome": bloco.nome,
        "documentos": [
            {"id": str(doc_id), "titulo": titulo, "situacao": situacao, "processo_nup": nup}
            for doc_id, titulo, situacao, nup in result.all()
        ],
    }


class CriarBlocoInput(BaseModel):
    nome: str


class AdicionarDocumentoInput(BaseModel):
    documento_id: str
    ordem: int = 0


class AssinarBlocoInput(BaseModel):
    papel_cargo: str | None = None
    nivel: str = "SIMPLES"


@router.post("/blocos-assinatura", status_code=201)
async def criar_bloco(
    payload: CriarBlocoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    bloco = await bloco_assinatura.criar_bloco(
        db, tenant_id, user, nome=payload.nome, client=get_client_info(request)
    )
    return {"id": str(bloco.id), "nome": bloco.nome}


@router.post("/blocos-assinatura/{bloco_id}/documentos", status_code=201)
async def adicionar_documento(
    bloco_id,
    payload: AdicionarDocumentoInput,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    item = await bloco_assinatura.adicionar_documento(
        db,
        tenant_id,
        user,
        bloco_id=bloco_id,
        documento_id=payload.documento_id,
        ordem=payload.ordem,
    )
    return {"bloco_id": str(item.bloco_id), "documento_id": str(item.documento_id)}


@router.post("/blocos-assinatura/{bloco_id}/assinar")
async def assinar_bloco(
    bloco_id,
    payload: AssinarBlocoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await bloco_assinatura.assinar_bloco(
        db,
        tenant_id,
        user,
        bloco_id=bloco_id,
        papel_cargo=payload.papel_cargo,
        nivel=payload.nivel,
        client=get_client_info(request),
    )
