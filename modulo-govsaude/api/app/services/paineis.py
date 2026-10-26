"""Painéis eletrônicos de chamada (B.6-045, B.6-046, B.6-047)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.agenda import ChamadaPainel, FilaAtendimento, PainelChamada
from app.models.enums import AcaoAuditoria, SituacaoFila
from app.models.nucleo import Usuario
from app.schemas.agenda import (
    PainelChamadaCreate,
    PainelChamadaUpdate,
    PainelEstadoOut,
)
from app.services.agenda_comum import (
    REGRA_ORDENACAO,
    obter_painel,
    obter_setor_da_unidade,
)
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
)

STATUS_AGUARDANDO = [
    SituacaoFila.AGUARDANDO.value,
    SituacaoFila.CHAMADO.value,
    SituacaoFila.AGUARDANDO_ATENDIMENTO.value,
]


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    setor_id: uuid.UUID | None = None,
    ativo: bool | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[PainelChamada], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [PainelChamada.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.FILA_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(PainelChamada.estabelecimento_id.in_(permitidos))
    if estabelecimento_id:
        await exigir_acesso_estabelecimento(
            db, usuario, Permissao.FILA_LER, estabelecimento_id
        )
        condicoes.append(PainelChamada.estabelecimento_id == estabelecimento_id)
    if setor_id:
        condicoes.append(PainelChamada.setor_id == setor_id)
    if ativo is not None:
        condicoes.append(PainelChamada.ativo.is_(ativo))
    total = await db.scalar(
        select(func.count()).select_from(PainelChamada).where(*condicoes)
    ) or 0
    consulta = (
        select(PainelChamada)
        .where(*condicoes)
        .order_by(PainelChamada.created_at, PainelChamada.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, PainelChamada, cursor)
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
    usuario: Usuario,
    dados: PainelChamadaCreate,
    ator: Usuario,
    cliente: dict,
) -> PainelChamada:
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_GERENCIAR, dados.estabelecimento_id
    )
    await obter_setor_da_unidade(
        db, tenant_id, dados.estabelecimento_id, dados.setor_id
    )
    existente = await db.scalar(
        select(PainelChamada).where(
            PainelChamada.tenant_id == tenant_id,
            PainelChamada.estabelecimento_id == dados.estabelecimento_id,
            PainelChamada.setor_id == dados.setor_id,
            PainelChamada.nome == dados.nome,
        )
    )
    if existente is not None:
        raise Conflict("Já existe um painel com este nome no setor.", code="painel_duplicado")
    registro = PainelChamada(
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        setor_id=dados.setor_id,
        nome=dados.nome.strip(),
        nome_abreviado=dados.nome_abreviado,
        voz_habilitada=dados.voz_habilitada,
        mensagem_rodape=dados.mensagem_rodape,
        noticias=dados.noticias,
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
        estabelecimento_id=registro.estabelecimento_id,
        recurso="painel_chamada",
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
    usuario: Usuario,
    painel_id: uuid.UUID,
    dados: PainelChamadaUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> PainelChamada:
    registro = await obter_painel(db, tenant_id, painel_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_GERENCIAR, registro.estabelecimento_id
    )
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    for campo in (
        "nome",
        "nome_abreviado",
        "voz_habilitada",
        "mensagem_rodape",
        "noticias",
        "ativo",
    ):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.ativo is False:
        registro.baixa_em = agora()
    elif dados.ativo is True:
        registro.baixa_em = None
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="painel_chamada",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def estado(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    painel_id: uuid.UUID,
) -> PainelEstadoOut:
    painel = await obter_painel(db, tenant_id, painel_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_LER, painel.estabelecimento_id
    )
    chamadas = list(
        (
            await db.execute(
                select(ChamadaPainel)
                .where(
                    ChamadaPainel.tenant_id == tenant_id,
                    ChamadaPainel.painel_id == painel.id,
                )
                .order_by(ChamadaPainel.chamado_em.desc())
                .limit(10)
            )
        )
        .scalars()
        .all()
    )
    aguardando = await db.scalar(
        select(func.count())
        .select_from(FilaAtendimento)
        .where(
            FilaAtendimento.tenant_id == tenant_id,
            FilaAtendimento.estabelecimento_id == painel.estabelecimento_id,
            FilaAtendimento.setor_id == painel.setor_id,
            FilaAtendimento.situacao.in_(STATUS_AGUARDANDO),
        )
    ) or 0
    from app.schemas.agenda import ChamadaOut, PainelChamadaOut

    return PainelEstadoOut(
        painel=PainelChamadaOut.model_validate(painel),
        ultimas_chamadas=[ChamadaOut.model_validate(item) for item in chamadas],
        aguardando=int(aguardando),
        regra_ordenacao=REGRA_ORDENACAO,
    )


async def obter(
    db: AsyncSession, tenant_id: uuid.UUID, usuario: Usuario, painel_id: uuid.UUID
) -> PainelChamada:
    registro = await obter_painel(db, tenant_id, painel_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.FILA_LER, registro.estabelecimento_id
    )
    return registro

