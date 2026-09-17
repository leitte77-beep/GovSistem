"""Rotas da demanda — o núcleo do GovTask.

Autorização em duas camadas: a permissão granular (o que o usuário pode fazer)
e o escopo de visibilidade (quais demandas ele enxerga, sempre dentro do seu
município). Toda mudança relevante grava um evento imutável na timeline.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.checklist import Checklist
from app.models.catalogo import CategoriaDemanda, DemandaTag, StatusDemanda, Tag
from app.models.demanda import Demanda
from app.models.demanda_participante import DemandaSeguidor
from app.models.enums import PrioridadeDemanda, TipoEvento
from app.models.evento_timeline import EventoTimeline
from app.models.protocolo_externo import ProtocoloExterno
from app.models.tarefa import Tarefa
from app.models.user import User
from app.schemas.demanda import (
    AlterarStatusRequest,
    BloquearRequest,
    CancelarRequest,
    ChecagemConclusao,
    ConcluirRequest,
    DemandaCreate,
    DemandaDetailOut,
    DemandaListItem,
    DemandaPage,
    DemandaUpdate,
    ProximaAcaoRequest,
    ReabrirRequest,
)
from app.services import demandas as svc
from app.services.busca import aplicar_busca
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/demandas", tags=["Demandas"])

# Ordenações permitidas — evita ordenar por coluna arbitrária vinda do cliente.
ORDENACOES = {
    "numero": Demanda.sequencial,
    "titulo": Demanda.titulo,
    "prazo": Demanda.prazo_final,
    "movimentacao": Demanda.ultima_movimentacao_em,
    "criacao": Demanda.created_at,
}

CARREGAMENTO_LISTA = (
    selectinload(Demanda.tipo),
    selectinload(Demanda.categoria),
    selectinload(Demanda.status),
    selectinload(Demanda.responsavel_geral),
    selectinload(Demanda.responsavel_atual),
    selectinload(Demanda.setor_atual),
    selectinload(Demanda.tags).selectinload(DemandaTag.tag),
)


def _serializar(demanda: Demanda, schema=DemandaListItem):
    item = schema.model_validate(demanda)
    item.atrasada = demanda.atrasada
    item.dias_sem_movimentacao = demanda.dias_sem_movimentacao
    return item


async def _vincular_tags(
    db: AsyncSession, demanda: Demanda, rotulos: list[str], organization_id: uuid.UUID
) -> None:
    """Cria as tags que ainda não existem no tenant e vincula todas à demanda."""
    for rotulo in {r.strip() for r in rotulos if r and r.strip()}:
        slug = rotulo.lower().replace(" ", "-")[:80]
        tag = (
            await db.execute(
                select(Tag).where(
                    Tag.organization_id == organization_id,
                    Tag.slug == slug,
                    Tag.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if tag is None:
            tag = Tag(organization_id=organization_id, slug=slug, rotulo=rotulo)
            db.add(tag)
            await db.flush()
        db.add(DemandaTag(demanda_id=demanda.id, tag_id=tag.id))


# ── Listagem e busca ────────────────────────────────────────────────────────

@router.get("", response_model=DemandaPage)
async def listar_demandas(
    q: str | None = Query(None, description="Busca por número, título, objeto ou assunto"),
    status_id: uuid.UUID | None = None,
    tipo_id: uuid.UUID | None = None,
    categoria_id: uuid.UUID | None = None,
    prioridade: PrioridadeDemanda | None = None,
    responsavel_geral_id: uuid.UUID | None = None,
    responsavel_atual_id: uuid.UUID | None = None,
    setor_atual_id: uuid.UUID | None = None,
    autoridade_id: uuid.UUID | None = None,
    exercicio: int | None = None,
    tag: str | None = None,
    atrasadas: bool | None = Query(None, description="Somente demandas fora do prazo"),
    sem_movimentacao_dias: int | None = Query(None, ge=1, le=365),
    aguardando_externo: bool | None = None,
    bloqueadas: bool | None = None,
    minhas: bool | None = Query(None, description="Demandas sob minha responsabilidade"),
    seguindo: bool | None = Query(None, description="Demandas que eu acompanho"),
    incluir_rascunhos: bool = False,
    incluir_arquivadas: bool = False,
    encerradas: bool | None = Query(None, description="true=só encerradas, false=só abertas"),
    ordenar_por: str = Query("movimentacao", pattern="^(numero|titulo|prazo|movimentacao|criacao)$"),
    ordem: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    permissoes = get_user_permissions(user)
    stmt = svc.aplicar_escopo(
        select(Demanda), user, permissoes, incluir_arquivadas=incluir_arquivadas
    )

    if not incluir_rascunhos:
        # Rascunho é privado de quem o criou até ser publicado.
        stmt = stmt.where(
            or_(Demanda.is_rascunho.is_(False), Demanda.criado_por_id == user.id)
        )

    if q:
        # Full-text no PostgreSQL (índice GIN sobre `busca_tsv`), ILIKE fora dele.
        stmt = aplicar_busca(stmt, db, q)
    if status_id:
        stmt = stmt.where(Demanda.status_id == status_id)
    if tipo_id:
        stmt = stmt.where(Demanda.tipo_id == tipo_id)
    if categoria_id:
        stmt = stmt.where(Demanda.categoria_id == categoria_id)
    if prioridade:
        stmt = stmt.where(Demanda.prioridade == prioridade.value)
    if responsavel_geral_id:
        stmt = stmt.where(Demanda.responsavel_geral_id == responsavel_geral_id)
    if responsavel_atual_id:
        stmt = stmt.where(Demanda.responsavel_atual_id == responsavel_atual_id)
    if setor_atual_id:
        stmt = stmt.where(Demanda.setor_atual_id == setor_atual_id)
    if autoridade_id:
        stmt = stmt.where(Demanda.autoridade_id == autoridade_id)
    if exercicio:
        stmt = stmt.where(Demanda.exercicio == exercicio)
    if bloqueadas is not None:
        stmt = stmt.where(Demanda.bloqueada.is_(bloqueadas))
    if minhas:
        stmt = stmt.where(
            or_(
                Demanda.responsavel_geral_id == user.id,
                Demanda.responsavel_atual_id == user.id,
                Demanda.gestor_id == user.id,
            )
        )
    if seguindo:
        seguidas = (
            select(DemandaSeguidor.demanda_id)
            .where(DemandaSeguidor.user_id == user.id)
            .scalar_subquery()
        )
        stmt = stmt.where(Demanda.id.in_(seguidas))
    if tag:
        com_tag = (
            select(DemandaTag.demanda_id)
            .join(Tag, Tag.id == DemandaTag.tag_id)
            .where(Tag.organization_id == user.organization_id, Tag.slug == tag.lower())
            .scalar_subquery()
        )
        stmt = stmt.where(Demanda.id.in_(com_tag))

    agora = datetime.now(timezone.utc)
    if encerradas is True:
        stmt = stmt.where(Demanda.concluida_em.is_not(None))
    elif encerradas is False:
        stmt = stmt.where(Demanda.concluida_em.is_(None))
    if atrasadas:
        stmt = stmt.where(
            Demanda.concluida_em.is_(None),
            Demanda.prazo_final.is_not(None),
            Demanda.prazo_final < agora,
        )
    if sem_movimentacao_dias:
        from datetime import timedelta

        corte = agora - timedelta(days=sem_movimentacao_dias)
        stmt = stmt.where(
            Demanda.concluida_em.is_(None), Demanda.ultima_movimentacao_em < corte
        )
    if aguardando_externo:
        externos = (
            select(StatusDemanda.id)
            .where(StatusDemanda.is_aguardando_externo.is_(True))
            .scalar_subquery()
        )
        stmt = stmt.where(
            or_(Demanda.status_id.in_(externos), Demanda.aguardando_terceiro.is_not(None))
        )

    total = (
        await db.execute(select(func.count()).select_from(stmt.subquery()))
    ).scalar_one()

    coluna = ORDENACOES[ordenar_por]
    stmt = stmt.order_by(coluna.desc() if ordem == "desc" else coluna.asc())
    stmt = stmt.options(*CARREGAMENTO_LISTA).offset((page - 1) * page_size).limit(page_size)

    demandas = (await db.execute(stmt)).scalars().unique().all()
    return DemandaPage(
        items=[_serializar(d) for d in demandas],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


# ── Criação e edição ────────────────────────────────────────────────────────

@router.post("", response_model=DemandaDetailOut, status_code=status.HTTP_201_CREATED)
async def criar_demanda(
    payload: DemandaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_CREATE)),
):
    dados = payload.model_dump(exclude_unset=False, exclude={"rascunho", "tags"})
    demanda = await svc.criar_demanda(db, dados, user, rascunho=payload.rascunho)
    if payload.tags:
        await _vincular_tags(db, demanda, payload.tags, user.organization_id)
    await db.commit()
    return await _detalhe(db, demanda.id, user)


async def _detalhe(db: AsyncSession, demanda_id: uuid.UUID, user: User) -> DemandaDetailOut:
    # populate_existing: a sessão mantém objetos após o commit
    # (expire_on_commit=False), então sem isso o detalhe voltaria com o estado
    # anterior das relações recém-alteradas.
    stmt = (
        select(Demanda)
        .where(Demanda.id == demanda_id)
        .options(*CARREGAMENTO_LISTA)
        .execution_options(populate_existing=True)
    )
    demanda = (await db.execute(stmt)).scalar_one()
    return _serializar(demanda, DemandaDetailOut)


@router.get("/{demanda_id}", response_model=DemandaDetailOut)
async def obter_demanda(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await svc.get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return await _detalhe(db, demanda_id, user)


@router.patch("/{demanda_id}", response_model=DemandaDetailOut)
async def atualizar_demanda(
    demanda_id: uuid.UUID,
    payload: DemandaUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    if demanda.concluida_em is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Demanda concluída: reabra antes de editar",
        )

    alteracoes = payload.model_dump(exclude_unset=True)
    for campo in ("tipo_id", "categoria_id", "subcategoria_id"):
        if campo in alteracoes:
            modelo = CategoriaDemanda if "categoria" in campo else None
            if modelo is not None:
                await svc.resolver_catalogo(
                    db, modelo, alteracoes[campo], user.organization_id, "Categoria"
                )

    antes = {c: getattr(demanda, c) for c in alteracoes}
    for campo, valor in alteracoes.items():
        setattr(demanda, campo, valor)
    await svc.marcar_movimentacao(demanda)

    if alteracoes:
        await registrar_evento(
            db,
            tipo_evento=TipoEvento.DEMANDA_ATUALIZADA,
            ator_id=user.id,
            descricao=f"Demanda atualizada: {', '.join(sorted(alteracoes))}",
            demanda_id=demanda.id,
            metadados={
                "antes": {k: str(v) for k, v in antes.items()},
                "depois": {k: str(v) for k, v in alteracoes.items()},
            },
        )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


@router.post("/{demanda_id}/publicar", response_model=DemandaDetailOut)
async def publicar_rascunho(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT, Perm.RESOURCE_CREATE)),
):
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    if not demanda.is_rascunho:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Demanda já está publicada"
        )
    demanda.is_rascunho = False
    demanda.status_id = (
        await svc.status_inicial(db, user.organization_id, rascunho=False)
    ).id
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_PUBLICADA,
        ator_id=user.id,
        descricao=f"Demanda {demanda.numero} publicada",
        demanda_id=demanda.id,
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


# ── Situação ────────────────────────────────────────────────────────────────

@router.post("/{demanda_id}/status", response_model=DemandaDetailOut)
async def alterar_status(
    demanda_id: uuid.UUID,
    payload: AlterarStatusRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    novo = await svc.resolver_catalogo(
        db, StatusDemanda, payload.status_id, user.organization_id, "Status"
    )
    if novo.is_final:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status final se aplica por concluir/cancelar/arquivar, não por troca direta",
        )
    anterior = demanda.status.chave if demanda.status else None
    demanda.status_id = novo.id
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_STATUS_ALTERADO,
        ator_id=user.id,
        descricao=f"Situação alterada de '{anterior}' para '{novo.rotulo}'",
        demanda_id=demanda.id,
        metadados={
            "antes": anterior,
            "depois": novo.chave,
            "justificativa": payload.justificativa,
        },
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


@router.post("/{demanda_id}/bloquear", response_model=DemandaDetailOut)
async def bloquear(
    demanda_id: uuid.UUID,
    payload: BloquearRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    agora = datetime.now(timezone.utc)
    demanda.bloqueada = True
    demanda.bloqueio_motivo = payload.motivo
    demanda.bloqueio_desde = agora
    demanda.bloqueio_previsao = payload.previsao_solucao
    if payload.aguardando_terceiro:
        demanda.aguardando_terceiro = payload.aguardando_terceiro
        demanda.aguardando_desde = agora
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_BLOQUEADA,
        ator_id=user.id,
        descricao=f"Demanda bloqueada: {payload.motivo}",
        demanda_id=demanda.id,
        metadados={"previsao": str(payload.previsao_solucao)},
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


@router.post("/{demanda_id}/desbloquear", response_model=DemandaDetailOut)
async def desbloquear(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    if not demanda.bloqueada:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Demanda não está bloqueada"
        )
    motivo_anterior = demanda.bloqueio_motivo
    demanda.bloqueada = False
    demanda.bloqueio_motivo = None
    demanda.bloqueio_desde = None
    demanda.bloqueio_previsao = None
    demanda.aguardando_terceiro = None
    demanda.aguardando_desde = None
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_DESBLOQUEADA,
        ator_id=user.id,
        descricao="Bloqueio removido",
        demanda_id=demanda.id,
        metadados={"motivo_anterior": motivo_anterior},
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


@router.post("/{demanda_id}/proxima-acao", response_model=DemandaDetailOut)
async def definir_proxima_acao(
    demanda_id: uuid.UUID,
    payload: ProximaAcaoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Deixa explícito o que falta para a demanda andar (§16)."""
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    demanda.proxima_acao = payload.descricao
    demanda.proxima_acao_responsavel_id = payload.responsavel_id
    demanda.proxima_acao_prazo = payload.prazo
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.PROXIMA_ACAO_DEFINIDA,
        ator_id=user.id,
        descricao=f"Próxima ação: {payload.descricao}",
        demanda_id=demanda.id,
        metadados={"prazo": str(payload.prazo)},
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


# ── Encerramento ────────────────────────────────────────────────────────────

async def _checar_conclusao(db: AsyncSession, demanda: Demanda) -> ChecagemConclusao:
    tarefas_abertas = (
        await db.execute(
            select(func.count())
            .select_from(Tarefa)
            .where(
                Tarefa.demanda_id == demanda.id,
                Tarefa.deleted_at.is_(None),
                Tarefa.status.not_in(("CONCLUIDA", "CANCELADA")),
            )
        )
    ).scalar_one()
    protocolos_pendentes = (
        await db.execute(
            select(func.count())
            .select_from(ProtocoloExterno)
            .where(
                ProtocoloExterno.demanda_id == demanda.id,
                ProtocoloExterno.deleted_at.is_(None),
                ProtocoloExterno.situacao.not_in(("APROVADO", "REJEITADO", "ARQUIVADO")),
            )
        )
    ).scalar_one()

    # Checklists obrigatórios com item pendente impedem a conclusão; os demais
    # entram como alerta que o usuário pode confirmar com `forcar`.
    checklists = (
        (
            await db.execute(
                select(Checklist)
                .where(
                    Checklist.demanda_id == demanda.id,
                    Checklist.deleted_at.is_(None),
                )
                .options(selectinload(Checklist.itens))
            )
        )
        .scalars()
        .all()
    )
    pendencias_bloqueantes: list[str] = []
    pendencias_avisadas: list[str] = []
    for checklist in checklists:
        pendentes = checklist.pendencias_obrigatorias
        if not pendentes:
            continue
        rotulo = f"{checklist.titulo}: {', '.join(pendentes)}"
        if checklist.obrigatorio:
            pendencias_bloqueantes.append(rotulo)
        else:
            pendencias_avisadas.append(rotulo)

    impedimentos: list[str] = []
    alertas: list[str] = []
    if demanda.concluida_em is not None:
        impedimentos.append("Demanda já está concluída")
    if demanda.bloqueada:
        impedimentos.append(f"Demanda bloqueada: {demanda.bloqueio_motivo}")
    if tarefas_abertas:
        alertas.append(f"{tarefas_abertas} tarefa(s) ainda em aberto")
    if protocolos_pendentes:
        alertas.append(f"{protocolos_pendentes} protocolo(s) sem desfecho no órgão externo")
    if demanda.valor_aprovado and not demanda.valor_executado:
        alertas.append("Valor aprovado sem execução financeira registrada")
    for rotulo in pendencias_bloqueantes:
        impedimentos.append(f"Checklist obrigatório incompleto — {rotulo}")
    for rotulo in pendencias_avisadas:
        alertas.append(f"Checklist incompleto — {rotulo}")

    return ChecagemConclusao(
        pode_concluir=not impedimentos,
        impedimentos=impedimentos,
        alertas=alertas,
        tarefas_abertas=tarefas_abertas,
        protocolos_pendentes=protocolos_pendentes,
        checklists_pendentes=pendencias_bloqueantes + pendencias_avisadas,
    )


@router.get("/{demanda_id}/checagem-conclusao", response_model=ChecagemConclusao)
async def checar_conclusao(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return await _checar_conclusao(db, demanda)


@router.post("/{demanda_id}/concluir", response_model=DemandaDetailOut)
async def concluir(
    demanda_id: uuid.UUID,
    payload: ConcluirRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Conclui a demanda. Nunca silenciosamente: exige resultado e checa pendências."""
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    checagem = await _checar_conclusao(db, demanda)
    if checagem.impedimentos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "Demanda não pode ser concluída", "impedimentos": checagem.impedimentos},
        )
    if checagem.alertas and not payload.forcar:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "detail": "Existem pendências; confirme para concluir mesmo assim",
                "alertas": checagem.alertas,
            },
        )

    agora = datetime.now(timezone.utc)
    demanda.concluida_em = agora
    demanda.resultado_final = payload.resultado
    demanda.progresso = 100
    if payload.valor_final is not None:
        demanda.valor_executado = payload.valor_final
    if payload.observacoes:
        demanda.observacoes = payload.observacoes
    final = (
        await db.execute(
            select(StatusDemanda)
            .where(
                StatusDemanda.chave == "CONCLUIDA",
                or_(
                    StatusDemanda.organization_id == user.organization_id,
                    StatusDemanda.organization_id.is_(None),
                ),
            )
            .order_by(StatusDemanda.organization_id.is_(None))
        )
    ).scalars().first()
    if final:
        demanda.status_id = final.id
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_CONCLUIDA,
        ator_id=user.id,
        descricao=f"Demanda concluída: {payload.resultado}",
        demanda_id=demanda.id,
        metadados={
            "alertas_ignorados": checagem.alertas if payload.forcar else [],
            "valor_final": str(payload.valor_final) if payload.valor_final else None,
        },
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


@router.post("/{demanda_id}/reabrir", response_model=DemandaDetailOut)
async def reabrir(
    demanda_id: uuid.UUID,
    payload: ReabrirRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG, Perm.RESOURCE_DELETE)),
):
    """Reabertura é restrita e sempre justificada (§143)."""
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    if demanda.concluida_em is None and demanda.arquivada_em is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Demanda não está encerrada"
        )
    demanda.concluida_em = None
    demanda.arquivada_em = None
    aberta = await svc.status_inicial(db, user.organization_id, rascunho=False)
    if aberta:
        demanda.status_id = aberta.id
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_REABERTA,
        ator_id=user.id,
        descricao=f"Demanda reaberta: {payload.justificativa}",
        demanda_id=demanda.id,
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


@router.post("/{demanda_id}/cancelar", response_model=DemandaDetailOut)
async def cancelar(
    demanda_id: uuid.UUID,
    payload: CancelarRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_DELETE)),
):
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    if demanda.concluida_em is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Demanda concluída não pode ser cancelada"
        )
    demanda.motivo_cancelamento = payload.motivo
    demanda.concluida_em = datetime.now(timezone.utc)
    cancelada = (
        await db.execute(
            select(StatusDemanda)
            .where(
                StatusDemanda.chave == "CANCELADA",
                or_(
                    StatusDemanda.organization_id == user.organization_id,
                    StatusDemanda.organization_id.is_(None),
                ),
            )
            .order_by(StatusDemanda.organization_id.is_(None))
        )
    ).scalars().first()
    if cancelada:
        demanda.status_id = cancelada.id
    await svc.marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_CANCELADA,
        ator_id=user.id,
        descricao=f"Demanda cancelada: {payload.motivo}",
        demanda_id=demanda.id,
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


@router.post("/{demanda_id}/arquivar", response_model=DemandaDetailOut)
async def arquivar(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Arquiva uma demanda encerrada: sai das listas, continua pesquisável (§142)."""
    permissoes = get_user_permissions(user)
    demanda = await svc.get_demanda_ou_404(db, demanda_id, user, permissoes)
    if demanda.concluida_em is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só demandas encerradas podem ser arquivadas",
        )
    demanda.arquivada_em = datetime.now(timezone.utc)
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_ARQUIVADA,
        ator_id=user.id,
        descricao="Demanda arquivada",
        demanda_id=demanda.id,
    )
    await db.commit()
    return await _detalhe(db, demanda_id, user)


# ── Acompanhar / favoritar ──────────────────────────────────────────────────

@router.post("/{demanda_id}/seguir", status_code=status.HTTP_204_NO_CONTENT)
async def seguir(
    demanda_id: uuid.UUID,
    favorito: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await svc.get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    registro = (
        await db.execute(
            select(DemandaSeguidor).where(
                DemandaSeguidor.demanda_id == demanda_id,
                DemandaSeguidor.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if registro is None:
        db.add(DemandaSeguidor(demanda_id=demanda_id, user_id=user.id, favorito=favorito))
    else:
        registro.favorito = favorito
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{demanda_id}/seguir", status_code=status.HTTP_204_NO_CONTENT)
async def deixar_de_seguir(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    registro = (
        await db.execute(
            select(DemandaSeguidor).where(
                DemandaSeguidor.demanda_id == demanda_id,
                DemandaSeguidor.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if registro is not None:
        await db.delete(registro)
        await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Timeline ────────────────────────────────────────────────────────────────

@router.get("/{demanda_id}/timeline")
async def timeline(
    demanda_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await svc.get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    base = select(EventoTimeline).where(EventoTimeline.demanda_id == demanda_id)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    eventos = (
        await db.execute(
            base.options(selectinload(EventoTimeline.ator))
            .order_by(EventoTimeline.ocorrido_em.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": str(e.id),
                "tipo_evento": e.tipo_evento,
                "descricao": e.descricao,
                "ocorrido_em": e.ocorrido_em,
                "ator": {"id": str(e.ator.id), "name": e.ator.name} if e.ator else None,
                "metadados": e.metadados,
            }
            for e in eventos
        ],
    }
