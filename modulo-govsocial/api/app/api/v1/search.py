import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.br_validators import mask_cpf, mask_nis
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.family import Family
from app.models.person_family_membership import PersonFamilyMembership
from app.models.user import User
from app.schemas.people import UnifiedSearchItem
from app.services.people import search_persons

router = APIRouter(prefix="/search", tags=["search"])

_READ = require_roles(
    RoleName.RECEPCAO.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)


@router.get("", response_model=list[UnifiedSearchItem])
async def busca_unificada(
    q: str = Query(..., min_length=1, description="Nome, nome social, CPF, NIS"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    pessoas = await search_persons(db, tenant_id, term=q, skip=skip, limit=limit)
    if not pessoas:
        return []

    person_ids = [p.id for p in pessoas]
    memberships = (
        (
            await db.execute(
                select(PersonFamilyMembership, Family.codigo)
                .join(Family, Family.id == PersonFamilyMembership.family_id)
                .where(
                    PersonFamilyMembership.tenant_id == tenant_id,
                    PersonFamilyMembership.person_id.in_(person_ids),
                    PersonFamilyMembership.status == "ATIVO",
                )
            )
        ).all()
    )
    fam_by_person: dict[uuid.UUID, list[dict]] = {}
    for m, codigo in memberships:
        fam_by_person.setdefault(m.person_id, []).append(
            {"family_id": str(m.family_id), "codigo": codigo, "parentesco": m.parentesco}
        )

    return [
        {
            "person_id": p.id,
            "nome_exibicao": p.nome_exibicao,
            "cpf_mascarado": mask_cpf(p.cpf),
            "nis_mascarado": mask_nis(p.nis),
            "data_nascimento": p.data_nascimento,
            "familias": fam_by_person.get(p.id, []),
        }
        for p in pessoas
    ]
