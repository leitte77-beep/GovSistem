"""Protocolos em sistemas externos e seu acompanhamento (§33, §34).

As rotas são aninhadas na demanda de propósito: a autorização da demanda
(tenant + sigilo) resolve antes de tocar no protocolo, então não existe caminho
por ID que alcance o protocolo de outro município.
"""

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.enums import StatusProtocolo, TipoEvento, TipoNotificacao
from app.models.protocolo_externo import ProtocoloAtualizacao, ProtocoloExterno
from app.models.user import User
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao
from app.services.notifications import criar_notificacao
from app.services.timeline import registrar_evento

router = APIRouter(tags=["Protocolos externos"])

SITUACOES_ENCERRADAS = {
    StatusProtocolo.APROVADO,
    StatusProtocolo.REJEITADO,
    StatusProtocolo.ARQUIVADO,
}


class ProtocoloIn(BaseModel):
    sistema: str = Field(min_length=2, max_length=120)
    numero: str = Field(min_length=1, max_length=120)
    data_protocolo: datetime
    orgao: str | None = Field(default=None, max_length=255)
    ano: int | None = Field(default=None, ge=1990, le=2200)
    url: str | None = None
    situacao: StatusProtocolo = StatusProtocolo.PROTOCOLADO
    observacoes: str | None = None
    prazo_resposta: datetime | None = None
    proxima_verificacao: date | None = None
    responsavel_id: uuid.UUID | None = None


class ProtocoloUpdate(BaseModel):
    """Correção de cadastro. A situação muda pela rota de atualização."""

    sistema: str | None = Field(default=None, min_length=2, max_length=120)
    numero: str | None = Field(default=None, min_length=1, max_length=120)
    orgao: str | None = None
    ano: int | None = Field(default=None, ge=1990, le=2200)
    data_protocolo: datetime | None = None
    url: str | None = None
    observacoes: str | None = None
    prazo_resposta: datetime | None = None
    proxima_verificacao: date | None = None
    responsavel_id: uuid.UUID | None = None


class AtualizacaoIn(BaseModel):
    situacao: StatusProtocolo
    descricao: str = Field(min_length=3)
    ocorrido_em: datetime | None = None
    proxima_verificacao: date | None = None
    prazo_resposta: datetime | None = None


class AtualizacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    situacao: StatusProtocolo
    descricao: str
    ocorrido_em: datetime
    registrado_por_id: uuid.UUID | None


class ProtocoloOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    demanda_id: uuid.UUID
    sistema: str
    numero: str
    ano: int | None
    orgao: str | None
    data_protocolo: datetime
    url: str | None
    situacao: StatusProtocolo
    observacoes: str | None
    prazo_resposta: datetime | None
    proxima_verificacao: date | None
    responsavel_id: uuid.UUID | None
    atualizacoes: list[AtualizacaoOut] = []


async def _recarregar(db: AsyncSession, protocolo: ProtocoloExterno) -> ProtocoloExterno:
    """Recarrega as atualizações depois de gravar.

    A sessão roda com `expire_on_commit=False`: sem isto, uma coleção lida antes
    do commit continuaria devolvendo a lista antiga, e a resposta esconderia a
    movimentação que o usuário acabou de registrar.
    """
    await db.refresh(protocolo, attribute_names=["atualizacoes"])
    return protocolo


async def _get_protocolo(
    db: AsyncSession, demanda_id: uuid.UUID, protocolo_id: uuid.UUID, user: User
) -> tuple[ProtocoloExterno, object]:
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    protocolo = (
        await db.execute(
            select(ProtocoloExterno)
            .where(
                ProtocoloExterno.id == protocolo_id,
                ProtocoloExterno.demanda_id == demanda.id,
                ProtocoloExterno.deleted_at.is_(None),
            )
            .options(selectinload(ProtocoloExterno.atualizacoes))
        )
    ).scalar_one_or_none()
    if protocolo is None:
        raise HTTPException(404, "Protocolo não encontrado")
    return protocolo, demanda


@router.get("/demandas/{demanda_id}/protocolos", response_model=list[ProtocoloOut])
async def listar(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return (
        (
            await db.execute(
                select(ProtocoloExterno)
                .where(
                    ProtocoloExterno.demanda_id == demanda.id,
                    ProtocoloExterno.deleted_at.is_(None),
                )
                .options(selectinload(ProtocoloExterno.atualizacoes))
                .order_by(ProtocoloExterno.data_protocolo.desc())
            )
        )
        .scalars()
        .all()
    )


@router.post(
    "/demandas/{demanda_id}/protocolos", response_model=ProtocoloOut, status_code=201
)
async def criar(
    demanda_id: uuid.UUID,
    payload: ProtocoloIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    if demanda.encerrada:
        raise HTTPException(409, "Demanda encerrada não recebe novos protocolos")

    duplicado = (
        await db.execute(
            select(ProtocoloExterno.id).where(
                ProtocoloExterno.demanda_id == demanda.id,
                ProtocoloExterno.sistema == payload.sistema,
                ProtocoloExterno.numero == payload.numero,
                ProtocoloExterno.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if duplicado is not None:
        raise HTTPException(
            409, "Este número já está cadastrado para o mesmo sistema nesta demanda"
        )

    protocolo = ProtocoloExterno(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        **payload.model_dump(),
    )
    protocolo.responsavel_id = payload.responsavel_id or user.id
    db.add(protocolo)
    await db.flush()
    # O cadastro é a primeira movimentação do protocolo: registrá-la evita um
    # histórico que começa no meio, já em "em análise".
    db.add(
        ProtocoloAtualizacao(
            protocolo_id=protocolo.id,
            situacao=protocolo.situacao,
            descricao=f"Protocolado em {protocolo.sistema} sob nº {protocolo.numero}",
            ocorrido_em=protocolo.data_protocolo,
            registrado_por_id=user.id,
        )
    )
    # Quem estava aguardando o Município passa a aguardar o órgão externo (§70).
    demanda.aguardando_terceiro = protocolo.orgao or protocolo.sistema
    demanda.aguardando_desde = datetime.now(timezone.utc)
    if protocolo.proxima_verificacao:
        demanda.proximo_followup = protocolo.proxima_verificacao
    await marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        TipoEvento.PROTOCOLO_REGISTRADO,
        user.id,
        f"Protocolo {protocolo.sistema} nº {protocolo.numero} registrado",
        demanda_id=demanda.id,
        metadados={
            "protocolo_id": str(protocolo.id),
            "sistema": protocolo.sistema,
            "numero": protocolo.numero,
            "orgao": protocolo.orgao,
        },
    )
    await db.commit()
    return await _recarregar(db, protocolo)


@router.get(
    "/demandas/{demanda_id}/protocolos/{protocolo_id}", response_model=ProtocoloOut
)
async def detalhe(
    demanda_id: uuid.UUID,
    protocolo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    protocolo, _ = await _get_protocolo(db, demanda_id, protocolo_id, user)
    return protocolo


@router.patch(
    "/demandas/{demanda_id}/protocolos/{protocolo_id}", response_model=ProtocoloOut
)
async def editar(
    demanda_id: uuid.UUID,
    protocolo_id: uuid.UUID,
    payload: ProtocoloUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    protocolo, demanda = await _get_protocolo(db, demanda_id, protocolo_id, user)
    alterados = payload.model_dump(exclude_unset=True)
    if not alterados:
        return protocolo
    antes = {campo: getattr(protocolo, campo) for campo in alterados}
    for campo, valor in alterados.items():
        setattr(protocolo, campo, valor)
    await marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        TipoEvento.PROTOCOLO_ATUALIZADO,
        user.id,
        f"Cadastro do protocolo {protocolo.numero} corrigido",
        demanda_id=demanda.id,
        metadados={
            "protocolo_id": str(protocolo.id),
            "antes": {k: str(v) for k, v in antes.items()},
            "depois": {k: str(v) for k, v in alterados.items()},
        },
    )
    await db.commit()
    return await _recarregar(db, protocolo)


@router.post(
    "/demandas/{demanda_id}/protocolos/{protocolo_id}/atualizacoes",
    response_model=ProtocoloOut,
    status_code=201,
)
async def registrar_atualizacao(
    demanda_id: uuid.UUID,
    protocolo_id: uuid.UUID,
    payload: AtualizacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Cada movimentação no órgão externo (§34). Append-only."""
    protocolo, demanda = await _get_protocolo(db, demanda_id, protocolo_id, user)
    if protocolo.situacao in SITUACOES_ENCERRADAS:
        raise HTTPException(
            409,
            f"Protocolo já encerrado como {protocolo.situacao}; "
            "cadastre um novo protocolo para reabrir a tramitação",
        )

    ocorrido = payload.ocorrido_em or datetime.now(timezone.utc)
    db.add(
        ProtocoloAtualizacao(
            protocolo_id=protocolo.id,
            situacao=payload.situacao,
            descricao=payload.descricao,
            ocorrido_em=ocorrido,
            registrado_por_id=user.id,
        )
    )
    protocolo.situacao = payload.situacao
    if payload.proxima_verificacao is not None:
        protocolo.proxima_verificacao = payload.proxima_verificacao
        demanda.proximo_followup = payload.proxima_verificacao
    if payload.prazo_resposta is not None:
        protocolo.prazo_resposta = payload.prazo_resposta

    if payload.situacao in SITUACOES_ENCERRADAS:
        # Encerrado no órgão: a bola volta para o Município.
        protocolo.proxima_verificacao = None
        demanda.aguardando_terceiro = None
        demanda.aguardando_desde = None

    await marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        TipoEvento.PROTOCOLO_ATUALIZADO,
        user.id,
        f"Protocolo {protocolo.numero}: {payload.situacao} — {payload.descricao}",
        demanda_id=demanda.id,
        metadados={
            "protocolo_id": str(protocolo.id),
            "situacao": payload.situacao.value,
        },
        ocorrido_em=ocorrido,
    )
    # O responsável pelo protocolo é quem cobra; avisá-lo é o que impede a
    # diligência de dormir até alguém reabrir a tela por acaso.
    if protocolo.responsavel_id and protocolo.responsavel_id != user.id:
        await criar_notificacao(
            db,
            destinatario_id=protocolo.responsavel_id,
            tipo=TipoNotificacao.PROTOCOLO_ATUALIZADO,
            demanda_id=demanda.id,
            mensagem=(
                f"Protocolo {protocolo.sistema} nº {protocolo.numero} "
                f"passou a {payload.situacao}"
            ),
        )
    await db.commit()
    return await _recarregar(db, protocolo)


@router.delete("/demandas/{demanda_id}/protocolos/{protocolo_id}", status_code=204)
async def excluir(
    demanda_id: uuid.UUID,
    protocolo_id: uuid.UUID,
    motivo: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_DELETE)),
):
    """Exclusão lógica com motivo (§105): o histórico do protocolo permanece."""
    protocolo, demanda = await _get_protocolo(db, demanda_id, protocolo_id, user)
    if len(motivo.strip()) < 5:
        raise HTTPException(422, "Informe o motivo da exclusão")
    protocolo.deleted_at = datetime.now(timezone.utc)
    await registrar_evento(
        db,
        TipoEvento.PROTOCOLO_ATUALIZADO,
        user.id,
        f"Protocolo {protocolo.numero} removido do cadastro: {motivo}",
        demanda_id=demanda.id,
        metadados={"protocolo_id": str(protocolo.id), "motivo": motivo},
    )
    await db.commit()


@router.get("/protocolos/acompanhamento")
async def acompanhamento(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Agenda de cobrança dos protocolos em aberto (§71, §72)."""
    hoje = date.today()
    protocolos = (
        (
            await db.execute(
                select(ProtocoloExterno)
                .where(
                    ProtocoloExterno.organization_id == user.organization_id,
                    ProtocoloExterno.deleted_at.is_(None),
                    ProtocoloExterno.situacao.not_in(
                        [s.value for s in SITUACOES_ENCERRADAS]
                    ),
                )
                .order_by(ProtocoloExterno.proxima_verificacao.is_(None))
            )
        )
        .scalars()
        .all()
    )
    agora = datetime.now(timezone.utc)

    def _venceu(p: ProtocoloExterno) -> bool:
        if p.prazo_resposta is None:
            return False
        prazo = p.prazo_resposta
        if prazo.tzinfo is None:
            prazo = prazo.replace(tzinfo=timezone.utc)
        return prazo < agora

    return {
        "total_abertos": len(protocolos),
        "cobrar_hoje": [
            {
                "id": str(p.id),
                "demanda_id": str(p.demanda_id),
                "sistema": p.sistema,
                "numero": p.numero,
                "orgao": p.orgao,
                "situacao": p.situacao,
                "proxima_verificacao": p.proxima_verificacao,
            }
            for p in protocolos
            if p.proxima_verificacao and p.proxima_verificacao <= hoje
        ],
        "prazo_de_resposta_vencido": [
            {
                "id": str(p.id),
                "demanda_id": str(p.demanda_id),
                "sistema": p.sistema,
                "numero": p.numero,
                "prazo_resposta": p.prazo_resposta,
            }
            for p in protocolos
            if _venceu(p)
        ],
        "sem_acompanhamento_agendado": [
            {"id": str(p.id), "demanda_id": str(p.demanda_id), "numero": p.numero}
            for p in protocolos
            if p.proxima_verificacao is None
        ],
    }
