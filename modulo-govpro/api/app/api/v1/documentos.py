import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_ATUANTES,
    PAPEIS_LEITURA,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.documento import Documento
from app.models.enums import FormatoDocumento, NivelAcesso
from app.models.user import User
from app.schemas import DocumentoCreate, DocumentoEdit, DocumentoOut
from app.services import captura
from app.services import documento as documento_service

router = APIRouter(tags=["documentos"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


@router.post("/processos/{processo_id}/documentos", response_model=DocumentoOut, status_code=201)
async def criar_documento(
    processo_id,
    payload: DocumentoCreate,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await documento_service.criar_documento_interno(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        titulo=payload.titulo,
        conteudo_html=payload.conteudo_html,
        tipo_documento_id=payload.tipo_documento_id,
        nivel_acesso=payload.nivel_acesso,
        hipotese_legal_id=payload.hipotese_legal_id,
        unidade_id=payload.unidade_id,
        client=get_client_info(request),
    )


@router.get("/processos/{processo_id}/documentos", response_model=list[DocumentoOut])
async def listar_documentos_processo(
    processo_id,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(Documento)
        .where(
            Documento.processo_id == uuid.UUID(processo_id),
            Documento.tenant_id == tenant_id,
        )
        .order_by(Documento.created_at)
    )
    return list(result.scalars())


@router.get("/documentos/{documento_id}", response_model=DocumentoOut)
async def detalhe_documento(
    documento_id,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    documento = await db.get(Documento, documento_id)
    if documento is None or documento.tenant_id != tenant_id:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )
    return documento


@router.patch("/documentos/{documento_id}", response_model=DocumentoOut)
async def editar_documento(
    documento_id,
    payload: DocumentoEdit,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await documento_service.editar_documento(
        db,
        tenant_id,
        user,
        documento_id=documento_id,
        conteudo_html=payload.conteudo_html,
        titulo=payload.titulo,
        client=get_client_info(request),
    )


@router.post(
    "/processos/{processo_id}/documentos/upload", response_model=DocumentoOut, status_code=201
)
async def capturar_documento(
    processo_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
    arquivo: UploadFile = File(...),
    titulo: str = Form(...),
    tipo_documento_id: str | None = Form(default=None),
    nivel_acesso: str = Form(default=NivelAcesso.PUBLICO.value),
    hipotese_legal_id: str | None = Form(default=None),
    unidade_id: str | None = Form(default=None),
    formato: str = Form(default=FormatoDocumento.CAPTURADO.value),
    responsavel: str | None = Form(default=None),
    autor: str | None = Form(default=None),
    assunto: str | None = Form(default=None),
    data_digitalizacao: str | None = Form(default=None),
    local_digitalizacao: str | None = Form(default=None),
):
    conteudo = await arquivo.read()
    metadados = {}
    for campo, valor in {
        "responsavel": responsavel,
        "autor": autor,
        "assunto": assunto,
        "data_digitalizacao": data_digitalizacao,
        "local_digitalizacao": local_digitalizacao,
    }.items():
        if valor:
            metadados[campo] = valor

    return await captura.capturar_documento_externo(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        titulo=titulo,
        nome_original=arquivo.filename or "arquivo",
        mime=arquivo.content_type or "application/octet-stream",
        conteudo=conteudo,
        tipo_documento_id=tipo_documento_id,
        nivel_acesso=nivel_acesso,
        hipotese_legal_id=hipotese_legal_id,
        unidade_id=unidade_id,
        formato=formato,
        metadados=metadados or None,
        client=get_client_info(request),
    )


@router.get("/documentos/{documento_id}/download")
async def baixar_documento(
    documento_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    from app.models.processo import Processo
    from app.services import auditoria, sigilo

    documento = await db.get(Documento, documento_id)
    if documento is None or documento.tenant_id != tenant_id:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )

    processo = await db.get(Processo, documento.processo_id)
    await sigilo.verificar_acesso_sigiloso(db, user, processo)

    conteudo, mime, nome = await documento_service.obter_conteudo_documento(
        db, tenant_id, documento_id
    )

    await auditoria.registrar(
        db,
        tenant_id=tenant_id,
        action="DOWNLOAD",
        entity="documento",
        entity_id=str(documento.id),
        actor_user_id=user.id,
        processo_id=documento.processo_id,
        ip_address=get_client_info(request)["ip_address"],
        user_agent=get_client_info(request)["user_agent"],
    )
    await db.commit()

    return Response(
        content=conteudo,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.post("/documentos/{documento_id}/tarjar")
async def tarjar_documento(
    documento_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
    arquivo: UploadFile = File(...),
    motivo: str = Form(...),
):
    conteudo = await arquivo.read()
    versao = await documento_service.tarjar_documento(
        db,
        tenant_id,
        user,
        documento_id=documento_id,
        conteudo_tarjado=conteudo,
        mime=arquivo.content_type or "application/pdf",
        motivo=motivo,
        client=get_client_info(request),
    )
    return {"documento_id": str(versao.documento_id), "versao_publica_id": str(versao.id)}
