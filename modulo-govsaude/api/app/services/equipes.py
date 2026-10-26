"""Equipes de atenção básica e vigência (B.12-006, B.1-011)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import validar_ine
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.enums import AcaoAuditoria, TipoEquipe
from app.models.nucleo import Equipe, Usuario
from app.schemas.rede import BaixaRequest, EquipeCreate, EquipeUpdate
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
    obter_equipe,
    obter_estabelecimento,
    validar_vigencia,
)

_TIPOS = {item.value for item in TipoEquipe}


def _validar_tipo(tipo: str) -> str:
    valor = (tipo or "").strip().upper()
    if valor not in _TIPOS:
        raise Unprocessable(
            "Tipo de equipe inválido.",
            errors=[
                {
                    "campo": "tipo",
                    "mensagem": f"Use um de {sorted(_TIPOS)}.",
                    "codigo_regra": "tipo_equipe",
                }
            ],
        )
    return valor


def _validar_ine_opcional(ine: str | None) -> str | None:
    if not ine:
        return None
    if not validar_ine(ine):
        raise Unprocessable(
            "INE inválido.",
            errors=[
                {
                    "campo": "ine",
                    "mensagem": "O INE deve ter 10 dígitos.",
                    "codigo_regra": "ine",
                }
            ],
        )
    return "".join(ch for ch in ine if ch.isdigit())


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: EquipeCreate,
    ator: Usuario,
    cliente: dict,
) -> Equipe:
    estabelecimento = await obter_estabelecimento(
        db, tenant_id, dados.estabelecimento_id
    )
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.EQUIPE_GERENCIAR, estabelecimento.id
    )
    ine = _validar_ine_opcional(dados.ine)
    if ine:
        existente = await db.scalar(
            select(Equipe).where(Equipe.tenant_id == tenant_id, Equipe.ine == ine)
        )
        if existente:
            raise Conflict("Já existe uma equipe com este INE.", code="ine_duplicado")
    validar_vigencia(dados.vigencia_inicio, dados.vigencia_fim)
    registro = Equipe(
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento.id,
        ine=ine,
        nome=dados.nome.strip(),
        tipo=_validar_tipo(dados.tipo),
        vigencia_inicio=dados.vigencia_inicio or date.today(),
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
        estabelecimento_id=estabelecimento.id,
        recurso="equipe",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    limite: int = 50,
    cursor: str | None = None,
    busca: str | None = None,
    ativo: bool | None = None,
) -> tuple[list[Equipe], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Equipe.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.EQUIPE_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(Equipe.estabelecimento_id.in_(permitidos))
    if estabelecimento_id:
        await exigir_acesso_estabelecimento(db, usuario, Permissao.EQUIPE_LER, estabelecimento_id)
        condicoes.append(Equipe.estabelecimento_id == estabelecimento_id)
    if busca:
        termo = f"%{busca.strip().lower()}%"
        condicoes.append(
            or_(func.lower(Equipe.nome).like(termo), Equipe.ine.like(f"%{busca.strip()}%"))
        )
    if ativo is not None:
        condicoes.append(Equipe.ativo.is_(ativo))
    total = await db.scalar(select(func.count()).select_from(Equipe).where(*condicoes)) or 0
    consulta = (
        select(Equipe)
        .where(*condicoes)
        .order_by(Equipe.created_at, Equipe.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Equipe, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter_com_escopo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    equipe_id: uuid.UUID,
    permissao: Permissao = Permissao.EQUIPE_LER,
) -> Equipe:
    registro = await obter_equipe(db, tenant_id, equipe_id)
    await exigir_acesso_estabelecimento(db, usuario, permissao, registro.estabelecimento_id)
    return registro


async def atualizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    equipe_id: uuid.UUID,
    dados: EquipeUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Equipe:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, equipe_id, Permissao.EQUIPE_GERENCIAR
    )
    conferir_versao(registro.versao, versao)
    if dados.ine is not None:
        ine = _validar_ine_opcional(dados.ine)
        if ine and ine != registro.ine:
            existente = await db.scalar(
                select(Equipe).where(
                    Equipe.tenant_id == tenant_id,
                    Equipe.ine == ine,
                    Equipe.id != registro.id,
                )
            )
            if existente:
                raise Conflict("Já existe uma equipe com este INE.", code="ine_duplicado")
        registro.ine = ine
    inicio = dados.vigencia_inicio or registro.vigencia_inicio
    fim = dados.vigencia_fim if dados.vigencia_fim is not None else registro.vigencia_fim
    validar_vigencia(inicio, fim)
    antes = instantaneo(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.tipo is not None:
        registro.tipo = _validar_tipo(dados.tipo)
    registro.vigencia_inicio = inicio
    registro.vigencia_fim = fim
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="equipe",
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
    usuario: Usuario,
    equipe_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> Equipe:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, equipe_id, Permissao.EQUIPE_GERENCIAR
    )
    if registro.baixa_em is not None:
        return registro
    antes = instantaneo(registro)
    registro.baixa_em = dados.data or agora()
    registro.baixa_motivo = dados.motivo
    registro.baixa_por_id = ator.id
    registro.ativo = False
    data_baixa = dados.data.date() if dados.data else date.today()
    if registro.vigencia_fim is None:
        registro.vigencia_fim = max(data_baixa, registro.vigencia_inicio)
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="equipe",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def obter_sem_escopo(
    db: AsyncSession, tenant_id: uuid.UUID, equipe_id: uuid.UUID
) -> Equipe:
    registro = await db.scalar(
        select(Equipe).where(Equipe.id == equipe_id, Equipe.tenant_id == tenant_id)
    )
    if registro is None:
        raise NotFound("Equipe não encontrada.")
    return registro
