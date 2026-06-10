import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.enums import NaturezaEtapa, StatusEtapa, TipoEvento
from app.models.etapa import Etapa
from app.models.user import User
from app.schemas.etapa import (
    EncaminharGovernoRequest,
    EtapaCreate,
    EtapaOut,
    EtapaUpdate,
    RespostaGovernoRequest,
)
from app.services.state_machine import (
    concluir_etapa,
    encaminhar_ao_governo,
    iniciar_etapa,
    voltar_etapa_para_andamento,
)
from app.services.timeline import registrar_evento

router = APIRouter(tags=["etapas"])


def _etapa_out(etapa: Etapa) -> dict:
    return {
        "id": etapa.id,
        "convenio_id": etapa.convenio_id,
        "nome": etapa.nome,
        "ordem": etapa.ordem,
        "natureza": etapa.natureza,
        "status": etapa.status,
        "prazo_governo": etapa.prazo_governo,
        "resposta_governo": etapa.resposta_governo,
        "data_inicio": etapa.data_inicio,
        "data_conclusao": etapa.data_conclusao,
        "created_at": etapa.created_at,
        "updated_at": etapa.updated_at,
    }


@router.post("/convenios/{convenio_id}/etapas", response_model=EtapaOut, status_code=201)
async def criar_etapa(
    convenio_id: uuid.UUID,
    body: EtapaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Convenio).where(Convenio.id == convenio_id, Convenio.deleted_at.is_(None))
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    # Determina a próxima ordem
    from sqlalchemy import func
    ordem_result = await db.execute(
        select(func.max(Etapa.ordem)).where(Etapa.convenio_id == convenio_id)
    )
    max_ordem = ordem_result.scalar() or 0
    ordem = body.ordem if body.ordem is not None else max_ordem + 1

    etapa = Etapa(
        convenio_id=convenio_id,
        nome=body.nome,
        ordem=ordem,
        natureza=body.natureza,
        prazo_governo=body.prazo_governo,
    )
    db.add(etapa)
    await db.flush()

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.ETAPA_ABERTA,
        ator_id=user.id,
        descricao=f"Etapa '{etapa.nome}' aberta (ordem {etapa.ordem})",
    )
    await db.commit()
    await db.refresh(etapa)
    return etapa


@router.patch("/etapas/{etapa_id}", response_model=EtapaOut)
async def atualizar_etapa(
    etapa_id: uuid.UUID,
    body: EtapaUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Etapa).where(Etapa.id == etapa_id, Etapa.deleted_at.is_(None))
    )
    etapa = result.scalar_one_or_none()
    if not etapa:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    if body.nome is not None:
        etapa.nome = body.nome
    if body.ordem is not None:
        etapa.ordem = body.ordem
    if body.natureza is not None:
        etapa.natureza = body.natureza
    if body.prazo_governo is not None:
        etapa.prazo_governo = body.prazo_governo
    if body.status is not None and body.status != etapa.status:
        current_status = (
            etapa.status
            if isinstance(etapa.status, StatusEtapa)
            else StatusEtapa(etapa.status)
        )
        current_status.assert_transition(body.status)
        etapa.status = body.status

    await db.commit()
    await db.refresh(etapa)
    return etapa


@router.post("/etapas/{etapa_id}/encaminhar-governo", response_model=EtapaOut)
async def encaminhar_governo(
    etapa_id: uuid.UUID,
    body: EncaminharGovernoRequest | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Etapa).where(Etapa.id == etapa_id, Etapa.deleted_at.is_(None))
    )
    etapa = result.scalar_one_or_none()
    if not etapa:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    await encaminhar_ao_governo(etapa, db)

    await registrar_evento(
        db,
        convenio_id=etapa.convenio_id,
        tipo_evento=TipoEvento.ENCAMINHADO_GOVERNO,
        ator_id=user.id,
        descricao=f"Etapa '{etapa.nome}' encaminhada ao governo",
        metadados={"observacao": body.observacao} if body and body.observacao else None,
    )
    await db.commit()
    await db.refresh(etapa)
    return etapa


@router.post("/etapas/{etapa_id}/resposta-governo", response_model=EtapaOut)
async def registrar_resposta_governo(
    etapa_id: uuid.UUID,
    body: RespostaGovernoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Etapa).where(Etapa.id == etapa_id, Etapa.deleted_at.is_(None))
    )
    etapa = result.scalar_one_or_none()
    if not etapa:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    etapa.resposta_governo = body.resposta
    etapa.status = StatusEtapa.EM_ANDAMENTO  # volta para andamento para processar resposta

    await registrar_evento(
        db,
        convenio_id=etapa.convenio_id,
        tipo_evento=TipoEvento.RESPOSTA_GOVERNO_REGISTRADA,
        ator_id=user.id,
        descricao=f"Resposta do governo registrada na etapa '{etapa.nome}'",
        metadados={"resposta": body.resposta[:500]},
    )
    await db.commit()
    await db.refresh(etapa)
    return etapa


@router.post("/etapas/{etapa_id}/concluir", response_model=EtapaOut)
async def concluir_etapa_endpoint(
    etapa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Etapa).where(Etapa.id == etapa_id, Etapa.deleted_at.is_(None))
    )
    etapa = result.scalar_one_or_none()
    if not etapa:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    await concluir_etapa(etapa, db)

    await db.commit()
    await db.refresh(etapa)
    return etapa


@router.delete("/etapas/{etapa_id}", status_code=204)
async def excluir_etapa(
    etapa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Etapa).where(Etapa.id == etapa_id, Etapa.deleted_at.is_(None))
    )
    etapa = result.scalar_one_or_none()
    if not etapa:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    etapa.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
