"""Planejamento da contratação: DFD, ETP, Termo de Referência e Matriz de
Riscos (seções 20-23) — todos 1:1 com o processo."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.organizacao import User
from app.models.planejamento import Dfd, Etp, EtpTopico, MatrizRisco, MatrizRiscoItem, TermoReferencia
from app.models.processo import ProcessoInstancia
from app.schemas.comuns import Criado, Mensagem
from app.schemas.planejamento import (
    DfdIn,
    DfdOut,
    EtpOut,
    EtpTopicoIn,
    MatrizRiscoItemIn,
    MatrizRiscoOut,
    TermoReferenciaIn,
    TermoReferenciaOut,
)

router = APIRouter(prefix="/processos/{processo_id}", tags=["Planejamento"])


async def _processo(db: AsyncSession, processo_id: uuid.UUID, user: User) -> ProcessoInstancia:
    return await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)


# ── DFD ────────────────────────────────────────────────────────────────────
@router.get("/dfd", response_model=DfdOut | None)
async def obter_dfd(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_VISUALIZAR))):
    await _processo(db, processo_id, user)
    return await db.scalar(select(Dfd).where(Dfd.processo_id == processo_id))


@router.put("/dfd", response_model=DfdOut)
async def salvar_dfd(
    processo_id: uuid.UUID,
    payload: DfdIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PLANEJAMENTO_EDITAR)),
):
    await _processo(db, processo_id, user)
    dfd = await db.scalar(select(Dfd).where(Dfd.processo_id == processo_id))
    if dfd is None:
        dfd = Dfd(processo_id=processo_id, created_by_id=user.id, **payload.model_dump())
        db.add(dfd)
    else:
        for campo, valor in payload.model_dump().items():
            setattr(dfd, campo, valor)
    await db.commit()
    await db.refresh(dfd)
    return dfd


@router.post("/dfd/aprovar", response_model=DfdOut)
async def aprovar_dfd(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_APROVAR))
):
    await _processo(db, processo_id, user)
    dfd = await db.scalar(select(Dfd).where(Dfd.processo_id == processo_id))
    if dfd is None:
        from app.core.errors import NotFound

        raise NotFound("DFD não encontrado.")
    dfd.status = "aprovado"
    dfd.aprovado_por_id = user.id
    dfd.aprovado_em = datetime.now(timezone.utc).isoformat()
    await db.commit()
    await db.refresh(dfd)
    return dfd


# ── ETP ────────────────────────────────────────────────────────────────────
@router.get("/etp", response_model=EtpOut | None)
async def obter_etp(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_VISUALIZAR))):
    await _processo(db, processo_id, user)
    etp = await db.scalar(select(Etp).where(Etp.processo_id == processo_id))
    return etp


@router.post("/etp", response_model=EtpOut, status_code=201)
async def criar_etp(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_EDITAR))
):
    await _processo(db, processo_id, user)
    etp = await db.scalar(select(Etp).where(Etp.processo_id == processo_id))
    if etp is None:
        etp = Etp(processo_id=processo_id, created_by_id=user.id)
        db.add(etp)
        await db.flush()
        for ordem, titulo in enumerate(EtpTopico.topicos_padrao(), start=1):
            db.add(EtpTopico(etp_id=etp.id, ordem=ordem, titulo=titulo))
        await db.commit()
        await db.refresh(etp)
    return etp


@router.put("/etp/topicos/{topico_id}", response_model=Mensagem)
async def salvar_topico(
    processo_id: uuid.UUID,
    topico_id: uuid.UUID,
    payload: EtpTopicoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PLANEJAMENTO_EDITAR)),
):
    await _processo(db, processo_id, user)
    topico = await db.get(EtpTopico, topico_id)
    if topico is None:
        from app.core.errors import NotFound

        raise NotFound("Tópico não encontrado.")
    topico.titulo = payload.titulo
    topico.conteudo = payload.conteudo
    topico.status = "preenchido" if payload.conteudo else "pendente"
    await db.commit()
    return Mensagem(mensagem="Tópico salvo.")


@router.post("/etp/aprovar", response_model=EtpOut)
async def aprovar_etp(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_APROVAR))
):
    await _processo(db, processo_id, user)
    etp = await db.scalar(select(Etp).where(Etp.processo_id == processo_id))
    if etp is None:
        from app.core.errors import NotFound

        raise NotFound("ETP não encontrado.")
    etp.status = "aprovado"
    await db.commit()
    await db.refresh(etp)
    return etp


# ── Termo de Referência ─────────────────────────────────────────────────────
@router.get("/termo-referencia", response_model=TermoReferenciaOut | None)
async def obter_tr(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_VISUALIZAR))):
    await _processo(db, processo_id, user)
    return await db.scalar(select(TermoReferencia).where(TermoReferencia.processo_id == processo_id))


@router.put("/termo-referencia", response_model=TermoReferenciaOut)
async def salvar_tr(
    processo_id: uuid.UUID,
    payload: TermoReferenciaIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PLANEJAMENTO_EDITAR)),
):
    await _processo(db, processo_id, user)
    tr = await db.scalar(select(TermoReferencia).where(TermoReferencia.processo_id == processo_id))
    if tr is None:
        tr = TermoReferencia(processo_id=processo_id, created_by_id=user.id, **payload.model_dump())
        db.add(tr)
    else:
        for campo, valor in payload.model_dump().items():
            setattr(tr, campo, valor)
        tr.versao += 1
        tr.status = "rascunho"
    await db.commit()
    await db.refresh(tr)
    return tr


@router.post("/termo-referencia/aprovar", response_model=TermoReferenciaOut)
async def aprovar_tr(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_APROVAR))
):
    await _processo(db, processo_id, user)
    tr = await db.scalar(select(TermoReferencia).where(TermoReferencia.processo_id == processo_id))
    if tr is None:
        from app.core.errors import NotFound

        raise NotFound("Termo de Referência não encontrado.")
    tr.status = "aprovado"
    tr.aprovado_por_id = user.id
    await db.commit()
    await db.refresh(tr)
    return tr


# ── Matriz de Riscos ─────────────────────────────────────────────────────────
@router.get("/matriz-risco", response_model=MatrizRiscoOut | None)
async def obter_matriz(processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PLANEJAMENTO_VISUALIZAR))):
    await _processo(db, processo_id, user)
    return await db.scalar(select(MatrizRisco).where(MatrizRisco.processo_id == processo_id))


@router.post("/matriz-risco/itens", response_model=Criado, status_code=201)
async def adicionar_risco(
    processo_id: uuid.UUID,
    payload: MatrizRiscoItemIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PLANEJAMENTO_EDITAR)),
):
    await _processo(db, processo_id, user)
    matriz = await db.scalar(select(MatrizRisco).where(MatrizRisco.processo_id == processo_id))
    if matriz is None:
        matriz = MatrizRisco(processo_id=processo_id, created_by_id=user.id)
        db.add(matriz)
        await db.flush()
    item = MatrizRiscoItem(matriz_id=matriz.id, **payload.model_dump())
    db.add(item)
    await db.commit()
    return Criado(id=item.id, mensagem="Risco adicionado à matriz.")
