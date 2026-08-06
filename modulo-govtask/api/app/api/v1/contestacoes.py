import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.contestacao import Contestacao
from app.models.enums import TipoEvento
from app.models.tarefa import Tarefa
from app.models.user import User
from app.schemas.contestacao import ContestacaoCreate, ContestacaoDecidir, ContestacaoOut
from app.services.state_machine import (
    aprovar_contestacao,
    contestar_tarefa,
    rejeitar_contestacao,
    voltar_de_contestacao,
)
from app.services.timeline import registrar_evento
from app.services.notifications import (
    notificar_contestacao_aberta,
    notificar_contestacao_decidida,
)

router = APIRouter(tags=["contestacoes"])


@router.post(
    "/tarefas/{tarefa_id}/contestacoes",
    response_model=ContestacaoOut,
    status_code=201,
)
async def criar_contestacao(
    tarefa_id: uuid.UUID,
    body: ContestacaoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tarefa).where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if tarefa.atribuida_a_id and tarefa.atribuida_a_id != user.id:
        raise HTTPException(status_code=403, detail="Apenas o responsável pode contestar o prazo")

    # Transição: EM_ANDAMENTO → CONTESTADA
    await contestar_tarefa(tarefa, db)

    contestacao = Contestacao(
        tarefa_id=tarefa_id,
        solicitado_por_id=user.id,
        motivo=body.motivo,
        novo_prazo_solicitado=body.novo_prazo_solicitado,
    )
    db.add(contestacao)
    await db.flush()

    await registrar_evento(
        db,
        convenio_id=tarefa.convenio_id,
        tipo_evento=TipoEvento.CONTESTACAO_ABERTA,
        ator_id=user.id,
        descricao=f"Contestação de prazo aberta: {body.motivo[:200]}",
        tarefa_id=tarefa.id,
        metadados={
            "novo_prazo_solicitado": body.novo_prazo_solicitado.isoformat(),
        },
    )
    await notificar_contestacao_aberta(
        db, tarefa.id, tarefa.convenio_id, tarefa.criada_por_id, tarefa.titulo
    )
    await db.commit()
    await db.refresh(contestacao)
    return contestacao


@router.post("/contestacoes/{contestacao_id}/decidir", response_model=ContestacaoOut)
async def decidir_contestacao(
    contestacao_id: uuid.UUID,
    body: ContestacaoDecidir,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Contestacao).where(
            Contestacao.id == contestacao_id, Contestacao.deleted_at.is_(None)
        )
    )
    contestacao = result.scalar_one_or_none()
    if not contestacao:
        raise HTTPException(status_code=404, detail="Contestação não encontrada")

    # Carrega a tarefa associada
    tarefa_result = await db.execute(
        select(Tarefa).where(Tarefa.id == contestacao.tarefa_id)
    )
    tarefa = tarefa_result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if body.aprovada:
        await aprovar_contestacao(
            contestacao,
            decidido_por_id=str(user.id),
            justificativa=body.justificativa,
            db=db,
        )
        # Atualiza o prazo da tarefa
        tarefa.prazo = contestacao.novo_prazo_solicitado
        # Volta a tarefa para EM_ANDAMENTO
        await voltar_de_contestacao(tarefa, db)

        await registrar_evento(
            db,
            convenio_id=tarefa.convenio_id,
            tipo_evento=TipoEvento.CONTESTACAO_DECIDIDA,
            ator_id=user.id,
            descricao="Contestação aprovada — prazo prorrogado",
            tarefa_id=tarefa.id,
            metadados={
                "aprovada": True,
                "novo_prazo": contestacao.novo_prazo_solicitado.isoformat(),
            },
        )
        await registrar_evento(
            db,
            convenio_id=tarefa.convenio_id,
            tipo_evento=TipoEvento.PRAZO_PRORROGADO,
            ator_id=user.id,
            descricao=f"Prazo prorrogado para {contestacao.novo_prazo_solicitado.strftime('%d/%m/%Y')}",
            tarefa_id=tarefa.id,
        )
    else:
        await rejeitar_contestacao(
            contestacao,
            decidido_por_id=str(user.id),
            justificativa=body.justificativa,
            db=db,
        )
        await voltar_de_contestacao(tarefa, db)

        await registrar_evento(
            db,
            convenio_id=tarefa.convenio_id,
            tipo_evento=TipoEvento.CONTESTACAO_DECIDIDA,
            ator_id=user.id,
            descricao="Contestação rejeitada",
            tarefa_id=tarefa.id,
            metadados={"aprovada": False},
        )

    await notificar_contestacao_decidida(
        db,
        tarefa.id,
        tarefa.convenio_id,
        contestacao.solicitado_por_id,
        tarefa.titulo,
        body.aprovada,
    )
    await db.commit()
    await db.refresh(contestacao)
    return contestacao
