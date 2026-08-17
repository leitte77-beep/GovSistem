from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import PAPEIS_ATUANTES, get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.user import User
from app.schemas import AssinaturaCreate, AssinaturaOut
from app.services import assinatura as assinatura_service

router = APIRouter(tags=["assinaturas"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


@router.post("/documentos/{documento_id}/assinar", response_model=AssinaturaOut, status_code=201)
async def assinar(
    documento_id,
    payload: AssinaturaCreate,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await assinatura_service.assinar_documento(
        db,
        tenant_id,
        user,
        documento_id=documento_id,
        papel_cargo=payload.papel_cargo,
        nivel=payload.nivel,
        formato=payload.formato,
        certificado_pfx_base64=payload.certificado_pfx_base64,
        certificado_senha=payload.certificado_senha,
        client=get_client_info(request),
    )
