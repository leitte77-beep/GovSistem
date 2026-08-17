"""Atas de Registro de Preços (seções 57-59)."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.permissoes import P
from app.models.ata import AtaItemSaldo, AtaRegistroPreco, AtaSolicitacaoConsumo
from app.models.enums import StatusAta, StatusConsumoAta
from app.models.organizacao import User
from app.schemas.ata import AtaIn, AtaItemIn, AtaOut, ConsumoAtaIn, ConsumoAtaOut
from app.schemas.comuns import Criado
from app.services import numeracao

router = APIRouter(prefix="/atas", tags=["Atas de Registro de Preços"])


@router.get("", response_model=list[AtaOut])
async def listar_atas(
    status_ata: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.ATAS_VISUALIZAR))
):
    consulta = select(AtaRegistroPreco).where(AtaRegistroPreco.organizacao_id == user.organizacao_id)
    if status_ata:
        consulta = consulta.where(AtaRegistroPreco.status == status_ata)
    return list((await db.scalars(consulta.order_by(AtaRegistroPreco.vigencia_fim))).all())


@router.post("", response_model=Criado, status_code=201)
async def criar_ata(
    payload: AtaIn, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.ATAS_GERENCIAR))
):
    exercicio, numero = await numeracao.numero_ata(db, user.organizacao_id)
    ata = AtaRegistroPreco(
        organizacao_id=user.organizacao_id,
        numero=payload.numero or numero,
        exercicio=exercicio,
        processo_id=payload.processo_id,
        fornecedor_id=payload.fornecedor_id,
        objeto=payload.objeto,
        vigencia_inicio=payload.vigencia_inicio,
        vigencia_fim=payload.vigencia_fim,
        status=StatusAta.VIGENTE.value,
        created_by_id=user.id,
    )
    db.add(ata)
    await db.flush()
    await db.commit()
    return Criado(id=ata.id, mensagem="Ata registrada.")


@router.get("/{ata_id}", response_model=AtaOut)
async def obter_ata(
    ata_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.ATAS_VISUALIZAR))
):
    return await buscar_da_organizacao(db, AtaRegistroPreco, ata_id, user)


@router.post("/{ata_id}/itens", response_model=Criado, status_code=201)
async def adicionar_item(
    ata_id: uuid.UUID, payload: AtaItemIn, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.ATAS_GERENCIAR))
):
    await buscar_da_organizacao(db, AtaRegistroPreco, ata_id, user)
    item = AtaItemSaldo(ata_id=ata_id, **payload.model_dump())
    db.add(item)
    await db.commit()
    return Criado(id=item.id, mensagem="Item adicionado à ata.")


@router.post("/{ata_id}/consumo", response_model=Criado, status_code=201)
async def solicitar_consumo(
    ata_id: uuid.UUID,
    payload: ConsumoAtaIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ATAS_VISUALIZAR)),
):
    await buscar_da_organizacao(db, AtaRegistroPreco, ata_id, user)
    item = await db.get(AtaItemSaldo, payload.item_id)
    if item is None:
        raise NotFound("Item da ata não encontrado.")
    if payload.quantidade_solicitada > item.quantidade_disponivel:
        raise AppError(
            f"Saldo insuficiente: disponível {item.quantidade_disponivel}, solicitado {payload.quantidade_solicitada}.",
            422,
            "saldo_insuficiente",
        )
    consumo = AtaSolicitacaoConsumo(
        ata_id=ata_id, created_by_id=user.id, status=StatusConsumoAta.SOLICITADA.value, **payload.model_dump()
    )
    db.add(consumo)
    await db.commit()
    return Criado(id=consumo.id, mensagem="Solicitação de consumo registrada, aguardando aprovação.")


@router.post("/consumo/{consumo_id}/aprovar", response_model=ConsumoAtaOut)
async def aprovar_consumo(
    consumo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.ATAS_GERENCIAR))
):
    consumo = await db.get(AtaSolicitacaoConsumo, consumo_id)
    if consumo is None:
        raise NotFound("Solicitação de consumo não encontrada.")
    item = await db.get(AtaItemSaldo, consumo.item_id)
    item.quantidade_reservada += consumo.quantidade_solicitada
    consumo.status = StatusConsumoAta.APROVADA.value
    await db.commit()
    await db.refresh(consumo)
    return consumo
