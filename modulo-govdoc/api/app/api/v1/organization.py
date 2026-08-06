"""Instituição, secretarias e setores."""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import client_info, get_institution, user_names
from app.core.auth import get_current_user, require_profiles
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, Conflict, NotFound
from app.models.document import Document
from app.models.enums import AuditAction, Profile
from app.models.organization import Department, Institution, Secretariat
from app.models.user import User
from app.schemas.common import Message
from app.schemas.organization import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    InstitutionOut,
    InstitutionUpdate,
    SecretariatCreate,
    SecretariatOut,
    SecretariatUpdate,
)
from app.services import audit, storage_usage

logger = logging.getLogger("govdoc.organization")

router = APIRouter(tags=["Organização"])

admin_only = require_profiles(Profile.ADMIN_GERAL)
admin_or_secretariat = require_profiles(Profile.ADMIN_GERAL, Profile.ADMIN_SECRETARIA)


# ── Instituição ──────────────────────────────────────────────────────────────


@router.get("/instituicao", response_model=InstitutionOut, summary="Dados da instituição")
async def get_institution_data(institution: Institution = Depends(get_institution)):
    return InstitutionOut(
        id=institution.id,
        nome=institution.name,
        sigla=institution.slug,
        cnpj=institution.cnpj,
        email=institution.email,
        telefone=institution.phone,
        cor_primaria=institution.primary_color,
        cor_destaque=institution.accent_color,
        limite_armazenamento_bytes=institution.storage_limit_bytes,
        ultima_sincronizacao=institution.last_sync_at,
    )


@router.put("/instituicao", response_model=InstitutionOut, summary="Atualizar instituição")
async def update_institution(
    payload: InstitutionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_only),
    institution: Institution = Depends(get_institution),
):
    before = {"limite": institution.storage_limit_bytes}
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if field == "cor_primaria":
            institution.primary_color = value
        elif field == "cor_destaque":
            institution.accent_color = value
        elif field == "limite_armazenamento_mb":
            institution.storage_limit_bytes = value * 1024 * 1024
    institution.updated_by_id = user.id
    await audit.record(
        db,
        action=AuditAction.CONFIG_CHANGE,
        user=user,
        resource_type="institution",
        resource_id=institution.id,
        resource_name=institution.name,
        data_before=before,
        data_after={"limite": institution.storage_limit_bytes},
        client=client_info(request),
    )
    await db.commit()
    return await get_institution_data(institution)


@router.post(
    "/instituicao/sincronizar",
    response_model=Message,
    summary="Sincronizar usuários e estrutura com o GovSistem",
)
async def sync_with_saas(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_only),
    institution: Institution = Depends(get_institution),
):
    """Pede à plataforma GovSistem que reenvie os usuários do órgão.

    O GovDoc não mantém identidade própria — ela chega do SaaS via SSO ou
    pelos endpoints internos de sync. Este botão cobre o caso em que novos
    usuários foram cadastrados na plataforma e ainda não acessaram o módulo.
    """
    saas_api_url = settings.SAAS_API_URL.rstrip("/")
    internal_key = settings.INTERNAL_API_KEY.get_secret_value()
    if not saas_api_url or not internal_key:
        raise AppError(
            "Integração com o GovSistem não configurada.", 503, "integracao_indisponivel"
        )

    payload = {
        "module_slug": "govdoc",
        "organization_id": str(institution.id),
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{saas_api_url}/internal/sync-module-users",
                json=payload,
                headers={"X-Internal-Key": internal_key},
            )
            if not resp.is_success:
                detail = resp.json().get("detail", "") if resp.headers.get("content-type", "").startswith("application/json") else ""
                raise AppError(
                    f"O GovSistem não concluiu a sincronização ({resp.status_code}). {detail}".strip(),
                    502,
                    "sync_falhou",
                )
            resultado = resp.json()
    except AppError:
        raise
    except Exception as exc:
        logger.warning("Falha ao sincronizar com o GovSistem: %s", exc)
        raise AppError(
            "Não foi possível contatar o GovSistem. Tente novamente mais tarde.",
            502,
            "sync_falhou",
        )

    institution.last_sync_at = datetime.now(timezone.utc)
    await audit.record(
        db,
        action=AuditAction.CONFIG_CHANGE,
        user=user,
        resource_type="institution",
        resource_id=institution.id,
        resource_name=institution.name,
        detail="Sincronização manual com o GovSistem",
        data_after={
            "sincronizados": resultado.get("sincronizados"),
            "total_usuarios": resultado.get("total_usuarios"),
        },
        client=client_info(request),
    )
    await db.commit()

    total = resultado.get("total_usuarios", 0)
    sincronizados = resultado.get("sincronizados", 0)
    erros = resultado.get("erros", [])
    mensagem = f"{sincronizados} de {total} usuário(s) sincronizado(s) com o GovSistem."
    if erros:
        mensagem += f" {len(erros)} com falha."
    return Message(mensagem=mensagem, detalhe="\n".join(erros[:5]) or None)


# ── Secretarias ──────────────────────────────────────────────────────────────


@router.get(
    "/secretarias", response_model=List[SecretariatOut], summary="Listar secretarias"
)
async def list_secretariats(
    incluir_inativas: bool = Query(False),
    com_consumo: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(Secretariat).where(
        Secretariat.institution_id == institution.id, Secretariat.deleted_at.is_(None)
    )
    if not incluir_inativas:
        stmt = stmt.where(Secretariat.is_active.is_(True))
    if user.profile == Profile.ADMIN_SECRETARIA.value and user.secretariat_id:
        stmt = stmt.where(Secretariat.id == user.secretariat_id)
    stmt = stmt.order_by(Secretariat.name)

    items = list((await db.scalars(stmt)).all())
    result = []
    for item in items:
        total_setores = int(
            await db.scalar(
                select(func.count(Department.id)).where(
                    Department.secretariat_id == item.id, Department.deleted_at.is_(None)
                )
            )
            or 0
        )
        total_docs = int(
            await db.scalar(
                select(func.count(Document.id)).where(
                    Document.secretariat_id == item.id, Document.deleted_at.is_(None)
                )
            )
            or 0
        )
        total_usuarios = int(
            await db.scalar(
                select(func.count(User.id)).where(
                    User.institution_id == institution.id,
                    User.secretariat_id == item.id,
                    User.deleted_at.is_(None),
                )
            )
            or 0
        )
        consumo = (
            await storage_usage.used_bytes(db, institution.id, secretariat_id=item.id)
            if com_consumo
            else None
        )
        result.append(
            SecretariatOut.build(
                item,
                total_setores=total_setores,
                total_documentos=total_docs,
                total_usuarios=total_usuarios,
                consumo_bytes=consumo,
            )
        )
    return result


@router.post(
    "/secretarias", response_model=SecretariatOut, status_code=201, summary="Criar secretaria"
)
async def create_secretariat(
    payload: SecretariatCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_only),
    institution: Institution = Depends(get_institution),
):
    exists = await db.scalar(
        select(Secretariat.id).where(
            Secretariat.institution_id == institution.id,
            func.lower(Secretariat.acronym) == payload.sigla.lower(),
            Secretariat.deleted_at.is_(None),
        )
    )
    if exists:
        raise Conflict(f'Já existe uma secretaria com a sigla "{payload.sigla}".')

    item = Secretariat(
        institution_id=institution.id,
        name=payload.nome,
        acronym=payload.sigla.upper(),
        description=payload.descricao,
        manager_name=payload.responsavel,
        manager_user_id=payload.responsavel_id,
        email=payload.email,
        phone=payload.telefone,
        color=payload.cor,
        icon=payload.icone,
        storage_limit_bytes=(
            payload.limite_armazenamento_mb * 1024 * 1024
            if payload.limite_armazenamento_mb
            else None
        ),
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(item)
    await db.flush()
    await audit.record(
        db,
        action=AuditAction.SECRETARIAT_CREATE,
        user=user,
        resource_type="secretariat",
        resource_id=item.id,
        resource_name=item.name,
        secretariat_id=item.id,
        data_after={"nome": item.name, "sigla": item.acronym},
        client=client_info(request),
    )
    await db.commit()
    return SecretariatOut.build(item)


@router.get(
    "/secretarias/{secretariat_id}", response_model=SecretariatOut, summary="Detalhar secretaria"
)
async def get_secretariat(
    secretariat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    item = await db.get(Secretariat, secretariat_id)
    if item is None or item.deleted_at is not None or item.institution_id != institution.id:
        raise NotFound("Secretaria não encontrada.")
    consumo = await storage_usage.used_bytes(db, institution.id, secretariat_id=item.id)
    total_setores = int(
        await db.scalar(
            select(func.count(Department.id)).where(
                Department.secretariat_id == item.id, Department.deleted_at.is_(None)
            )
        )
        or 0
    )
    return SecretariatOut.build(
        item, consumo_bytes=consumo, total_setores=total_setores
    )


@router.put(
    "/secretarias/{secretariat_id}", response_model=SecretariatOut, summary="Editar secretaria"
)
async def update_secretariat(
    secretariat_id: uuid.UUID,
    payload: SecretariatUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    item = await db.get(Secretariat, secretariat_id)
    if item is None or item.deleted_at is not None or item.institution_id != institution.id:
        raise NotFound("Secretaria não encontrada.")
    if (
        user.profile == Profile.ADMIN_SECRETARIA.value
        and user.secretariat_id != item.id
    ):
        raise AppError("Você só pode editar a sua própria secretaria.", 403, "fora_do_escopo")

    before = {"nome": item.name, "sigla": item.acronym, "ativo": item.is_active}
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "nome": "name",
        "descricao": "description",
        "responsavel": "manager_name",
        "responsavel_id": "manager_user_id",
        "email": "email",
        "telefone": "phone",
        "cor": "color",
        "icone": "icon",
        "ativo": "is_active",
    }
    for field, value in data.items():
        if field in mapping:
            setattr(item, mapping[field], value)
        elif field == "sigla" and value:
            item.acronym = value.upper()
        elif field == "limite_armazenamento_mb":
            item.storage_limit_bytes = value * 1024 * 1024 if value else None
    item.updated_by_id = user.id

    await audit.record(
        db,
        action=AuditAction.SECRETARIAT_UPDATE,
        user=user,
        resource_type="secretariat",
        resource_id=item.id,
        resource_name=item.name,
        secretariat_id=item.id,
        data_before=before,
        data_after={"nome": item.name, "sigla": item.acronym, "ativo": item.is_active},
        client=client_info(request),
    )
    await db.commit()
    return SecretariatOut.build(item)


@router.delete(
    "/secretarias/{secretariat_id}", response_model=Message, summary="Desativar secretaria"
)
async def deactivate_secretariat(
    secretariat_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_only),
    institution: Institution = Depends(get_institution),
):
    item = await db.get(Secretariat, secretariat_id)
    if item is None or item.deleted_at is not None or item.institution_id != institution.id:
        raise NotFound("Secretaria não encontrada.")
    documentos = int(
        await db.scalar(
            select(func.count(Document.id)).where(
                Document.secretariat_id == item.id, Document.deleted_at.is_(None)
            )
        )
        or 0
    )
    item.is_active = False
    item.updated_by_id = user.id
    await audit.record(
        db,
        action=AuditAction.SECRETARIAT_UPDATE,
        user=user,
        resource_type="secretariat",
        resource_id=item.id,
        resource_name=item.name,
        detail="Secretaria desativada",
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'Secretaria "{item.name}" desativada.',
        detalhe=(
            f"Os {documentos} documento(s) vinculados continuam preservados e acessíveis "
            "aos administradores."
        ),
    )


# ── Setores ──────────────────────────────────────────────────────────────────


@router.get("/setores", response_model=List[DepartmentOut], summary="Listar setores")
async def list_departments(
    secretaria_id: Optional[uuid.UUID] = Query(None),
    incluir_inativos: bool = Query(False),
    com_consumo: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(Department).where(
        Department.institution_id == institution.id, Department.deleted_at.is_(None)
    )
    if secretaria_id:
        stmt = stmt.where(Department.secretariat_id == secretaria_id)
    if not incluir_inativos:
        stmt = stmt.where(Department.is_active.is_(True))
    if user.profile == Profile.ADMIN_SECRETARIA.value and user.secretariat_id:
        stmt = stmt.where(Department.secretariat_id == user.secretariat_id)
    stmt = stmt.order_by(Department.name)

    items = list((await db.scalars(stmt)).all())
    sec_ids = {item.secretariat_id for item in items}
    sec_rows = (
        await db.execute(
            select(Secretariat.id, Secretariat.name).where(Secretariat.id.in_(sec_ids))
        )
    ).all()
    sec_names = {row[0]: row[1] for row in sec_rows}

    result = []
    for item in items:
        total_docs = int(
            await db.scalar(
                select(func.count(Document.id)).where(
                    Document.department_id == item.id, Document.deleted_at.is_(None)
                )
            )
            or 0
        )
        total_usuarios = int(
            await db.scalar(
                select(func.count(User.id)).where(
                    User.institution_id == institution.id,
                    User.department_id == item.id,
                    User.deleted_at.is_(None),
                )
            )
            or 0
        )
        consumo = (
            await storage_usage.used_bytes(db, institution.id, department_id=item.id)
            if com_consumo
            else None
        )
        result.append(
            DepartmentOut.build(
                item,
                secretaria_nome=sec_names.get(item.secretariat_id),
                total_documentos=total_docs,
                total_usuarios=total_usuarios,
                consumo_bytes=consumo,
            )
        )
    return result


@router.post("/setores", response_model=DepartmentOut, status_code=201, summary="Criar setor")
async def create_department(
    payload: DepartmentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    secretariat = await db.get(Secretariat, payload.secretaria_id)
    if (
        secretariat is None
        or secretariat.deleted_at is not None
        or secretariat.institution_id != institution.id
    ):
        raise NotFound("Secretaria não encontrada.")
    if (
        user.profile == Profile.ADMIN_SECRETARIA.value
        and user.secretariat_id != secretariat.id
    ):
        raise AppError(
            "Você só pode criar setores na sua própria secretaria.", 403, "fora_do_escopo"
        )

    item = Department(
        institution_id=institution.id,
        secretariat_id=secretariat.id,
        name=payload.nome,
        acronym=payload.sigla,
        description=payload.descricao,
        manager_name=payload.responsavel,
        manager_user_id=payload.responsavel_id,
        storage_limit_bytes=(
            payload.limite_armazenamento_mb * 1024 * 1024
            if payload.limite_armazenamento_mb
            else None
        ),
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(item)
    await db.flush()
    await audit.record(
        db,
        action=AuditAction.DEPARTMENT_CREATE,
        user=user,
        resource_type="department",
        resource_id=item.id,
        resource_name=item.name,
        secretariat_id=secretariat.id,
        department_id=item.id,
        data_after={"nome": item.name, "secretaria": secretariat.name},
        client=client_info(request),
    )
    await db.commit()
    return DepartmentOut.build(item, secretaria_nome=secretariat.name)


@router.put("/setores/{department_id}", response_model=DepartmentOut, summary="Editar setor")
async def update_department(
    department_id: uuid.UUID,
    payload: DepartmentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    item = await db.get(Department, department_id)
    if item is None or item.deleted_at is not None or item.institution_id != institution.id:
        raise NotFound("Setor não encontrado.")
    if (
        user.profile == Profile.ADMIN_SECRETARIA.value
        and user.secretariat_id != item.secretariat_id
    ):
        raise AppError("Você só pode editar setores da sua secretaria.", 403, "fora_do_escopo")

    before = {"nome": item.name, "secretaria": str(item.secretariat_id)}
    data = payload.model_dump(exclude_unset=True)
    mapping = {
        "nome": "name",
        "sigla": "acronym",
        "descricao": "description",
        "responsavel": "manager_name",
        "responsavel_id": "manager_user_id",
        "ativo": "is_active",
    }
    for field, value in data.items():
        if field in mapping:
            setattr(item, mapping[field], value)
        elif field == "secretaria_id" and value:
            destino = await db.get(Secretariat, value)
            if destino is None or destino.institution_id != institution.id:
                raise NotFound("Secretaria de destino não encontrada.")
            item.secretariat_id = destino.id
        elif field == "limite_armazenamento_mb":
            item.storage_limit_bytes = value * 1024 * 1024 if value else None
    item.updated_by_id = user.id

    await audit.record(
        db,
        action=AuditAction.DEPARTMENT_UPDATE,
        user=user,
        resource_type="department",
        resource_id=item.id,
        resource_name=item.name,
        data_before=before,
        data_after={"nome": item.name, "secretaria": str(item.secretariat_id)},
        client=client_info(request),
    )
    await db.commit()
    secretariat = await db.get(Secretariat, item.secretariat_id)
    return DepartmentOut.build(
        item, secretaria_nome=secretariat.name if secretariat else None
    )


@router.delete(
    "/setores/{department_id}", response_model=Message, summary="Desativar setor"
)
async def deactivate_department(
    department_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    item = await db.get(Department, department_id)
    if item is None or item.deleted_at is not None or item.institution_id != institution.id:
        raise NotFound("Setor não encontrado.")
    if (
        user.profile == Profile.ADMIN_SECRETARIA.value
        and user.secretariat_id != item.secretariat_id
    ):
        raise AppError("Você só pode desativar setores da sua secretaria.", 403, "fora_do_escopo")

    documentos = int(
        await db.scalar(
            select(func.count(Document.id)).where(
                Document.department_id == item.id, Document.deleted_at.is_(None)
            )
        )
        or 0
    )
    item.is_active = False
    item.updated_by_id = user.id
    await audit.record(
        db,
        action=AuditAction.DEPARTMENT_UPDATE,
        user=user,
        resource_type="department",
        resource_id=item.id,
        resource_name=item.name,
        detail="Setor desativado",
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'Setor "{item.name}" desativado.',
        detalhe=(
            f"Os {documentos} documento(s) vinculados continuam preservados e acessíveis "
            "aos administradores."
        ),
    )


@router.get(
    "/secretarias/{secretariat_id}/responsaveis",
    summary="Usuários disponíveis como responsáveis",
)
async def list_managers(
    secretariat_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    rows = (
        await db.scalars(
            select(User).where(
                User.institution_id == institution.id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                (User.secretariat_id == secretariat_id) | (User.secretariat_id.is_(None)),
            )
        )
    ).all()
    names = await user_names(db, [row.id for row in rows])
    return [
        {"id": str(row.id), "nome": names.get(row.id, row.name), "perfil": row.profile}
        for row in rows
    ]
