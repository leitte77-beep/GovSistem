import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.etapa import Etapa
from app.models.enums import StatusConvenio, TipoEvento
from app.models.template_fluxo import TemplateFluxo
from app.models.user import User
from app.schemas.convenio import (
    ConvenioCreate,
    ConvenioListItem,
    ConvenioOut,
    ConvenioUpdate,
    ProtocoloRequest,
)
from app.services.timeline import registrar_evento


def _enrich_list_item(convenio: Convenio) -> dict:
    """Adiciona etapa_atual e proximo_prazo computados."""
    from app.models.etapa import Etapa

    etapas: list = sorted((convenio.etapas or []), key=lambda e: e.ordem)
    etapa_atual = None
    proximo_prazo = None

    for e in etapas:
        if e.status not in ("CONCLUIDA",):
            etapa_atual = e.nome
            if e.prazo_governo:
                proximo_prazo = e.prazo_governo
            break

    if not proximo_prazo:
        for e in etapas:
            tarefas = getattr(e, "tarefas", None) or []
            for t in tarefas:
                if t.prazo and t.status not in ("CONCLUIDA", "CANCELADA"):
                    if proximo_prazo is None or t.prazo < proximo_prazo:
                        proximo_prazo = t.prazo

    return {
        "id": convenio.id,
        "titulo": convenio.titulo,
        "tipo": convenio.tipo,
        "origem": convenio.origem,
        "numero_protocolo_governo": convenio.numero_protocolo_governo,
        "valor": convenio.valor,
        "status": convenio.status,
        "etapa_atual": etapa_atual,
        "proximo_prazo": proximo_prazo,
        "responsavel_id": convenio.responsavel_id,
        "created_at": convenio.created_at,
        "updated_at": convenio.updated_at,
    }

router = APIRouter(prefix="/convenios", tags=["convenios"])


@router.get("", response_model=list[ConvenioListItem])
async def listar_convenios(
    status: StatusConvenio | None = Query(None),
    tipo: str | None = Query(None),
    search: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Convenio).where(Convenio.deleted_at.is_(None))
    if status:
        query = query.where(Convenio.status == status)
    if tipo:
        query = query.where(Convenio.tipo == tipo)
    if search:
        query = query.where(
            (Convenio.titulo.ilike(f"%{search}%"))
            | (Convenio.numero_protocolo_governo.ilike(f"%{search}%"))
        )
    query = query.options(selectinload(Convenio.etapas)).offset(skip).limit(limit).order_by(Convenio.updated_at.desc())
    result = await db.execute(query)
    convenios = result.scalars().all()
    return [_enrich_list_item(c) for c in convenios]


@router.post("", response_model=ConvenioOut, status_code=201)
async def criar_convenio(
    body: ConvenioCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    convenio = Convenio(
        titulo=body.titulo,
        descricao=body.descricao,
        tipo=body.tipo,
        origem=body.origem,
        valor=body.valor,
        responsavel_id=user.id,
        template_fluxo_id=body.template_fluxo_id,
    )
    db.add(convenio)
    await db.flush()

    if body.template_fluxo_id:
        template_result = await db.execute(
            select(TemplateFluxo)
            .where(
                TemplateFluxo.id == body.template_fluxo_id,
                TemplateFluxo.deleted_at.is_(None),
            )
            .options(selectinload(TemplateFluxo.etapas))
        )
        template = template_result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=422, detail="Template de fluxo não encontrado")

        for template_etapa in sorted(template.etapas, key=lambda e: e.ordem):
            db.add(
                Etapa(
                    convenio_id=convenio.id,
                    nome=template_etapa.nome,
                    ordem=template_etapa.ordem,
                    natureza=template_etapa.natureza,
                )
            )

    await registrar_evento(
        db,
        convenio_id=convenio.id,
        tipo_evento=TipoEvento.CONVENIO_CRIADO,
        ator_id=user.id,
        descricao=f"Convênio '{convenio.titulo}' criado",
    )
    await db.commit()
    result = await db.execute(
        select(Convenio)
        .where(Convenio.id == convenio.id)
        .options(selectinload(Convenio.etapas))
    )
    convenio = result.scalar_one()
    return convenio


@router.get("/{convenio_id}", response_model=ConvenioOut)
async def obter_convenio(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Convenio)
        .where(Convenio.id == convenio_id, Convenio.deleted_at.is_(None))
        .options(
            selectinload(Convenio.etapas),
            selectinload(Convenio.anexos),
            selectinload(Convenio.tarefas),
        )
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")
    return convenio


@router.patch("/{convenio_id}", response_model=ConvenioOut)
async def atualizar_convenio(
    convenio_id: uuid.UUID,
    body: ConvenioUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Convenio).where(Convenio.id == convenio_id, Convenio.deleted_at.is_(None))
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    old_status = (
        convenio.status
        if isinstance(convenio.status, StatusConvenio)
        else StatusConvenio(convenio.status)
    )

    if body.titulo is not None:
        convenio.titulo = body.titulo
    if body.descricao is not None:
        convenio.descricao = body.descricao
    if body.tipo is not None:
        convenio.tipo = body.tipo
    if body.origem is not None:
        convenio.origem = body.origem
    if body.valor is not None:
        convenio.valor = body.valor
    if body.template_fluxo_id is not None:
        convenio.template_fluxo_id = body.template_fluxo_id

    if body.status is not None and body.status != convenio.status:
        old_status.assert_transition(body.status)
        convenio.status = body.status
        await registrar_evento(
            db,
            convenio_id=convenio.id,
            tipo_evento=TipoEvento.STATUS_ALTERADO,
            ator_id=user.id,
            descricao=f"Status alterado de '{old_status.value}' para '{body.status.value}'",
            metadados={"status_anterior": old_status.value, "status_novo": body.status.value},
        )

    await db.commit()
    result = await db.execute(
        select(Convenio)
        .where(Convenio.id == convenio.id)
        .options(selectinload(Convenio.etapas))
    )
    return result.scalar_one()


@router.post("/{convenio_id}/protocolo", response_model=ConvenioOut)
async def registrar_protocolo(
    convenio_id: uuid.UUID,
    body: ProtocoloRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Convenio).where(Convenio.id == convenio_id, Convenio.deleted_at.is_(None))
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    convenio.numero_protocolo_governo = body.numero_protocolo
    convenio.data_protocolo = body.data_protocolo or datetime.now(timezone.utc)
    if convenio.status == StatusConvenio.RASCUNHO:
        convenio.status = StatusConvenio.EM_ANDAMENTO

    await registrar_evento(
        db,
        convenio_id=convenio.id,
        tipo_evento=TipoEvento.PROTOCOLO_REGISTRADO,
        ator_id=user.id,
        descricao=f"Protocolo {body.numero_protocolo} registrado no governo",
        metadados={"numero_protocolo": body.numero_protocolo},
    )
    await db.commit()
    await db.refresh(convenio)
    return convenio


@router.get("/{convenio_id}/timeline")
async def obter_timeline(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Convenio)
        .where(Convenio.id == convenio_id, Convenio.deleted_at.is_(None))
        .options(selectinload(Convenio.eventos))
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    return [
        {
            "id": str(e.id),
            "tipo_evento": e.tipo_evento.value if hasattr(e.tipo_evento, "value") else e.tipo_evento,
            "ator_id": str(e.ator_id),
            "descricao": e.descricao,
            "metadados": e.metadados,
            "ocorrido_em": e.ocorrido_em.isoformat(),
            "tarefa_id": str(e.tarefa_id) if e.tarefa_id else None,
        }
        for e in convenio.eventos
    ]


@router.delete("/{convenio_id}", status_code=204)
async def excluir_convenio(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Convenio).where(Convenio.id == convenio_id, Convenio.deleted_at.is_(None))
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    convenio.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
