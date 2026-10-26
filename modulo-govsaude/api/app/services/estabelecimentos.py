"""Estabelecimentos, setores e consulta da rede (B.12-006, B.12-007)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import validar_cep
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Equipe, Estabelecimento, Setor, Usuario
from app.schemas.rede import (
    BaixaRequest,
    EstabelecimentoCreate,
    EstabelecimentoOut,
    EstabelecimentoUpdate,
    SetorCreate,
    SetorUpdate,
)
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
    obter_estabelecimento,
    obter_organizacao,
    serializar_estabelecimento,
    validar_cnes_cadastro,
    validar_cnes_contra_referencia,
    validar_cnpj_opcional,
    validar_ibge_opcional,
)


def _validar_email(email: str | None) -> str | None:
    if not email:
        return None
    valor = email.strip().lower()
    if "@" not in valor or len(valor) > 200:
        raise Unprocessable(
            "E-mail inválido.",
            errors=[
                {
                    "campo": "email",
                    "mensagem": "Informe um e-mail válido.",
                    "codigo_regra": "email",
                }
            ],
        )
    return valor


def _validar_cep(cep: str | None) -> str | None:
    if not cep:
        return None
    if not validar_cep(cep):
        raise Unprocessable(
            "CEP inválido.",
            errors=[
                {
                    "campo": "cep",
                    "mensagem": "Informe 8 dígitos.",
                    "codigo_regra": "cep",
                }
            ],
        )
    return "".join(ch for ch in cep if ch.isdigit())


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    limite: int = 50,
    cursor: str | None = None,
    busca: str | None = None,
    ativo: bool | None = None,
    municipio_ibge: str | None = None,
) -> tuple[list[Estabelecimento], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Estabelecimento.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.ESTABELECIMENTO_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(Estabelecimento.id.in_(permitidos))
    if busca:
        termo = f"%{busca.strip().lower()}%"
        condicoes.append(
            or_(
                func.lower(Estabelecimento.nome).like(termo),
                Estabelecimento.cnes.like(f"%{busca.strip()}%"),
            )
        )
    if ativo is not None:
        condicoes.append(Estabelecimento.ativo.is_(ativo))
    if municipio_ibge:
        condicoes.append(Estabelecimento.municipio_ibge == municipio_ibge)
    total = (
        await db.scalar(select(func.count()).select_from(Estabelecimento).where(*condicoes))
        or 0
    )
    consulta = (
        select(Estabelecimento)
        .where(*condicoes)
        .order_by(Estabelecimento.created_at, Estabelecimento.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Estabelecimento, cursor)
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
    estabelecimento_id: uuid.UUID,
    permissao: Permissao = Permissao.ESTABELECIMENTO_LER,
) -> Estabelecimento:
    registro = await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db, usuario, permissao, registro.id)
    return registro


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: EstabelecimentoCreate,
    ator: Usuario,
    cliente: dict,
) -> Estabelecimento:
    cnes = validar_cnes_cadastro(dados.cnes)
    await validar_cnes_contra_referencia(db, cnes)
    existente = await db.scalar(
        select(Estabelecimento).where(
            Estabelecimento.tenant_id == tenant_id, Estabelecimento.cnes == cnes
        )
    )
    if existente:
        raise Conflict(
            "Já existe um estabelecimento com este CNES neste tenant.",
            code="cnes_duplicado",
        )
    registro = Estabelecimento(
        tenant_id=tenant_id,
        cnes=cnes,
        nome=dados.nome.strip(),
        tipo=dados.tipo.strip(),
        cnpj_normalizado=validar_cnpj_opcional(dados.cnpj),
        logradouro=dados.logradouro,
        numero=dados.numero,
        bairro=dados.bairro,
        municipio_ibge=validar_ibge_opcional(dados.municipio_ibge),
        cep=_validar_cep(dados.cep),
        telefone=dados.telefone,
        email=_validar_email(dados.email),
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
        estabelecimento_id=registro.id,
        recurso="estabelecimento",
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
    estabelecimento_id: uuid.UUID,
    dados: EstabelecimentoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Estabelecimento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, estabelecimento_id, Permissao.ESTABELECIMENTO_GERENCIAR
    )
    conferir_versao(registro.versao, versao)
    if registro.baixa_em is not None:
        raise Conflict("Estabelecimento baixado não pode ser alterado.", code="baixado")
    antes = instantaneo(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.tipo is not None:
        registro.tipo = dados.tipo.strip()
    if dados.cnpj is not None:
        registro.cnpj_normalizado = validar_cnpj_opcional(dados.cnpj)
    if dados.municipio_ibge is not None:
        registro.municipio_ibge = validar_ibge_opcional(dados.municipio_ibge)
    if dados.cep is not None:
        registro.cep = _validar_cep(dados.cep)
    if dados.email is not None:
        registro.email = _validar_email(dados.email)
    for campo in ("logradouro", "numero", "bairro", "telefone"):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.id,
        recurso="estabelecimento",
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
    estabelecimento_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> Estabelecimento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, estabelecimento_id, Permissao.ESTABELECIMENTO_GERENCIAR
    )
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
        estabelecimento_id=registro.id,
        recurso="estabelecimento",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_setores(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[Setor], str | None, int]:
    await obter_com_escopo(db, tenant_id, usuario, estabelecimento_id)
    limite = min(max(limite, 1), 100)
    condicoes = [
        Setor.tenant_id == tenant_id,
        Setor.estabelecimento_id == estabelecimento_id,
    ]
    total = await db.scalar(select(func.count()).select_from(Setor).where(*condicoes)) or 0
    consulta = (
        select(Setor)
        .where(*condicoes)
        .order_by(Setor.created_at, Setor.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Setor, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar_setor(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    dados: SetorCreate,
    ator: Usuario,
    cliente: dict,
) -> Setor:
    await obter_com_escopo(
        db, tenant_id, usuario, estabelecimento_id, Permissao.ESTABELECIMENTO_GERENCIAR
    )
    existente = await db.scalar(
        select(Setor).where(
            Setor.tenant_id == tenant_id,
            Setor.estabelecimento_id == estabelecimento_id,
            func.lower(Setor.nome) == dados.nome.strip().lower(),
        )
    )
    if existente:
        raise Conflict("Já existe um setor com este nome na unidade.", code="setor_duplicado")
    registro = Setor(
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento_id,
        nome=dados.nome.strip(),
        tipo=dados.tipo.strip(),
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
        estabelecimento_id=estabelecimento_id,
        recurso="setor",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def atualizar_setor(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    setor_id: uuid.UUID,
    dados: SetorUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Setor:
    await obter_com_escopo(
        db, tenant_id, usuario, estabelecimento_id, Permissao.ESTABELECIMENTO_GERENCIAR
    )
    registro = await db.scalar(
        select(Setor).where(
            Setor.id == setor_id,
            Setor.tenant_id == tenant_id,
            Setor.estabelecimento_id == estabelecimento_id,
        )
    )
    if registro is None:
        raise NotFound("Setor não encontrado.")
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.tipo is not None:
        registro.tipo = dados.tipo.strip()
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento_id,
        recurso="setor",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_equipes_da_unidade(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[Equipe], str | None, int]:
    await obter_com_escopo(db, tenant_id, usuario, estabelecimento_id)
    limite = min(max(limite, 1), 100)
    condicoes = [
        Equipe.tenant_id == tenant_id,
        Equipe.estabelecimento_id == estabelecimento_id,
    ]
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


def para_saida(registro: Estabelecimento, fuso_horario: str) -> EstabelecimentoOut:
    return EstabelecimentoOut(**serializar_estabelecimento(registro, fuso_horario))


async def fuso_do_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    organizacao = await obter_organizacao(db, tenant_id)
    return organizacao.fuso_horario
