"""O fluxo de trabalho do módulo, em três endpoints.

O ciclo real é sempre o mesmo: o assessor encaminha uma demanda ao
departamento, o departamento devolve, o assessor analisa e protocola no
governo. Estes endpoints entregam exatamente esse recorte — cada tela de
trabalho faz uma chamada, sem varrer setor por setor no navegador.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.convenio import Convenio
from app.models.diligencia import Diligencia
from app.models.enums import Prioridade, TipoEvento
from app.models.etapa import Etapa
from app.models.setor import Setor
from app.models.tarefa import Tarefa
from app.models.user import User
from app.services.notifications import notificar_atribuicao_tarefa
from app.services.timeline import registrar_evento

router = APIRouter(tags=["fluxo"])

# Status em que a demanda está com o departamento.
COM_O_SETOR = ["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]


# ── Saída ───────────────────────────────────────────────────────────────────

class DemandaItem(BaseModel):
    id: uuid.UUID
    titulo: str
    convenio_id: uuid.UUID
    processo: str | None = None
    setor: str | None = None
    setor_id: uuid.UUID | None = None
    responsavel: str | None = None
    status: str
    prioridade: str
    prazo: datetime | None = None
    prazo_interno: datetime | None = None
    atrasada: bool = False
    dias_parada: int | None = None


class SetorResumo(BaseModel):
    setor_id: uuid.UUID | None = None
    setor: str
    total: int
    atrasadas: int
    demandas: list[DemandaItem] = []


class ProcessoPendente(BaseModel):
    id: uuid.UUID
    titulo: str
    situacao: str | None = None
    etapa_atual: str | None = None
    dias_parado: int | None = None


class MesaDoAssessor(BaseModel):
    """As cinco perguntas do coordenador, na ordem em que ele trabalha."""

    para_analisar: list[DemandaItem]      # setor entregou, preciso conferir
    devolvidas: list[DemandaItem]         # devolvi para correção, aguardo
    nos_setores: list[SetorResumo]        # está com os departamentos
    para_protocolar: list[ProcessoPendente]   # pronto, falta protocolar no governo
    aguardando_governo: list[ProcessoPendente]
    prazos_criticos: list[DemandaItem]
    sem_movimentacao: list[ProcessoPendente]


class CaixaDoDepartamento(BaseModel):
    """O que chegou para mim/meu setor, no estado em que está."""

    novas: list[DemandaItem]
    em_andamento: list[DemandaItem]
    devolvidas: list[DemandaItem]
    aguardando_analise: list[DemandaItem]


# ── Helpers ─────────────────────────────────────────────────────────────────

def _dias_desde(momento: datetime | None) -> int | None:
    if not momento:
        return None
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - momento).days


def _demanda(t: Tarefa) -> DemandaItem:
    agora = datetime.now(timezone.utc)
    prazo = t.prazo_interno or t.prazo
    if prazo and prazo.tzinfo is None:
        prazo = prazo.replace(tzinfo=timezone.utc)
    aberta = t.status not in ("CONCLUIDA", "CANCELADA")
    return DemandaItem(
        id=t.id,
        titulo=t.titulo,
        convenio_id=t.convenio_id,
        processo=t.convenio.titulo if t.convenio else None,
        setor=t.setor_destino.nome if t.setor_destino else None,
        setor_id=t.setor_destino_id,
        responsavel=t.atribuida_a.name if t.atribuida_a else None,
        status=t.status.value if hasattr(t.status, "value") else str(t.status),
        prioridade=t.prioridade.value if hasattr(t.prioridade, "value") else str(t.prioridade),
        prazo=t.prazo,
        prazo_interno=t.prazo_interno,
        atrasada=bool(prazo and prazo < agora and aberta),
        dias_parada=_dias_desde(t.updated_at),
    )


def _query_tarefas(tenant_id: uuid.UUID):
    return (
        select(Tarefa)
        .options(
            selectinload(Tarefa.convenio),
            selectinload(Tarefa.setor_destino),
            selectinload(Tarefa.atribuida_a),
        )
        .join(Convenio, Tarefa.convenio_id == Convenio.id)
        .where(
            Convenio.organization_id == tenant_id,
            Convenio.deleted_at.is_(None),
            Tarefa.deleted_at.is_(None),
        )
    )


# ── Mesa do assessor ────────────────────────────────────────────────────────

@router.get("/mesa", response_model=MesaDoAssessor)
async def mesa_do_assessor(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_ASSIGN, Perm.RESOURCE_EDIT)),
):
    tenant_id = user.organization_id
    agora = datetime.now(timezone.utc)

    tarefas = (await db.execute(
        _query_tarefas(tenant_id).where(
            Tarefa.status.in_(COM_O_SETOR + ["ENTREGUE", "DEVOLVIDA"])
        ).order_by(Tarefa.prazo.asc().nulls_last())
    )).scalars().all()

    demandas = [_demanda(t) for t in tarefas]

    para_analisar = [d for d in demandas if d.status == "ENTREGUE"]
    devolvidas = [d for d in demandas if d.status == "DEVOLVIDA"]
    com_setor = [d for d in demandas if d.status in COM_O_SETOR]

    # Agrupamento por departamento — o "quem está com a bola".
    por_setor: dict[str, SetorResumo] = {}
    for d in com_setor:
        chave = str(d.setor_id) if d.setor_id else "sem-setor"
        if chave not in por_setor:
            por_setor[chave] = SetorResumo(
                setor_id=d.setor_id, setor=d.setor or "Sem departamento", total=0, atrasadas=0
            )
        resumo = por_setor[chave]
        resumo.total += 1
        if d.atrasada:
            resumo.atrasadas += 1
        resumo.demandas.append(d)
    nos_setores = sorted(por_setor.values(), key=lambda s: (-s.atrasadas, -s.total))

    prazos_criticos = sorted(
        [
            d
            for d in demandas
            if d.status in COM_O_SETOR
            and (
                d.atrasada
                or ((d.prazo_interno or d.prazo) and (d.prazo_interno or d.prazo).replace(tzinfo=timezone.utc) <= agora + timedelta(days=3))  # type: ignore[union-attr]
            )
        ],
        key=lambda d: (not d.atrasada, d.prazo or datetime.max.replace(tzinfo=timezone.utc)),
    )[:15]

    # Processos: o que falta protocolar e o que está com o governo.
    processos = (await db.execute(
        select(Convenio)
        .options(selectinload(Convenio.etapas))
        .where(
            Convenio.organization_id == tenant_id,
            Convenio.deleted_at.is_(None),
            Convenio.status.notin_(["CONCLUIDO", "CANCELADO"]),
        )
        .order_by(Convenio.updated_at.asc())
    )).scalars().all()

    para_protocolar: list[ProcessoPendente] = []
    aguardando_governo: list[ProcessoPendente] = []
    sem_movimentacao: list[ProcessoPendente] = []

    for c in processos:
        etapas = sorted(
            [e for e in (c.etapas or []) if e.deleted_at is None], key=lambda e: e.ordem
        )
        etapa_atual = next(
            (e for e in etapas if e.status in ("EM_ANDAMENTO", "AGUARDANDO_GOVERNO")), None
        )
        parado = _dias_desde(c.updated_at)
        item = ProcessoPendente(
            id=c.id,
            titulo=c.titulo,
            situacao=c.situacao,
            etapa_atual=etapa_atual.nome if etapa_atual else None,
            dias_parado=parado,
        )
        if etapa_atual and etapa_atual.status == "AGUARDANDO_GOVERNO":
            aguardando_governo.append(item)
        elif not c.numero_protocolo_governo:
            para_protocolar.append(item)
        if parado is not None and parado >= 10:
            sem_movimentacao.append(item)

    return MesaDoAssessor(
        para_analisar=para_analisar,
        devolvidas=devolvidas,
        nos_setores=nos_setores,
        para_protocolar=para_protocolar[:10],
        aguardando_governo=aguardando_governo[:10],
        prazos_criticos=prazos_criticos,
        sem_movimentacao=sem_movimentacao[:10],
    )


# ── Caixa do departamento ───────────────────────────────────────────────────

@router.get("/minhas-demandas", response_model=CaixaDoDepartamento)
async def minhas_demandas(
    setor_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Demandas do usuário — as atribuídas a ele e as do setor informado."""
    query = _query_tarefas(user.organization_id).where(
        Tarefa.status.notin_(["CONCLUIDA", "CANCELADA"])
    )
    if setor_id:
        query = query.where(
            (Tarefa.atribuida_a_id == user.id) | (Tarefa.setor_destino_id == setor_id)
        )
    else:
        query = query.where(Tarefa.atribuida_a_id == user.id)

    tarefas = (await db.execute(query.order_by(Tarefa.prazo.asc().nulls_last()))).scalars().all()
    demandas = [_demanda(t) for t in tarefas]

    return CaixaDoDepartamento(
        novas=[d for d in demandas if d.status == "AGUARDANDO_ACEITE"],
        em_andamento=[d for d in demandas if d.status == "EM_ANDAMENTO"],
        devolvidas=[d for d in demandas if d.status == "DEVOLVIDA"],
        aguardando_analise=[d for d in demandas if d.status in ("ENTREGUE", "CONTESTADA")],
    )


# ── Encaminhar demanda para um departamento ─────────────────────────────────

class EncaminharDemanda(BaseModel):
    """O handoff do assessor: assunto, para quem, até quando."""

    setor_destino_id: uuid.UUID
    titulo: str = Field(..., max_length=500)
    descricao: str | None = None
    atribuida_a_id: uuid.UUID | None = None
    prioridade: Prioridade = Prioridade.NORMAL
    prazo: datetime | None = None
    prazo_interno: datetime | None = None
    etapa_id: uuid.UUID | None = None


@router.post("/convenios/{convenio_id}/encaminhar", status_code=201)
async def encaminhar_demanda(
    convenio_id: uuid.UUID,
    body: EncaminharDemanda,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_ASSIGN)),
):
    """Cria a demanda no departamento sem obrigar o assessor a escolher a etapa.

    A etapa é a que estiver em andamento; se o processo ainda não tem etapas,
    uma etapa de demandas internas é aberta para abrigar o encaminhamento.
    """
    convenio = await db.scalar(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    if not convenio:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    setor = await db.scalar(
        select(Setor).where(
            Setor.id == body.setor_destino_id,
            Setor.organization_id == user.organization_id,
            Setor.deleted_at.is_(None),
        )
    )
    if not setor:
        raise HTTPException(status_code=422, detail="Departamento não pertence à organização")

    if body.atribuida_a_id:
        responsavel = await db.scalar(
            select(User).where(
                User.id == body.atribuida_a_id,
                User.organization_id == user.organization_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
            )
        )
        if not responsavel:
            raise HTTPException(status_code=422, detail="Responsável não pertence à organização")

    etapa = await _resolver_etapa(db, convenio_id, body.etapa_id)

    tarefa = Tarefa(
        convenio_id=convenio_id,
        etapa_id=etapa.id,
        titulo=body.titulo,
        descricao=body.descricao,
        criada_por_id=user.id,
        atribuida_a_id=body.atribuida_a_id,
        setor_destino_id=body.setor_destino_id,
        prioridade=body.prioridade,
        prazo=body.prazo,
        prazo_interno=body.prazo_interno,
    )
    db.add(tarefa)
    await db.flush()

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.TAREFA_CRIADA,
        ator_id=user.id,
        descricao=f"Demanda '{tarefa.titulo}' encaminhada para {setor.nome}",
        tarefa_id=tarefa.id,
        metadados={
            "setor": setor.nome,
            "prazo": body.prazo.isoformat() if body.prazo else None,
            "prazo_interno": body.prazo_interno.isoformat() if body.prazo_interno else None,
        },
    )

    if body.atribuida_a_id:
        await notificar_atribuicao_tarefa(
            db, tarefa.id, convenio_id, body.atribuida_a_id, tarefa.titulo
        )

    await db.commit()

    return {
        "id": str(tarefa.id),
        "etapa_id": str(etapa.id),
        "setor": setor.nome,
        "aviso": _aviso_de_prazo(etapa, body),
    }


async def _resolver_etapa(db: AsyncSession, convenio_id: uuid.UUID, etapa_id: uuid.UUID | None) -> Etapa:
    if etapa_id:
        etapa = await db.scalar(
            select(Etapa).where(
                Etapa.id == etapa_id,
                Etapa.convenio_id == convenio_id,
                Etapa.deleted_at.is_(None),
            )
        )
        if not etapa:
            raise HTTPException(status_code=422, detail="Etapa não pertence ao processo")
        return etapa

    etapas = (await db.execute(
        select(Etapa)
        .where(Etapa.convenio_id == convenio_id, Etapa.deleted_at.is_(None))
        .order_by(Etapa.ordem)
    )).scalars().all()

    for e in etapas:
        if e.status == "EM_ANDAMENTO":
            return e
    for e in etapas:
        if e.status == "PENDENTE":
            return e
    if etapas:
        return etapas[-1]

    proxima_ordem = (await db.scalar(
        select(func.coalesce(func.max(Etapa.ordem), 0)).where(Etapa.convenio_id == convenio_id)
    )) or 0
    etapa = Etapa(
        convenio_id=convenio_id,
        nome="Demandas internas",
        ordem=proxima_ordem + 1,
        natureza="INTERNA",
        status="EM_ANDAMENTO",
        data_inicio=datetime.now(timezone.utc),
    )
    db.add(etapa)
    await db.flush()
    return etapa


def _aviso_de_prazo(etapa: Etapa, body: EncaminharDemanda) -> str | None:
    """O prazo interno existe para dar margem antes do prazo do governo (§60)."""
    prazo_governo = etapa.prazo_governo
    if prazo_governo and body.prazo and body.prazo > prazo_governo:
        return (
            f"O prazo desta demanda ({body.prazo.strftime('%d/%m/%Y')}) é posterior ao prazo "
            f"do governo ({prazo_governo.strftime('%d/%m/%Y')}). Considere uma folga para revisar e protocolar."
        )
    return None
