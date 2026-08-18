"""Autuação: criar processo e atribuir NUP."""

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timeutils import agora_brasilia, agora_utc
from app.models.andamento import Andamento
from app.models.dominio import TipoProcesso
from app.models.enums import (
    EstadoProcessoUnidade,
    NivelAcesso,
    SituacaoProcesso,
    TipoEvento,
    TipoPessoa,
)
from app.models.interessado import Interessado
from app.models.processo import Processo, ProcessoUnidade
from app.models.unidade import LotacaoUsuario, Unidade
from app.models.user import User
from app.services import roteamento
from app.services.auditoria import registrar
from app.services.numeracao import proximo_nup


async def _unidade_protocolizadora(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    unidade_id: Optional[uuid.UUID],
) -> Unidade:
    if unidade_id is not None:
        result = await db.execute(
            select(Unidade).where(Unidade.id == unidade_id, Unidade.tenant_id == tenant_id)
        )
        unidade = result.scalar_one_or_none()
    else:
        result = await db.execute(
            select(Unidade)
            .join(LotacaoUsuario, LotacaoUsuario.unidade_id == Unidade.id)
            .where(
                LotacaoUsuario.user_id == user.id,
                LotacaoUsuario.tenant_id == tenant_id,
                LotacaoUsuario.principal.is_(True),
            )
        )
        unidade = result.scalars().first()
        if unidade is None:
            result = await db.execute(
                select(Unidade)
                .join(LotacaoUsuario, LotacaoUsuario.unidade_id == Unidade.id)
                .where(LotacaoUsuario.user_id == user.id, LotacaoUsuario.tenant_id == tenant_id)
            )
            unidade = result.scalars().first()

    if unidade is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Usuário sem lotação em unidade; informe a unidade protocolizadora",
        )
    if not unidade.protocolizadora:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A unidade informada não é protocolizadora",
        )
    return unidade


async def autuar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    tipo_processo_id: uuid.UUID,
    especificacao: str,
    interessados: list[dict],
    nivel_acesso: str = NivelAcesso.PUBLICO.value,
    hipotese_legal_id: Optional[uuid.UUID] = None,
    classe_id: Optional[uuid.UUID] = None,
    observacoes: Optional[str] = None,
    unidade_protocolizadora_id: Optional[uuid.UUID] = None,
    fuso: str = "America/Sao_Paulo",
    client: Optional[dict] = None,
) -> Processo:
    tipo = await db.get(TipoProcesso, tipo_processo_id)
    if tipo is None or tipo.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de processo não encontrado"
        )

    if nivel_acesso not in (tipo.niveis_permitidos or []):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Nível de acesso não permitido para este tipo de processo",
        )
    if nivel_acesso != NivelAcesso.PUBLICO.value and hipotese_legal_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Restrição de acesso exige hipótese legal",
        )

    classe_final = classe_id or tipo.classificacao_padrao_id

    unidade = await _unidade_protocolizadora(db, tenant_id, user, unidade_protocolizadora_id)

    agora = agora_brasilia(fuso)
    nup = await proximo_nup(db, tenant_id, unidade, agora.year)

    processo = Processo(
        tenant_id=tenant_id,
        nup=nup,
        tipo_processo_id=tipo.id,
        especificacao=especificacao.strip(),
        classe_id=classe_final,
        nivel_acesso=nivel_acesso,
        hipotese_legal_id=hipotese_legal_id,
        situacao=SituacaoProcesso.EM_TRAMITACAO.value,
        unidade_protocolizadora_id=unidade.id,
        autuado_por_user_id=user.id,
        data_autuacao=agora_utc(),
        observacoes=observacoes,
    )
    db.add(processo)
    await db.flush()

    db.add(
        ProcessoUnidade(
            tenant_id=tenant_id,
            processo_id=processo.id,
            unidade_id=unidade.id,
            estado=EstadoProcessoUnidade.EM_ANALISE.value,
            recebido_em=agora_utc(),
        )
    )

    for item in interessados or []:
        db.add(
            Interessado(
                tenant_id=tenant_id,
                processo_id=processo.id,
                tipo_pessoa=item.get("tipo_pessoa", TipoPessoa.PF.value),
                nome=item["nome"],
                cpf_cnpj=item.get("cpf_cnpj"),
                email=item.get("email"),
                telefone=item.get("telefone"),
            )
        )

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.AUTUACAO.value,
            descricao=f"Processo iniciado com NUP {nup}.",
            unidade_id=unidade.id,
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="processo",
        entity_id=str(processo.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        origin=client.get("origin") if client else None,
        dados_depois={"nup": nup, "tipo_processo_id": str(tipo.id), "nivel_acesso": nivel_acesso},
    )

    await db.commit()
    await db.refresh(processo)
    return processo


async def _unidade_protocolizadora_padrao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    preferida_id: Optional[uuid.UUID] = None,
) -> Unidade:
    """Resolve a unidade protocolizadora para autuação sem usuário interno."""
    if preferida_id is not None:
        preferida = await db.get(Unidade, preferida_id)
        if preferida is not None and preferida.tenant_id == tenant_id and preferida.protocolizadora:
            return preferida
    result = await db.execute(
        select(Unidade)
        .where(Unidade.tenant_id == tenant_id, Unidade.protocolizadora.is_(True))
        .order_by(Unidade.created_at)
        .limit(1)
    )
    unidade = result.scalar_one_or_none()
    if unidade is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Ente sem unidade protocolizadora configurada",
        )
    return unidade


async def autuar_externo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    tipo_processo_id: uuid.UUID,
    especificacao: str,
    interessados: list[dict],
    nivel_acesso: str = NivelAcesso.PUBLICO.value,
    hipotese_legal_id: Optional[uuid.UUID] = None,
    classe_id: Optional[uuid.UUID] = None,
    observacoes: Optional[str] = None,
    fuso: str = "America/Sao_Paulo",
    client: Optional[dict] = None,
) -> Processo:
    """Autuação por peticionamento externo (cidadão) — sem usuário interno."""
    tipo = await db.get(TipoProcesso, tipo_processo_id)
    if tipo is None or tipo.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de processo não encontrado"
        )
    if not tipo.publico_externo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Este tipo de processo não aceita peticionamento externo",
        )
    if nivel_acesso not in (tipo.niveis_permitidos or []):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Nível de acesso não permitido para este tipo de processo",
        )
    if nivel_acesso != NivelAcesso.PUBLICO.value and hipotese_legal_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Restrição de acesso exige hipótese legal",
        )

    classe_final = classe_id or tipo.classificacao_padrao_id

    unidade = await _unidade_protocolizadora_padrao(db, tenant_id, tipo.unidade_destino_padrao_id)

    agora = agora_brasilia(fuso)
    nup = await proximo_nup(db, tenant_id, unidade, agora.year)

    processo = Processo(
        tenant_id=tenant_id,
        nup=nup,
        tipo_processo_id=tipo.id,
        especificacao=especificacao.strip(),
        classe_id=classe_final,
        nivel_acesso=nivel_acesso,
        hipotese_legal_id=hipotese_legal_id,
        situacao=SituacaoProcesso.EM_TRAMITACAO.value,
        unidade_protocolizadora_id=unidade.id,
        autuado_por_user_id=None,
        data_autuacao=agora_utc(),
        observacoes=observacoes,
    )
    db.add(processo)
    await db.flush()

    db.add(
        ProcessoUnidade(
            tenant_id=tenant_id,
            processo_id=processo.id,
            unidade_id=unidade.id,
            estado=EstadoProcessoUnidade.EM_ANALISE.value,
            recebido_em=agora_utc(),
        )
    )

    # Roteamento automático: regras de encaminhamento > destino padrão do tipo
    # > Protocolo Central (triagem). Nunca deixa a solicitação sem destino.
    await roteamento.rotear_automaticamente(
        db,
        tenant_id,
        processo,
        destino_explicito_id=tipo.unidade_destino_padrao_id,
        client=client,
    )

    for item in interessados or []:
        db.add(
            Interessado(
                tenant_id=tenant_id,
                processo_id=processo.id,
                tipo_pessoa=item.get("tipo_pessoa", TipoPessoa.PF.value),
                nome=item["nome"],
                cpf_cnpj=item.get("cpf_cnpj"),
                email=item.get("email"),
                telefone=item.get("telefone"),
            )
        )

    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.AUTUACAO.value,
            descricao=f"Processo iniciado por peticionamento externo com NUP {nup}.",
            unidade_id=unidade.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CRIACAO",
        entity="processo",
        entity_id=str(processo.id),
        actor_tipo="EXTERNO",
        processo_id=processo.id,
        nup=nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        dados_depois={"nup": nup, "tipo_processo_id": str(tipo.id), "nivel_acesso": nivel_acesso},
    )

    await db.commit()
    await db.refresh(processo)
    return processo
