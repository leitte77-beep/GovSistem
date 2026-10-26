"""Deduplicação configurável, decisão humana e unificação reversível.

B.12-001…003: a pontuação usa pesos do tenant, a decisão é humana e a
unificação preserva os dados anteriores do destino para reversão.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.security import agora
from app.models.cidadao import Cidadao, CidadaoDuplicidade, CidadaoUnificacao
from app.models.enums import AcaoAuditoria, StatusDuplicidade, StatusUnificacao
from app.models.nucleo import Usuario
from app.services.auditoria import registrar
from app.services.cidadao_comum import (
    obter_cidadao,
    serializar_cidadao,
    serializar_resumo,
)
from app.services.configuracoes import valor as valor_configuracao

PESOS_PADRAO = {
    "nome": 40,
    "nascimento": 30,
    "mae": 20,
    "cpf": 40,
    "cns": 40,
}
LIMIAR_PADRAO = 60

CAMPOS_UNIFICAVEIS = {
    "nome",
    "nome_social",
    "data_nascimento",
    "sexo",
    "identidade_genero",
    "orientacao_sexual",
    "raca_cor",
    "etnia",
    "nacionalidade",
    "municipio_nascimento_ibge",
    "ocupacao_cbo",
    "escolaridade",
    "situacao_rua",
    "nome_mae",
    "observacoes",
}


def _tokens(texto: str | None) -> set[str]:
    return {parte for parte in (texto or "").split() if parte}


def _similaridade(a: str | None, b: str | None) -> float:
    tokens_a, tokens_b = _tokens(a), _tokens(b)
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / len(tokens_a | tokens_b)


async def _pesos(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[dict, int]:
    configurado = await valor_configuracao(
        db, tenant_id, "cidadao.duplicidade_pesos", PESOS_PADRAO
    )
    pesos = dict(PESOS_PADRAO)
    for chave, valor in dict(configurado or {}).items():
        if chave not in pesos:
            continue
        try:
            pesos[chave] = max(0, int(valor))
        except (TypeError, ValueError):
            pesos[chave] = PESOS_PADRAO[chave]
    limiar = await valor_configuracao(
        db, tenant_id, "cidadao.duplicidade_limiar", LIMIAR_PADRAO
    )
    try:
        limiar_int = max(0, min(100, int(limiar)))
    except (TypeError, ValueError):
        limiar_int = LIMIAR_PADRAO
    return pesos, limiar_int


def _pontuar(
    cidadao: Cidadao, candidato: Cidadao, pesos: dict
) -> tuple[int, list[str]]:
    pontos = 0.0
    motivos: list[str] = []
    sim_nome = _similaridade(cidadao.nome_fonetico, candidato.nome_fonetico)
    if sim_nome:
        pontos += sim_nome * float(pesos["nome"])
        motivos.append("nome_semelhante")
    if cidadao.data_nascimento and cidadao.data_nascimento == candidato.data_nascimento:
        pontos += float(pesos["nascimento"])
        motivos.append("mesma_data_nascimento")
    sim_mae = _similaridade(cidadao.mae_nome_fonetico, candidato.mae_nome_fonetico)
    if sim_mae:
        pontos += sim_mae * float(pesos["mae"])
        motivos.append("nome_mae_semelhante")
    if cidadao.cpf_hash and cidadao.cpf_hash == candidato.cpf_hash:
        pontos += float(pesos["cpf"])
        motivos.append("mesmo_cpf")
    if cidadao.cns_hash and cidadao.cns_hash == candidato.cns_hash:
        pontos += float(pesos["cns"])
        motivos.append("mesmo_cns")
    return min(100, round(pontos)), motivos


async def detectar_duplicidades(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao: Cidadao,
    ator: Usuario,
    cliente: dict,
) -> list[CidadaoDuplicidade]:
    if cidadao.baixa_em is not None or cidadao.unificado_para_id is not None:
        return []
    pesos, limiar = await _pesos(db, tenant_id)
    condicoes = [
        Cidadao.tenant_id == tenant_id,
        Cidadao.id != cidadao.id,
        Cidadao.baixa_em.is_(None),
        Cidadao.unificado_para_id.is_(None),
    ]
    filtros = []
    if cidadao.data_nascimento:
        filtros.append(Cidadao.data_nascimento == cidadao.data_nascimento)
    if cidadao.nome_fonetico:
        filtros.append(Cidadao.nome_fonetico == cidadao.nome_fonetico)
    if cidadao.mae_nome_fonetico:
        filtros.append(Cidadao.mae_nome_fonetico == cidadao.mae_nome_fonetico)
    if not filtros:
        return []
    candidatos = (
        await db.execute(select(Cidadao).where(*condicoes, or_(*filtros)).limit(50))
    ).scalars().all()
    criadas: list[CidadaoDuplicidade] = []
    for candidato in candidatos:
        pontuacao, motivos = _pontuar(cidadao, candidato, pesos)
        if pontuacao < limiar:
            continue
        existente = await db.scalar(
            select(CidadaoDuplicidade).where(
                CidadaoDuplicidade.tenant_id == tenant_id,
                or_(
                    (
                        CidadaoDuplicidade.cidadao_id == cidadao.id
                    ) & (CidadaoDuplicidade.candidato_id == candidato.id),
                    (
                        CidadaoDuplicidade.cidadao_id == candidato.id
                    ) & (CidadaoDuplicidade.candidato_id == cidadao.id),
                ),
            )
        )
        if existente is not None:
            if existente.status == StatusDuplicidade.PENDENTE.value:
                existente.pontuacao = pontuacao
                existente.motivos = motivos
            continue
        registro = CidadaoDuplicidade(
            tenant_id=tenant_id,
            cidadao_id=cidadao.id,
            candidato_id=candidato.id,
            pontuacao=pontuacao,
            motivos=motivos,
            status=StatusDuplicidade.PENDENTE.value,
        )
        db.add(registro)
        criadas.append(registro)
    if criadas:
        await db.flush()
        await registrar(
            db,
            acao=AcaoAuditoria.CRIAR,
            usuario=ator,
            tenant_id=tenant_id,
            recurso="cidadao_duplicidade",
            recurso_id=cidadao.id,
            detalhe=f"{len(criadas)} par(es) de possível duplicidade.",
            cliente=cliente,
        )
    return criadas


async def listar_duplicidades(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    *,
    incluir_decididas: bool = False,
) -> list[dict[str, Any]]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    condicoes = [
        CidadaoDuplicidade.tenant_id == tenant_id,
        or_(
            CidadaoDuplicidade.cidadao_id == cidadao_id,
            CidadaoDuplicidade.candidato_id == cidadao_id,
        ),
    ]
    if not incluir_decididas:
        condicoes.append(CidadaoDuplicidade.status == StatusDuplicidade.PENDENTE.value)
    registros = (
        await db.execute(
            select(CidadaoDuplicidade)
            .where(*condicoes)
            .order_by(CidadaoDuplicidade.pontuacao.desc())
        )
    ).scalars().all()
    saida = []
    for registro in registros:
        outro_id = (
            registro.candidato_id
            if registro.cidadao_id == cidadao_id
            else registro.cidadao_id
        )
        candidato = await db.scalar(
            select(Cidadao).where(
                Cidadao.id == outro_id, Cidadao.tenant_id == tenant_id
            )
        )
        saida.append(
            {
                "id": registro.id,
                "tenant_id": registro.tenant_id,
                "cidadao_id": registro.cidadao_id,
                "candidato_id": registro.candidato_id,
                "pontuacao": registro.pontuacao,
                "motivos": registro.motivos,
                "status": registro.status,
                "decisao_por_id": registro.decisao_por_id,
                "decisao_em": registro.decisao_em,
                "justificativa": registro.justificativa,
                "candidato": serializar_resumo(candidato) if candidato else None,
            }
        )
    return saida


async def decidir_duplicidade(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    duplicidade_id: uuid.UUID,
    decisao: str,
    justificativa: str,
    ator: Usuario,
    cliente: dict,
) -> CidadaoDuplicidade:
    registro = await db.scalar(
        select(CidadaoDuplicidade).where(
            CidadaoDuplicidade.id == duplicidade_id,
            CidadaoDuplicidade.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Duplicidade não encontrada.")
    if registro.status != StatusDuplicidade.PENDENTE.value:
        raise Conflict("Esta duplicidade já foi decidida.", code="duplicidade_decidida")
    registro.status = (
        StatusDuplicidade.MESMO.value
        if decisao == "MESMO"
        else StatusDuplicidade.DIFERENTE.value
    )
    registro.decisao_por_id = ator.id
    registro.decisao_em = agora()
    registro.justificativa = justificativa
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_duplicidade",
        recurso_id=registro.id,
        justificativa=justificativa,
        detalhe=f"Decisão humana: {registro.status}.",
        cliente=cliente,
    )
    await db.commit()
    return registro


async def unificar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    origem_id: uuid.UUID,
    destino_id: uuid.UUID,
    campos: dict[str, str] | None,
    justificativa: str,
    ator: Usuario,
    cliente: dict,
) -> CidadaoUnificacao:
    if origem_id == destino_id:
        raise Conflict(
            "Origem e destino devem ser cidadãos diferentes.",
            code="unificacao_mesmo_id",
        )
    origem = await obter_cidadao(db, tenant_id, origem_id)
    destino = await obter_cidadao(db, tenant_id, destino_id)
    if origem.unificado_para_id is not None:
        raise Conflict("O cidadão de origem já está unificado.", code="ja_unificado")
    if destino.unificado_para_id is not None:
        raise Conflict("O cidadão de destino já está unificado.", code="destino_unificado")
    campos = campos or {}
    invalidos = set(campos) - CAMPOS_UNIFICAVEIS
    if invalidos:
        raise Unprocessable(
            "Campos inválidos para unificação.",
            errors=[
                {
                    "campo": campo,
                    "mensagem": "Campo não permitido na unificação.",
                    "codigo_regra": "campo_unificacao",
                }
                for campo in sorted(invalidos)
            ],
        )
    for campo, escolha in campos.items():
        if escolha not in {"ORIGEM", "DESTINO"}:
            raise Unprocessable(
                "Escolha inválida para o campo.",
                errors=[
                    {
                        "campo": f"campos.{campo}",
                        "mensagem": "Use ORIGEM ou DESTINO.",
                        "codigo_regra": "origem_destino",
                    }
                ],
            )
    dados_antes = {
        campo: (
            getattr(destino, campo).isoformat()
            if isinstance(getattr(destino, campo), date)
            else getattr(destino, campo)
        )
        for campo in campos
    }
    for campo, escolha in campos.items():
        if escolha == "ORIGEM":
            setattr(destino, campo, getattr(origem, campo))
    from app.services.cidadao_comum import atualizar_busca

    atualizar_busca(destino)
    destino.versao += 1
    origem.unificado_para_id = destino.id
    origem.unificado_em = agora()
    origem.versao += 1
    registro = CidadaoUnificacao(
        tenant_id=tenant_id,
        origem_id=origem.id,
        destino_id=destino.id,
        campos_escolhidos=campos,
        dados_antes_destino=dados_antes,
        status=StatusUnificacao.ATIVA.value,
        justificativa=justificativa,
        autor_id=ator.id,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_unificacao",
        recurso_id=registro.id,
        justificativa=justificativa,
        dados_antes=serializar_cidadao(origem),
        dados_depois=serializar_cidadao(destino),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def reverter_unificacao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    unificacao_id: uuid.UUID,
    justificativa: str,
    ator: Usuario,
    cliente: dict,
) -> CidadaoUnificacao:
    registro = await db.scalar(
        select(CidadaoUnificacao).where(
            CidadaoUnificacao.id == unificacao_id,
            CidadaoUnificacao.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Unificação não encontrada.")
    if registro.status != StatusUnificacao.ATIVA.value:
        raise Conflict("Unificação já revertida.", code="unificacao_revertida")
    origem = await obter_cidadao(db, tenant_id, registro.origem_id, incluir_baixado=True)
    destino = await obter_cidadao(db, tenant_id, registro.destino_id, incluir_baixado=True)
    for campo, valor in (registro.dados_antes_destino or {}).items():
        if campo not in CAMPOS_UNIFICAVEIS:
            continue
        if campo == "data_nascimento" and isinstance(valor, str):
            valor = date.fromisoformat(valor)
        setattr(destino, campo, valor)
    from app.services.cidadao_comum import atualizar_busca

    atualizar_busca(destino)
    destino.versao += 1
    origem.unificado_para_id = None
    origem.unificado_em = None
    origem.versao += 1
    registro.status = StatusUnificacao.REVERTIDA.value
    registro.revertida_em = agora()
    registro.revertida_por_id = ator.id
    registro.justificativa_reversao = justificativa
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_unificacao",
        recurso_id=registro.id,
        justificativa=justificativa,
        detalhe="Unificação revertida.",
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_unificacoes(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoUnificacao]:
    await obter_cidadao(db, tenant_id, cidadao_id, incluir_baixado=True)
    return list(
        (
            await db.execute(
                select(CidadaoUnificacao)
                .where(
                    CidadaoUnificacao.tenant_id == tenant_id,
                    or_(
                        CidadaoUnificacao.origem_id == cidadao_id,
                        CidadaoUnificacao.destino_id == cidadao_id,
                    ),
                )
                .order_by(CidadaoUnificacao.created_at.desc())
            )
        )
        .scalars()
        .all()
    )


__all__ = [
    "decidir_duplicidade",
    "detectar_duplicidades",
    "listar_duplicidades",
    "listar_unificacoes",
    "reverter_unificacao",
    "unificar",
]
