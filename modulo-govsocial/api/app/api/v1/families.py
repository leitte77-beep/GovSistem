import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.br_validators import mask_nis
from app.core.database import get_db
from app.models.enums import AuditAccessType, AuditAction, RoleName
from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.models.unificacao import UnificacaoLog
from app.models.user import User
from app.schemas.people import (
    AddMemberRequest,
    FamilyCreate,
    FamilyListItem,
    FamilyOut,
    FamilyUpdate,
    MemberOut,
    MoveMemberRequest,
    UpdateMemberRequest,
)
from app.services.audit import record_audit
from app.services.geocode import enqueue_family_geocode
from app.services.people import merge_families, next_family_codigo

router = APIRouter(prefix="/families", tags=["families"])

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
_DELETE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_MERGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)

_ADDRESS_FIELDS = {"cep", "logradouro", "numero", "bairro", "municipio", "uf"}


async def _membership_ativo(db, tenant_id, family_id, person_id):
    return (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.person_id == person_id,
                PersonFamilyMembership.status == "ATIVO",
            )
        )
    ).scalar_one_or_none()


async def _aplicar_responsavel(
    db, tenant_id, fam: Family, person: Person, vinculo, nis_explicito: bool = False
) -> None:
    """Torna `person` responsável da família, mantendo parentesco e NIS coerentes.

    O parentesco é declarado em relação ao responsável, então o responsável
    anterior fica sem relação conhecida — zeramos em vez de inventar um valor,
    e a UI permite corrigir depois.
    """
    anterior_id = fam.responsavel_id
    if anterior_id == person.id:
        return
    fam.responsavel_id = person.id
    vinculo.parentesco = "RESPONSAVEL"
    if anterior_id:
        antigo = await _membership_ativo(db, tenant_id, fam.id, anterior_id)
        if antigo and antigo.parentesco == "RESPONSAVEL":
            antigo.parentesco = None
    if not nis_explicito:
        fam.nis_responsavel = person.nis


async def _load_family(db, tenant_id, family_id) -> Family:
    fam = (
        await db.execute(
            select(Family)
            .where(
                Family.id == family_id,
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
            .options(
                selectinload(Family.memberships).selectinload(
                    PersonFamilyMembership.person
                ),
                selectinload(Family.responsavel),
            )
            # Refresca instâncias já na identity map (memberships atualizados
            # após commits na mesma sessão; expire_on_commit=False).
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not fam:
        raise HTTPException(status_code=404, detail="Família não encontrada")
    return fam


def _members(fam: Family) -> list[dict]:
    out = []
    for m in fam.memberships:
        if m.status == "DESLIGADO":
            continue
        out.append(
            {
                "membership_id": m.id,
                "person_id": m.person_id,
                "nome_exibicao": m.person.nome_exibicao if m.person else "",
                "parentesco": m.parentesco,
                "status": m.status,
                "data_entrada": m.data_entrada,
                "data_saida": m.data_saida,
                "is_responsavel": m.person_id == fam.responsavel_id,
            }
        )
    return out


def _to_out(fam: Family) -> dict:
    return {
        "id": fam.id,
        "codigo": fam.codigo,
        "responsavel_id": fam.responsavel_id,
        "responsavel_nome": fam.responsavel.nome_exibicao if fam.responsavel else None,
        "nis_responsavel_mascarado": mask_nis(fam.nis_responsavel),
        "cep": fam.cep,
        "logradouro": fam.logradouro,
        "numero": fam.numero,
        "complemento": fam.complemento,
        "bairro": fam.bairro,
        "municipio": fam.municipio,
        "uf": fam.uf,
        "ponto_referencia": fam.ponto_referencia,
        "telefone_contato": fam.telefone_contato,
        "situacao_rua": fam.situacao_rua,
        "data_cadastramento": fam.data_cadastramento,
        "despesa_aluguel": fam.despesa_aluguel,
        "despesa_transporte": fam.despesa_transporte,
        "despesa_alimentacao": fam.despesa_alimentacao,
        "despesa_medicamentos": fam.despesa_medicamentos,
        "despesa_outros": fam.despesa_outros,
        "latitude": fam.latitude,
        "longitude": fam.longitude,
        "geocode_status": fam.geocode_status,
        "territorio": fam.territorio,
        "faixa_renda": fam.faixa_renda,
        "no_cadunico": fam.no_cadunico,
        "cadunico_atualizado_em": fam.cadunico_atualizado_em,
        "beneficiaria_pbf": fam.beneficiaria_pbf,
        "possui_bpc": fam.possui_bpc,
        "inseguranca_alimentar": fam.inseguranca_alimentar,
        "membros": _members(fam),
        "created_at": fam.created_at,
        "updated_at": fam.updated_at,
    }


@router.get("", response_model=list[FamilyListItem])
async def listar_familias(
    search: str | None = Query(None, description="Código, bairro, território ou nome do responsável"),
    territorio: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    query = (
        select(Family)
        .outerjoin(Person, Person.id == Family.responsavel_id)
        .where(Family.tenant_id == tenant_id, Family.deleted_at.is_(None))
        .options(selectinload(Family.responsavel))
    )
    if territorio:
        query = query.where(Family.territorio == territorio)
    if search:
        search = search.strip()[:100]
        codigo_search: int | None = None
        try:
            codigo_search = int(search)
        except (ValueError, TypeError):
            codigo_search = None
        if codigo_search is not None:
            query = query.where(Family.codigo == codigo_search)
        else:
            # Subquery: IDs de famílias que contêm membros com o nome buscado
            membro_q = (
                select(PersonFamilyMembership.family_id)
                .join(Person, Person.id == PersonFamilyMembership.person_id)
                .where(
                    PersonFamilyMembership.status == "ATIVO",
                    Person.deleted_at.is_(None),
                    or_(
                        Person.nome_civil.ilike(f"%{search}%"),
                        Person.nome_social.ilike(f"%{search}%"),
                        Person.busca.ilike(f"%{search}%"),
                    ),
                )
            ).distinct()
            query = query.where(
                or_(
                    Person.nome_civil.ilike(f"%{search}%"),
                    Person.nome_social.ilike(f"%{search}%"),
                    Person.busca.ilike(f"%{search}%"),
                    Family.bairro.ilike(f"%{search}%"),
                    Family.territorio.ilike(f"%{search}%"),
                    Family.id.in_(membro_q),
                )
            )
    query = query.order_by(Family.codigo).offset(skip).limit(limit)
    fams = (await db.execute(query)).scalars().all()
    return [
        {
            "id": f.id,
            "codigo": f.codigo,
            "responsavel_nome": f.responsavel.nome_exibicao if f.responsavel else None,
            "nis_responsavel_mascarado": mask_nis(f.nis_responsavel),
            "bairro": f.bairro,
            "territorio": f.territorio,
            "faixa_renda": f.faixa_renda,
            "beneficiaria_pbf": f.beneficiaria_pbf,
            "created_at": f.created_at,
        }
        for f in fams
    ]


@router.post("", response_model=FamilyOut, status_code=201)
async def criar_familia(
    body: FamilyCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    codigo = await next_family_codigo(db, tenant_id)
    data = body.model_dump()
    fam = Family(
        tenant_id=tenant_id,
        codigo=codigo,
        territorio=body.bairro,
        geocode_status="PENDENTE" if body.logradouro else "SEM_ENDERECO",
        **data,
    )
    db.add(fam)
    await db.flush()
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="family",
        entity_id=fam.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"codigo": codigo},
    )
    await db.commit()
    if fam.geocode_status == "PENDENTE":
        await enqueue_family_geocode(tenant_id, fam.id)
    fam = await _load_family(db, tenant_id, fam.id)
    return _to_out(fam)


@router.get("/{family_id}", response_model=FamilyOut)
async def obter_familia(
    family_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    fam = await _load_family(db, tenant_id, family_id)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.READ,
        access_type=AuditAccessType.READ_SENSIVEL,
        entity="family",
        entity_id=fam.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return _to_out(fam)


@router.patch("/{family_id}", response_model=FamilyOut)
async def atualizar_familia(
    family_id: uuid.UUID,
    body: FamilyUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    fam = await _load_family(db, tenant_id, family_id)
    changes = body.model_dump(exclude_unset=True)

    novo_responsavel: Person | None = None
    if body.responsavel_id is not None:
        novo_responsavel = (
            await db.execute(
                select(Person).where(
                    Person.id == body.responsavel_id,
                    Person.tenant_id == tenant_id,
                    Person.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if not novo_responsavel:
            raise HTTPException(status_code=422, detail="Responsável inválido")
        # O responsável precisa ser alguém que de fato compõe a família.
        vinculo = await _membership_ativo(db, tenant_id, family_id, body.responsavel_id)
        if not vinculo:
            raise HTTPException(
                status_code=422,
                detail="Responsável deve ser membro ativo da família",
            )

    for field, value in changes.items():
        if field != "responsavel_id":
            setattr(fam, field, value)

    if novo_responsavel is not None:
        await _aplicar_responsavel(
            db,
            tenant_id,
            fam,
            novo_responsavel,
            vinculo,
            nis_explicito="nis_responsavel" in changes,
        )
    if _ADDRESS_FIELDS & set(changes.keys()):
        fam.territorio = fam.bairro
        if fam.logradouro:
            fam.geocode_status = "PENDENTE"

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="family",
        entity_id=fam.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    if fam.geocode_status == "PENDENTE" and _ADDRESS_FIELDS & set(changes.keys()):
        await enqueue_family_geocode(tenant_id, fam.id)
    fam = await _load_family(db, tenant_id, fam.id)
    return _to_out(fam)


@router.delete("/{family_id}", status_code=204)
async def excluir_familia(
    family_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_DELETE),
):
    fam = await _load_family(db, tenant_id, family_id)
    fam.deleted_at = datetime.now(timezone.utc)
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.DELETE,
        entity="family",
        entity_id=fam.id,
        actor=user,
        client_info=get_client_info(request),
    )
    await db.commit()
    return None


# ── Membros ───────────────────────────────────────────────────────
@router.get("/{family_id}/members", response_model=list[MemberOut])
async def listar_membros(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    fam = await _load_family(db, tenant_id, family_id)
    return _members(fam)


@router.post("/{family_id}/members", response_model=FamilyOut, status_code=201)
async def adicionar_membro(
    family_id: uuid.UUID,
    body: AddMemberRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    fam = await _load_family(db, tenant_id, family_id)
    person = (
        await db.execute(
            select(Person).where(
                Person.id == body.person_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=422, detail="Pessoa inválida para o tenant")

    existing = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.person_id == body.person_id,
                PersonFamilyMembership.status == "ATIVO",
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Pessoa já é membro ativo")

    vinculo = PersonFamilyMembership(
        tenant_id=tenant_id,
        person_id=body.person_id,
        family_id=family_id,
        parentesco=body.parentesco,
        status="ATIVO",
        data_entrada=body.data_entrada or date.today(),
    )
    db.add(vinculo)
    if body.definir_responsavel:
        await _aplicar_responsavel(db, tenant_id, fam, person, vinculo)

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="family",
        entity_id=fam.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"add_member": str(body.person_id)},
    )
    await db.commit()
    fam = await _load_family(db, tenant_id, fam.id)
    return _to_out(fam)


@router.patch("/{family_id}/members/{person_id}", response_model=FamilyOut)
async def atualizar_membro(
    family_id: uuid.UUID,
    person_id: uuid.UUID,
    body: UpdateMemberRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    """Atualiza o vínculo do membro (parentesco). Os dados cadastrais da pessoa
    são editados em PATCH /persons/{id}."""
    membership = await _membership_ativo(db, tenant_id, family_id, person_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Vínculo ativo não encontrado")

    changes = body.model_dump(exclude_unset=True)
    if "parentesco" in changes:
        fam = await _load_family(db, tenant_id, family_id)
        if changes["parentesco"] == "RESPONSAVEL" and fam.responsavel_id != person_id:
            raise HTTPException(
                status_code=422,
                detail="Para marcar como RESPONSAVEL, defina a pessoa como "
                "responsável da família",
            )
        membership.parentesco = changes["parentesco"]

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="family",
        entity_id=family_id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"update_member": str(person_id), "campos": list(changes.keys())},
    )
    await db.commit()
    fam = await _load_family(db, tenant_id, family_id)
    return _to_out(fam)


@router.post("/{family_id}/members/{person_id}/move", response_model=FamilyOut)
async def mover_membro(
    family_id: uuid.UUID,
    person_id: uuid.UUID,
    body: MoveMemberRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    """Transfere membro para outra família mantendo histórico (encerra vínculo
    atual como TRANSFERIDO e cria novo vínculo ATIVO na família destino)."""
    membership = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.person_id == person_id,
                PersonFamilyMembership.status == "ATIVO",
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Vínculo ativo não encontrado")

    destino = (
        await db.execute(
            select(Family).where(
                Family.id == body.destino_family_id,
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not destino:
        raise HTTPException(status_code=422, detail="Família destino inválida")
    if destino.id == family_id:
        raise HTTPException(status_code=422, detail="Destino igual à origem")

    hoje = body.data_movimento or date.today()
    membership.status = "TRANSFERIDO"
    membership.data_saida = hoje
    membership.motivo_saida = body.motivo

    # Se era responsável na origem, remove a responsabilidade.
    origem = await _load_family(db, tenant_id, family_id)
    if origem.responsavel_id == person_id:
        origem.responsavel_id = None

    db.add(
        PersonFamilyMembership(
            tenant_id=tenant_id,
            person_id=person_id,
            family_id=destino.id,
            parentesco=body.parentesco,
            status="ATIVO",
            data_entrada=hoje,
        )
    )
    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="family",
        entity_id=destino.id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={
            "move_person": str(person_id),
            "from": str(family_id),
            "to": str(destino.id),
        },
    )
    await db.commit()
    destino = await _load_family(db, tenant_id, destino.id)
    return _to_out(destino)


@router.delete("/{family_id}/members/{person_id}", status_code=204)
async def remover_membro(
    family_id: uuid.UUID,
    person_id: uuid.UUID,
    request: Request,
    motivo: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    membership = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.person_id == person_id,
                PersonFamilyMembership.status == "ATIVO",
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Vínculo ativo não encontrado")
    membership.status = "DESLIGADO"
    membership.data_saida = date.today()
    membership.motivo_saida = motivo

    fam = await _load_family(db, tenant_id, family_id)
    if fam.responsavel_id == person_id:
        fam.responsavel_id = None

    await record_audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="family",
        entity_id=family_id,
        actor=user,
        client_info=get_client_info(request),
        diff_summary={"remove_member": str(person_id)},
    )
    await db.commit()
    return None


class MergeFamiliesRequest(BaseModel):
    keep_id: uuid.UUID
    merge_id: uuid.UUID


@router.post("/merge")
async def mesclar_familias(
    body: MergeFamiliesRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MERGE),
):
    try:
        result = await merge_families(
            db, str(body.keep_id), str(body.merge_id),
            str(tenant_id), str(user.id),
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/unificacoes")
async def listar_unificacoes(
    tabela: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(UnificacaoLog).where(
        UnificacaoLog.tenant_id == str(tenant_id)
    )
    if tabela:
        q = q.where(UnificacaoLog.tabela == tabela)
    r = await db.execute(
        q.order_by(UnificacaoLog.created_at.desc()).limit(100)
    )
    return [
        {
            "id": str(u.id),
            "tabela": u.tabela,
            "registro_mantido_id": u.registro_mantido_id,
            "registros_excluidos": u.registros_excluidos,
            "realizado_por_id": (
                str(u.realizado_por_id) if u.realizado_por_id else None
            ),
            "created_at": (
                u.created_at.isoformat() if u.created_at else None
            ),
        }
        for u in r.scalars().all()
    ]
