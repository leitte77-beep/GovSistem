"""Assinatura eletrônica — serviço isolado com Strategy Pattern (Lei 14.063/2020).

Fase 1: `AssinaturaSimplesProvider` (login SSO + reautenticação no ato, com
registro de IP/UA/timestamp). O nível qualificado (ICP-Brasil, PAdES/CAdES) é
um provider pronto a ativar quando o ente obtiver certificado A1/A3.
"""

import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.icp_brasil import ICPBrasilCriptografiaAdapter, serializar_resultado
from app.core.auth import user_role_names
from app.models.andamento import Andamento
from app.models.documento import Assinatura, Documento
from app.models.dominio import TipoDocumento
from app.models.enums import NivelAssinatura, SituacaoDocumento, TipoEvento
from app.models.user import User
from app.services.auditoria import registrar

_NIVEL_RANKING = {"SIMPLES": 0, "AVANCADA": 1, "QUALIFICADA": 2}


class AssinaturaProvider(ABC):
    nivel: str

    @abstractmethod
    async def assinar(
        self,
        db: AsyncSession,
        tenant_id: uuid.UUID,
        user: User,
        documento: Documento,
        *,
        papel_cargo: Optional[str],
        client: Optional[dict],
        **extra: object,
    ) -> Assinatura: ...


class AssinaturaSimplesProvider(AssinaturaProvider):
    """Assinatura simples: autenticação SSO + confirmação explícita no ato."""

    nivel = NivelAssinatura.SIMPLES.value

    async def assinar(
        self,
        db: AsyncSession,
        tenant_id: uuid.UUID,
        user: User,
        documento: Documento,
        *,
        papel_cargo: Optional[str],
        client: Optional[dict],
        **extra: object,
    ) -> Assinatura:
        return Assinatura(
            tenant_id=tenant_id,
            documento_id=documento.id,
            signatario_user_id=user.id,
            signatario_nome=user.name,
            papel_cargo=papel_cargo,
            nivel=self.nivel,
            algoritmo="SHA256",
            hash_assinado=documento.hash_conteudo,
            ip_address=client.get("ip_address") if client else None,
            user_agent=client.get("user_agent") if client else None,
            validacao_resultado="OK",
        )


class AssinaturaQualificadaICPProvider(AssinaturaProvider):
    """Assinatura qualificada ICP-Brasil (PAdES/CAdES + carimbo de tempo).

    Exige certificado digital A1/A3 (PKCS#12) fornecido no ato. O carimbo (RFC 3161)
    usa a TSA configurada; em falha assina degradado (CAdES-BES, sem T) via fallback.
    """

    nivel = NivelAssinatura.QUALIFICADA.value

    async def assinar(
        self,
        db: AsyncSession,
        tenant_id: uuid.UUID,
        user: User,
        documento: Documento,
        *,
        papel_cargo: Optional[str],
        client: Optional[dict],
        **extra: object,
    ) -> Assinatura:
        certificado_pfx_base64 = extra.get("certificado_pfx_base64") or None
        certificado_senha = extra.get("certificado_senha") or ""
        formato = extra.get("formato") or "CADES"

        if not certificado_pfx_base64:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Certificado digital (PKCS#12) é obrigatório para assinatura qualificada",
            )

        from app.services.documento import obter_conteudo_documento

        conteudo, _mime, _nome = await obter_conteudo_documento(db, tenant_id, documento.id)

        adapter = ICPBrasilCriptografiaAdapter()
        resultado = adapter.assinar(
            conteudo,
            certificado_pfx_base64=str(certificado_pfx_base64),
            certificado_senha=str(certificado_senha),
            formato=str(formato),
        )

        return Assinatura(
            tenant_id=tenant_id,
            documento_id=documento.id,
            signatario_user_id=user.id,
            signatario_nome=user.name,
            papel_cargo=papel_cargo,
            nivel=self.nivel,
            algoritmo=resultado.algoritmo,
            hash_assinado=documento.hash_conteudo,
            certificado_serial=resultado.certificado_serial,
            validacao_resultado=resultado.validacao_resultado,
            assinatura_b64=serializar_resultado(resultado),
            ip_address=client.get("ip_address") if client else None,
            user_agent=client.get("user_agent") if client else None,
        )


_PROVIDERS = {
    NivelAssinatura.SIMPLES.value: AssinaturaSimplesProvider(),
    NivelAssinatura.QUALIFICADA.value: AssinaturaQualificadaICPProvider(),
}


def _nivel_atende(minimo: str, nivel: str) -> bool:
    return _NIVEL_RANKING.get(nivel, 0) >= _NIVEL_RANKING.get(minimo, 0)


async def assinar_documento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    documento_id: uuid.UUID,
    papel_cargo: Optional[str] = None,
    nivel: str = NivelAssinatura.SIMPLES.value,
    client: Optional[dict] = None,
    **extra: object,
) -> Assinatura:
    documento = await db.get(Documento, documento_id)
    if documento is None or documento.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento não encontrado"
        )
    if documento.situacao == SituacaoDocumento.ASSINADO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Documento já possui todas as assinaturas exigidas",
        )
    if documento.situacao not in (
        SituacaoDocumento.RASCUNHO.value,
        SituacaoDocumento.EM_ASSINATURA.value,
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Documento não está disponível para assinatura",
        )
    if documento.hash_conteudo is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Documento sem conteúdo assinável",
        )

    tipo: Optional[TipoDocumento] = None
    if documento.tipo_documento_id is not None:
        tipo = await db.get(TipoDocumento, documento.tipo_documento_id)
        if tipo is not None:
            if not _nivel_atende(tipo.nivel_assinatura_minimo, nivel):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=(
                        f"Este tipo de ato exige assinatura de nível mínimo "
                        f"'{tipo.nivel_assinatura_minimo}' (Lei 14.063/2020)"
                    ),
                )
            perfis = tipo.perfis_autorizados or []
            if perfis:
                papeis = user_role_names(user)
                if not papeis.intersection(perfis):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            f"A assinatura deste tipo de ato é restrita aos perfis: "
                            f"{', '.join(perfis)}"
                        ),
                    )

    # Multi-assinatura (matriz de assinatura): quantidade mínima + sem duplicidade.
    qtd_necessaria = (tipo.qtd_assinaturas_minima if tipo is not None else 1) or 1
    assinaturas_existentes = (
        await db.execute(
            select(func.count(Assinatura.id)).where(Assinatura.documento_id == documento.id)
        )
    ).scalar_one() or 0

    if assinaturas_existentes >= qtd_necessaria:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Documento já possui todas as assinaturas exigidas",
        )

    ja_assinou = (
        await db.execute(
            select(Assinatura.id).where(
                Assinatura.documento_id == documento.id,
                Assinatura.signatario_user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if ja_assinou is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Você já assinou este documento",
        )

    provider = _PROVIDERS.get(nivel)
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Provedor de assinatura '{nivel}' não disponível",
        )

    assinatura = await provider.assinar(
        db, tenant_id, user, documento, papel_cargo=papel_cargo, client=client, **extra
    )
    db.add(assinatura)
    await db.flush()

    total_assinaturas = assinaturas_existentes + 1
    if total_assinaturas >= qtd_necessaria:
        documento.situacao = SituacaoDocumento.ASSINADO.value
        documento.assinado_em = datetime.now(timezone.utc)
    else:
        documento.situacao = SituacaoDocumento.EM_ASSINATURA.value

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=documento.processo_id,
            tipo_evento=TipoEvento.ASSINATURA.value,
            descricao=(
                f"Documento '{documento.titulo}' assinado por {user.name} "
                f"({total_assinaturas}/{qtd_necessaria})."
            ),
            unidade_id=documento.criado_unidade_id,
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="ASSINATURA",
        entity="documento",
        entity_id=str(documento.id),
        actor_user_id=user.id,
        processo_id=documento.processo_id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"nivel": nivel, "hash": documento.hash_conteudo},
    )

    await db.commit()
    await db.refresh(assinatura)
    return assinatura
