"""Permissões: concessões explícitas, herança e permissão efetiva."""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import client_info, get_institution
from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.models.document import Document
from app.models.enums import (
    AuditAction,
    Permission,
    PermissionEffect,
    ResourceType,
    SubjectType,
)
from app.models.folder import Folder
from app.models.organization import Department, Institution, Secretariat
from app.models.permission import PermissionEntry
from app.models.user import Group, User
from app.schemas.admin import (
    EffectivePermissionsOut,
    PermissionEntryIn,
    PermissionEntryOut,
)
from app.schemas.common import Message
from app.services import audit
from app.services import folders as folder_service
from app.services import permissions as perm

router = APIRouter(prefix="/permissoes", tags=["Permissões"])


async def _load_resource(db: AsyncSession, resource_type: str, resource_id: uuid.UUID):
    if resource_type == ResourceType.FOLDER.value:
        return await perm.get_folder_or_404(db, resource_id)
    if resource_type == ResourceType.DOCUMENT.value:
        return await perm.get_document_or_404(db, resource_id)
    if resource_type == ResourceType.SECRETARIAT.value:
        item = await db.get(Secretariat, resource_id)
    elif resource_type == ResourceType.DEPARTMENT.value:
        item = await db.get(Department, resource_id)
    elif resource_type == ResourceType.INSTITUTION.value:
        item = await db.get(Institution, resource_id)
    else:
        raise AppError("Tipo de recurso inválido.", 422, "recurso_invalido")
    if item is None:
        raise NotFound("Recurso não encontrado.")
    return item


async def _require_manage(db: AsyncSession, user: User, resource_type: str, resource):
    if resource_type == ResourceType.FOLDER.value:
        await perm.require_folder_permission(db, user, resource, Permission.MANAGE_PERMISSIONS)
    elif resource_type == ResourceType.DOCUMENT.value:
        await perm.require_document_permission(
            db, user, resource, Permission.MANAGE_PERMISSIONS
        )
    else:
        from app.models.enums import Profile

        if user.profile not in {Profile.ADMIN_GERAL.value, Profile.ADMIN_SECRETARIA.value}:
            raise AppError(
                "Apenas administradores gerenciam permissões neste nível.",
                403,
                "permissao_negada",
            )


async def _subject_name(db: AsyncSession, entry: PermissionEntry) -> Optional[str]:
    if entry.subject_type == SubjectType.USER.value and entry.subject_id:
        item = await db.get(User, entry.subject_id)
        return item.name if item else None
    if entry.subject_type == SubjectType.GROUP.value and entry.subject_id:
        item = await db.get(Group, entry.subject_id)
        return item.name if item else None
    if entry.subject_type == SubjectType.DEPARTMENT.value and entry.subject_id:
        item = await db.get(Department, entry.subject_id)
        return item.name if item else None
    if entry.subject_type == SubjectType.SECRETARIAT.value and entry.subject_id:
        item = await db.get(Secretariat, entry.subject_id)
        return item.name if item else None
    return entry.subject_profile


@router.get("/{resource_type}/{resource_id}", summary="Permissões de um recurso")
async def list_entries(
    resource_type: ResourceType,
    resource_id: uuid.UUID,
    incluir_herdadas: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resource = await _load_resource(db, resource_type.value, resource_id)
    await _require_manage(db, user, resource_type.value, resource)

    if resource_type == ResourceType.FOLDER:
        ctx = await perm.build_folder_context(db, resource)
    elif resource_type == ResourceType.DOCUMENT:
        ctx = await perm.build_document_context(db, resource)
    else:
        ctx = perm.ResourceContext(
            resource_type=resource_type.value,
            resource_id=resource_id,
            institution_id=user.institution_id,
        )

    ancestry = ctx.ancestry()
    alvo = ancestry[-1]
    ids = [rid for _, rid in ancestry] if incluir_herdadas else [alvo[1]]
    entries = (
        await db.scalars(
            select(PermissionEntry)
            .where(PermissionEntry.resource_id.in_(ids))
            .order_by(PermissionEntry.created_at)
        )
    ).all()

    resultado = []
    for entry in entries:
        herdada = entry.resource_id != alvo[1]
        if herdada and not entry.apply_to_children:
            continue
        resultado.append(
            PermissionEntryOut(
                id=entry.id,
                recurso_tipo=entry.resource_type,
                recurso_id=entry.resource_id,
                destino_tipo=entry.subject_type,
                destino_id=entry.subject_id,
                destino_perfil=entry.subject_profile,
                destino_nome=await _subject_name(db, entry),
                permissoes=entry.permissions or [],
                efeito=entry.effect,
                aplicar_subpastas=entry.apply_to_children,
                expira_em=entry.expires_at,
                motivo=entry.reason,
                herdada_de=entry.resource_type if herdada else None,
                criado_em=entry.created_at,
            )
        )
    return {
        "recurso_tipo": resource_type.value,
        "recurso_id": str(resource_id),
        "herda_permissoes": getattr(resource, "inherit_permissions", True),
        "entradas": resultado,
    }


@router.post("/{resource_type}/{resource_id}", status_code=201, summary="Conceder permissão")
async def create_entry(
    resource_type: ResourceType,
    resource_id: uuid.UUID,
    payload: PermissionEntryIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    resource = await _load_resource(db, resource_type.value, resource_id)
    await _require_manage(db, user, resource_type.value, resource)

    if payload.destino_tipo == SubjectType.PROFILE and not payload.destino_perfil:
        raise AppError("Informe o perfil de destino.", 422, "destino_invalido")
    if payload.destino_tipo != SubjectType.PROFILE and not payload.destino_id:
        raise AppError("Informe o destino da permissão.", 422, "destino_invalido")

    aplicar_filhos = payload.aplicar_em in {"item_e_subpastas", "documentos_existentes"}

    entry = PermissionEntry(
        institution_id=institution.id,
        resource_type=resource_type.value,
        resource_id=resource_id,
        subject_type=payload.destino_tipo.value,
        subject_id=payload.destino_id,
        subject_profile=(
            payload.destino_perfil.value if payload.destino_perfil else None
        ),
        permissions=[p.value for p in payload.permissoes],
        effect=payload.efeito.value,
        apply_to_children=aplicar_filhos,
        expires_at=payload.expira_em,
        reason=payload.motivo,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(entry)
    await db.flush()

    aplicados = 0
    if payload.aplicar_em == "documentos_existentes" and resource_type == ResourceType.FOLDER:
        folder_ids = [resource.id] + [
            f.id for f in await folder_service.descendants(db, resource)
        ]
        documentos = (
            await db.scalars(
                select(Document).where(
                    Document.folder_id.in_(folder_ids), Document.deleted_at.is_(None)
                )
            )
        ).all()
        for documento in documentos:
            db.add(
                PermissionEntry(
                    institution_id=institution.id,
                    resource_type=ResourceType.DOCUMENT.value,
                    resource_id=documento.id,
                    subject_type=entry.subject_type,
                    subject_id=entry.subject_id,
                    subject_profile=entry.subject_profile,
                    permissions=entry.permissions,
                    effect=entry.effect,
                    apply_to_children=False,
                    expires_at=entry.expires_at,
                    reason=entry.reason,
                    created_by_id=user.id,
                )
            )
            aplicados += 1

    await audit.record(
        db,
        action=AuditAction.PERMISSION_CHANGE,
        user=user,
        resource_type=resource_type.value,
        resource_id=resource_id,
        resource_name=getattr(resource, "name", None) or getattr(resource, "display_name", None),
        data_after={
            "destino": entry.subject_type,
            "permissoes": entry.permissions,
            "efeito": entry.effect,
            "aplicar_em": payload.aplicar_em,
        },
        client=client_info(request),
    )
    await db.commit()
    return {
        "id": str(entry.id),
        "mensagem": "Permissão concedida.",
        "documentos_afetados": aplicados,
    }


@router.delete("/entradas/{entry_id}", response_model=Message, summary="Remover permissão")
async def delete_entry(
    entry_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    entry = await db.get(PermissionEntry, entry_id)
    if entry is None:
        raise NotFound("Permissão não encontrada.")
    resource = await _load_resource(db, entry.resource_type, entry.resource_id)
    await _require_manage(db, user, entry.resource_type, resource)

    await audit.record(
        db,
        action=AuditAction.PERMISSION_CHANGE,
        user=user,
        resource_type=entry.resource_type,
        resource_id=entry.resource_id,
        data_before={"destino": entry.subject_type, "permissoes": entry.permissions},
        detail="Permissão removida",
        client=client_info(request),
    )
    await db.delete(entry)
    await db.commit()
    return Message(mensagem="Permissão removida.")


@router.post(
    "/{resource_type}/{resource_id}/herdar", response_model=Message, summary="Voltar a herdar"
)
async def reset_inheritance(
    resource_type: ResourceType,
    resource_id: uuid.UUID,
    request: Request,
    remover_excecoes: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resource = await _load_resource(db, resource_type.value, resource_id)
    await _require_manage(db, user, resource_type.value, resource)
    if not hasattr(resource, "inherit_permissions"):
        raise AppError("Este recurso não possui herança configurável.", 422, "sem_heranca")

    resource.inherit_permissions = True
    removidas = 0
    if remover_excecoes:
        entries = (
            await db.scalars(
                select(PermissionEntry).where(
                    PermissionEntry.resource_type == resource_type.value,
                    PermissionEntry.resource_id == resource_id,
                )
            )
        ).all()
        for entry in entries:
            await db.delete(entry)
            removidas += 1

    await audit.record(
        db,
        action=AuditAction.PERMISSION_CHANGE,
        user=user,
        resource_type=resource_type.value,
        resource_id=resource_id,
        detail=f"Herança restabelecida ({removidas} exceção(ões) removidas)",
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem="O item voltou a herdar as permissões do nível superior.",
        detalhe=f"{removidas} exceção(ões) removida(s).",
    )


@router.get(
    "/{resource_type}/{resource_id}/efetivas",
    response_model=EffectivePermissionsOut,
    summary="Permissão efetiva",
)
async def effective(
    resource_type: ResourceType,
    resource_id: uuid.UUID,
    usuario_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    alvo = user
    if usuario_id and usuario_id != user.id:
        from app.models.enums import Profile

        if user.profile not in {Profile.ADMIN_GERAL.value, Profile.ADMIN_SECRETARIA.value}:
            raise AppError(
                "Você só pode consultar as suas próprias permissões efetivas.",
                403,
                "permissao_negada",
            )
        alvo = await db.get(User, usuario_id)
        if alvo is None:
            raise NotFound("Usuário não encontrado.")

    resource = await _load_resource(db, resource_type.value, resource_id)
    if resource_type == ResourceType.FOLDER:
        ctx = await perm.build_folder_context(db, resource)
    elif resource_type == ResourceType.DOCUMENT:
        ctx = await perm.build_document_context(db, resource)
    else:
        ctx = perm.ResourceContext(
            resource_type=resource_type.value,
            resource_id=resource_id,
            institution_id=alvo.institution_id,
            secretariat_id=getattr(resource, "secretariat_id", None) or (
                resource_id if resource_type == ResourceType.SECRETARIAT else None
            ),
            department_id=(
                resource_id if resource_type == ResourceType.DEPARTMENT else None
            ),
        )

    perms = await perm.effective_permissions(db, alvo, ctx)
    return EffectivePermissionsOut(
        recurso_tipo=resource_type.value,
        recurso_id=resource_id,
        permissoes=sorted(perms),
        origem={
            "perfil": alvo.perfil if hasattr(alvo, "perfil") else alvo.profile,
            "secretaria": str(alvo.secretariat_id or ""),
            "setor": str(alvo.department_id or ""),
            "classificacao_recurso": ctx.classification,
            "herda": ctx.inherit,
        },
    )


@router.get("/catalogo", summary="Catálogo de permissões disponíveis")
async def catalog(user: User = Depends(get_current_user)):
    rotulos = {
        Permission.VIEW: "Visualizar",
        Permission.VIEW_METADATA: "Visualizar metadados",
        Permission.DOWNLOAD: "Baixar",
        Permission.UPLOAD: "Enviar",
        Permission.CREATE_FOLDER: "Criar pasta",
        Permission.EDIT_METADATA: "Editar metadados",
        Permission.NEW_VERSION: "Enviar nova versão",
        Permission.MOVE: "Mover",
        Permission.COPY: "Copiar",
        Permission.DELETE: "Excluir",
        Permission.RESTORE: "Restaurar",
        Permission.SHARE_INTERNAL: "Compartilhar internamente",
        Permission.SHARE_EXTERNAL: "Criar link externo",
        Permission.MANAGE_PERMISSIONS: "Gerenciar permissões",
        Permission.APPROVE: "Aprovar",
        Permission.VIEW_HISTORY: "Consultar histórico",
        Permission.VIEW_VERSIONS: "Consultar versões",
        Permission.MANAGE_BACKUP: "Administrar backup",
    }
    return {
        "permissoes": [
            {"chave": key.value, "rotulo": rotulo} for key, rotulo in rotulos.items()
        ],
        "efeitos": [e.value for e in PermissionEffect],
        "destinos": [s.value for s in SubjectType],
        "aplicar_em": [
            {"chave": "somente_item", "rotulo": "Aplicar somente neste item"},
            {"chave": "item_e_subpastas", "rotulo": "Aplicar a esta pasta e subpastas"},
            {
                "chave": "documentos_existentes",
                "rotulo": "Aplicar também aos documentos existentes",
            },
            {"chave": "novos_documentos", "rotulo": "Aplicar apenas aos novos documentos"},
        ],
    }
