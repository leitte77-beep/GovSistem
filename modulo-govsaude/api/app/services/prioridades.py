"""Prioridades legal e clínica configuráveis por tenant (B.12-016).

O código não conhece prioridades fixas: a ordenação, o rótulo e a marcação
legal vêm da tabela ``prioridades``.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.security import agora
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.models.rede import Prioridade
from app.schemas.rede import BaixaRequest, PrioridadeCreate, PrioridadeUpdate
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import conferir_versao, validar_vigencia


def _validar_legal(prioridade_legal: bool, base_legal: str | None) -> None:
    if prioridade_legal and len((base_legal or "").strip()) < 3:
        raise Unprocessable(
            "Prioridade legal exige a indicação da base legal.",
            errors=[
                {
                    "campo": "base_legal",
                    "mensagem": "Informe a norma/portaria que fundamenta a prioridade.",
                    "codigo_regra": "base_legal",
                }
            ],
        )


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
    ativo: bool | None = None,
    prioridade_legal: bool | None = None,
    vigentes_em: date | None = None,
) -> tuple[list[Prioridade], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Prioridade.tenant_id == tenant_id]
    if ativo is not None:
        condicoes.append(Prioridade.ativo.is_(ativo))
    if prioridade_legal is not None:
        condicoes.append(Prioridade.prioridade_legal.is_(prioridade_legal))
    if vigentes_em:
        condicoes.append(Prioridade.vigencia_inicio <= vigentes_em)
        condicoes.append(
            (Prioridade.vigencia_fim.is_(None)) | (Prioridade.vigencia_fim >= vigentes_em)
        )
    total = (
        await db.scalar(select(func.count()).select_from(Prioridade).where(*condicoes))
        or 0
    )
    consulta = (
        select(Prioridade)
        .where(*condicoes)
        .order_by(Prioridade.created_at, Prioridade.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Prioridade, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter(
    db: AsyncSession, tenant_id: uuid.UUID, prioridade_id: uuid.UUID
) -> Prioridade:
    registro = await db.scalar(
        select(Prioridade).where(
            Prioridade.id == prioridade_id, Prioridade.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Prioridade não encontrada.")
    return registro


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: PrioridadeCreate,
    ator: Usuario,
    cliente: dict,
) -> Prioridade:
    inicio = dados.vigencia_inicio or date.today()
    validar_vigencia(inicio, dados.vigencia_fim)
    _validar_legal(dados.prioridade_legal, dados.base_legal)
    existente = await db.scalar(
        select(Prioridade.id).where(
            Prioridade.tenant_id == tenant_id,
            Prioridade.codigo == dados.codigo.strip(),
            Prioridade.vigencia_inicio == inicio,
        )
    )
    if existente:
        raise Conflict(
            "Já existe prioridade com este código nesta data de vigência.",
            code="prioridade_duplicada",
        )
    registro = Prioridade(
        tenant_id=tenant_id,
        codigo=dados.codigo.strip().upper(),
        rotulo=dados.rotulo.strip(),
        ordem=dados.ordem,
        prioridade_legal=dados.prioridade_legal,
        base_legal=dados.base_legal,
        observacoes=dados.observacoes,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        ativo=True,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="prioridade",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def atualizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    prioridade_id: uuid.UUID,
    dados: PrioridadeUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Prioridade:
    registro = await obter(db, tenant_id, prioridade_id)
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    if dados.rotulo is not None:
        registro.rotulo = dados.rotulo.strip()
    if dados.ordem is not None:
        registro.ordem = dados.ordem
    if dados.prioridade_legal is not None:
        registro.prioridade_legal = dados.prioridade_legal
    if dados.base_legal is not None:
        registro.base_legal = dados.base_legal
    if dados.observacoes is not None:
        registro.observacoes = dados.observacoes
    if dados.vigencia_fim is not None:
        registro.vigencia_fim = dados.vigencia_fim
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    _validar_legal(registro.prioridade_legal, registro.base_legal)
    validar_vigencia(registro.vigencia_inicio, registro.vigencia_fim)
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="prioridade",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    prioridade_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> Prioridade:
    registro = await obter(db, tenant_id, prioridade_id)
    if registro.baixa_em is not None:
        return registro
    antes = instantaneo(registro)
    registro.baixa_em = dados.data or agora()
    registro.baixa_motivo = dados.motivo
    registro.baixa_por_id = ator.id
    registro.ativo = False
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="prioridade",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def vigentes(
    db: AsyncSession, tenant_id: uuid.UUID, em: date | None = None
) -> list[Prioridade]:
    referencia = em or date.today()
    return list(
        (
            await db.execute(
                select(Prioridade)
                .where(
                    Prioridade.tenant_id == tenant_id,
                    Prioridade.ativo.is_(True),
                    Prioridade.baixa_em.is_(None),
                    Prioridade.vigencia_inicio <= referencia,
                    (Prioridade.vigencia_fim.is_(None))
                    | (Prioridade.vigencia_fim >= referencia),
                )
                .order_by(Prioridade.ordem, Prioridade.codigo)
            )
        )
        .scalars()
        .all()
    )
