import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.br_validators import mask_cpf, mask_nis
from app.core.database import get_db
from app.core.encryption import decrypt_text, encrypt_text
from app.models.enums import AuditAccessType, AuditAction, RoleName
from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.models.user import User
from app.schemas.people import (
    DuplicateCandidate,
    MergeRequest,
    PersonCreate,
    PersonCreateResult,
    PersonListItem,
    PersonOut,
    PersonUpdate,
)
from app.services.audit import record_audit
from app.services.people import (
    build_person_busca,
    find_person_duplicates,
    merge_persons,
    search_persons,
)

router = APIRouter(prefix="/persons", tags=["persons"])

# Recepção cadastra pessoas (dados cadastrais). Técnicos e gestão também.
_MANAGE = require_roles(
    RoleName.RECEPCAO.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.RECEPCAO.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MERGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)


def _to_out(p: Person) -> dict:
    return {
        "id": p.id,
        "nome_civil": p.nome_civil,
        "nome_social": p.nome_social,
        "nome_exibicao": p.nome_exibicao,
        "cpf_mascarado": mask_cpf(p.cpf),
        "nis_mascarado": mask_nis(p.nis),
        "data_nascimento": p.data_nascimento,
        "sexo": p.sexo,
        "escolaridade": p.escolaridade,
        "ocupacao": p.ocupacao,
        "tipo_deficiencia": p.tipo_deficiencia,
        "deficiencia_detalhe": decrypt_text(p.deficiencia_detalhe_enc),
        "raca_cor": p.raca_cor,
        "estado_civil": p.estado_civil,
        "frequenta_escola": p.frequenta_escola,
        "situacao_mercado_trabalho": p.situacao_mercado_trabalho,
        "gestante": p.gestante,
        "amamentando": p.amamentando,
        "renda_mensal": p.renda_mensal,
        "documentos": p.documentos,
        "is_falecido": p.is_falecido,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


async def _get_owned(db, tenant_id, person_id) -> Person:
    p = (
        await db.execute(
            select(Person).where(
                Person.id == person_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada")
    return p


@router.get("/search")
async def buscar_pessoas_para_agendamento(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(15, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Busca qualquer pessoa cadastrada com info da família para agendamento."""
    from sqlalchemy.orm import joinedload

    termo = f"%{q.strip()}%"
    query = (
        select(Person, Family)
        .join(PersonFamilyMembership, PersonFamilyMembership.person_id == Person.id)
        .join(Family, Family.id == PersonFamilyMembership.family_id)
        .where(
            Person.tenant_id == tenant_id,
            Person.deleted_at.is_(None),
            Family.deleted_at.is_(None),
            PersonFamilyMembership.status == "ATIVO",
            or_(
                Person.nome_civil.ilike(termo),
                Person.nome_social.ilike(termo),
                Person.busca.ilike(termo),
            ),
        )
        .order_by(Person.nome_civil)
        .limit(limit)
    )
    rows = (await db.execute(query)).all()
    return [
        {
            "person_id": str(p.id),
            "nome_exibicao": p.nome_exibicao,
            "nome_civil": p.nome_civil,
            "family_id": str(f.id),
            "codigo_familia": f.codigo,
            "responsavel_nome": f.responsavel.nome_exibicao if f.responsavel else None,
            "bairro": f.bairro,
        }
        for p, f in rows
    ]


@router.get("", response_model=list[PersonListItem])
async def listar_pessoas(
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    if search:
        pessoas = await search_persons(
            db, tenant_id, term=search, skip=skip, limit=limit
        )
    else:
        pessoas = (
            (
                await db.execute(
                    select(Person)
                    .where(Person.tenant_id == tenant_id, Person.deleted_at.is_(None))
                    .order_by(Person.nome_civil)
                    .offset(skip)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
    return [
        {
            "id": p.id,
            "nome_exibicao": p.nome_exibicao,
            "nome_civil": p.nome_civil,
            "cpf_mascarado": mask_cpf(p.cpf),
            "nis_mascarado": mask_nis(p.nis),
            "data_nascimento": p.data_nascimento,
            "is_falecido": p.is_falecido,
        }
        for p in pessoas
    ]


@router.post("", response_model=PersonCreateResult, status_code=201)
async def criar_pessoa(
    body: PersonCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    # Unicidade dura de CPF/NIS por tenant.
    for campo, valor in (("cpf", body.cpf), ("nis", body.nis)):
        if valor:
            dup = (
                await db.execute(
                    select(Person.id).where(
                        Person.tenant_id == tenant_id,
                        getattr(Person, campo) == valor,
                        Person.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail=f"Já existe pessoa com este {campo.upper()} no tenant",
                )

    # Detecção de possível duplicata (nome+nascimento) — exige confirmação.
    if not body.confirmar_duplicata:
        candidatos = await find_person_duplicates(
            db,
            tenant_id,
            nome_civil=body.nome_civil,
            data_nascimento=body.data_nascimento,
            cpf=body.cpf,
            nis=body.nis,
        )
        if candidatos:
            return PersonCreateResult(
                created=False,
                duplicates=[
                    DuplicateCandidate(
                        id=c.id,
                        nome_exibicao=c.nome_exibicao,
                        cpf_mascarado=mask_cpf(c.cpf),
                        data_nascimento=c.data_nascimento,
                    )
                    for c in candidatos
                ],
            )

    if body.family_id:
        fam = (
            await db.execute(
                select(Family.id).where(
                    Family.id == body.family_id,
                    Family.tenant_id == tenant_id,
                    Family.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not fam:
            raise HTTPException(status_code=422, detail="Família inválida para o tenant")

    # Campos de controle do request que não são colunas de Person; o restante
    # mapeia 1:1 e é repassado em bloco para que um campo novo no schema não
    # seja silenciosamente descartado aqui.
    dados = body.model_dump(
        exclude={"family_id", "parentesco", "confirmar_duplicata", "deficiencia_detalhe"}
    )
    person = Person(
        tenant_id=tenant_id,
        busca=build_person_busca(body.nome_civil, body.nome_social),
        deficiencia_detalhe_enc=encrypt_text(body.deficiencia_detalhe),
        **dados,
    )
    db.add(person)
    await db.flush()

    if body.family_id:
        db.add(
            PersonFamilyMembership(
                tenant_id=tenant_id,
                person_id=person.id,
                family_id=body.family_id,
                parentesco=body.parentesco,
                status="ATIVO",
                data_entrada=date.today(),
            )
        )

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="person",
        entity_id=person.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"nome": person.nome_civil},
    )
    await db.commit()
    person = await _get_owned(db, tenant_id, person.id)
    return PersonCreateResult(created=True, person=PersonOut(**_to_out(person)))


@router.get("/{person_id}", response_model=PersonOut)
async def obter_pessoa(
    person_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    person = await _get_owned(db, tenant_id, person_id)
    # Ficha da pessoa é registro sensível → leitura auditada.
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.READ,
        access_type=AuditAccessType.READ_SENSIVEL,
        entity="person",
        entity_id=person.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return _to_out(person)


@router.patch("/{person_id}", response_model=PersonOut)
async def atualizar_pessoa(
    person_id: uuid.UUID,
    body: PersonUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    person = await _get_owned(db, tenant_id, person_id)
    changes = body.model_dump(exclude_unset=True)

    for campo in ("cpf", "nis"):
        if campo in changes and changes[campo]:
            dup = (
                await db.execute(
                    select(Person.id).where(
                        Person.tenant_id == tenant_id,
                        getattr(Person, campo) == changes[campo],
                        Person.id != person.id,
                        Person.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail=f"Já existe pessoa com este {campo.upper()} no tenant",
                )

    if "deficiencia_detalhe" in changes:
        person.deficiencia_detalhe_enc = encrypt_text(changes.pop("deficiencia_detalhe"))
    for field, value in changes.items():
        setattr(person, field, value)
    if "nome_civil" in changes or "nome_social" in changes:
        person.busca = build_person_busca(person.nome_civil, person.nome_social)

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="person",
        entity_id=person.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(body.model_dump(exclude_unset=True).keys())},
    )
    await db.commit()
    person = await _get_owned(db, tenant_id, person.id)
    return _to_out(person)


@router.delete("/{person_id}", status_code=204)
async def excluir_pessoa(
    person_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MERGE),
):
    person = await _get_owned(db, tenant_id, person_id)
    person.deleted_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DELETE,
        entity="person",
        entity_id=person.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return None


@router.post("/merge", response_model=PersonOut)
async def mesclar_pessoas(
    body: MergeRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MERGE),
):
    try:
        keep = await merge_persons(
            db, tenant_id, keep_id=body.keep_id, drop_id=body.drop_id
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except LookupError:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada")

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.MERGE,
        entity="person",
        entity_id=keep.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={
            "keep_id": str(body.keep_id),
            "drop_id": str(body.drop_id),
            "justificativa": body.justificativa,
        },
    )
    await db.commit()
    keep = await _get_owned(db, tenant_id, keep.id)
    return _to_out(keep)
