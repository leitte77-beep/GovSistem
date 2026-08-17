"""Fiscalização contratual (seções 60-63)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.contrato import Contrato
from app.models.fiscalizacao import Medicao, NotaFiscal, OcorrenciaContrato
from app.models.organizacao import User
from app.schemas.comuns import Criado
from app.schemas.fiscalizacao import (
    MedicaoIn,
    MedicaoOut,
    NotaFiscalIn,
    NotaFiscalOut,
    OcorrenciaIn,
    OcorrenciaOut,
)

router = APIRouter(prefix="/contratos/{contrato_id}", tags=["Fiscalização"])


@router.get("/ocorrencias", response_model=list[OcorrenciaOut])
async def listar_ocorrencias(contrato_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    return list((await db.scalars(select(OcorrenciaContrato).where(OcorrenciaContrato.contrato_id == contrato_id))).all())


@router.post("/ocorrencias", response_model=Criado, status_code=201)
async def registrar_ocorrencia(
    contrato_id: uuid.UUID,
    payload: OcorrenciaIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.FISCALIZACAO_REGISTRAR)),
):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    ocorrencia = OcorrenciaContrato(contrato_id=contrato_id, created_by_id=user.id, **payload.model_dump())
    db.add(ocorrencia)
    await db.commit()
    return Criado(id=ocorrencia.id, mensagem="Ocorrência registrada.")


@router.get("/medicoes", response_model=list[MedicaoOut])
async def listar_medicoes(contrato_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    return list((await db.scalars(select(Medicao).where(Medicao.contrato_id == contrato_id))).all())


@router.post("/medicoes", response_model=Criado, status_code=201)
async def registrar_medicao(
    contrato_id: uuid.UUID,
    payload: MedicaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.FISCALIZACAO_REGISTRAR)),
):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    medicao = Medicao(contrato_id=contrato_id, created_by_id=user.id, **payload.model_dump())
    db.add(medicao)
    await db.commit()
    return Criado(id=medicao.id, mensagem="Medição registrada.")


@router.get("/notas-fiscais", response_model=list[NotaFiscalOut])
async def listar_notas(contrato_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    return list((await db.scalars(select(NotaFiscal).where(NotaFiscal.contrato_id == contrato_id))).all())


@router.post("/notas-fiscais", response_model=Criado, status_code=201)
async def registrar_nota(
    contrato_id: uuid.UUID,
    payload: NotaFiscalIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.FISCALIZACAO_REGISTRAR)),
):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    nota = NotaFiscal(contrato_id=contrato_id, created_by_id=user.id, **payload.model_dump())
    db.add(nota)
    await db.commit()
    return Criado(id=nota.id, mensagem="Nota fiscal registrada.")
