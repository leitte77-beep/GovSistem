"""Tarefas de uma demanda, e a área pessoal "Minhas tarefas".

As rotas ficam aninhadas na demanda de propósito: a autorização da demanda
(tenant + sigilo) é resolvida antes de tocar na tarefa, então não existe
caminho em que alguém alcance uma tarefa de outro município por ID.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.demanda import Demanda
from app.models.enums import (
    StatusTarefa,
    TipoEvento,
    TipoMovimentacaoTarefa,
    TipoTarefa,
)
from app.models.tarefa import Tarefa
from app.models.tarefa_dependencia import TarefaDependencia
from app.models.tarefa_prazo_historico import TarefaPrazoHistorico
from app.models.user import User
from app.schemas.demanda_tarefa import (
    ConcluirTarefaRequest,
    DevolverRequest,
    EncaminharRequest,
    EsperaRequest,
    MinhasTarefasOut,
    SolicitarInformacaoRequest,
    TarefaAtualizar,
    TarefaCriar,
    TarefaDetalhe,
    TarefaOut,
)
from app.services import tarefas as svc_tarefa
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao
from app.models.enums import TipoNotificacao
from app.services.notifications import notificar_tarefa_demanda
from app.services.timeline import registrar_evento
from app.services.workflow import avaliar_avanco

router = APIRouter(tags=["Tarefas da demanda"])

CARREGAMENTO = (
    selectinload(Tarefa.atribuida_a),
    selectinload(Tarefa.setor_destino),
    selectinload(Tarefa.solicitante),
    selectinload(Tarefa.dependencias).selectinload(TarefaDependencia.depende_de),
    selectinload(Tarefa.anexos),
    selectinload(Tarefa.comentarios),
    selectinload(Tarefa.subtarefas),
)


def _com_fuso(momento: datetime | None) -> datetime | None:
    """Normaliza o prazo para UTC.

    Bancos que não guardam fuso devolvem datetime ingênuo; compará-lo com um
    datetime com fuso levanta TypeError.
    """
    if momento is None or momento.tzinfo is not None:
        return momento
    return momento.replace(tzinfo=timezone.utc)


def _serializar(tarefa: Tarefa, schema=TarefaOut):
    item = schema.model_validate(tarefa)
    item.atrasada = tarefa.atrasada
    item.em_espera = tarefa.em_espera
    item.bloqueada_por = tarefa.bloqueada_por
    item.qtd_anexos = len([a for a in tarefa.anexos if a.deleted_at is None])
    item.qtd_comentarios = len(tarefa.comentarios)
    item.qtd_subtarefas_abertas = len(
        [
            s
            for s in tarefa.subtarefas
            if s.deleted_at is None
            and s.status not in (StatusTarefa.CONCLUIDA, StatusTarefa.CANCELADA)
        ]
    )
    return item


async def _carregar(db: AsyncSession, tarefa_id: uuid.UUID, schema=TarefaOut):
    tarefa = (
        await db.execute(
            select(Tarefa)
            .where(Tarefa.id == tarefa_id)
            .options(*CARREGAMENTO, selectinload(Tarefa.movimentacoes))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return _serializar(tarefa, schema)


async def _demanda_editavel(
    db: AsyncSession, demanda_id: uuid.UUID, user: User
) -> Demanda:
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    if demanda.concluida_em is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Demanda encerrada: reabra antes de mexer nas tarefas",
        )
    return demanda


# ── Listagem e criação ──────────────────────────────────────────────────────

@router.get("/demandas/{demanda_id}/tarefas", response_model=list[TarefaOut])
async def listar_tarefas(
    demanda_id: uuid.UUID,
    status_tarefa: StatusTarefa | None = None,
    somente_raiz: bool = Query(False, description="Oculta subtarefas na listagem"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    stmt = (
        select(Tarefa)
        .where(Tarefa.demanda_id == demanda_id, Tarefa.deleted_at.is_(None))
        .options(*CARREGAMENTO)
        .order_by(Tarefa.ordem, Tarefa.created_at)
    )
    if status_tarefa:
        stmt = stmt.where(Tarefa.status == status_tarefa.value)
    if somente_raiz:
        stmt = stmt.where(Tarefa.tarefa_pai_id.is_(None))
    tarefas = (await db.execute(stmt)).scalars().unique().all()
    return [_serializar(t) for t in tarefas]


@router.post(
    "/demandas/{demanda_id}/tarefas",
    response_model=TarefaDetalhe,
    status_code=status.HTTP_201_CREATED,
)
async def criar_tarefa(
    demanda_id: uuid.UUID,
    payload: TarefaCriar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_ASSIGN, Perm.RESOURCE_EDIT)),
):
    demanda = await _demanda_editavel(db, demanda_id, user)

    pai = None
    if payload.tarefa_pai_id:
        pai = await svc_tarefa.get_tarefa_da_demanda(db, demanda, payload.tarefa_pai_id)

    tarefa = await svc_tarefa.criar_tarefa(
        db,
        demanda,
        payload.model_dump(exclude={"tipo", "tarefa_pai_id", "exige_aceite"}),
        user,
        tipo=payload.tipo,
        tarefa_pai=pai,
        exige_aceite=payload.exige_aceite,
    )
    await notificar_tarefa_demanda(
        db, tarefa, TipoNotificacao.TAREFA_ATRIBUIDA, tarefa.atribuida_a_id,
        f"Nova tarefa atribuída a você: {tarefa.titulo}",
    )
    await db.commit()
    return await _carregar(db, tarefa.id, TarefaDetalhe)


@router.get("/demandas/{demanda_id}/tarefas/{tarefa_id}", response_model=TarefaDetalhe)
async def obter_tarefa(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    await svc_tarefa.get_tarefa_da_demanda(db, demanda, tarefa_id)
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.patch("/demandas/{demanda_id}/tarefas/{tarefa_id}", response_model=TarefaDetalhe)
async def atualizar_tarefa(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    payload: TarefaAtualizar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT, Perm.TASK_ASSIGN)),
):
    demanda = await _demanda_editavel(db, demanda_id, user)
    tarefa = await svc_tarefa.get_tarefa_da_demanda(db, demanda, tarefa_id)
    if tarefa.status in (StatusTarefa.CONCLUIDA, StatusTarefa.CANCELADA):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Tarefa encerrada"
        )

    alteracoes = payload.model_dump(exclude_unset=True, exclude={"motivo_prazo"})
    if "prazo" in alteracoes and alteracoes["prazo"] != tarefa.prazo:
        # Mudança de prazo sempre deixa rastro, com o motivo informado.
        db.add(
            TarefaPrazoHistorico(
                tarefa_id=tarefa.id,
                prazo_anterior=tarefa.prazo,
                prazo_novo=alteracoes["prazo"],
                definido_por_id=user.id,
                motivo=payload.motivo_prazo,
                tipo="PRORROGACAO" if tarefa.prazo else "DEFINICAO",
            )
        )
        await registrar_evento(
            db,
            tipo_evento=TipoEvento.PRAZO_PRORROGADO,
            ator_id=user.id,
            descricao=f"Prazo da tarefa '{tarefa.titulo}' alterado",
            demanda_id=demanda.id,
            tarefa_id=tarefa.id,
            metadados={
                "antes": str(tarefa.prazo),
                "depois": str(alteracoes["prazo"]),
                "motivo": payload.motivo_prazo,
            },
        )

    for campo, valor in alteracoes.items():
        setattr(tarefa, campo, valor)
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


# ── Ciclo de vida ───────────────────────────────────────────────────────────

async def _tarefa_do_usuario(
    db: AsyncSession, demanda_id: uuid.UUID, tarefa_id: uuid.UUID, user: User
) -> tuple[Demanda, Tarefa]:
    demanda = await _demanda_editavel(db, demanda_id, user)
    tarefa = await svc_tarefa.get_tarefa_da_demanda(db, demanda, tarefa_id)
    return demanda, tarefa


@router.post("/demandas/{demanda_id}/tarefas/{tarefa_id}/receber", response_model=TarefaDetalhe)
async def receber(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    await svc_tarefa.aceitar(db, tarefa, user)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.TAREFA_ACEITA,
        ator_id=user.id,
        descricao=f"Tarefa recebida: {tarefa.titulo}",
        demanda_id=demanda.id,
        tarefa_id=tarefa.id,
    )
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.post("/demandas/{demanda_id}/tarefas/{tarefa_id}/iniciar", response_model=TarefaDetalhe)
async def iniciar(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    await svc_tarefa.iniciar(db, tarefa, user)
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.post("/demandas/{demanda_id}/tarefas/{tarefa_id}/aguardar", response_model=TarefaDetalhe)
async def aguardar(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    payload: EsperaRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Explicita por que a tarefa parou, em vez de deixá-la 'em andamento'."""
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    await svc_tarefa.colocar_em_espera(tarefa, payload.status, payload.motivo)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.OBSERVACAO_REGISTRADA,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' aguardando: {payload.motivo}",
        demanda_id=demanda.id,
        tarefa_id=tarefa.id,
        metadados={"status": payload.status.value},
    )
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.post("/demandas/{demanda_id}/tarefas/{tarefa_id}/entregar", response_model=TarefaDetalhe)
async def entregar(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    await svc_tarefa.entregar(db, tarefa, user)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.TAREFA_ENTREGUE,
        ator_id=user.id,
        descricao=f"Tarefa entregue: {tarefa.titulo}",
        demanda_id=demanda.id,
        tarefa_id=tarefa.id,
    )
    await notificar_tarefa_demanda(
        db, tarefa, TipoNotificacao.TAREFA_ENTREGUE, tarefa.solicitante_id,
        f"Tarefa '{tarefa.titulo}' foi entregue e aguarda sua revisão.",
    )
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.post("/demandas/{demanda_id}/tarefas/{tarefa_id}/devolver", response_model=TarefaDetalhe)
async def devolver(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    payload: DevolverRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_APPROVE, Perm.RESOURCE_EDIT)),
):
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    await svc_tarefa.devolver(db, tarefa, user, payload.motivo)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.TAREFA_DEVOLVIDA,
        ator_id=user.id,
        descricao=f"Tarefa devolvida para correção: {payload.motivo}",
        demanda_id=demanda.id,
        tarefa_id=tarefa.id,
    )
    await notificar_tarefa_demanda(
        db, tarefa, TipoNotificacao.TAREFA_DEVOLVIDA, tarefa.atribuida_a_id,
        f"Tarefa '{tarefa.titulo}' foi devolvida para ajustes.",
    )
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.post("/demandas/{demanda_id}/tarefas/{tarefa_id}/concluir", response_model=TarefaDetalhe)
async def concluir(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    payload: ConcluirTarefaRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    if tarefa.exige_aprovacao:
        perms = get_user_permissions(user)
        if Perm.TASK_APPROVE not in perms and Perm.ADMIN_CONFIG not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Esta tarefa exige aprovação de quem tem essa permissão",
            )
    await svc_tarefa.concluir(db, tarefa, user, payload.resultado)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.TAREFA_CONCLUIDA,
        ator_id=user.id,
        descricao=f"Tarefa concluída: {tarefa.titulo}",
        demanda_id=demanda.id,
        tarefa_id=tarefa.id,
        metadados={"resultado": payload.resultado},
    )
    # Concluir a tarefa pode fechar a etapa e abrir a seguinte (§80).
    await avaliar_avanco(db, demanda, user)
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.post("/demandas/{demanda_id}/tarefas/{tarefa_id}/encaminhar", response_model=TarefaDetalhe)
async def encaminhar(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    payload: EncaminharRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.TASK_ASSIGN, Perm.RESOURCE_EDIT)),
):
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    await svc_tarefa.encaminhar(
        db,
        tarefa,
        user,
        para_user_id=payload.para_user_id,
        para_setor_id=payload.para_setor_id,
        motivo=payload.motivo,
        prazo=payload.prazo,
        exige_retorno=payload.exige_retorno,
    )
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_ENCAMINHADA,
        ator_id=user.id,
        descricao=f"Tarefa '{tarefa.titulo}' encaminhada",
        demanda_id=demanda.id,
        tarefa_id=tarefa.id,
        metadados={"motivo": payload.motivo, "prazo": str(payload.prazo)},
    )
    await notificar_tarefa_demanda(
        db, tarefa, TipoNotificacao.TAREFA_ATRIBUIDA, tarefa.atribuida_a_id,
        f"Tarefa encaminhada a você: {tarefa.titulo}",
    )
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _carregar(db, tarefa_id, TarefaDetalhe)


@router.post(
    "/demandas/{demanda_id}/tarefas/{tarefa_id}/solicitar-informacao",
    response_model=TarefaDetalhe,
    status_code=status.HTTP_201_CREATED,
)
async def solicitar_informacao(
    demanda_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    payload: SolicitarInformacaoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Cria uma subtarefa para outro setor sem largar a responsabilidade (§23)."""
    demanda, tarefa = await _tarefa_do_usuario(db, demanda_id, tarefa_id, user)
    subtarefa = await svc_tarefa.criar_tarefa(
        db,
        demanda,
        {
            "titulo": payload.titulo,
            "descricao": payload.descricao,
            "atribuida_a_id": payload.atribuida_a_id,
            "setor_destino_id": payload.setor_destino_id,
            "prazo": payload.prazo,
            "exige_retorno": True,
        },
        user,
        tipo=TipoTarefa.INFORMACAO,
        tarefa_pai=tarefa,
    )
    await svc_tarefa.registrar_movimentacao(
        db,
        subtarefa,
        TipoMovimentacaoTarefa.SOLICITACAO_INFORMACAO,
        user,
        para_user_id=payload.atribuida_a_id,
        para_setor_id=payload.setor_destino_id,
        motivo=payload.titulo,
        prazo=payload.prazo,
    )
    await notificar_tarefa_demanda(
        db, subtarefa, TipoNotificacao.TAREFA_ATRIBUIDA, subtarefa.atribuida_a_id,
        f"Pedido de informação: {subtarefa.titulo}",
    )
    await db.commit()
    return await _carregar(db, subtarefa.id, TarefaDetalhe)


# ── Minhas tarefas (§11) ────────────────────────────────────────────────────

@router.get("/minhas-tarefas", response_model=MinhasTarefasOut)
async def minhas_tarefas(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """O que *eu* preciso fazer, já separado por urgência.

    Considera tanto as tarefas atribuídas nominalmente quanto as encaminhadas
    ao meu setor e ainda sem dono, que de outro modo ficariam sem ninguém.
    """
    stmt = (
        select(Tarefa)
        .join(Demanda, Tarefa.demanda_id == Demanda.id)
        .where(
            Demanda.organization_id == user.organization_id,
            Demanda.deleted_at.is_(None),
            Tarefa.deleted_at.is_(None),
            Tarefa.status.not_in(
                (StatusTarefa.CONCLUIDA.value, StatusTarefa.CANCELADA.value)
            ),
            or_(
                Tarefa.atribuida_a_id == user.id,
                Tarefa.solicitante_id == user.id,
            ),
        )
        .options(*CARREGAMENTO)
        .order_by(Tarefa.prazo.is_(None), Tarefa.prazo)
    )
    tarefas = (await db.execute(stmt)).scalars().unique().all()

    agora = datetime.now(timezone.utc)
    fim_do_dia = agora.replace(hour=23, minute=59, second=59, microsecond=0)
    limite_proximas = agora + timedelta(days=7)

    grupos: dict[str, list] = {
        "hoje": [], "atrasadas": [], "proximas": [], "aguardando": [],
        "devolvidas": [], "em_execucao": [], "a_receber": [],
    }
    for t in tarefas:
        item = _serializar(t)
        minha = t.atribuida_a_id == user.id
        if t.atrasada:
            grupos["atrasadas"].append(item)
        else:
            prazo = _com_fuso(t.prazo)
            if prazo is not None and prazo <= fim_do_dia:
                grupos["hoje"].append(item)
            elif prazo is not None and prazo <= limite_proximas:
                grupos["proximas"].append(item)

        estado = StatusTarefa(t.status)
        if estado in StatusTarefa.esperas():
            grupos["aguardando"].append(item)
        elif estado == StatusTarefa.DEVOLVIDA:
            grupos["devolvidas"].append(item)
        elif estado == StatusTarefa.EM_ANDAMENTO:
            grupos["em_execucao"].append(item)
        elif estado == StatusTarefa.AGUARDANDO_ACEITE and minha:
            grupos["a_receber"].append(item)

    return MinhasTarefasOut(**grupos, total=len(tarefas))
