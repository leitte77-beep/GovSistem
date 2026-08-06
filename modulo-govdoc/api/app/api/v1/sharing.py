"""Compartilhamento interno, links externos e solicitações de envio externo."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Pagination, client_info, get_institution, page_payload, user_names
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.security import generate_external_token, hash_password
from app.models.document import Document
from app.models.enums import (
    AuditAction,
    Classification,
    NotificationType,
    Permission,
    ResourceType,
    SubjectType,
)
from app.models.folder import Folder
from app.models.organization import Department, Institution, Secretariat
from app.models.sharing import (
    ExternalAccessLog,
    ExternalLink,
    ExternalLinkItem,
    ExternalUpload,
    ExternalUploadRequest,
    InternalShare,
)
from app.models.user import Group, User, UserGroup
from app.schemas.common import Message
from app.schemas.sharing import (
    ExternalLinkCreate,
    ExternalLinkOut,
    ExternalUploadOut,
    ExternalUploadRequestCreate,
    ExternalUploadRequestOut,
    ExternalUploadReview,
    InternalShareCreate,
    InternalShareOut,
)
from app.services import audit, notifications
from app.services import documents as doc_service
from app.services import permissions as perm

router = APIRouter(tags=["Compartilhamento"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _resource_and_check(
    db: AsyncSession, user: User, resource_type: str, resource_id: uuid.UUID, permission: Permission
):
    if resource_type == ResourceType.FOLDER.value:
        resource = await perm.get_folder_or_404(db, resource_id)
        await perm.require_folder_permission(db, user, resource, permission)
        return resource, resource.name
    if resource_type == ResourceType.DOCUMENT.value:
        resource = await perm.get_document_or_404(db, resource_id)
        await perm.require_document_permission(db, user, resource, permission)
        return resource, resource.display_name
    raise AppError(
        "Só é possível compartilhar pastas e documentos.", 422, "recurso_invalido"
    )


# ── Compartilhamento interno ─────────────────────────────────────────────────


@router.post(
    "/compartilhamentos", status_code=201, summary="Compartilhar pasta ou documento"
)
async def create_share(
    payload: InternalShareCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    resource, nome = await _resource_and_check(
        db, user, payload.recurso_tipo.value, payload.recurso_id, Permission.SHARE_INTERNAL
    )

    share = InternalShare(
        institution_id=institution.id,
        resource_type=payload.recurso_tipo.value,
        resource_id=payload.recurso_id,
        target_type=payload.destino_tipo.value,
        target_id=payload.destino_id,
        permissions=[p.value for p in payload.permissoes],
        starts_at=payload.inicio,
        expires_at=payload.fim,
        reason=payload.motivo,
        notify=payload.notificar,
        require_read_receipt=payload.exigir_confirmacao_leitura,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(share)
    await db.flush()

    if payload.notificar:
        destinatarios: List[uuid.UUID] = []
        if payload.destino_tipo == SubjectType.USER:
            destinatarios = [payload.destino_id]
        elif payload.destino_tipo == SubjectType.GROUP:
            destinatarios = list(
                (
                    await db.scalars(
                        select(UserGroup.user_id).where(
                            UserGroup.group_id == payload.destino_id
                        )
                    )
                ).all()
            )
        elif payload.destino_tipo == SubjectType.DEPARTMENT:
            destinatarios = list(
                (
                    await db.scalars(
                        select(User.id).where(User.department_id == payload.destino_id)
                    )
                ).all()
            )
        elif payload.destino_tipo == SubjectType.SECRETARIAT:
            destinatarios = list(
                (
                    await db.scalars(
                        select(User.id).where(User.secretariat_id == payload.destino_id)
                    )
                ).all()
            )
        await notifications.notify_many(
            db,
            user_ids=[d for d in destinatarios if d != user.id],
            type_=NotificationType.DOCUMENTO_COMPARTILHADO,
            title=f"{user.name} compartilhou “{nome}” com você",
            body=payload.motivo,
            resource_type=payload.recurso_tipo.value,
            resource_id=payload.recurso_id,
            dedupe_key=f"share:{share.id}",
        )

    await audit.record(
        db,
        action=AuditAction.SHARE_CREATE,
        user=user,
        resource_type=payload.recurso_tipo.value,
        resource_id=payload.recurso_id,
        resource_name=nome,
        data_after={
            "destino": payload.destino_tipo.value,
            "permissoes": share.permissions,
        },
        client=client_info(request),
    )
    await db.commit()
    return {"id": str(share.id), "mensagem": f'"{nome}" compartilhado com sucesso.'}


@router.get(
    "/compartilhamentos/comigo",
    response_model=List[InternalShareOut],
    summary="Compartilhados comigo",
)
async def shared_with_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    grupos = list(
        (await db.scalars(select(UserGroup.group_id).where(UserGroup.user_id == user.id))).all()
    )
    condicoes = [
        (InternalShare.target_type == SubjectType.USER.value)
        & (InternalShare.target_id == user.id)
    ]
    for grupo in grupos:
        condicoes.append(
            (InternalShare.target_type == SubjectType.GROUP.value)
            & (InternalShare.target_id == grupo)
        )
    if user.department_id:
        condicoes.append(
            (InternalShare.target_type == SubjectType.DEPARTMENT.value)
            & (InternalShare.target_id == user.department_id)
        )
    if user.secretariat_id:
        condicoes.append(
            (InternalShare.target_type == SubjectType.SECRETARIAT.value)
            & (InternalShare.target_id == user.secretariat_id)
        )

    shares = (
        await db.scalars(
            select(InternalShare)
            .where(or_(*condicoes), InternalShare.revoked_at.is_(None))
            .order_by(InternalShare.created_at.desc())
        )
    ).all()
    return await _serialize_shares(db, shares)


@router.get(
    "/compartilhamentos/por-mim",
    response_model=List[InternalShareOut],
    summary="Compartilhados por mim",
)
async def shared_by_me(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    shares = (
        await db.scalars(
            select(InternalShare)
            .where(InternalShare.created_by_id == user.id)
            .order_by(InternalShare.created_at.desc())
        )
    ).all()
    return await _serialize_shares(db, shares)


async def _serialize_shares(db: AsyncSession, shares) -> List[InternalShareOut]:
    autores = await user_names(db, [s.created_by_id for s in shares])
    resultado = []
    for share in shares:
        nome_recurso = None
        local = None
        if share.resource_type == ResourceType.DOCUMENT.value:
            doc = await db.get(Document, share.resource_id)
            if doc:
                nome_recurso = doc.display_name
                pasta = await db.get(Folder, doc.folder_id)
                local = pasta.name if pasta else None
        else:
            pasta = await db.get(Folder, share.resource_id)
            nome_recurso = pasta.name if pasta else None
            local = pasta.name if pasta else None

        destino_nome = None
        if share.target_type == SubjectType.USER.value:
            item = await db.get(User, share.target_id)
            destino_nome = item.name if item else None
        elif share.target_type == SubjectType.GROUP.value:
            item = await db.get(Group, share.target_id)
            destino_nome = item.name if item else None
        elif share.target_type == SubjectType.DEPARTMENT.value:
            item = await db.get(Department, share.target_id)
            destino_nome = item.name if item else None
        elif share.target_type == SubjectType.SECRETARIAT.value:
            item = await db.get(Secretariat, share.target_id)
            destino_nome = item.name if item else None

        resultado.append(
            InternalShareOut(
                id=share.id,
                recurso_tipo=share.resource_type,
                recurso_id=share.resource_id,
                recurso_nome=nome_recurso,
                destino_tipo=share.target_type,
                destino_id=share.target_id,
                destino_nome=destino_nome,
                permissoes=share.permissions or [],
                inicio=share.starts_at,
                fim=share.expires_at,
                motivo=share.reason,
                compartilhado_por_id=share.created_by_id,
                compartilhado_por_nome=autores.get(share.created_by_id),
                confirmado_em=share.acknowledged_at,
                revogado_em=share.revoked_at,
                criado_em=share.created_at,
                local_original=local,
                atualizado_em=share.updated_at,
            )
        )
    return resultado


@router.delete(
    "/compartilhamentos/{share_id}", response_model=Message, summary="Revogar compartilhamento"
)
async def revoke_share(
    share_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    share = await db.get(InternalShare, share_id)
    if share is None:
        raise NotFound("Compartilhamento não encontrado.")
    if share.created_by_id != user.id and not user.is_admin:
        await _resource_and_check(
            db, user, share.resource_type, share.resource_id, Permission.SHARE_INTERNAL
        )
    share.revoked_at = _now()
    await audit.record(
        db,
        action=AuditAction.SHARE_REVOKE,
        user=user,
        resource_type=share.resource_type,
        resource_id=share.resource_id,
        client=client_info(request),
    )
    await db.commit()
    return Message(mensagem="Compartilhamento revogado.")


@router.post(
    "/compartilhamentos/{share_id}/confirmar", response_model=Message, summary="Confirmar leitura"
)
async def acknowledge_share(
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    share = await db.get(InternalShare, share_id)
    if share is None:
        raise NotFound("Compartilhamento não encontrado.")
    share.acknowledged_at = _now()
    await db.commit()
    return Message(mensagem="Leitura confirmada.")


# ── Links externos ───────────────────────────────────────────────────────────


@router.post("/links-externos", status_code=201, summary="Criar link externo")
async def create_external_link(
    payload: ExternalLinkCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    itens_validados = []
    for item in payload.itens:
        tipo = item.get("tipo")
        try:
            item_id = uuid.UUID(str(item.get("id")))
        except (ValueError, TypeError):
            raise AppError("Item inválido na lista de compartilhamento.", 422, "item_invalido")

        if tipo == ResourceType.DOCUMENT.value:
            documento = await perm.get_document_or_404(db, item_id)
            await perm.require_document_permission(
                db, user, documento, Permission.SHARE_EXTERNAL
            )
            if documento.classification == Classification.SIGILOSO.value:
                raise AppError(
                    f'O documento "{documento.display_name}" é sigiloso e não pode '
                    "ser compartilhado por link externo.",
                    403,
                    "classificacao_impede",
                )
            itens_validados.append((ResourceType.DOCUMENT.value, documento.id))
        elif tipo == ResourceType.FOLDER.value:
            pasta = await perm.get_folder_or_404(db, item_id)
            await perm.require_folder_permission(db, user, pasta, Permission.SHARE_EXTERNAL)
            itens_validados.append((ResourceType.FOLDER.value, pasta.id))
        else:
            raise AppError(
                'O tipo do item deve ser "document" ou "folder".', 422, "item_invalido"
            )

    raw_token, token_hash, prefix = generate_external_token()
    link = ExternalLink(
        institution_id=institution.id,
        token_hash=token_hash,
        token_prefix=prefix,
        name=payload.nome,
        description=payload.descricao,
        allow_view=payload.permitir_visualizacao,
        allow_download=payload.permitir_download,
        allow_upload=payload.permitir_upload,
        expires_at=payload.expira_em,
        max_accesses=payload.max_acessos,
        max_downloads=payload.max_downloads,
        password_hash=hash_password(payload.senha) if payload.senha else None,
        require_name=payload.exigir_nome,
        require_email=payload.exigir_email,
        require_phone=payload.exigir_telefone,
        require_email_code=payload.exigir_codigo_email,
        allowed_ips=payload.ips_permitidos,
        watermark=payload.marca_dagua,
        terms_text=payload.termo_responsabilidade,
        notify_on_access=payload.notificar_acesso,
        notify_on_download=payload.notificar_download,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(link)
    await db.flush()
    for tipo, item_id in itens_validados:
        db.add(ExternalLinkItem(link_id=link.id, resource_type=tipo, resource_id=item_id))

    await audit.record(
        db,
        action=AuditAction.EXTERNAL_LINK_CREATE,
        user=user,
        resource_type="external_link",
        resource_id=link.id,
        resource_name=link.name,
        data_after={
            "itens": len(itens_validados),
            "expira_em": payload.expira_em.isoformat() if payload.expira_em else None,
            "download": payload.permitir_download,
        },
        client=client_info(request),
    )
    await db.commit()

    url = f"{settings.PUBLIC_URL.rstrip('/')}/acesso-externo/{raw_token}"
    return {
        "url": url,
        "id": str(link.id),
        "mensagem": (
            "Link criado. Copie o endereço agora — por segurança ele não pode ser "
            "exibido novamente."
        ),
        "expira_em": link.expires_at,
    }


@router.get("/links-externos", summary="Listar links externos")
async def list_external_links(
    apenas_ativos: bool = Query(False),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(ExternalLink).where(ExternalLink.institution_id == institution.id)
    if not user.is_admin:
        stmt = stmt.where(ExternalLink.created_by_id == user.id)
    if apenas_ativos:
        stmt = stmt.where(ExternalLink.revoked_at.is_(None))

    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    links = (
        await db.scalars(
            stmt.order_by(ExternalLink.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).all()
    autores = await user_names(db, [link.created_by_id for link in links])

    itens = []
    for link in links:
        recursos = (
            await db.scalars(
                select(ExternalLinkItem).where(ExternalLinkItem.link_id == link.id)
            )
        ).all()
        detalhes = []
        for recurso in recursos:
            if recurso.resource_type == ResourceType.DOCUMENT.value:
                doc = await db.get(Document, recurso.resource_id)
                detalhes.append(
                    {
                        "tipo": "document",
                        "id": str(recurso.resource_id),
                        "nome": doc.display_name if doc else "(removido)",
                    }
                )
            else:
                pasta = await db.get(Folder, recurso.resource_id)
                detalhes.append(
                    {
                        "tipo": "folder",
                        "id": str(recurso.resource_id),
                        "nome": pasta.name if pasta else "(removida)",
                    }
                )
        itens.append(
            ExternalLinkOut(
                id=link.id,
                nome=link.name,
                descricao=link.description,
                prefixo_token=link.token_prefix,
                expira_em=link.expires_at,
                permitir_visualizacao=link.allow_view,
                permitir_download=link.allow_download,
                permitir_upload=link.allow_upload,
                max_acessos=link.max_accesses,
                max_downloads=link.max_downloads,
                total_acessos=link.access_count,
                total_downloads=link.download_count,
                exige_senha=link.password_hash is not None,
                exigir_nome=link.require_name,
                exigir_email=link.require_email,
                marca_dagua=link.watermark,
                ativo=link.is_active(_now()),
                revogado_em=link.revoked_at,
                criado_por_id=link.created_by_id,
                criado_por_nome=autores.get(link.created_by_id),
                criado_em=link.created_at,
                itens=detalhes,
            )
        )
    return page_payload(itens, total, paginacao)


@router.delete(
    "/links-externos/{link_id}", response_model=Message, summary="Revogar link externo"
)
async def revoke_link(
    link_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    link = await db.get(ExternalLink, link_id)
    if link is None:
        raise NotFound("Link não encontrado.")
    if link.created_by_id != user.id and not user.is_admin:
        raise AppError(
            "Somente quem criou o link ou um administrador pode revogá-lo.",
            403,
            "permissao_negada",
        )
    link.revoked_at = _now()
    link.revoked_by_id = user.id
    await audit.record(
        db,
        action=AuditAction.EXTERNAL_LINK_REVOKE,
        user=user,
        resource_type="external_link",
        resource_id=link.id,
        resource_name=link.name,
        client=client_info(request),
    )
    await db.commit()
    return Message(
        mensagem=f'Link "{link.name}" revogado.',
        detalhe="Quem tentar acessá-lo verá a mensagem de compartilhamento revogado.",
    )


@router.get("/links-externos/{link_id}/acessos", summary="Registro de acessos ao link")
async def link_logs(
    link_id: uuid.UUID,
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    link = await db.get(ExternalLink, link_id)
    if link is None:
        raise NotFound("Link não encontrado.")
    if link.created_by_id != user.id and not user.is_admin:
        raise AppError("Você não pode consultar os acessos deste link.", 403, "permissao_negada")

    stmt = select(ExternalAccessLog).where(ExternalAccessLog.link_id == link_id)
    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = (
        await db.scalars(
            stmt.order_by(ExternalAccessLog.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).all()
    itens = [
        {
            "id": str(row.id),
            "acao": row.action,
            "documento_id": str(row.document_id) if row.document_id else None,
            "ip": row.ip_address,
            "navegador": row.user_agent,
            "nome": row.visitor_name,
            "email": row.visitor_email,
            "resultado": row.result,
            "detalhe": row.detail,
            "data_hora": row.created_at,
        }
        for row in rows
    ]
    return page_payload(itens, total, paginacao)


# ── Solicitações externas (recebimento) ──────────────────────────────────────


@router.post("/solicitacoes-externas", status_code=201, summary="Criar solicitação de envio")
async def create_upload_request(
    payload: ExternalUploadRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    pasta = await perm.get_folder_or_404(db, payload.pasta_destino_id)
    await perm.require_folder_permission(db, user, pasta, Permission.UPLOAD)

    raw_token, token_hash, prefix = generate_external_token()
    solicitacao = ExternalUploadRequest(
        institution_id=institution.id,
        token_hash=token_hash,
        token_prefix=prefix,
        title=payload.titulo,
        description=payload.descricao,
        owner_user_id=user.id,
        secretariat_id=payload.secretaria_id or pasta.secretariat_id,
        department_id=payload.setor_id or pasta.department_id,
        target_folder_id=pasta.id,
        allowed_extensions=payload.extensoes_aceitas,
        max_file_size_mb=payload.tamanho_maximo_mb,
        max_files=payload.quantidade_maxima,
        deadline=payload.prazo,
        require_identification=payload.exigir_identificacao,
        require_email=payload.exigir_email,
        password_hash=hash_password(payload.senha) if payload.senha else None,
        require_email_code=payload.exigir_codigo_email,
        terms_text=payload.termo_responsabilidade,
        notes=payload.observacoes,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(solicitacao)
    await db.flush()
    await audit.record(
        db,
        action=AuditAction.EXTERNAL_LINK_CREATE,
        user=user,
        resource_type="external_upload_request",
        resource_id=solicitacao.id,
        resource_name=solicitacao.title,
        client=client_info(request),
    )
    await db.commit()

    url = f"{settings.PUBLIC_URL.rstrip('/')}/envio-externo/{raw_token}"
    return {
        "url": url,
        "id": str(solicitacao.id),
        "mensagem": (
            "Solicitação criada. Envie o endereço ao remetente — "
            "ele não poderá ser recuperado depois."
        ),
    }


@router.get(
    "/solicitacoes-externas",
    response_model=List[ExternalUploadRequestOut],
    summary="Listar solicitações externas",
)
async def list_upload_requests(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(ExternalUploadRequest).where(
        ExternalUploadRequest.institution_id == institution.id
    )
    if not user.is_admin:
        stmt = stmt.where(ExternalUploadRequest.owner_user_id == user.id)
    solicitacoes = (
        await db.scalars(stmt.order_by(ExternalUploadRequest.created_at.desc()))
    ).all()
    nomes = await user_names(db, [s.owner_user_id for s in solicitacoes])

    resultado = []
    for item in solicitacoes:
        total = int(
            await db.scalar(
                select(func.count(ExternalUpload.id)).where(
                    ExternalUpload.request_id == item.id
                )
            )
            or 0
        )
        pendentes = int(
            await db.scalar(
                select(func.count(ExternalUpload.id)).where(
                    ExternalUpload.request_id == item.id,
                    ExternalUpload.status.in_(["recebido", "em_analise"]),
                )
            )
            or 0
        )
        pasta = await db.get(Folder, item.target_folder_id)
        resultado.append(
            ExternalUploadRequestOut(
                id=item.id,
                titulo=item.title,
                descricao=item.description,
                prefixo_token=item.token_prefix,
                responsavel_id=item.owner_user_id,
                responsavel_nome=nomes.get(item.owner_user_id),
                pasta_destino_id=item.target_folder_id,
                pasta_destino_nome=pasta.name if pasta else None,
                extensoes_aceitas=item.allowed_extensions,
                tamanho_maximo_mb=item.max_file_size_mb,
                quantidade_maxima=item.max_files,
                prazo=item.deadline,
                exige_senha=item.password_hash is not None,
                ativo=item.revoked_at is None
                and (item.deadline is None or item.deadline > _now()),
                total_recebidos=total,
                pendentes=pendentes,
                criado_em=item.created_at,
            )
        )
    return resultado


@router.delete(
    "/solicitacoes-externas/{request_id}",
    response_model=Message,
    summary="Encerrar solicitação externa",
)
async def revoke_request(
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    solicitacao = await db.get(ExternalUploadRequest, request_id)
    if solicitacao is None:
        raise NotFound("Solicitação não encontrada.")
    if solicitacao.owner_user_id != user.id and not user.is_admin:
        raise AppError("Você não pode encerrar esta solicitação.", 403, "permissao_negada")
    solicitacao.revoked_at = _now()
    await db.commit()
    return Message(mensagem="Solicitação encerrada. O link deixou de aceitar envios.")


@router.get(
    "/recebimentos", response_model=List[ExternalUploadOut], summary="Documentos recebidos"
)
async def list_received(
    situacao: Optional[str] = Query(None),
    solicitacao_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = (
        select(ExternalUpload, ExternalUploadRequest)
        .join(
            ExternalUploadRequest,
            ExternalUploadRequest.id == ExternalUpload.request_id,
        )
        .where(ExternalUploadRequest.institution_id == institution.id)
    )
    if not user.is_admin:
        stmt = stmt.where(ExternalUploadRequest.owner_user_id == user.id)
    if situacao:
        stmt = stmt.where(ExternalUpload.status == situacao)
    if solicitacao_id:
        stmt = stmt.where(ExternalUpload.request_id == solicitacao_id)

    rows = (await db.execute(stmt.order_by(ExternalUpload.created_at.desc()))).all()
    return [
        ExternalUploadOut(
            id=upload.id,
            solicitacao_id=upload.request_id,
            solicitacao_titulo=solicitacao.title,
            nome_original=upload.original_name,
            mime=upload.mime_type,
            extensao=upload.extension,
            tamanho_bytes=upload.size_bytes,
            sha256=upload.sha256,
            remetente_nome=upload.sender_name,
            remetente_email=upload.sender_email,
            remetente_telefone=upload.sender_phone,
            observacao_remetente=upload.sender_note,
            situacao_arquivo=upload.file_status,
            resultado_verificacao=upload.scan_result,
            situacao=upload.status,
            observacao_analise=upload.review_note,
            documento_id=upload.document_id,
            recebido_em=upload.created_at,
        )
        for upload, solicitacao in rows
    ]


@router.post("/recebimentos/{upload_id}/analisar", summary="Aprovar ou rejeitar recebimento")
async def review_upload(
    upload_id: uuid.UUID,
    payload: ExternalUploadReview,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    from app.core.storage import get_storage
    from app.models.enums import ExternalRequestStatus, FileStatus

    upload = await db.get(ExternalUpload, upload_id)
    if upload is None:
        raise NotFound("Recebimento não encontrado.")
    solicitacao = await db.get(ExternalUploadRequest, upload.request_id)
    if solicitacao.owner_user_id != user.id and not user.is_admin:
        raise AppError("Você não pode analisar este recebimento.", 403, "permissao_negada")

    if payload.acao == "rejeitar":
        upload.status = ExternalRequestStatus.REJEITADO.value
        upload.review_note = payload.observacao
        upload.reviewed_by_id = user.id
        upload.reviewed_at = _now()
        await db.commit()
        return Message(
            mensagem="Recebimento rejeitado.",
            detalhe="O arquivo permanece em quarentena e não foi incorporado ao repositório.",
        )

    if payload.acao == "solicitar_correcao":
        upload.status = ExternalRequestStatus.CORRECAO_SOLICITADA.value
        upload.review_note = payload.observacao
        upload.reviewed_by_id = user.id
        upload.reviewed_at = _now()
        await db.commit()
        return Message(mensagem="Correção solicitada ao remetente.")

    if payload.acao != "aprovar":
        raise AppError(
            'Ação inválida. Use "aprovar", "rejeitar" ou "solicitar_correcao".',
            422,
            "acao_invalida",
        )

    if upload.file_status == FileStatus.BLOCKED.value:
        raise AppError(
            "Este arquivo foi bloqueado pela verificação antivírus e não pode ser incorporado.",
            409,
            "arquivo_bloqueado",
        )

    pasta = await perm.get_folder_or_404(
        db, payload.pasta_destino_id or solicitacao.target_folder_id
    )
    await perm.require_folder_permission(db, user, pasta, Permission.UPLOAD)

    data = await get_storage().get(upload.storage_key)
    documento, versao, aviso = await doc_service.create_document(
        db,
        user=user,
        institution=institution,
        folder=pasta,
        filename=upload.original_name,
        data=data,
        metadata={
            "description": (
                f"Recebido de {upload.sender_name or 'remetente externo'} "
                f"({upload.sender_email or 'sem e-mail'}) via solicitação "
                f"“{solicitacao.title}”."
            ),
            "stakeholder_name": upload.sender_name,
        },
    )
    if payload.classificacao:
        documento.classification = payload.classificacao

    upload.status = ExternalRequestStatus.INCORPORADO.value
    upload.review_note = payload.observacao
    upload.reviewed_by_id = user.id
    upload.reviewed_at = _now()
    upload.document_id = documento.id

    await audit.record(
        db,
        action=AuditAction.EXTERNAL_UPLOAD,
        user=user,
        resource_type="document",
        resource_id=documento.id,
        resource_name=documento.display_name,
        detail=f"Recebimento externo aprovado e incorporado (solicitação {solicitacao.title})",
        client=client_info(request),
    )
    await db.commit()
    return {
        "mensagem": "Documento aprovado e incorporado ao repositório.",
        "documento_id": str(documento.id),
        "codigo": documento.code,
        "aviso": aviso,
    }
