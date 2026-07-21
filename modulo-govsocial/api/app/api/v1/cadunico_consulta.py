"""Endpoints de consulta ao CadÚnico."""
from fastapi import APIRouter, Depends, Query

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services.cadunico_consulta import consultar_por_cpf, consultar_por_nis
from app.services.audit import record_audit

router = APIRouter(tags=["CadÚnico"])


@router.get("/cadunico/consulta/cpf")
async def cadunico_consulta_cpf(
    cpf: str = Query(..., min_length=11, max_length=14, description="CPF (apenas dígitos)"),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consulta dados do CadÚnico para um CPF."""
    await record_audit(
        db=db,
        user=current_user,
        action="READ",
        entity="CadUnico",
        entity_id=cpf,
        access_type="READ_SENSIVEL",
    )
    return await consultar_por_cpf(db, current_user.tenant_id, cpf)


@router.get("/cadunico/consulta/nis")
async def cadunico_consulta_nis(
    nis: str = Query(..., min_length=8, max_length=11, description="NIS (apenas dígitos)"),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Consulta dados do CadÚnico para um NIS."""
    await record_audit(
        db=db,
        user=current_user,
        action="READ",
        entity="CadUnico",
        entity_id=nis,
        access_type="READ_SENSIVEL",
    )
    return await consultar_por_nis(db, current_user.tenant_id, nis)
