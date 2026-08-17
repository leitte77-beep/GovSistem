"""Produção de documentos internos (nato-digitais) e captura de conteúdo."""

import secrets
import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.regras import documento_menos_restritivo_que_processo
from app.core.storage import sha256
from app.models.andamento import Andamento
from app.models.documento import ComponenteDigital, Documento, VersaoDocumento
from app.models.dominio import TipoDocumento
from app.models.enums import (
    FormatoDocumento,
    NivelAcesso,
    SituacaoDocumento,
    TipoEvento,
)
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar


def gerar_codigo_verificador() -> str:
    """Código público de validação (7 dígitos), sem login."""
    return f"{secrets.randbelow(10_000_000):07d}"


async def _get_processo(db: AsyncSession, tenant_id: uuid.UUID, processo_id: uuid.UUID) -> Processo:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")
    return processo


async def criar_documento_interno(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    titulo: str,
    conteudo_html: Optional[str] = None,
    tipo_documento_id: Optional[uuid.UUID] = None,
    nivel_acesso: str = NivelAcesso.PUBLICO.value,
    hipotese_legal_id: Optional[uuid.UUID] = None,
    unidade_id: Optional[uuid.UUID] = None,
    client: Optional[dict] = None,
) -> Documento:
    processo = await _get_processo(db, tenant_id, processo_id)

    if documento_menos_restritivo_que_processo(processo.nivel_acesso, nivel_acesso):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Documento não pode ter nível de acesso menos restritivo que o processo",
        )
    if nivel_acesso != NivelAcesso.PUBLICO.value and hipotese_legal_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Restrição de acesso exige hipótese legal",
        )

    numero: Optional[str] = None
    if tipo_documento_id is not None:
        tipo = await db.get(TipoDocumento, tipo_documento_id)
        if tipo is None or tipo.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de documento não encontrado"
            )
        if tipo.numeracao and unidade_id is not None:
            numero = await _proximo_numero_documento(db, tenant_id, tipo, unidade_id)

    conteudo = conteudo_html or ""
    documento = Documento(
        tenant_id=tenant_id,
        processo_id=processo.id,
        tipo_documento_id=tipo_documento_id,
        numero=numero,
        titulo=titulo.strip(),
        formato=FormatoDocumento.NATO_DIGITAL.value,
        nivel_acesso=nivel_acesso,
        hipotese_legal_id=hipotese_legal_id,
        situacao=SituacaoDocumento.RASCUNHO.value,
        criado_por_user_id=user.id,
        criado_unidade_id=unidade_id,
        codigo_verificador=gerar_codigo_verificador(),
        hash_conteudo=sha256(conteudo.encode("utf-8")),
        versao_atual=1,
    )
    db.add(documento)
    await db.flush()

    db.add(
        VersaoDocumento(
            documento_id=documento.id,
            versao=1,
            conteudo_html=conteudo,
            criado_por_user_id=user.id,
        )
    )

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.PRODUCAO_DOCUMENTO.value,
            descricao=f"Documento '{titulo}' produzido.",
            unidade_id=unidade_id,
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="documento",
        entity_id=str(documento.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"titulo": titulo, "nivel_acesso": nivel_acesso},
    )

    await db.commit()
    await db.refresh(documento)
    return documento


async def editar_documento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    documento_id: uuid.UUID,
    conteudo_html: str,
    titulo: Optional[str] = None,
    client: Optional[dict] = None,
) -> Documento:
    documento = await db.get(Documento, documento_id)
    if documento is None or documento.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )
    if documento.situacao != SituacaoDocumento.RASCUNHO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Documento assinado é imutável; crie um novo documento",
        )

    if titulo is not None:
        documento.titulo = titulo.strip()

    nova_versao = documento.versao_atual + 1
    documento.versao_atual = nova_versao
    documento.hash_conteudo = sha256(conteudo_html.encode("utf-8"))

    db.add(
        VersaoDocumento(
            documento_id=documento.id,
            versao=nova_versao,
            conteudo_html=conteudo_html,
            criado_por_user_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="documento",
        entity_id=str(documento.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"versao": nova_versao},
    )

    await db.commit()
    await db.refresh(documento)
    return documento


async def _proximo_numero_documento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    tipo: TipoDocumento,
    unidade_id: uuid.UUID,
) -> str:
    from app.core.timeutils import ano_brasilia

    ano = ano_brasilia()
    prefixo = f"{tipo.codigo}/{ano}/"
    result = await db.execute(
        select(func.count(Documento.id)).where(
            Documento.tenant_id == tenant_id,
            Documento.tipo_documento_id == tipo.id,
            Documento.criado_unidade_id == unidade_id,
        )
    )
    count = result.scalar_one() or 0
    return f"{prefixo}{count + 1:05d}"


async def obter_conteudo_documento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    documento_id: uuid.UUID,
) -> tuple[bytes, str, str]:
    """Retorna (conteúdo, mime, nome) do documento na sua versão corrente."""
    documento = await db.get(Documento, documento_id)
    if documento is None or documento.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )

    from app.core.storage import ler
    from app.models.documento import VersaoDocumento

    result = await db.execute(
        select(VersaoDocumento).where(
            VersaoDocumento.documento_id == documento.id,
            VersaoDocumento.versao == documento.versao_atual,
        )
    )
    versao = result.scalar_one_or_none()

    if versao is not None and versao.componente_digital_id is not None:
        componente = await db.get(ComponenteDigital, versao.componente_digital_id)
        conteudo = await ler(tenant_id, componente.storage_key)
        return (
            conteudo,
            componente.mime or "application/octet-stream",
            componente.nome_original or "documento",
        )

    conteudo = (versao.conteudo_html if versao and versao.conteudo_html else "").encode("utf-8")
    return conteudo, "text/html", f"{documento.titulo}.html"


async def tarjar_documento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    documento_id: uuid.UUID,
    conteudo_tarjado: bytes,
    mime: str,
    motivo: str,
    client: Optional[dict] = None,
):
    """Gera versão pública (tarja) mantendo o original íntegro e vinculado."""
    from app.core.storage import gerar_storage_key, salvar, sha256
    from app.models.versao_publica import VersaoPublica

    documento = await db.get(Documento, documento_id)
    if documento is None or documento.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )

    hash_256 = sha256(conteudo_tarjado)
    comp_result = await db.execute(
        select(ComponenteDigital).where(ComponenteDigital.sha256 == hash_256)
    )
    componente = comp_result.scalar_one_or_none()
    if componente is None:
        storage_key = gerar_storage_key(tenant_id, f"{documento.titulo}-publico.pdf")
        await salvar(tenant_id, conteudo_tarjado, storage_key)
        componente = ComponenteDigital(
            tenant_id=tenant_id,
            sha256=hash_256,
            mime=mime,
            tamanho=len(conteudo_tarjado),
            nome_original=f"{documento.titulo}-publico",
            storage_key=storage_key,
        )
        db.add(componente)
        await db.flush()

    versao_publica = VersaoPublica(
        tenant_id=tenant_id,
        documento_id=documento.id,
        componente_digital_id=componente.id,
        criado_por_user_id=user.id,
        motivo=motivo,
    )
    db.add(versao_publica)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="versao_publica",
        entity_id=str(versao_publica.id),
        actor_user_id=user.id,
        processo_id=documento.processo_id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        finalidade="Ocultação parcial (tarja) — Lei 12.527/2011",
    )

    await db.commit()
    await db.refresh(versao_publica)
    return versao_publica
