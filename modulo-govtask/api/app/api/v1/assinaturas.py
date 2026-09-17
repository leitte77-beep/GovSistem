"""Assinatura de documento (§78).

O ciclo de vida é explícito — Rascunho, Em revisão, Aguardando assinatura,
Assinado, Cancelado — e a transição para **Assinado** não é oferecida a usuários
comuns. Ela depende da rota interna que recebe referência e hash do módulo de
assinatura. É a diferença entre registrar uma assinatura e simular uma: sem
evidência, o documento fica "Aguardando assinatura", por mais que se clique.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    get_user_permissions,
    require_internal_key,
    require_permission,
)
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.assinatura_documento import AssinaturaDocumento
from app.models.enums import StatusAssinatura, TipoEvento
from app.models.user import User
from app.schemas.assinatura import (
    AssinaturaCancelar,
    AssinaturaOut,
    AssinaturaRegistrarInterno,
    AssinaturaSolicitar,
)
from app.services import documentos as svc_doc
from app.services.auditoria import registrar_auditoria
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao
from app.services.timeline import registrar_evento

router = APIRouter(tags=["Assinatura de documento"])

_ABERTOS = {
    StatusAssinatura.RASCUNHO,
    StatusAssinatura.EM_REVISAO,
    StatusAssinatura.AGUARDANDO_ASSINATURA,
}


async def _demanda_autorizada(db: AsyncSession, demanda_id: uuid.UUID, user: User):
    return await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))


async def _grupo_autorizado(db: AsyncSession, demanda, grupo_id: uuid.UUID, user: User):
    documento = await svc_doc.versao_atual_do_grupo(db, demanda, grupo_id)
    if documento is None or not svc_doc.pode_ver_documento(
        documento, demanda, user, get_user_permissions(user)
    ):
        # 404 e não 403: a existência do grupo não é confirmada a quem não o vê.
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return documento


async def _registro(db: AsyncSession, demanda_id: uuid.UUID, grupo_id: uuid.UUID):
    return (
        await db.execute(
            select(AssinaturaDocumento).where(
                AssinaturaDocumento.demanda_id == demanda_id,
                AssinaturaDocumento.documento_grupo_id == grupo_id,
            )
        )
    ).scalar_one_or_none()


async def _recarregar(db: AsyncSession, registro_id: uuid.UUID) -> AssinaturaDocumento:
    return (
        await db.execute(
            select(AssinaturaDocumento)
            .where(AssinaturaDocumento.id == registro_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


@router.get(
    "/demandas/{demanda_id}/documentos/{grupo_id}/assinatura",
    response_model=AssinaturaOut | None,
)
async def obter_assinatura(
    demanda_id: uuid.UUID,
    grupo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _demanda_autorizada(db, demanda_id, user)
    await _grupo_autorizado(db, demanda, grupo_id, user)
    return await _registro(db, demanda.id, grupo_id)


@router.post(
    "/demandas/{demanda_id}/documentos/{grupo_id}/assinatura/solicitar",
    response_model=AssinaturaOut,
)
async def solicitar_assinatura(
    demanda_id: uuid.UUID,
    grupo_id: uuid.UUID,
    payload: AssinaturaSolicitar,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await _demanda_autorizada(db, demanda_id, user)
    documento = await _grupo_autorizado(db, demanda, grupo_id, user)

    registro = await _registro(db, demanda.id, grupo_id)
    if registro and registro.status == StatusAssinatura.ASSINADO:
        raise HTTPException(status_code=409, detail="Documento já assinado")
    if registro is None:
        registro = AssinaturaDocumento(
            organization_id=user.organization_id,
            demanda_id=demanda.id,
            documento_grupo_id=grupo_id,
        )
        db.add(registro)

    registro.status = StatusAssinatura.AGUARDANDO_ASSINATURA
    registro.anexo_id = payload.anexo_id or documento.id
    registro.solicitado_por_id = user.id
    registro.solicitado_em = datetime.now(timezone.utc)
    registro.motivo_cancelamento = None

    await registrar_evento(
        db,
        demanda_id=demanda.id,
        tipo_evento=TipoEvento.ASSINATURA_SOLICITADA,
        ator_id=user.id,
        descricao=f"Assinatura solicitada para o documento '{documento.nome_arquivo}'",
        metadados={"documento_grupo_id": str(grupo_id), "anexo_id": str(registro.anexo_id)},
    )
    await registrar_auditoria(
        db,
        request=request,
        user_id=user.id,
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        acao="assinatura.solicitar",
        entidade="documento_assinatura",
        entidade_id=registro.id,
    )
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _recarregar(db, registro.id)


@router.post(
    "/demandas/{demanda_id}/documentos/{grupo_id}/assinatura/revisar",
    response_model=AssinaturaOut,
)
async def enviar_para_revisao(
    demanda_id: uuid.UUID,
    grupo_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await _demanda_autorizada(db, demanda_id, user)
    await _grupo_autorizado(db, demanda, grupo_id, user)
    registro = await _registro(db, demanda.id, grupo_id)
    if registro is None:
        raise HTTPException(status_code=404, detail="Nenhuma assinatura em andamento")
    if registro.status not in _ABERTOS:
        raise HTTPException(status_code=409, detail="Assinatura encerrada não volta para revisão")

    registro.status = StatusAssinatura.EM_REVISAO
    registro.revisado_por_id = user.id
    registro.revisado_em = datetime.now(timezone.utc)

    await registrar_evento(
        db,
        demanda_id=demanda.id,
        tipo_evento=TipoEvento.ASSINATURA_EM_REVISAO,
        ator_id=user.id,
        descricao="Documento enviado para revisão antes da assinatura",
        metadados={"documento_grupo_id": str(grupo_id)},
    )
    await db.commit()
    return await _recarregar(db, registro.id)


@router.post(
    "/demandas/{demanda_id}/documentos/{grupo_id}/assinatura/cancelar",
    response_model=AssinaturaOut,
)
async def cancelar_assinatura(
    demanda_id: uuid.UUID,
    grupo_id: uuid.UUID,
    payload: AssinaturaCancelar,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await _demanda_autorizada(db, demanda_id, user)
    await _grupo_autorizado(db, demanda, grupo_id, user)
    registro = await _registro(db, demanda.id, grupo_id)
    if registro is None:
        raise HTTPException(status_code=404, detail="Nenhuma assinatura em andamento")
    if registro.status == StatusAssinatura.ASSINADO:
        raise HTTPException(status_code=409, detail="Documento assinado não pode ser cancelado")

    registro.status = StatusAssinatura.CANCELADO
    registro.motivo_cancelamento = payload.motivo

    await registrar_evento(
        db,
        demanda_id=demanda.id,
        tipo_evento=TipoEvento.ASSINATURA_CANCELADA,
        ator_id=user.id,
        descricao="Solicitação de assinatura cancelada",
        metadados={"documento_grupo_id": str(grupo_id), "motivo": payload.motivo},
    )
    await registrar_auditoria(
        db,
        request=request,
        user_id=user.id,
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        acao="assinatura.cancelar",
        entidade="documento_assinatura",
        entidade_id=registro.id,
    )
    await db.commit()
    return await _recarregar(db, registro.id)


@router.post(
    "/internal/assinaturas/registrar",
    response_model=AssinaturaOut,
    dependencies=[Depends(require_internal_key)],
)
async def registrar_assinatura_interna(
    payload: AssinaturaRegistrarInterno,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Boundary com o módulo de assinatura. Exige referência e hash.

    Não há caminho de usuário para cá: quem chama é o assinador, com a chave
    interna. A assinatura só existe quando há evidência.
    """
    registro = await _registro(db, payload.demanda_id, payload.documento_grupo_id)
    if registro is None:
        raise HTTPException(status_code=404, detail="Nenhuma solicitação de assinatura para este documento")
    if registro.status == StatusAssinatura.ASSINADO:
        raise HTTPException(status_code=409, detail="Assinatura já registrada")
    if registro.status != StatusAssinatura.AGUARDANDO_ASSINATURA:
        raise HTTPException(
            status_code=409,
            detail="Documento não está aguardando assinatura",
        )

    registro.status = StatusAssinatura.ASSINADO
    registro.referencia_externa = payload.referencia
    registro.hash_assinado = payload.hash_assinado
    registro.provedor = payload.provedor
    registro.assinado_em = datetime.now(timezone.utc)
    if payload.assinado_por_email:
        assinante = (
            await db.execute(
                select(User).where(
                    User.email == payload.assinado_por_email,
                    User.organization_id == registro.organization_id,
                    User.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        registro.assinado_por_id = assinante.id if assinante else None

    await registrar_evento(
        db,
        demanda_id=registro.demanda_id,
        tipo_evento=TipoEvento.ASSINATURA_REGISTRADA,
        ator_id=registro.assinado_por_id or registro.solicitado_por_id,
        descricao="Assinatura registrada pelo módulo de assinatura",
        metadados={
            "documento_grupo_id": str(registro.documento_grupo_id),
            "referencia": payload.referencia,
            "provedor": payload.provedor,
        },
    )
    await registrar_auditoria(
        db,
        request=request,
        user_id=None,
        organization_id=registro.organization_id,
        demanda_id=registro.demanda_id,
        acao="assinatura.registrar",
        entidade="documento_assinatura",
        entidade_id=registro.id,
        dados_posteriores={"referencia": payload.referencia, "hash": payload.hash_assinado},
    )
    await db.commit()
    return await _recarregar(db, registro.id)
