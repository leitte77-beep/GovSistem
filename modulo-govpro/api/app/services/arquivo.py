"""Gestão arquivística (Fase 5): TTD, ciclo de vida, transferência/recolhimento,
exportação de acervo e dados abertos anonimizados.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import sha256
from app.models.andamento import Andamento
from app.models.arquivo import (
    MovimentacaoArquivistica,
    ProcessoArquivistico,
    TabelaTemporalidade,
)
from app.models.documento import ComponenteDigital, Documento
from app.models.dominio import PlanoClassificacao
from app.models.enums import (
    DestinacaoFinal,
    FaseCicloVida,
    TipoEvento,
    TipoMovimentacaoArquivistica,
)
from app.models.processo import Processo
from app.models.user import User
from app.services.auditoria import registrar


# ── TTD ───────────────────────────────────────────────────────────────────────
async def criar_ttd(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    classe_id: uuid.UUID,
    prazo_corrente_anos: int,
    prazo_intermediario_anos: int = 0,
    destinacao_final: str = DestinacaoFinal.GUARDA_PERMANENTE.value,
    observacoes: Optional[str] = None,
    fundamento: Optional[str] = None,
    client: Optional[dict] = None,
) -> TabelaTemporalidade:
    classe = await db.get(PlanoClassificacao, classe_id)
    if classe is None or classe.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Classe não encontrada")

    result = await db.execute(
        select(TabelaTemporalidade).where(TabelaTemporalidade.classe_id == classe_id)
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Classe já possui TTD")

    ttd = TabelaTemporalidade(
        tenant_id=tenant_id,
        classe_id=classe_id,
        prazo_corrente_anos=prazo_corrente_anos,
        prazo_intermediario_anos=prazo_intermediario_anos,
        destinacao_final=destinacao_final,
        observacoes=observacoes,
        fundamento=fundamento,
    )
    db.add(ttd)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="tabela_temporalidade",
        entity_id=str(ttd.id),
        actor_user_id=user.id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(ttd)
    return ttd


async def listar_ttd(db: AsyncSession, tenant_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(TabelaTemporalidade, PlanoClassificacao)
        .join(PlanoClassificacao, PlanoClassificacao.id == TabelaTemporalidade.classe_id)
        .where(TabelaTemporalidade.tenant_id == tenant_id)
    )
    return [
        {
            "id": str(ttd.id),
            "classe_id": str(ttd.classe_id),
            "classe": classe.descricao,
            "prazo_corrente_anos": ttd.prazo_corrente_anos,
            "prazo_intermediario_anos": ttd.prazo_intermediario_anos,
            "destinacao_final": ttd.destinacao_final,
        }
        for ttd, classe in result.all()
    ]


# ── Ciclo de vida ─────────────────────────────────────────────────────────────
async def _ciclo(
    db: AsyncSession, tenant_id: uuid.UUID, processo_id: uuid.UUID
) -> ProcessoArquivistico:
    result = await db.execute(
        select(ProcessoArquivistico).where(ProcessoArquivistico.processo_id == processo_id)
    )
    ciclo = result.scalar_one_or_none()
    if ciclo is None:
        ciclo = ProcessoArquivistico(
            tenant_id=tenant_id, processo_id=processo_id, fase=FaseCicloVida.CORRENTE.value
        )
        db.add(ciclo)
        await db.flush()
    return ciclo


async def transferir(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    client: Optional[dict] = None,
) -> ProcessoArquivistico:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    ciclo = await _ciclo(db, tenant_id, processo_id)
    if ciclo.fase != FaseCicloVida.CORRENTE.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Processo não está na fase corrente"
        )

    agora = datetime.now(timezone.utc)
    ciclo.fase = FaseCicloVida.INTERMEDIARIA.value
    ciclo.data_transferencia = agora

    termo_codigo = uuid.uuid4().hex[:16].upper()
    db.add(
        MovimentacaoArquivistica(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo=TipoMovimentacaoArquivistica.TRANSFERENCIA.value,
            termo_codigo=termo_codigo,
            executada_em=agora,
            hash_termo=sha256(termo_codigo.encode("utf-8")),
            executado_por_user_id=user.id,
        )
    )
    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.OUTRO.value,
            descricao="Processo transferido para a fase intermediária.",
            usuario_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="processo_arquivistico",
        entity_id=str(ciclo.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(ciclo)
    return ciclo


async def recolher(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    client: Optional[dict] = None,
) -> ProcessoArquivistico:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    ciclo = await _ciclo(db, tenant_id, processo_id)
    if ciclo.fase != FaseCicloVida.INTERMEDIARIA.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Processo não está na fase intermediária"
        )

    agora = datetime.now(timezone.utc)
    ciclo.fase = FaseCicloVida.PERMANENTE.value
    ciclo.data_recolhimento = agora
    ciclo.destinacao_final = DestinacaoFinal.GUARDA_PERMANENTE.value

    termo_codigo = uuid.uuid4().hex[:16].upper()
    db.add(
        MovimentacaoArquivistica(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo=TipoMovimentacaoArquivistica.RECOLHIMENTO.value,
            termo_codigo=termo_codigo,
            executada_em=agora,
            hash_termo=sha256(termo_codigo.encode("utf-8")),
            executado_por_user_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="processo_arquivistico",
        entity_id=str(ciclo.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(ciclo)
    return ciclo


async def obter_ciclo(
    db: AsyncSession, tenant_id: uuid.UUID, processo_id: uuid.UUID
) -> ProcessoArquivistico:
    return await _ciclo(db, tenant_id, processo_id)


# ── Exportação de acervo (SIP/AIP) ────────────────────────────────────────────
async def exportar_acervo(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    processos_result = await db.execute(
        select(Processo).where(Processo.tenant_id == tenant_id).order_by(Processo.created_at)
    )
    processos = list(processos_result.scalars())

    itens = []
    for processo in processos:
        docs_result = await db.execute(
            select(Documento).where(
                Documento.processo_id == processo.id, Documento.tenant_id == tenant_id
            )
        )
        documentos = []
        for doc in docs_result.scalars():
            componentes = []
            if doc.hash_conteudo:
                comp_result = await db.execute(
                    select(ComponenteDigital).where(ComponenteDigital.sha256 == doc.hash_conteudo)
                )
                comp = comp_result.scalar_one_or_none()
                if comp is not None:
                    componentes.append(
                        {
                            "sha256": comp.sha256,
                            "mime": comp.mime,
                            "tamanho": comp.tamanho,
                            "storage_key": comp.storage_key,
                        }
                    )
            documentos.append(
                {
                    "id": str(doc.id),
                    "titulo": doc.titulo,
                    "formato": doc.formato,
                    "nivel_acesso": doc.nivel_acesso,
                    "situacao": doc.situacao,
                    "hash_conteudo": doc.hash_conteudo,
                    "componentes": componentes,
                }
            )
        itens.append(
            {
                "nup": processo.nup,
                "tipo_processo_id": str(processo.tipo_processo_id),
                "especificacao": processo.especificacao,
                "situacao": processo.situacao,
                "nivel_acesso": processo.nivel_acesso,
                "data_autuacao": processo.data_autuacao.isoformat()
                if processo.data_autuacao
                else None,
                "documentos": documentos,
            }
        )

    return {
        "formato": "SIP-AIP",
        "versao": "1.0",
        "tenant_id": str(tenant_id),
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "total_processos": len(itens),
        "itens": itens,
    }


# ── Dados abertos (anonimizados) ──────────────────────────────────────────────
async def dados_abertos(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    total = (
        await db.execute(select(func.count(Processo.id)).where(Processo.tenant_id == tenant_id))
    ).scalar_one()

    por_situacao = {}
    result = await db.execute(
        select(Processo.situacao, func.count(Processo.id))
        .where(Processo.tenant_id == tenant_id)
        .group_by(Processo.situacao)
    )
    for situacao, count in result.all():
        por_situacao[situacao] = count

    por_tipo = {}
    result = await db.execute(
        select(Processo.tipo_processo_id, func.count(Processo.id))
        .where(Processo.tenant_id == tenant_id)
        .group_by(Processo.tipo_processo_id)
    )
    for tipo_id, count in result.all():
        por_tipo[str(tipo_id)] = count

    return {
        "total_processos": total,
        "por_situacao": por_situacao,
        "por_tipo_processo": por_tipo,
        "anonimizado": True,
        "licenca": "open-data-commons-odbl",
    }
