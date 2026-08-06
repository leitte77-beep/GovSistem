"""Cadastro unificado de pessoas e imóveis (itens 8 e 9)."""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Paginacao,
    buscar_da_organizacao,
    cliente,
    conferir_versao,
    documento_visivel,
    nova_versao,
    pagina_payload,
)
from app.core.auth import exigir
from app.core.br_validators import chave_busca, sem_acento
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, Conflict
from app.core.geo import geocodificar
from app.core.permissoes import P
from app.models.bloqueios import Bloqueio
from app.models.enums import AcaoAuditoria, SituacaoBloqueio
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa, PessoaImovel
from app.schemas import pessoas as esquemas
from app.services import auditoria, protocolo

router = APIRouter(tags=["Pessoas e imóveis"])


# ─────────────────────────────────────────────────────────────────────────────
# Pessoas
# ─────────────────────────────────────────────────────────────────────────────


def _chave_endereco(logradouro: str | None, numero: str | None, bairro: str | None) -> str:
    """Endereço normalizado — base das regras "um por endereço"."""
    return chave_busca(logradouro, numero, bairro)


def _resumo_pessoa(pessoa: Pessoa, user: User) -> dict:
    documento, mascarado = documento_visivel(user, pessoa.documento)
    return {
        "id": pessoa.id,
        "nome": pessoa.nome,
        "documento": documento,
        "documento_mascarado": mascarado,
        "telefone": pessoa.telefone,
        "bairro": pessoa.bairro,
        "municipio": pessoa.municipio,
        "situacao": pessoa.situacao,
        "tipos": pessoa.tipos or [],
        "pessoa_juridica": pessoa.pessoa_juridica,
    }


async def _contar_bloqueios(
    db: AsyncSession, *, pessoa_id: uuid.UUID | None = None, imovel_id: uuid.UUID | None = None
) -> int:
    condicao = (
        Bloqueio.pessoa_id == pessoa_id if pessoa_id else Bloqueio.imovel_id == imovel_id
    )
    return (
        await db.scalar(
            select(func.count())
            .select_from(Bloqueio)
            .where(condicao, Bloqueio.situacao == SituacaoBloqueio.ATIVO.value)
        )
        or 0
    )


async def _detectar_duplicidades(
    db: AsyncSession, organizacao_id: uuid.UUID, dados: esquemas.PessoaEntrada, ignorar_id=None
) -> list[dict]:
    """Alerta de duplicidade por CPF, telefone e endereço semelhante (item 8.2)."""
    alertas: list[dict] = []
    condicoes_base = [Pessoa.organizacao_id == organizacao_id, Pessoa.deleted_at.is_(None)]
    if ignorar_id:
        condicoes_base.append(Pessoa.id != ignorar_id)

    if dados.documento:
        existente = await db.scalar(
            select(Pessoa).where(*condicoes_base, Pessoa.documento == dados.documento)
        )
        if existente is not None:
            alertas.append(
                {
                    "tipo": "documento",
                    "mensagem": f"Já existe cadastro com este CPF/CNPJ: {existente.nome}.",
                    "pessoa_id": str(existente.id),
                    "nome": existente.nome,
                }
            )

    if dados.telefone:
        outro = await db.scalar(
            select(Pessoa).where(
                *condicoes_base,
                or_(Pessoa.telefone == dados.telefone, Pessoa.whatsapp == dados.telefone),
            )
        )
        if outro is not None:
            alertas.append(
                {
                    "tipo": "telefone",
                    "mensagem": f"O telefone informado já consta no cadastro de {outro.nome}.",
                    "pessoa_id": outro.id,
                    "nome": outro.nome,
                }
            )

    if dados.logradouro and dados.numero:
        semelhante = await db.scalar(
            select(Pessoa).where(
                *condicoes_base,
                Pessoa.busca.ilike(f"%{sem_acento(dados.logradouro)}%"),
                Pessoa.numero == dados.numero,
            )
        )
        if semelhante is not None:
            alertas.append(
                {
                    "tipo": "endereco",
                    "mensagem": (
                        f"Existe cadastro com endereço semelhante: {semelhante.nome} "
                        f"({semelhante.logradouro}, {semelhante.numero})."
                    ),
                    "pessoa_id": semelhante.id,
                    "nome": semelhante.nome,
                }
            )

    return alertas


@router.get("/pessoas", summary="Listar pessoas")
async def listar_pessoas(
    termo: str | None = Query(None, description="Nome, CPF, telefone ou endereço"),
    tipo: str | None = Query(None, description="Classificação (cidadao, produtor_rural, ...)"),
    situacao: str | None = None,
    bairro: str | None = None,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PESSOAS_VISUALIZAR)),
):
    condicoes = [Pessoa.organizacao_id == user.organizacao_id, Pessoa.deleted_at.is_(None)]
    if termo:
        from app.core.br_validators import apenas_digitos

        normalizado = sem_acento(termo)
        digitos = apenas_digitos(termo)
        alternativas = [Pessoa.busca.ilike(f"%{normalizado}%")]
        if digitos:
            alternativas.append(Pessoa.documento.like(f"%{digitos}%"))
            alternativas.append(Pessoa.telefone.like(f"%{digitos}%"))
        condicoes.append(or_(*alternativas))
    if situacao:
        condicoes.append(Pessoa.situacao == situacao)
    if bairro:
        condicoes.append(Pessoa.bairro.ilike(f"%{bairro}%"))

    consulta = select(Pessoa).where(*condicoes)
    if tipo:
        # `tipos` é JSON; o filtro textual funciona igual no PostgreSQL e no SQLite.
        consulta = consulta.where(func.cast(Pessoa.tipos, __import__("sqlalchemy").String).like(f'%"{tipo}"%'))

    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(consulta.order_by(Pessoa.nome).offset(paginacao.offset).limit(paginacao.por_pagina))
    ).scalars().all()

    return pagina_payload([_resumo_pessoa(p, user) for p in registros], total, paginacao)


@router.post("/pessoas", status_code=status.HTTP_201_CREATED, summary="Cadastrar pessoa")
async def criar_pessoa(
    dados: esquemas.PessoaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PESSOAS_CRIAR)),
):
    duplicidades = await _detectar_duplicidades(db, user.organizacao_id, dados)

    # Duplicidade de documento é impeditiva; as demais são alertas que o
    # atendente confirma conscientemente.
    if any(d["tipo"] == "documento" for d in duplicidades):
        raise Conflict(
            next(d["mensagem"] for d in duplicidades if d["tipo"] == "documento"),
            "documento_duplicado",
            {"duplicidades": duplicidades},
        )
    if duplicidades and not dados.confirmar_duplicidade:
        raise AppError(
            "Foram encontrados cadastros parecidos. Confira antes de criar um novo registro.",
            409,
            "possivel_duplicidade",
            {"duplicidades": duplicidades},
        )

    pessoa = Pessoa(
        organizacao_id=user.organizacao_id,
        created_by_id=user.id,
        updated_by_id=user.id,
        municipio=dados.municipio or settings.MUNICIPIO_NOME,
        uf=dados.uf or settings.MUNICIPIO_UF,
        **dados.model_dump(exclude={"confirmar_duplicidade", "municipio", "uf"}),
    )
    pessoa.busca = chave_busca(
        pessoa.nome, pessoa.nome_social, pessoa.documento, pessoa.telefone,
        pessoa.whatsapp, pessoa.logradouro, pessoa.bairro,
    )
    db.add(pessoa)
    await db.flush()

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="pessoa",
        entidade_id=pessoa.id,
        entidade_descricao=pessoa.nome,
        dados_depois=auditoria.instantaneo(pessoa),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": pessoa.id, "mensagem": "Cadastro criado com sucesso.", "alertas": duplicidades}


@router.get("/pessoas/{pessoa_id}", summary="Detalhar pessoa")
async def detalhar_pessoa(
    pessoa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PESSOAS_VISUALIZAR)),
):
    pessoa = await buscar_da_organizacao(db, Pessoa, pessoa_id, user, "Pessoa não encontrada.")
    vinculos = (
        await db.execute(
            select(Imovel)
            .join(PessoaImovel, PessoaImovel.imovel_id == Imovel.id)
            .where(PessoaImovel.pessoa_id == pessoa.id, Imovel.deleted_at.is_(None))
        )
    ).scalars().all()

    base = _resumo_pessoa(pessoa, user)
    base.update(
        {
            "nome_social": pessoa.nome_social,
            "pessoa_juridica": pessoa.pessoa_juridica,
            "rg": pessoa.rg,
            "data_nascimento": pessoa.data_nascimento,
            "whatsapp": pessoa.whatsapp,
            "email": pessoa.email,
            "cep": pessoa.cep,
            "logradouro": pessoa.logradouro,
            "numero": pessoa.numero,
            "complemento": pessoa.complemento,
            "uf": pessoa.uf,
            "observacoes": pessoa.observacoes,
            "created_at": pessoa.created_at,
            "imoveis": [_resumo_imovel(i) for i in vinculos],
            "bloqueios_ativos": await _contar_bloqueios(db, pessoa_id=pessoa.id),
        }
    )
    return base


@router.put("/pessoas/{pessoa_id}", summary="Atualizar pessoa")
async def atualizar_pessoa(
    pessoa_id: uuid.UUID,
    dados: esquemas.PessoaAtualizacao,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PESSOAS_EDITAR)),
):
    pessoa = await buscar_da_organizacao(db, Pessoa, pessoa_id, user, "Pessoa não encontrada.")
    antes = auditoria.instantaneo(pessoa)

    alteracoes = dados.model_dump(exclude_unset=True, exclude={"confirmar_duplicidade"})
    if alteracoes.get("documento") and alteracoes["documento"] != pessoa.documento:
        conflito = await db.scalar(
            select(Pessoa).where(
                Pessoa.organizacao_id == user.organizacao_id,
                Pessoa.documento == alteracoes["documento"],
                Pessoa.id != pessoa.id,
                Pessoa.deleted_at.is_(None),
            )
        )
        if conflito is not None:
            raise Conflict(
                f"O CPF/CNPJ informado já pertence ao cadastro de {conflito.nome}.",
                "documento_duplicado",
            )

    for campo, valor in alteracoes.items():
        setattr(pessoa, campo, valor)
    pessoa.busca = chave_busca(
        pessoa.nome, pessoa.nome_social, pessoa.documento, pessoa.telefone,
        pessoa.whatsapp, pessoa.logradouro, pessoa.bairro,
    )
    pessoa.updated_by_id = user.id
    nova_versao(pessoa)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="pessoa",
        entidade_id=pessoa.id,
        entidade_descricao=pessoa.nome,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(pessoa),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Cadastro atualizado."}


# ─────────────────────────────────────────────────────────────────────────────
# Imóveis
# ─────────────────────────────────────────────────────────────────────────────


def _resumo_imovel(imovel: Imovel) -> dict:
    return {
        "id": imovel.id,
        "codigo": imovel.codigo,
        "nome": imovel.nome,
        "tipo": imovel.tipo,
        "logradouro": imovel.logradouro,
        "numero": imovel.numero,
        "bairro": imovel.bairro,
        "comunidade": imovel.comunidade,
        "latitude": imovel.latitude,
        "longitude": imovel.longitude,
        "situacao": imovel.situacao,
    }


@router.get("/imoveis", summary="Listar imóveis e propriedades")
async def listar_imoveis(
    termo: str | None = None,
    tipo: str | None = Query(None, description="urbano | rural"),
    pessoa_id: uuid.UUID | None = None,
    bairro: str | None = None,
    sem_coordenada: bool = Query(False, description="Somente imóveis sem ponto no mapa"),
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.IMOVEIS_VISUALIZAR)),
):
    condicoes = [Imovel.organizacao_id == user.organizacao_id, Imovel.deleted_at.is_(None)]
    if termo:
        condicoes.append(
            or_(
                Imovel.busca.ilike(f"%{sem_acento(termo)}%"),
                Imovel.codigo.ilike(f"%{termo}%"),
                Imovel.matricula.ilike(f"%{termo}%"),
            )
        )
    if tipo:
        condicoes.append(Imovel.tipo == tipo)
    if bairro:
        condicoes.append(or_(Imovel.bairro.ilike(f"%{bairro}%"), Imovel.comunidade.ilike(f"%{bairro}%")))
    if sem_coordenada:
        condicoes.append(Imovel.latitude.is_(None))

    consulta = select(Imovel).where(*condicoes)
    if pessoa_id:
        consulta = consulta.join(PessoaImovel, PessoaImovel.imovel_id == Imovel.id).where(
            PessoaImovel.pessoa_id == pessoa_id
        )

    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(
            consulta.order_by(Imovel.nome.nulls_last(), Imovel.codigo)
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).scalars().all()

    return pagina_payload([_resumo_imovel(i) for i in registros], total, paginacao)


@router.post("/imoveis", status_code=status.HTTP_201_CREATED, summary="Cadastrar imóvel")
async def criar_imovel(
    dados: esquemas.ImovelEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.IMOVEIS_CRIAR)),
):
    codigo = await protocolo.codigo_imovel(db, user.organizacao_id)
    imovel = Imovel(
        organizacao_id=user.organizacao_id,
        codigo=codigo,
        created_by_id=user.id,
        updated_by_id=user.id,
        municipio=dados.municipio or settings.MUNICIPIO_NOME,
        uf=dados.uf or settings.MUNICIPIO_UF,
        **dados.model_dump(exclude={"municipio", "uf"}),
    )
    imovel.busca = chave_busca(
        imovel.nome, imovel.codigo, imovel.logradouro, imovel.bairro,
        imovel.comunidade, imovel.matricula, imovel.cadastro_rural,
    )
    imovel.endereco_chave = _chave_endereco(imovel.logradouro, imovel.numero, imovel.bairro)
    db.add(imovel)
    await db.flush()

    # Vincula automaticamente proprietário e solicitante informados.
    for pessoa_id, relacao in (
        (dados.proprietario_id, "proprietario"),
        (dados.solicitante_id, dados.relacao_solicitante or "responsavel"),
    ):
        if pessoa_id:
            db.add(
                PessoaImovel(
                    pessoa_id=pessoa_id,
                    imovel_id=imovel.id,
                    relacao=relacao,
                    principal=relacao == "proprietario",
                    created_by_id=user.id,
                )
            )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="imovel",
        entidade_id=imovel.id,
        entidade_descricao=f"{imovel.codigo} — {imovel.nome or imovel.logradouro or ''}",
        dados_depois=auditoria.instantaneo(imovel),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": imovel.id, "codigo": imovel.codigo, "mensagem": "Imóvel cadastrado."}


@router.get("/imoveis/{imovel_id}", summary="Detalhar imóvel")
async def detalhar_imovel(
    imovel_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.IMOVEIS_VISUALIZAR)),
):
    imovel = await buscar_da_organizacao(db, Imovel, imovel_id, user, "Imóvel não encontrado.")
    proprietario = await db.get(Pessoa, imovel.proprietario_id) if imovel.proprietario_id else None
    solicitante = await db.get(Pessoa, imovel.solicitante_id) if imovel.solicitante_id else None

    base = _resumo_imovel(imovel)
    base.update(
        {
            "cep": imovel.cep,
            "complemento": imovel.complemento,
            "estrada_acesso": imovel.estrada_acesso,
            "municipio": imovel.municipio,
            "uf": imovel.uf,
            "regiao_id": imovel.regiao_id,
            "lote": imovel.lote,
            "matricula": imovel.matricula,
            "inscricao_municipal": imovel.inscricao_municipal,
            "cadastro_rural": imovel.cadastro_rural,
            "area_hectares": imovel.area_hectares,
            "atividade_produtiva": imovel.atividade_produtiva,
            "precisao_coordenada": imovel.precisao_coordenada,
            "instrucoes_acesso": imovel.instrucoes_acesso,
            "observacoes": imovel.observacoes,
            "proprietario": _resumo_pessoa(proprietario, user) if proprietario else None,
            "solicitante": _resumo_pessoa(solicitante, user) if solicitante else None,
            "created_at": imovel.created_at,
            "row_version": imovel.row_version,
            "bloqueios_ativos": await _contar_bloqueios(db, imovel_id=imovel.id),
        }
    )
    return base


@router.put("/imoveis/{imovel_id}", summary="Atualizar imóvel")
async def atualizar_imovel(
    imovel_id: uuid.UUID,
    dados: esquemas.ImovelEntrada,
    request: Request,
    row_version: int | None = Query(None, description="Versão lida pelo cliente"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.IMOVEIS_EDITAR)),
):
    imovel = await buscar_da_organizacao(db, Imovel, imovel_id, user, "Imóvel não encontrado.")
    conferir_versao(imovel, row_version)
    antes = auditoria.instantaneo(imovel)

    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(imovel, campo, valor)
    imovel.busca = chave_busca(
        imovel.nome, imovel.codigo, imovel.logradouro, imovel.bairro,
        imovel.comunidade, imovel.matricula, imovel.cadastro_rural,
    )
    imovel.endereco_chave = _chave_endereco(imovel.logradouro, imovel.numero, imovel.bairro)
    imovel.updated_by_id = user.id
    nova_versao(imovel)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="imovel",
        entidade_id=imovel.id,
        entidade_descricao=imovel.codigo,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(imovel),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Imóvel atualizado."}


@router.post("/imoveis/{imovel_id}/vinculos", summary="Vincular pessoa ao imóvel")
async def vincular_pessoa(
    imovel_id: uuid.UUID,
    dados: esquemas.VinculoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.IMOVEIS_EDITAR)),
):
    imovel = await buscar_da_organizacao(db, Imovel, imovel_id, user, "Imóvel não encontrado.")
    await buscar_da_organizacao(db, Pessoa, dados.pessoa_id, user, "Pessoa não encontrada.")

    existente = await db.scalar(
        select(PessoaImovel).where(
            PessoaImovel.imovel_id == imovel.id,
            PessoaImovel.pessoa_id == dados.pessoa_id,
            PessoaImovel.relacao == dados.relacao,
        )
    )
    if existente is not None:
        raise Conflict("Esta pessoa já está vinculada ao imóvel com essa relação.")

    db.add(
        PessoaImovel(
            imovel_id=imovel.id,
            pessoa_id=dados.pessoa_id,
            relacao=dados.relacao,
            principal=dados.principal,
            observacao=dados.observacao,
            created_by_id=user.id,
        )
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="imovel_vinculo",
        entidade_id=imovel.id,
        entidade_descricao=f"Vínculo {dados.relacao}",
        dados_depois={"pessoa_id": str(dados.pessoa_id), "relacao": dados.relacao},
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Vínculo criado."}


@router.post("/geocodificar", summary="Sugerir coordenadas para um endereço")
async def sugerir_coordenadas(
    dados: esquemas.GeocodificacaoEntrada,
    user: User = Depends(exigir(P.IMOVEIS_VISUALIZAR)),
):
    """Consulta o provedor externo de geocodificação.

    A indisponibilidade do serviço NUNCA impede o cadastro: a resposta traz
    `encontrado=false` com uma mensagem, e a tela segue com marcação manual.
    """
    resultado = await geocodificar(dados.endereco)
    if resultado is None:
        return {
            "encontrado": False,
            "mensagem": (
                "Não foi possível obter uma sugestão automática agora. "
                "Marque o ponto manualmente no mapa."
            ),
        }
    return {
        "encontrado": True,
        "latitude": resultado.latitude,
        "longitude": resultado.longitude,
        "endereco_formatado": resultado.endereco_formatado,
        "precisao": resultado.precisao,
        "provedor": resultado.provedor,
    }
