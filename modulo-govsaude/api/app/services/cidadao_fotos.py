"""Fotos do cidadão com política do tenant, magic number e storage privado."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.antivirus import validar_anexo
from app.core.errors import NotFound, PermissionDenied, Unprocessable
from app.core.security import agora, hash_bytes
from app.core.storage import Storage, get_storage
from app.models.cidadao import CidadaoFoto
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.services.auditoria import instantaneo, registrar
from app.services.cidadao_comum import obter_cidadao
from app.services.configuracoes import valor as valor_configuracao

MIMES_FOTO = {"image/jpeg", "image/png", "image/webp"}


async def _politica(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    configurada = await valor_configuracao(
        db, tenant_id, "cidadao.uso_foto", {"permitir": True, "obrigatoria": False}
    )
    return {"permitir": True, "obrigatoria": False, **(configurada or {})}


async def listar_fotos(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoFoto]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(CidadaoFoto)
                .where(
                    CidadaoFoto.tenant_id == tenant_id,
                    CidadaoFoto.cidadao_id == cidadao_id,
                    CidadaoFoto.baixa_em.is_(None),
                )
                .order_by(CidadaoFoto.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


async def criar_foto(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    nome_arquivo: str,
    conteudo: bytes,
    mime_declarado: str | None,
    principal: bool,
    ator: Usuario,
    cliente: dict,
) -> CidadaoFoto:
    cidadao = await obter_cidadao(db, tenant_id, cidadao_id)
    politica = await _politica(db, tenant_id)
    if not politica.get("permitir", True):
        raise PermissionDenied("O uso de foto está desabilitado pela política do tenant.")
    validado = validar_anexo(nome_arquivo, conteudo, mime_declarado)
    if validado.mime not in MIMES_FOTO:
        raise Unprocessable(
            "Formato de foto não permitido.",
            errors=[
                {
                    "campo": "arquivo",
                    "mensagem": "Envie JPEG, PNG ou WebP.",
                    "codigo_regra": "foto_formato",
                }
            ],
        )
    if principal:
        await _desmarcar_principal(db, tenant_id, cidadao.id)
    extensao = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }[validado.mime]
    chave = Storage.chave_opaca(tenant_id, extensao)
    await get_storage().put(chave, conteudo, validado.mime)
    registro = CidadaoFoto(
        tenant_id=tenant_id,
        cidadao_id=cidadao.id,
        chave_objeto=chave,
        mime=validado.mime,
        tamanho_bytes=validado.tamanho,
        hash_sha256=hash_bytes(conteudo),
        status_antivirus=validado.status_antivirus,
        principal=principal,
        criado_por_id=ator.id,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_foto",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def definir_principal(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    foto_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> CidadaoFoto:
    registro = await _obter_foto(db, tenant_id, cidadao_id, foto_id)
    await _desmarcar_principal(db, tenant_id, cidadao_id, ignorar_id=registro.id)
    registro.principal = True
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_foto",
        recurso_id=registro.id,
        detalhe="Foto definida como principal.",
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar_foto(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    foto_id: uuid.UUID,
    motivo: str,
    data: datetime | None = None,
    ator: Usuario,
    cliente: dict,
) -> CidadaoFoto:
    registro = await _obter_foto(db, tenant_id, cidadao_id, foto_id)
    if registro.baixa_em is not None:
        return registro
    antes = instantaneo(registro)
    registro.baixa_em = data or agora()
    registro.baixa_motivo = motivo
    registro.baixa_por_id = ator.id
    registro.principal = False
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_foto",
        recurso_id=registro.id,
        justificativa=motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def obter_conteudo(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    foto_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> tuple[bytes, str]:
    registro = await _obter_foto(db, tenant_id, cidadao_id, foto_id)
    conteudo = await get_storage().get(registro.chave_objeto)
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_foto",
        recurso_id=registro.id,
        finalidade="consulta de foto do cidadão",
        cliente=cliente,
    )
    await db.commit()
    return conteudo, registro.mime


async def url_temporaria(registro: CidadaoFoto) -> str | None:
    return await get_storage().url_temporaria(registro.chave_objeto)


async def _obter_foto(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, foto_id: uuid.UUID
) -> CidadaoFoto:
    await obter_cidadao(db, tenant_id, cidadao_id)
    registro = await db.scalar(
        select(CidadaoFoto).where(
            CidadaoFoto.id == foto_id,
            CidadaoFoto.tenant_id == tenant_id,
            CidadaoFoto.cidadao_id == cidadao_id,
            CidadaoFoto.baixa_em.is_(None),
        )
    )
    if registro is None:
        raise NotFound("Foto não encontrada.")
    return registro


async def _desmarcar_principal(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    *,
    ignorar_id: uuid.UUID | None = None,
) -> None:
    consulta = select(CidadaoFoto).where(
        CidadaoFoto.tenant_id == tenant_id,
        CidadaoFoto.cidadao_id == cidadao_id,
        CidadaoFoto.principal.is_(True),
        CidadaoFoto.baixa_em.is_(None),
    )
    if ignorar_id:
        consulta = consulta.where(CidadaoFoto.id != ignorar_id)
    for registro in (await db.execute(consulta)).scalars().all():
        registro.principal = False


__all__ = [
    "baixar_foto",
    "criar_foto",
    "definir_principal",
    "listar_fotos",
    "obter_conteudo",
    "url_temporaria",
]
