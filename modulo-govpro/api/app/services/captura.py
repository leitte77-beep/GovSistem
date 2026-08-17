"""Captura de documentos externos (upload) com hash, deduplicação e metadados.

- Valida MIME (allowlist) e tamanho máximo.
- Scanner de antivírus obrigatório antes de aceitar.
- SHA-256/SHA-512 calculados na captura; deduplicação por hash.
- Digitalização com valor legal exige metadados mínimos do Anexo II do
  Decreto 10.278/2020.
"""

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import antivirus
from app.core.config import settings
from app.core.regras import documento_menos_restritivo_que_processo
from app.core.storage import gerar_storage_key, salvar, sha256, sha512
from app.models.andamento import Andamento
from app.models.documento import ComponenteDigital, Documento, VersaoDocumento
from app.models.enums import FormatoDocumento, NivelAcesso, SituacaoDocumento, TipoEvento
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar
from app.services.documento import gerar_codigo_verificador

_METADADOS_MINIMOS_DIGITALIZACAO = {
    "assunto",
    "autor",
    "data_digitalizacao",
    "local_digitalizacao",
    "responsavel",
}


async def capturar_documento_externo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: Optional[User],
    *,
    processo_id: uuid.UUID,
    titulo: str,
    nome_original: str,
    mime: str,
    conteudo: bytes,
    tipo_documento_id: Optional[uuid.UUID] = None,
    nivel_acesso: str = NivelAcesso.PUBLICO.value,
    hipotese_legal_id: Optional[uuid.UUID] = None,
    unidade_id: Optional[uuid.UUID] = None,
    formato: str = FormatoDocumento.CAPTURADO.value,
    metadados: Optional[dict] = None,
    client: Optional[dict] = None,
) -> Documento:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

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

    if mime not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Tipo de arquivo não permitido",
        )
    if len(conteudo) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Arquivo vazio"
        )
    if len(conteudo) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Arquivo excede o limite de {settings.MAX_UPLOAD_SIZE_MB} MB",
        )

    if not await antivirus.scan(conteudo):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Arquivo rejeitado pelo antivírus",
        )

    hash_256 = sha256(conteudo)

    metadados_finais: dict = {}
    if formato == FormatoDocumento.DIGITALIZADO.value:
        metadados_finais = dict(metadados or {})
        faltantes = _METADADOS_MINIMOS_DIGITALIZACAO - set(metadados_finais)
        if faltantes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Digitalização exige metadados mínimos (Anexo II, Decreto 10.278/2020): "
                + ", ".join(sorted(faltantes)),
            )
        # Metadados derivados/obrigatórios preenchidos pelo sistema.
        metadados_finais.update(
            {
                "titulo": titulo,
                "hash": hash_256,
                "formato_preservacao": "PDF/A",
            }
        )

    # Deduplicação por hash: o mesmo conteúdo não é armazenado duas vezes.
    comp_result = await db.execute(
        select(ComponenteDigital).where(ComponenteDigital.sha256 == hash_256)
    )
    componente = comp_result.scalar_one_or_none()
    if componente is None:
        storage_key = gerar_storage_key(tenant_id, nome_original)
        await salvar(tenant_id, conteudo, storage_key)
        componente = ComponenteDigital(
            tenant_id=tenant_id,
            sha256=hash_256,
            sha512=sha512(conteudo),
            mime=mime,
            tamanho=len(conteudo),
            nome_original=nome_original,
            storage_key=storage_key,
        )
        db.add(componente)
        await db.flush()

    documento = Documento(
        tenant_id=tenant_id,
        processo_id=processo.id,
        tipo_documento_id=tipo_documento_id,
        titulo=titulo.strip(),
        formato=formato,
        nivel_acesso=nivel_acesso,
        hipotese_legal_id=hipotese_legal_id,
        situacao=SituacaoDocumento.RASCUNHO.value,
        criado_por_user_id=user.id if user else None,
        criado_unidade_id=unidade_id,
        codigo_verificador=gerar_codigo_verificador(),
        hash_conteudo=hash_256,
        versao_atual=1,
        metadados_captura=metadados_finais or None,
    )
    db.add(documento)
    await db.flush()

    db.add(
        VersaoDocumento(
            documento_id=documento.id,
            versao=1,
            componente_digital_id=componente.id,
            criado_por_user_id=user.id if user else None,
        )
    )

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.JUNTADA.value,
            descricao=f"Documento '{titulo}' juntado ao processo.",
            unidade_id=unidade_id,
            usuario_id=user.id if user else None,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="documento",
        entity_id=str(documento.id),
        actor_user_id=user.id if user else None,
        actor_tipo="INTERNO" if user else "EXTERNO",
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"titulo": titulo, "sha256": hash_256, "formato": formato},
    )

    await db.commit()
    await db.refresh(documento)
    return documento
