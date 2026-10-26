"""Consórcio intermunicipal e entes consorciados (Fase 1)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import somente_digitos, validar_codigo_ibge
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.security import agora
from app.models.enums import AcaoAuditoria, SituacaoEnteConsorciado
from app.models.nucleo import EnteConsorciado, Usuario
from app.schemas.rede import (
    BaixaRequest,
    EnteConsorciadoCreate,
    EnteConsorciadoUpdate,
)
from app.services.auditoria import registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    obter_ente,
    serializar_ente,
    validar_cnpj_opcional,
    validar_vigencia,
)

_SITUACOES = {item.value for item in SituacaoEnteConsorciado}


def _validar_municipio(codigo: str) -> str:
    numero = somente_digitos(codigo)
    if not validar_codigo_ibge(numero):
        raise Unprocessable(
            "Código IBGE de município inválido.",
            errors=[
                {
                    "campo": "municipio_ibge",
                    "mensagem": "Informe 7 dígitos com UF válida.",
                    "codigo_regra": "ibge",
                }
            ],
        )
    return numero


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
    situacao: str | None = None,
    municipio_ibge: str | None = None,
    vigentes_em: date | None = None,
) -> tuple[list[EnteConsorciado], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [EnteConsorciado.tenant_id == tenant_id]
    if situacao:
        condicoes.append(EnteConsorciado.situacao == situacao.upper())
    if municipio_ibge:
        condicoes.append(EnteConsorciado.municipio_ibge == somente_digitos(municipio_ibge))
    if vigentes_em:
        condicoes.append(EnteConsorciado.vigencia_inicio <= vigentes_em)
        condicoes.append(
            (EnteConsorciado.vigencia_fim.is_(None))
            | (EnteConsorciado.vigencia_fim >= vigentes_em)
        )
    total = (
        await db.scalar(select(func.count()).select_from(EnteConsorciado).where(*condicoes))
        or 0
    )
    consulta = (
        select(EnteConsorciado)
        .where(*condicoes)
        .order_by(EnteConsorciado.created_at, EnteConsorciado.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, EnteConsorciado, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: EnteConsorciadoCreate,
    ator: Usuario,
    cliente: dict,
) -> EnteConsorciado:
    inicio = dados.vigencia_inicio or date.today()
    validar_vigencia(inicio, dados.vigencia_fim)
    municipio = _validar_municipio(dados.municipio_ibge)
    existente = await db.scalar(
        select(EnteConsorciado.id).where(
            EnteConsorciado.tenant_id == tenant_id,
            EnteConsorciado.municipio_ibge == municipio,
            EnteConsorciado.vigencia_inicio == inicio,
        )
    )
    if existente:
        raise Conflict(
            "Já existe ente consorciado para este município nesta vigência.",
            code="ente_duplicado",
        )
    registro = EnteConsorciado(
        tenant_id=tenant_id,
        municipio_ibge=municipio,
        nome=dados.nome.strip(),
        cnpj_normalizado=validar_cnpj_opcional(dados.cnpj),
        situacao=dados.situacao,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        observacoes=dados.observacoes,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="ente_consorciado",
        recurso_id=registro.id,
        dados_depois=serializar_ente(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def atualizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    ente_id: uuid.UUID,
    dados: EnteConsorciadoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> EnteConsorciado:
    registro = await obter_ente(db, tenant_id, ente_id)
    conferir_versao(registro.versao, versao)
    antes = serializar_ente(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.cnpj is not None:
        registro.cnpj_normalizado = validar_cnpj_opcional(dados.cnpj)
    if dados.situacao is not None:
        if dados.situacao not in _SITUACOES:
            raise Unprocessable("Situação do ente inválida.", code="situacao_ente")
        registro.situacao = dados.situacao
    if dados.vigencia_inicio is not None:
        registro.vigencia_inicio = dados.vigencia_inicio
    if dados.vigencia_fim is not None:
        registro.vigencia_fim = dados.vigencia_fim
    if dados.observacoes is not None:
        registro.observacoes = dados.observacoes
    validar_vigencia(registro.vigencia_inicio, registro.vigencia_fim)
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="ente_consorciado",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=serializar_ente(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def encerrar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    ente_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> EnteConsorciado:
    registro = await obter_ente(db, tenant_id, ente_id)
    if registro.situacao == SituacaoEnteConsorciado.INATIVO.value:
        return registro
    antes = serializar_ente(registro)
    registro.situacao = SituacaoEnteConsorciado.INATIVO.value
    registro.vigencia_fim = dados.data.date() if dados.data else agora().date()
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="ente_consorciado",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=serializar_ente(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def obter(db: AsyncSession, tenant_id: uuid.UUID, ente_id: uuid.UUID) -> EnteConsorciado:
    return await obter_ente(db, tenant_id, ente_id)


async def garantir_ente(db: AsyncSession, tenant_id: uuid.UUID, ente_id: uuid.UUID):
    registro = await db.scalar(
        select(EnteConsorciado).where(
            EnteConsorciado.id == ente_id, EnteConsorciado.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Ente consorciado não encontrado.")
    return registro
