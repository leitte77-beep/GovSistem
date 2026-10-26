"""Anexos clínicos — B.12-054, B.6-029, B.3-012.

Upload multipart com classificação, autoria e sigilo herdado do atendimento.
"""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir_alguma
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.services import anexos as svc
from app.services.auditoria import dados_do_cliente

router = APIRouter(prefix="/anexos", tags=["Anexos clínicos"])
LER = exigir_alguma(Permissao.PRONTUARIO_LER, Permissao.ODONTOLOGIA_LER)
ESCREVER = exigir_alguma(Permissao.PRONTUARIO_EDITAR, Permissao.ODONTOLOGIA_GERENCIAR)


class AnexoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    cidadao_id: uuid.UUID
    contexto: str
    contexto_id: uuid.UUID | None
    classificacao: str
    descricao: str | None
    nome_arquivo: str
    mime: str
    tamanho_bytes: int
    nivel_sigilo: str
    status_antivirus: str
    criado_por_id: uuid.UUID | None


class Baixa(BaseModel):
    model_config = ConfigDict(extra="forbid")
    motivo: str = Field(min_length=10, max_length=400)


@router.post("", response_model=AnexoOut, status_code=201)
async def anexar(
    r: Request,
    arquivo: UploadFile = File(...),
    cidadao_id: uuid.UUID = Form(...),
    contexto: Literal["CIDADAO", "PRONTUARIO", "ODONTOLOGIA"] = Form(...),
    classificacao: str = Form(..., min_length=2, max_length=60),
    contexto_id: uuid.UUID | None = Form(default=None),
    descricao: str | None = Form(default=None, max_length=2000),
    sigiloso: bool = Form(default=False),
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(ESCREVER),
    db: AsyncSession = Depends(get_db),
):
    """B.12-054, B.6-029, B.3-012 — anexa imagem/PDF com validação e antivírus."""
    return await svc.anexar(
        db,
        t,
        cidadao_id=cidadao_id,
        contexto=contexto,
        contexto_id=contexto_id,
        classificacao=classificacao,
        descricao=descricao,
        sigiloso=sigiloso,
        nome_arquivo=arquivo.filename or "",
        conteudo=await arquivo.read(),
        mime_declarado=arquivo.content_type,
        ator=u,
        cliente=dados_do_cliente(r),
    )


@router.get("/cidadaos/{cidadao_id}")
async def listar(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(LER),
    db: AsyncSession = Depends(get_db),
):
    """B.6-029, B.3-012 — anexos do cidadão; sigilosos aparecem velados."""
    return await svc.listar(db, t, cidadao_id, u, dados_do_cliente(r))


@router.get("/{id}/conteudo")
async def conteudo(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(LER),
    db: AsyncSession = Depends(get_db),
):
    """B.6-029, B.6-056 — download auditado."""
    dados, item = await svc.conteudo(db, t, id, u, dados_do_cliente(r))
    return Response(
        content=dados,
        media_type=item.mime,
        headers={"Content-Disposition": "inline", "Cache-Control": "no-store"},
    )


@router.post("/{id}/baixar", response_model=AnexoOut)
async def baixar(
    id: uuid.UUID,
    c: Baixa,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(ESCREVER),
    db: AsyncSession = Depends(get_db),
):
    """B.6-029 — baixa lógica com motivo."""
    return await svc.baixar(db, t, id, c.motivo, u, dados_do_cliente(r))
