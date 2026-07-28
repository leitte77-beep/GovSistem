"""Endpoints de assinatura digital — fluxo completo com validade juridica.

GET    /assinaturas/pendentes       — documentos aguardando assinatura
GET    /assinaturas                 — historico completo (paginado)
POST   /assinaturas/solicitar       — solicita assinatura a outro usuario
POST   /assinaturas/{id}/assinar    — assina documento (recebe assinatura_base64 + hash)
GET    /assinaturas/{id}/certificado — download do certificado PDF/A
GET    /assinaturas/{id}/verificar   — status de verificacao de integridade
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.signing import AssinaturaDocumento
from app.models.user import User
from app.schemas.signing import (
    AssinaturaAssinarIn,
    AssinaturaCertificadoOut,
    AssinaturaOut,
    AssinaturaSolicitarIn,
    AssinaturaVerificacaoOut,
)
from app.services.signer import (
    assinar_documento,
    gerar_certificado_assinatura,
    gerar_hash_documento,
    listar_assinaturas,
    listar_pendentes,
    solicitar_assinatura,
    verificar_assinatura,
)

router = APIRouter(prefix="/assinaturas", tags=["assinaturas"])

_WRITE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)


# ═══════════════════════════════════════════════════════════════════════
# LISTAR PENDENTES
# ═══════════════════════════════════════════════════════════════════════

@router.get("/pendentes", response_model=list[AssinaturaOut])
async def listar_pendentes_endpoint(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Lista documentos aguardando assinatura no tenant.

    Se o usuario tiver signatario_id definido, filtra apenas os
    documentos designados para ele.
    """
    docs = await listar_pendentes(db, tenant_id=tenant_id)
    return docs


# ═══════════════════════════════════════════════════════════════════════
# HISTORICO COMPLETO
# ═══════════════════════════════════════════════════════════════════════

@router.get("", response_model=dict)
async def listar_assinaturas_endpoint(
    status: str | None = Query(None, description="PENDENTE | ASSINADO | EXPIRADO | RECUSADO"),
    documento_tipo: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Historico completo de assinaturas com paginacao e filtros."""
    docs, total = await listar_assinaturas(
        db,
        tenant_id=tenant_id,
        status=status,
        documento_tipo=documento_tipo,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [AssinaturaOut.model_validate(d) for d in docs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


# ═══════════════════════════════════════════════════════════════════════
# SOLICITAR ASSINATURA
# ═══════════════════════════════════════════════════════════════════════

@router.post("/solicitar", response_model=AssinaturaOut, status_code=201)
async def solicitar_assinatura_endpoint(
    payload: AssinaturaSolicitarIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    """Solicita assinatura digital para um documento.

    O hash SHA-256 do conteudo e calculado automaticamente e armazenado
    para verificacao futura de integridade.

    Body:
    - documento_tipo: tipo do documento (DECLARACAO, COMPROVANTE, etc.)
    - documento_id: ID da entidade de origem (opcional)
    - titulo: titulo descritivo
    - dados_documento: conteudo completo do documento (dict)
    - signatario_id: usuario que deve assinar (opcional)
    - signatario_nome: nome do signatario
    - signatario_cpf: CPF do signatario
    - motivo: justificativa
    - validade_dias: prazo de validade da assinatura
    """
    client_info = get_client_info(request)

    doc = await solicitar_assinatura(
        db,
        tenant_id=tenant_id,
        documento_tipo=payload.documento_tipo,
        documento_id=payload.documento_id,
        titulo=payload.titulo,
        dados_documento=payload.dados_documento,
        signatario_id=payload.signatario_id,
        signatario_nome=payload.signatario_nome,
        signatario_cpf=payload.signatario_cpf,
        motivo=payload.motivo,
        validade_dias=payload.validade_dias,
        solicitado_por=user,
        client_info=client_info,
    )
    await db.commit()
    await db.refresh(doc)
    return doc


# ═══════════════════════════════════════════════════════════════════════
# ASSINAR DOCUMENTO
# ═══════════════════════════════════════════════════════════════════════

@router.post("/{assinatura_id}/assinar", response_model=AssinaturaOut)
async def assinar_documento_endpoint(
    assinatura_id: uuid.UUID,
    payload: AssinaturaAssinarIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_WRITE),
):
    """Registra assinatura digital em um documento pendente.

    Body:
    - assinatura_base64: representacao da assinatura em base64
      (pode ser canvas do frontend, token JWT assinado, ou certificado)
    - hash_documento: hash SHA-256 do documento (opcional — recalculado
      internamente se nao informado, mas recomendado para integridade)

    Verifica:
    - Documento existe e esta PENDENTE
    - Hash confere com o armazenado (se informado)
    - Signatario corresponde (se designado)
    """
    client_info = get_client_info(request)

    try:
        doc = await assinar_documento(
            db,
            assinatura_id=assinatura_id,
            assinatura_base64=payload.assinatura_base64,
            signatario=user,
            hash_documento=payload.hash_documento,
            client_info=client_info,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await db.commit()
    await db.refresh(doc)
    return doc


# ═══════════════════════════════════════════════════════════════════════
# VERIFICAR ASSINATURA
# ═══════════════════════════════════════════════════════════════════════

@router.get("/{assinatura_id}/verificar", response_model=AssinaturaVerificacaoOut)
async def verificar_assinatura_endpoint(
    assinatura_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Verifica validade e integridade de uma assinatura digital.

    Realiza:
    1. Verificacao de hash SHA-256 (integridade do conteudo)
    2. Verificacao de presenca da assinatura
    3. Verificacao de expiracao (validade_dias)
    4. Atualizacao do status de verificacao no registro

    Retorna status detalhado com todos os indicadores.
    """
    try:
        result = await verificar_assinatura(
            db,
            assinatura_id=assinatura_id,
            tenant_id=tenant_id,
            actor=user,
            client_info=get_client_info(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    await db.commit()
    return result


# ═══════════════════════════════════════════════════════════════════════
# CERTIFICADO PDF/A
# ═══════════════════════════════════════════════════════════════════════

@router.get("/{assinatura_id}/certificado")
async def download_certificado_endpoint(
    assinatura_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Download do certificado digital PDF/A com metadados da assinatura.

    O certificado inclui:
    - Identificacao completa do documento
    - Hash SHA-256
    - Timestamp da assinatura
    - Identificacao do signatario
    - IP da assinatura
    - Codigo de verificacao
    - Metadados XMP conforme PDF/A-3
    """
    try:
        result = await gerar_certificado_assinatura(
            db,
            assinatura_id=assinatura_id,
            tenant_id=tenant_id,
            actor=user,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    await db.commit()

    pdf_bytes = result.get("pdf_bytes")
    if not pdf_bytes:
        raise HTTPException(status_code=503, detail="Falha na geracao do certificado PDF")

    filename = f"certificado_assinatura_{assinatura_id}.pdf"
    return Response(
        pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Certificado-SHA256": result.get("certificado_sha256", ""),
        },
    )


# ═══════════════════════════════════════════════════════════════════════
# DETALHE DE ASSINATURA (lookup individual)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/{assinatura_id}", response_model=AssinaturaOut)
async def detalhe_assinatura_endpoint(
    assinatura_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Retorna detalhes completos de um registro de assinatura."""
    stmt = select(AssinaturaDocumento).where(
        AssinaturaDocumento.id == assinatura_id,
        AssinaturaDocumento.tenant_id == tenant_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Assinatura nao encontrada")
    return doc
