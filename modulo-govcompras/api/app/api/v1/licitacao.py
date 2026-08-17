"""Licitação: edital, publicação, sessão, adjudicação e homologação
(seções 36-43)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.permissoes import P
from app.models.licitacao import (
    Adjudicacao,
    Edital,
    EditalTemplate,
    Homologacao,
    Proposta,
    Publicacao,
    Sessao,
)
from app.models.organizacao import User
from app.models.processo import ProcessoInstancia
from app.schemas.comuns import Criado
from app.schemas.licitacao import (
    AdjudicarIn,
    EditalIn,
    EditalOut,
    HomologacaoOut,
    HomologarIn,
    PropostaIn,
    PropostaOut,
    PublicacaoIn,
    PublicacaoOut,
    SessaoIn,
    SessaoOut,
)
from app.services.editais import resolver_variaveis
from app.services.integracoes import pncp

router = APIRouter(prefix="/processos/{processo_id}", tags=["Licitações"])


@router.get("/edital", response_model=EditalOut | None)
async def obter_edital(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.LICITACAO_VISUALIZAR))):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    return await db.scalar(select(Edital).where(Edital.processo_id == processo_id))


@router.put("/edital", response_model=EditalOut)
async def salvar_edital(
    processo_id: uuid.UUID,
    payload: EditalIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.LICITACAO_GERENCIAR)),
):
    processo = await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    edital = await db.scalar(select(Edital).where(Edital.processo_id == processo_id))
    conteudo = payload.conteudo
    if payload.template_id and not conteudo:
        template = await db.get(EditalTemplate, payload.template_id)
        if template:
            conteudo = resolver_variaveis(template.conteudo_base, processo)
    if edital is None:
        edital = Edital(processo_id=processo_id, created_by_id=user.id, **payload.model_dump(exclude={"conteudo"}), conteudo=conteudo)
        db.add(edital)
    else:
        for campo, valor in payload.model_dump(exclude={"conteudo"}).items():
            setattr(edital, campo, valor)
        edital.conteudo = conteudo
    await db.commit()
    await db.refresh(edital)
    return edital


@router.post("/edital/publicar", response_model=EditalOut)
async def publicar_edital(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.EDITAL_PUBLICAR))
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    edital = await db.scalar(select(Edital).where(Edital.processo_id == processo_id))
    if edital is None:
        raise NotFound("Edital não encontrado.")
    edital.status = "publicado"
    await pncp.enviar_publicacao(db, organizacao_id=user.organizacao_id, processo_id=processo_id)
    await db.commit()
    await db.refresh(edital)
    return edital


@router.get("/edital/publicacoes", response_model=list[PublicacaoOut])
async def listar_publicacoes(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.LICITACAO_VISUALIZAR))):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    edital = await db.scalar(select(Edital).where(Edital.processo_id == processo_id))
    if edital is None:
        return []
    return list((await db.scalars(select(Publicacao).where(Publicacao.edital_id == edital.id))).all())


@router.post("/edital/publicacoes", response_model=Criado, status_code=201)
async def registrar_publicacao(
    processo_id: uuid.UUID,
    payload: PublicacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.LICITACAO_GERENCIAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    edital = await db.scalar(select(Edital).where(Edital.processo_id == processo_id))
    if edital is None:
        raise AppError("Cadastre o edital antes de registrar a publicação.", 422, "edital_nao_encontrado")
    publicacao = Publicacao(edital_id=edital.id, created_by_id=user.id, **payload.model_dump())
    db.add(publicacao)
    await db.commit()
    return Criado(id=publicacao.id, mensagem="Publicação registrada.")


@router.get("/sessoes", response_model=list[SessaoOut])
async def listar_sessoes(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.LICITACAO_VISUALIZAR))):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    return list((await db.scalars(select(Sessao).where(Sessao.processo_id == processo_id))).all())


@router.post("/sessoes", response_model=Criado, status_code=201)
async def registrar_sessao(
    processo_id: uuid.UUID,
    payload: SessaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.LICITACAO_GERENCIAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    sessao = Sessao(processo_id=processo_id, created_by_id=user.id, situacao="realizada", **payload.model_dump())
    db.add(sessao)
    await db.commit()
    return Criado(id=sessao.id, mensagem="Sessão registrada.")


@router.post("/propostas", response_model=Criado, status_code=201)
async def registrar_proposta(
    processo_id: uuid.UUID,
    payload: PropostaIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.LICITACAO_GERENCIAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    proposta = Proposta(processo_id=processo_id, **payload.model_dump())
    db.add(proposta)
    await db.commit()
    return Criado(id=proposta.id, mensagem="Proposta registrada.")


@router.get("/propostas", response_model=list[PropostaOut])
async def listar_propostas(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.LICITACAO_VISUALIZAR))):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    return list((await db.scalars(select(Proposta).where(Proposta.processo_id == processo_id))).all())


@router.post("/adjudicar", response_model=Criado, status_code=201)
async def adjudicar(
    processo_id: uuid.UUID,
    payload: AdjudicarIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.LICITACAO_GERENCIAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    adjudicacao = Adjudicacao(processo_id=processo_id, created_by_id=user.id, **payload.model_dump())
    db.add(adjudicacao)
    await db.commit()
    return Criado(id=adjudicacao.id, mensagem="Fornecedor adjudicado.")


@router.post("/homologar", response_model=HomologacaoOut, status_code=201)
async def homologar(
    processo_id: uuid.UUID,
    payload: HomologarIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.HOMOLOGACAO_DECIDIR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    homologacao = Homologacao(processo_id=processo_id, autoridade_usuario_id=user.id, **payload.model_dump())
    db.add(homologacao)
    await db.commit()
    await db.refresh(homologacao)
    return homologacao
