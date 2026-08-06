import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.etapa import Etapa
from app.models.enums import StatusTarefa, TipoEvento
from app.models.tarefa import Tarefa
from app.models.user import User
from app.schemas.tarefa import (
    ComentarioCreate,
    ComentarioOut,
    TarefaCreate,
    TarefaListItem,
    TarefaOut,
    TarefaUpdate,
)
from app.models.comentario import Comentario
from app.services.state_machine import (
    aceitar_tarefa,
    cancelar_tarefa,
    concluir_tarefa,
    devolver_tarefa,
    entregar_tarefa,
    retomar_tarefa,
)
from app.services.timeline import registrar_evento
from app.services.notifications import (
    notificar_atribuicao_tarefa,
    notificar_tarefa_devolvida,
    notificar_tarefa_entregue,
)

router = APIRouter(tags=["tarefas"])


@router.get("/tarefas", response_model=list[TarefaListItem])
async def listar_tarefas(
    minhas: bool = Query(False),
    setor_id: uuid.UUID | None = Query(None),
    status: StatusTarefa | None = Query(None),
    atrasadas: bool = Query(False),
    convenio_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Tarefa).where(Tarefa.deleted_at.is_(None))

    if minhas:
        query = query.where(Tarefa.atribuida_a_id == user.id)
    if setor_id:
        query = query.where(Tarefa.setor_destino_id == setor_id)
    if status:
        query = query.where(Tarefa.status == status)
    if convenio_id:
        query = query.where(Tarefa.convenio_id == convenio_id)

    query = query.offset(skip).limit(limit).order_by(Tarefa.prazo.asc())

    result = await db.execute(query)
    tarefas = result.scalars().all()

    if atrasadas:
        tarefas = [t for t in tarefas if t.atrasada]

    return tarefas


@router.post("/etapas/{etapa_id}/tarefas", response_model=TarefaOut, status_code=201)
async def criar_tarefa(
    etapa_id: uuid.UUID,
    body: TarefaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Etapa).where(Etapa.id == etapa_id, Etapa.deleted_at.is_(None))
    )
    etapa = result.scalar_one_or_none()
    if not etapa:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    # Validação: alertar se prazo interno > prazo do governo
    warning = None
    if etapa.prazo_governo and body.prazo and body.prazo > etapa.prazo_governo:
        warning = (
            f"Atenção: o prazo da tarefa ({body.prazo.strftime('%d/%m/%Y')}) "
            f"é posterior ao prazo do governo ({etapa.prazo_governo.strftime('%d/%m/%Y')}). "
            f"Considere uma folga para encaminhar ao governo."
        )

    tarefa = Tarefa(
        convenio_id=etapa.convenio_id,
        etapa_id=etapa_id,
        titulo=body.titulo,
        descricao=body.descricao,
        criada_por_id=user.id,
        atribuida_a_id=body.atribuida_a_id,
        setor_destino_id=body.setor_destino_id,
        prioridade=body.prioridade,
        prazo=body.prazo,
        tarefa_pai_id=body.tarefa_pai_id,
        recorrente=body.recorrente,
        intervalo_recorrencia_dias=body.intervalo_recorrencia_dias,
    )
    db.add(tarefa)
    await db.flush()

    await registrar_evento(
        db,
        convenio_id=tarefa.convenio_id,
        tipo_evento=TipoEvento.TAREFA_CRIADA,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' criada na etapa '{etapa.nome}'",
        tarefa_id=tarefa.id,
        metadados={"prazo": tarefa.prazo.isoformat() if tarefa.prazo else None, "prioridade": tarefa.prioridade.value},
    )

    if body.atribuida_a_id:
        await registrar_evento(
            db,
            convenio_id=tarefa.convenio_id,
            tipo_evento=TipoEvento.TAREFA_ATRIBUIDA,
            ator_id=user.id,
            descricao=f"Tarefa '{tarefa.titulo}' atribuída",
            tarefa_id=tarefa.id,
        )
        await notificar_atribuicao_tarefa(
            db, tarefa.id, tarefa.convenio_id, body.atribuida_a_id, tarefa.titulo
        )

    await db.commit()
    await db.refresh(tarefa)

    # Retorna warning como header se existir
    return tarefa


@router.get("/tarefas/{tarefa_id}", response_model=TarefaOut)
async def obter_tarefa(
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tarefa)
        .where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
        .options(
            selectinload(Tarefa.anexos),
            selectinload(Tarefa.comentarios),
            selectinload(Tarefa.contestacoes),
        )
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return tarefa


@router.patch("/tarefas/{tarefa_id}", response_model=TarefaOut)
async def atualizar_tarefa(
    tarefa_id: uuid.UUID,
    body: TarefaUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Tarefa).where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if body.titulo is not None:
        tarefa.titulo = body.titulo
    if body.descricao is not None:
        tarefa.descricao = body.descricao
    if body.atribuida_a_id is not None:
        old_assignee = tarefa.atribuida_a_id
        tarefa.atribuida_a_id = body.atribuida_a_id
        if body.atribuida_a_id != old_assignee:
            await notificar_atribuicao_tarefa(
                db, tarefa.id, tarefa.convenio_id, body.atribuida_a_id, tarefa.titulo
            )
    if body.setor_destino_id is not None:
        tarefa.setor_destino_id = body.setor_destino_id
    if body.prioridade is not None:
        tarefa.prioridade = body.prioridade
    if body.prazo is not None:
        old_prazo = tarefa.prazo
        tarefa.prazo = body.prazo
        old_str = old_prazo.strftime("%d/%m/%Y") if old_prazo else "(sem prazo)"
        await registrar_evento(
            db,
            convenio_id=tarefa.convenio_id,
            tipo_evento=TipoEvento.PRAZO_DEFINIDO,
            ator_id=user.id,
            descricao=f"Prazo alterado de {old_str} para {body.prazo.strftime('%d/%m/%Y')}",
            tarefa_id=tarefa.id,
            metadados={"prazo_anterior": old_prazo.isoformat() if old_prazo else None, "prazo_novo": body.prazo.isoformat()},
        )

    await db.commit()
    await db.refresh(tarefa)
    return tarefa


@router.post("/tarefas/{tarefa_id}/aceitar", response_model=TarefaOut)
async def aceitar_tarefa_endpoint(
    tarefa_id: uuid.UUID,
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
        raise HTTPException(status_code=403, detail="Tarefa atribuída a outro usuário")

    await aceitar_tarefa(tarefa, db)
    if not tarefa.atribuida_a_id:
        tarefa.atribuida_a_id = user.id

    await registrar_evento(
        db,
        convenio_id=tarefa.convenio_id,
        tipo_evento=TipoEvento.TAREFA_ACEITA,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' aceita",
        tarefa_id=tarefa.id,
    )
    await db.commit()
    await db.refresh(tarefa)
    return tarefa


@router.post("/tarefas/{tarefa_id}/entregar", response_model=TarefaOut)
async def entregar_tarefa_endpoint(
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tarefa)
        .where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
        .options(selectinload(Tarefa.anexos))
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if tarefa.atribuida_a_id and tarefa.atribuida_a_id != user.id:
        raise HTTPException(status_code=403, detail="Tarefa atribuída a outro usuário")

    await entregar_tarefa(tarefa, db)

    # Encontra o assessor (criador da tarefa ou responsável do convênio)
    await registrar_evento(
        db,
        convenio_id=tarefa.convenio_id,
        tipo_evento=TipoEvento.TAREFA_ENTREGUE,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' entregue",
        tarefa_id=tarefa.id,
    )
    await notificar_tarefa_entregue(
        db, tarefa.id, tarefa.convenio_id, tarefa.criada_por_id, tarefa.titulo
    )
    await db.commit()
    await db.refresh(tarefa)
    return tarefa


@router.post("/tarefas/{tarefa_id}/devolver", response_model=TarefaOut)
async def devolver_tarefa_endpoint(
    tarefa_id: uuid.UUID,
    comentario: ComentarioCreate | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Tarefa).where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    if not comentario or not comentario.texto.strip():
        raise HTTPException(status_code=400, detail="Comentário é obrigatório para devolução")

    await devolver_tarefa(tarefa, db)

    # Adiciona comentário de devolução
    c = Comentario(
        tarefa_id=tarefa.id,
        autor_id=user.id,
        texto=comentario.texto,
    )
    db.add(c)

    await registrar_evento(
        db,
        convenio_id=tarefa.convenio_id,
        tipo_evento=TipoEvento.TAREFA_DEVOLVIDA,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' devolvida para ajustes",
        tarefa_id=tarefa.id,
        metadados={"motivo": comentario.texto[:500]},
    )

    if tarefa.atribuida_a_id:
        await notificar_tarefa_devolvida(
            db, tarefa.id, tarefa.convenio_id, tarefa.atribuida_a_id, tarefa.titulo
        )

    await db.commit()
    await db.refresh(tarefa)
    return tarefa


@router.post("/tarefas/{tarefa_id}/concluir", response_model=TarefaOut)
async def concluir_tarefa_endpoint(
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Tarefa).where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    await concluir_tarefa(tarefa, db)

    await registrar_evento(
        db,
        convenio_id=tarefa.convenio_id,
        tipo_evento=TipoEvento.TAREFA_CONCLUIDA,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' concluída",
        tarefa_id=tarefa.id,
    )
    await db.commit()
    await db.refresh(tarefa)
    return tarefa


@router.post("/tarefas/{tarefa_id}/cancelar", response_model=TarefaOut)
async def cancelar_tarefa_endpoint(
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Tarefa).where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    await cancelar_tarefa(tarefa, db)

    await registrar_evento(
        db,
        convenio_id=tarefa.convenio_id,
        tipo_evento=TipoEvento.STATUS_ALTERADO,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' cancelada",
        tarefa_id=tarefa.id,
    )
    await db.commit()
    await db.refresh(tarefa)
    return tarefa


@router.post("/tarefas/{tarefa_id}/comentarios", response_model=ComentarioOut, status_code=201)
async def adicionar_comentario(
    tarefa_id: uuid.UUID,
    body: ComentarioCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tarefa).where(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None))
    )
    tarefa = result.scalar_one_or_none()
    if not tarefa:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    comentario = Comentario(
        tarefa_id=tarefa_id,
        autor_id=user.id,
        texto=body.texto,
    )
    db.add(comentario)
    await db.commit()
    await db.refresh(comentario)
    return comentario
