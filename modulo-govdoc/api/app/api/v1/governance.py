"""Painel, auditoria, notificações, armazenamento e relatórios."""

import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Pagination, get_institution, page_payload, user_names
from app.core.auth import get_current_user, require_profiles
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.models.document import Document, DocumentVersion, Favorite
from app.models.enums import (
    AuditAction,
    DocumentStatus,
    NotificationState,
    Profile,
    ResourceType,
)
from app.models.folder import Folder
from app.models.governance import AuditLog, BackupExecution, Notification, StorageQuota
from app.models.organization import Department, Institution, Secretariat
from app.models.sharing import ExternalLink, ExternalUpload
from app.models.user import User
from app.schemas.admin import NotificationOut, QuotaIn
from app.schemas.common import Message
from app.services import storage_usage
from app.services.permissions import scope_filter_for_documents, visible_scope

router = APIRouter(tags=["Painel e governança"])

auditors = require_profiles(Profile.ADMIN_GERAL, Profile.AUDITOR, Profile.ADMIN_SECRETARIA)
admin_only = require_profiles(Profile.ADMIN_GERAL)


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _scoped_documents(db: AsyncSession, user: User):
    stmt = select(Document).where(
        Document.institution_id == user.institution_id, Document.deleted_at.is_(None)
    )
    if user.profile not in {Profile.ADMIN_GERAL.value, Profile.AUDITOR.value}:
        scope = await visible_scope(db, user)
        condition = scope_filter_for_documents(scope)
        if condition is not None:
            from sqlalchemy import or_

            stmt = stmt.where(or_(condition, Document.owner_user_id == user.id))
    return stmt


@router.get("/painel", summary="Painel com indicadores")
async def dashboard(
    dias: int = Query(30, ge=1, le=365),
    secretaria_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    base = await _scoped_documents(db, user)
    if secretaria_id:
        base = base.where(Document.secretariat_id == secretaria_id)

    async def contar(stmt) -> int:
        return int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)

    hoje = date.today()
    desde = _now() - timedelta(days=dias)

    total_documentos = await contar(base)
    total_pastas = int(
        await db.scalar(
            select(func.count(Folder.id)).where(
                Folder.institution_id == institution.id, Folder.deleted_at.is_(None)
            )
        )
        or 0
    )
    enviados_periodo = await contar(base.where(Document.created_at >= desde))
    vencidos = await contar(
        base.where(Document.expires_on.is_not(None), Document.expires_on < hoje)
    )
    vencendo = await contar(
        base.where(
            Document.expires_on.is_not(None),
            Document.expires_on >= hoje,
            Document.expires_on <= hoje + timedelta(days=30),
        )
    )
    aguardando = await contar(
        base.where(
            Document.status.in_(
                [
                    DocumentStatus.AGUARDANDO_APROVACAO.value,
                    DocumentStatus.AGUARDANDO_REVISAO.value,
                ]
            )
        )
    )

    links_ativos = int(
        await db.scalar(
            select(func.count(ExternalLink.id)).where(
                ExternalLink.institution_id == institution.id,
                ExternalLink.revoked_at.is_(None),
            )
        )
        or 0
    )
    recebimentos_pendentes = int(
        await db.scalar(
            select(func.count(ExternalUpload.id)).where(
                ExternalUpload.status.in_(["recebido", "em_analise"])
            )
        )
        or 0
    )
    lixeira = int(
        await db.scalar(
            select(func.count(Document.id)).where(
                Document.institution_id == institution.id,
                Document.deleted_at.is_not(None),
            )
        )
        or 0
    )

    recentes = (
        await db.scalars(base.order_by(Document.updated_at.desc()).limit(8))
    ).all()
    mais_acessados = (
        await db.scalars(base.order_by(Document.view_count.desc()).limit(5))
    ).all()

    backups = (
        await db.scalars(
            select(BackupExecution).order_by(BackupExecution.started_at.desc()).limit(5)
        )
    ).all()
    backup_ok = sum(1 for b in backups if b.status == "concluido")
    backup_falhas = sum(1 for b in backups if b.status == "falhou")

    atividades = (
        await db.scalars(
            select(AuditLog)
            .where(AuditLog.institution_id == institution.id)
            .order_by(AuditLog.created_at.desc())
            .limit(10)
        )
    ).all()

    uso = await storage_usage.usage_summary(db, institution)

    return {
        "totais": {
            "documentos": total_documentos,
            "pastas": total_pastas,
            "enviados_periodo": enviados_periodo,
            "vencidos": vencidos,
            "vencendo": vencendo,
            "aguardando_aprovacao": aguardando,
            "links_ativos": links_ativos,
            "recebimentos_pendentes": recebimentos_pendentes,
            "na_lixeira": lixeira,
        },
        "armazenamento": uso,
        "backups": {
            "concluidos": backup_ok,
            "falhas": backup_falhas,
            "ultimo": (
                {
                    "id": str(backups[0].id),
                    "situacao": backups[0].status,
                    "quando": backups[0].started_at,
                    "verificado_em": backups[0].verified_at,
                }
                if backups
                else None
            ),
        },
        "documentos_recentes": [
            {
                "id": str(d.id),
                "nome": d.display_name,
                "codigo": d.code,
                "extensao": d.extension,
                "atualizado_em": d.updated_at,
            }
            for d in recentes
        ],
        "mais_acessados": [
            {
                "id": str(d.id),
                "nome": d.display_name,
                "acessos": d.view_count,
            }
            for d in mais_acessados
        ],
        "atividades": [
            {
                "acao": a.action,
                "usuario": a.user_name,
                "recurso": a.resource_name,
                "quando": a.created_at,
                "resultado": a.result,
            }
            for a in atividades
        ],
    }


# ── Auditoria ────────────────────────────────────────────────────────────────


@router.get("/auditoria", summary="Consultar auditoria")
async def list_audit(
    acao: Optional[str] = Query(None),
    usuario_id: Optional[uuid.UUID] = Query(None),
    recurso_tipo: Optional[str] = Query(None),
    recurso_id: Optional[uuid.UUID] = Query(None),
    resultado: Optional[str] = Query(None),
    de: Optional[date] = Query(None),
    ate: Optional[date] = Query(None),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(auditors),
    institution: Institution = Depends(get_institution),
):
    stmt = select(AuditLog).where(AuditLog.institution_id == institution.id)
    if user.profile == Profile.ADMIN_SECRETARIA.value and user.secretariat_id:
        stmt = stmt.where(AuditLog.secretariat_id == user.secretariat_id)
    if acao:
        stmt = stmt.where(AuditLog.action == acao)
    if usuario_id:
        stmt = stmt.where(AuditLog.user_id == usuario_id)
    if recurso_tipo:
        stmt = stmt.where(AuditLog.resource_type == recurso_tipo)
    if recurso_id:
        stmt = stmt.where(AuditLog.resource_id == recurso_id)
    if resultado:
        stmt = stmt.where(AuditLog.result == resultado)
    if de:
        stmt = stmt.where(func.date(AuditLog.created_at) >= de)
    if ate:
        stmt = stmt.where(func.date(AuditLog.created_at) <= ate)

    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = (
        await db.scalars(
            stmt.order_by(AuditLog.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).all()
    itens = [
        {
            "id": str(row.id),
            "acao": row.action,
            "usuario_id": str(row.user_id) if row.user_id else None,
            "usuario_nome": row.user_name,
            "recurso_tipo": row.resource_type,
            "recurso_id": str(row.resource_id) if row.resource_id else None,
            "recurso_nome": row.resource_name,
            "ip": row.ip_address,
            "navegador": row.user_agent,
            "resultado": row.result,
            "detalhe": row.detail,
            "dados_anteriores": row.data_before,
            "dados_posteriores": row.data_after,
            "correlacao": row.correlation_id,
            "data_hora": row.created_at,
        }
        for row in rows
    ]
    return page_payload(itens, total, paginacao)


@router.get("/auditoria/acoes", summary="Ações disponíveis na auditoria")
async def audit_actions(user: User = Depends(auditors)):
    return [{"chave": a.value, "rotulo": a.value.replace("_", " ").capitalize()} for a in AuditAction]


@router.get("/auditoria/exportar", summary="Exportar auditoria em CSV")
async def export_audit(
    de: Optional[date] = Query(None),
    ate: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(auditors),
    institution: Institution = Depends(get_institution),
):
    stmt = select(AuditLog).where(AuditLog.institution_id == institution.id)
    if de:
        stmt = stmt.where(func.date(AuditLog.created_at) >= de)
    if ate:
        stmt = stmt.where(func.date(AuditLog.created_at) <= ate)
    rows = (await db.scalars(stmt.order_by(AuditLog.created_at.desc()).limit(50000))).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(
        ["Data/hora", "Usuário", "Ação", "Recurso", "Nome do recurso", "Resultado", "IP", "Detalhe"]
    )
    for row in rows:
        writer.writerow(
            [
                row.created_at.strftime("%d/%m/%Y %H:%M:%S"),
                row.user_name or "",
                row.action,
                row.resource_type or "",
                row.resource_name or "",
                row.result,
                row.ip_address or "",
                (row.detail or "").replace("\n", " "),
            ]
        )
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="auditoria-govdoc.csv"'
        },
    )


# ── Notificações ─────────────────────────────────────────────────────────────


@router.get("/notificacoes", summary="Minhas notificações")
async def list_notifications(
    estado: Optional[str] = Query(None),
    paginacao: Pagination = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if estado:
        stmt = stmt.where(Notification.state == estado)
    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    nao_lidas = int(
        await db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id,
                Notification.state == NotificationState.NAO_LIDA.value,
            )
        )
        or 0
    )
    rows = (
        await db.scalars(
            stmt.order_by(Notification.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).all()
    itens = [
        NotificationOut(
            id=row.id,
            tipo=row.type,
            titulo=row.title,
            corpo=row.body,
            recurso_tipo=row.resource_type,
            recurso_id=row.resource_id,
            estado=row.state,
            criado_em=row.created_at,
        )
        for row in rows
    ]
    return {**page_payload(itens, total, paginacao), "nao_lidas": nao_lidas}


@router.post("/notificacoes/{notification_id}/estado", response_model=Message, summary="Marcar")
async def set_notification_state(
    notification_id: uuid.UUID,
    estado: str = Query(..., description="lida | nao_lida | arquivada"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFound("Notificação não encontrada.")
    if estado not in {e.value for e in NotificationState}:
        raise AppError("Estado inválido.", 422, "estado_invalido")
    notification.state = estado
    notification.read_at = _now() if estado != NotificationState.NAO_LIDA.value else None
    await db.commit()
    return Message(mensagem="Notificação atualizada.")


@router.post("/notificacoes/marcar-todas", response_model=Message, summary="Marcar todas as lidas")
async def mark_all_read(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    await db.execute(
        Notification.__table__.update()
        .where(
            Notification.user_id == user.id,
            Notification.state == NotificationState.NAO_LIDA.value,
        )
        .values(state=NotificationState.LIDA.value, read_at=_now())
    )
    await db.commit()
    return Message(mensagem="Todas as notificações foram marcadas como lidas.")


# ── Favoritos ────────────────────────────────────────────────────────────────


@router.get("/favoritos", summary="Meus favoritos")
async def list_favorites(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    favoritos = (
        await db.scalars(select(Favorite).where(Favorite.user_id == user.id))
    ).all()
    itens = []
    for favorito in favoritos:
        if favorito.resource_type == ResourceType.DOCUMENT.value:
            doc = await db.get(Document, favorito.resource_id)
            if doc and doc.deleted_at is None:
                itens.append(
                    {
                        "tipo": "documento",
                        "id": str(doc.id),
                        "nome": doc.display_name,
                        "codigo": doc.code,
                        "extensao": doc.extension,
                        "pasta_id": str(doc.folder_id),
                    }
                )
        else:
            pasta = await db.get(Folder, favorito.resource_id)
            if pasta and pasta.deleted_at is None:
                itens.append(
                    {
                        "tipo": "pasta",
                        "id": str(pasta.id),
                        "nome": pasta.name,
                        "cor": pasta.color,
                        "icone": pasta.icon,
                    }
                )
    return itens


# ── Armazenamento ────────────────────────────────────────────────────────────


@router.get("/armazenamento", summary="Consumo de armazenamento")
async def storage_report(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_profiles(Profile.ADMIN_GERAL, Profile.ADMIN_SECRETARIA)),
    institution: Institution = Depends(get_institution),
):
    resumo = await storage_usage.usage_summary(db, institution)

    maiores = (
        await db.scalars(
            select(Document)
            .where(
                Document.institution_id == institution.id, Document.deleted_at.is_(None)
            )
            .order_by(Document.size_bytes.desc())
            .limit(10)
        )
    ).all()

    por_tipo = (
        await db.execute(
            select(
                Document.extension,
                func.count(Document.id),
                func.coalesce(func.sum(Document.size_bytes), 0),
            )
            .where(Document.institution_id == institution.id, Document.deleted_at.is_(None))
            .group_by(Document.extension)
            .order_by(func.coalesce(func.sum(Document.size_bytes), 0).desc())
            .limit(15)
        )
    ).all()

    duplicados = (
        await db.execute(
            select(Document.sha256, func.count(Document.id))
            .where(Document.institution_id == institution.id, Document.deleted_at.is_(None))
            .group_by(Document.sha256)
            .having(func.count(Document.id) > 1)
        )
    ).all()

    from app.core.config import settings as _settings

    mes_expr = (
        func.strftime("%Y-%m", Document.created_at)
        if _settings.DATABASE_URL.startswith("sqlite")
        else func.to_char(Document.created_at, "YYYY-MM")
    )
    crescimento = (
        await db.execute(
            select(
                mes_expr,
                func.coalesce(func.sum(Document.size_bytes), 0),
            )
            .where(Document.institution_id == institution.id)
            .group_by(mes_expr)
            .order_by(mes_expr)
        )
    ).all()

    return {
        **resumo,
        "maiores_arquivos": [
            {
                "id": str(d.id),
                "nome": d.display_name,
                "bytes": d.size_bytes,
                "extensao": d.extension,
            }
            for d in maiores
        ],
        "por_tipo": [
            {"extensao": row[0] or "(sem extensão)", "quantidade": row[1], "bytes": int(row[2])}
            for row in por_tipo
        ],
        "duplicados": {
            "grupos": len(duplicados),
            "arquivos_extras": sum(row[1] - 1 for row in duplicados),
        },
        "crescimento_mensal": [
            {"mes": row[0], "bytes": int(row[1])} for row in crescimento if row[0]
        ],
        "alertas": storage_usage.ALERT_LEVELS,
    }


@router.post("/armazenamento/cotas", response_model=Message, summary="Definir cota")
async def set_quota(
    payload: QuotaIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_only),
    institution: Institution = Depends(get_institution),
):
    limite = payload.limite_mb * 1024 * 1024
    if payload.escopo_tipo == "institution":
        institution.storage_limit_bytes = limite
    elif payload.escopo_tipo == "secretariat":
        item = await db.get(Secretariat, payload.escopo_id)
        if item is None:
            raise NotFound("Secretaria não encontrada.")
        item.storage_limit_bytes = limite
    elif payload.escopo_tipo == "department":
        item = await db.get(Department, payload.escopo_id)
        if item is None:
            raise NotFound("Setor não encontrado.")
        item.storage_limit_bytes = limite
    else:
        raise AppError("Escopo inválido.", 422, "escopo_invalido")

    existing = await db.scalar(
        select(StorageQuota).where(
            StorageQuota.institution_id == institution.id,
            StorageQuota.scope_type == payload.escopo_tipo,
            StorageQuota.scope_id == payload.escopo_id,
        )
    )
    if existing:
        existing.limit_bytes = limite
        existing.alert_percent = payload.alerta_percentual
    else:
        db.add(
            StorageQuota(
                institution_id=institution.id,
                scope_type=payload.escopo_tipo,
                scope_id=payload.escopo_id,
                limit_bytes=limite,
                alert_percent=payload.alerta_percentual,
            )
        )
    await db.commit()
    return Message(mensagem=f"Cota definida em {payload.limite_mb} MB.")


# ── Relatórios ───────────────────────────────────────────────────────────────


REPORTS = {
    "por_secretaria": "Documentos por secretaria",
    "por_setor": "Documentos por setor",
    "por_categoria": "Documentos por categoria",
    "por_responsavel": "Documentos por responsável",
    "vencidos": "Documentos vencidos",
    "vencendo": "Documentos próximos do vencimento",
    "downloads": "Downloads por documento",
    "visualizacoes": "Visualizações por documento",
    "links_externos": "Links externos e acessos",
    "excluidos": "Documentos excluídos",
    "armazenamento": "Consumo de armazenamento",
    "backups": "Execuções de backup",
    "usuarios_ativos": "Usuários ativos",
}


@router.get("/relatorios", summary="Relatórios disponíveis")
async def list_reports(user: User = Depends(get_current_user)):
    return [{"chave": chave, "titulo": titulo} for chave, titulo in REPORTS.items()]


@router.get("/relatorios/{chave}", summary="Gerar relatório")
async def build_report(
    chave: str,
    formato: str = Query("json", description="json | csv"),
    de: Optional[date] = Query(None),
    ate: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    if chave not in REPORTS:
        raise NotFound("Relatório não encontrado.")

    base = await _scoped_documents(db, user)
    if de:
        base = base.where(func.date(Document.created_at) >= de)
    if ate:
        base = base.where(func.date(Document.created_at) <= ate)

    colunas: list = []
    linhas: list = []

    if chave == "por_secretaria":
        rows = (
            await db.execute(
                select(
                    Secretariat.name,
                    func.count(Document.id),
                    func.coalesce(func.sum(Document.size_bytes), 0),
                )
                .select_from(Document)
                .join(Secretariat, Secretariat.id == Document.secretariat_id)
                .where(Document.institution_id == institution.id, Document.deleted_at.is_(None))
                .group_by(Secretariat.name)
                .order_by(func.count(Document.id).desc())
            )
        ).all()
        colunas = ["Secretaria", "Documentos", "Bytes"]
        linhas = [[row[0], row[1], int(row[2])] for row in rows]

    elif chave == "por_setor":
        rows = (
            await db.execute(
                select(Department.name, func.count(Document.id))
                .select_from(Document)
                .join(Department, Department.id == Document.department_id)
                .where(Document.institution_id == institution.id, Document.deleted_at.is_(None))
                .group_by(Department.name)
                .order_by(func.count(Document.id).desc())
            )
        ).all()
        colunas = ["Setor", "Documentos"]
        linhas = [[row[0], row[1]] for row in rows]

    elif chave == "por_categoria":
        from app.models.taxonomy import Category

        rows = (
            await db.execute(
                select(Category.name, func.count(Document.id))
                .select_from(Document)
                .join(Category, Category.id == Document.category_id)
                .where(Document.institution_id == institution.id, Document.deleted_at.is_(None))
                .group_by(Category.name)
                .order_by(func.count(Document.id).desc())
            )
        ).all()
        colunas = ["Categoria", "Documentos"]
        linhas = [[row[0], row[1]] for row in rows]

    elif chave == "por_responsavel":
        rows = (
            await db.execute(
                select(User.name, func.count(Document.id))
                .select_from(Document)
                .join(User, User.id == Document.owner_user_id)
                .where(Document.institution_id == institution.id, Document.deleted_at.is_(None))
                .group_by(User.name)
                .order_by(func.count(Document.id).desc())
            )
        ).all()
        colunas = ["Responsável", "Documentos"]
        linhas = [[row[0], row[1]] for row in rows]

    elif chave in {"vencidos", "vencendo"}:
        hoje = date.today()
        stmt = base.where(Document.expires_on.is_not(None))
        stmt = (
            stmt.where(Document.expires_on < hoje)
            if chave == "vencidos"
            else stmt.where(
                Document.expires_on >= hoje,
                Document.expires_on <= hoje + timedelta(days=90),
            )
        )
        rows = (await db.scalars(stmt.order_by(Document.expires_on))).all()
        colunas = ["Código", "Documento", "Vencimento", "Responsável"]
        nomes = await user_names(db, [r.owner_user_id for r in rows])
        linhas = [
            [
                r.code,
                r.display_name,
                r.expires_on.strftime("%d/%m/%Y") if r.expires_on else "",
                nomes.get(r.owner_user_id, ""),
            ]
            for r in rows
        ]

    elif chave in {"downloads", "visualizacoes"}:
        campo = Document.download_count if chave == "downloads" else Document.view_count
        rows = (await db.scalars(base.order_by(campo.desc()).limit(200))).all()
        colunas = ["Código", "Documento", "Quantidade"]
        linhas = [
            [
                r.code,
                r.display_name,
                r.download_count if chave == "downloads" else r.view_count,
            ]
            for r in rows
        ]

    elif chave == "links_externos":
        rows = (
            await db.scalars(
                select(ExternalLink)
                .where(ExternalLink.institution_id == institution.id)
                .order_by(ExternalLink.created_at.desc())
            )
        ).all()
        colunas = ["Nome", "Criado em", "Expira em", "Acessos", "Downloads", "Situação"]
        linhas = [
            [
                r.name,
                r.created_at.strftime("%d/%m/%Y %H:%M"),
                r.expires_at.strftime("%d/%m/%Y %H:%M") if r.expires_at else "sem prazo",
                r.access_count,
                r.download_count,
                "ativo" if r.is_active(_now()) else "inativo",
            ]
            for r in rows
        ]

    elif chave == "excluidos":
        rows = (
            await db.scalars(
                select(Document)
                .where(
                    Document.institution_id == institution.id,
                    Document.deleted_at.is_not(None),
                )
                .order_by(Document.deleted_at.desc())
            )
        ).all()
        nomes = await user_names(db, [r.deleted_by_id for r in rows])
        colunas = ["Código", "Documento", "Excluído em", "Excluído por", "Motivo"]
        linhas = [
            [
                r.code,
                r.display_name,
                r.deleted_at.strftime("%d/%m/%Y %H:%M") if r.deleted_at else "",
                nomes.get(r.deleted_by_id, ""),
                r.delete_reason or "",
            ]
            for r in rows
        ]

    elif chave == "armazenamento":
        resumo = await storage_usage.usage_summary(db, institution)
        colunas = ["Secretaria", "Bytes", "Limite"]
        linhas = [
            [item["nome"], item["bytes"], item["limite_bytes"] or "sem limite"]
            for item in resumo["por_secretaria"]
        ]

    elif chave == "backups":
        rows = (
            await db.scalars(
                select(BackupExecution).order_by(BackupExecution.started_at.desc()).limit(200)
            )
        ).all()
        colunas = ["Início", "Tipo", "Situação", "Arquivos", "Bytes", "Verificação"]
        linhas = [
            [
                r.started_at.strftime("%d/%m/%Y %H:%M") if r.started_at else "",
                r.backup_type,
                r.status,
                r.file_count,
                r.total_bytes,
                r.verify_result or "não verificado",
            ]
            for r in rows
        ]

    elif chave == "usuarios_ativos":
        rows = (
            await db.scalars(
                select(User)
                .where(User.institution_id == institution.id, User.deleted_at.is_(None))
                .order_by(User.last_login_at.desc().nullslast())
            )
        ).all()
        colunas = ["Nome", "E-mail", "Perfil", "Último acesso", "Situação"]
        linhas = [
            [
                r.name,
                r.email,
                r.profile,
                r.last_login_at.strftime("%d/%m/%Y %H:%M") if r.last_login_at else "nunca",
                "ativo" if r.is_active else "inativo",
            ]
            for r in rows
        ]

    if formato == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer, delimiter=";")
        writer.writerow(colunas)
        writer.writerows(linhas)
        buffer.seek(0)
        return StreamingResponse(
            iter([buffer.getvalue().encode("utf-8-sig")]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{chave}.csv"'},
        )

    return {
        "titulo": REPORTS[chave],
        "gerado_em": _now(),
        "colunas": colunas,
        "linhas": linhas,
        "total": len(linhas),
    }
