"""Administração dos fluxos e aplicação deles às demandas (§17, §18, §151).

Desenhar fluxo é ato administrativo: exige `admin.config`. Aplicar um fluxo a
uma demanda é operação do dia a dia e exige apenas permissão de edição.

Modelos do sistema (`organization_id` nulo) são visíveis a todos os tenants,
mas ninguém os edita: quem quer mudar um deles o clona para a própria
organização.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.demanda import Demanda
from app.models.enums import StatusWorkflowVersao
from app.models.etapa import Etapa
from app.models.enums import StatusTarefa
from app.models.user import User
from app.models.workflow import (
    Workflow,
    WorkflowEtapa,
    WorkflowTarefaModelo,
    WorkflowVersao,
)
from app.schemas.workflow import (
    AplicarFluxoRequest,
    ConcluirEtapaRequest,
    EtapaAvulsaRequest,
    EtapaInstanciaOut,
    EtapaModeloEntrada,
    VersaoOut,
    WorkflowAtualizar,
    WorkflowCriar,
    WorkflowDetalhe,
    WorkflowListItem,
    PublicarVersaoRequest,
)
from app.services import workflow as motor
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao

router = APIRouter(tags=["Workflows"])

CARREGAMENTO_WF = (
    selectinload(Workflow.versoes)
    .selectinload(WorkflowVersao.etapas)
    .selectinload(WorkflowEtapa.tarefas_modelo),
    selectinload(Workflow.versoes)
    .selectinload(WorkflowVersao.etapas)
    .selectinload(WorkflowEtapa.setor_responsavel),
)


def _resumo(wf: Workflow) -> WorkflowListItem:
    publicada = wf.versao_publicada
    item = WorkflowListItem.model_validate(wf)
    item.versao_atual = publicada.versao if publicada else None
    item.qtd_etapas = len(publicada.etapas) if publicada else 0
    return item


async def _carregar_workflow(
    db: AsyncSession, workflow_id: uuid.UUID, user: User, *, para_editar: bool = False
) -> Workflow:
    wf = (
        await db.execute(
            select(Workflow)
            .where(
                Workflow.id == workflow_id,
                Workflow.deleted_at.is_(None),
                or_(
                    Workflow.organization_id == user.organization_id,
                    Workflow.organization_id.is_(None),
                ),
            )
            .options(*CARREGAMENTO_WF)
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if wf is None:
        raise HTTPException(status_code=404, detail="Fluxo não encontrado")
    if para_editar and wf.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Modelo do sistema não é editável; duplique-o para a sua organização",
        )
    return wf


# ── Catálogo de fluxos ──────────────────────────────────────────────────────

@router.get("/workflows", response_model=list[WorkflowListItem])
async def listar_workflows(
    apenas_ativos: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    stmt = (
        select(Workflow)
        .where(
            Workflow.deleted_at.is_(None),
            or_(
                Workflow.organization_id == user.organization_id,
                Workflow.organization_id.is_(None),
            ),
        )
        .options(*CARREGAMENTO_WF)
        .order_by(Workflow.organization_id.is_(None), Workflow.nome)
    )
    if apenas_ativos:
        stmt = stmt.where(Workflow.ativo.is_(True))
    return [_resumo(wf) for wf in (await db.execute(stmt)).scalars().unique().all()]


@router.post("/workflows", response_model=WorkflowDetalhe, status_code=201)
async def criar_workflow(
    payload: WorkflowCriar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    duplicada = (
        await db.execute(
            select(Workflow).where(
                Workflow.organization_id == user.organization_id,
                Workflow.chave == payload.chave,
                Workflow.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if duplicada is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um fluxo com esta chave nesta organização",
        )

    wf = Workflow(
        organization_id=user.organization_id,
        chave=payload.chave,
        nome=payload.nome,
        descricao=payload.descricao,
        tipo_demanda_id=payload.tipo_demanda_id,
    )
    db.add(wf)
    await db.flush()

    versao = WorkflowVersao(workflow_id=wf.id, versao=1)
    db.add(versao)
    await db.flush()

    if payload.copiar_de_id:
        origem = await _carregar_workflow(db, payload.copiar_de_id, user)
        base = origem.versao_publicada or (origem.versoes[-1] if origem.versoes else None)
        if base is not None:
            await _copiar_etapas(db, base, versao)

    await db.commit()
    return await _detalhe(db, wf.id, user)


async def _copiar_etapas(
    db: AsyncSession, origem: WorkflowVersao, destino: WorkflowVersao
) -> None:
    for etapa in origem.etapas:
        nova = WorkflowEtapa(
            versao_id=destino.id,
            chave=etapa.chave,
            nome=etapa.nome,
            descricao=etapa.descricao,
            ordem=etapa.ordem,
            peso=etapa.peso,
            modo=etapa.modo,
            natureza=etapa.natureza,
            regra_conclusao=etapa.regra_conclusao,
            setor_responsavel_id=etapa.setor_responsavel_id,
            responsavel_id=etapa.responsavel_id,
            prazo_dias=etapa.prazo_dias,
            tipo_contagem=etapa.tipo_contagem,
            exige_aprovacao=etapa.exige_aprovacao,
            documentos_obrigatorios=etapa.documentos_obrigatorios,
            condicao=etapa.condicao,
            status_demanda_id=etapa.status_demanda_id,
            is_final=etapa.is_final,
        )
        db.add(nova)
        await db.flush()
        for modelo in etapa.tarefas_modelo:
            db.add(
                WorkflowTarefaModelo(
                    etapa_id=nova.id,
                    titulo=modelo.titulo,
                    descricao=modelo.descricao,
                    ordem=modelo.ordem,
                    tipo=modelo.tipo,
                    setor_destino_id=modelo.setor_destino_id,
                    prazo_dias=modelo.prazo_dias,
                    exige_documento=modelo.exige_documento,
                    exige_comentario=modelo.exige_comentario,
                    exige_aprovacao=modelo.exige_aprovacao,
                    exige_aceite=modelo.exige_aceite,
                )
            )
    await db.flush()


async def _detalhe(db: AsyncSession, workflow_id: uuid.UUID, user: User) -> WorkflowDetalhe:
    wf = await _carregar_workflow(db, workflow_id, user)
    detalhe = WorkflowDetalhe.model_validate(wf)
    resumo = _resumo(wf)
    detalhe.versao_atual = resumo.versao_atual
    detalhe.qtd_etapas = resumo.qtd_etapas
    return detalhe


@router.get("/workflows/{workflow_id}", response_model=WorkflowDetalhe)
async def obter_workflow(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    return await _detalhe(db, workflow_id, user)


@router.patch("/workflows/{workflow_id}", response_model=WorkflowDetalhe)
async def atualizar_workflow(
    workflow_id: uuid.UUID,
    payload: WorkflowAtualizar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    wf = await _carregar_workflow(db, workflow_id, user, para_editar=True)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(wf, campo, valor)
    await db.commit()
    return await _detalhe(db, workflow_id, user)


# ── Versões ─────────────────────────────────────────────────────────────────

def _rascunho(wf: Workflow) -> WorkflowVersao:
    rascunhos = [
        v for v in wf.versoes if v.status == StatusWorkflowVersao.RASCUNHO
    ]
    if not rascunhos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não há versão em rascunho; crie uma nova versão para editar",
        )
    return max(rascunhos, key=lambda v: v.versao)


@router.post("/workflows/{workflow_id}/versoes", response_model=VersaoOut, status_code=201)
async def nova_versao(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    """Abre um rascunho a partir da versão publicada, sem tocar nas demandas em curso."""
    wf = await _carregar_workflow(db, workflow_id, user, para_editar=True)
    if any(v.status == StatusWorkflowVersao.RASCUNHO for v in wf.versoes):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma versão em rascunho",
        )

    proxima = max((v.versao for v in wf.versoes), default=0) + 1
    versao = WorkflowVersao(workflow_id=wf.id, versao=proxima)
    db.add(versao)
    await db.flush()

    base = wf.versao_publicada
    if base is not None:
        await _copiar_etapas(db, base, versao)
    await db.commit()

    recarregada = (
        await db.execute(
            select(WorkflowVersao)
            .where(WorkflowVersao.id == versao.id)
            .options(
                selectinload(WorkflowVersao.etapas).selectinload(
                    WorkflowEtapa.tarefas_modelo
                ),
                selectinload(WorkflowVersao.etapas).selectinload(
                    WorkflowEtapa.setor_responsavel
                ),
            )
        )
    ).scalar_one()
    return VersaoOut.model_validate(recarregada)


@router.put("/workflows/{workflow_id}/rascunho/etapas", response_model=VersaoOut)
async def definir_etapas(
    workflow_id: uuid.UUID,
    etapas: list[EtapaModeloEntrada],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    """Substitui o desenho do rascunho — é o 'salvar' do editor visual."""
    wf = await _carregar_workflow(db, workflow_id, user, para_editar=True)
    versao = _rascunho(wf)

    chaves = [e.chave for e in etapas]
    if len(set(chaves)) != len(chaves):
        raise HTTPException(status_code=422, detail="Há chaves de etapa repetidas")
    soma = sum(e.peso for e in etapas)
    if soma not in (0, 100):
        raise HTTPException(
            status_code=422,
            detail=f"Os pesos devem somar 100 (ou 0 para distribuir igualmente); somam {soma}",
        )

    for antiga in list(versao.etapas):
        await db.delete(antiga)
    await db.flush()

    for entrada in etapas:
        dados = entrada.model_dump(exclude={"tarefas"})
        nova = WorkflowEtapa(versao_id=versao.id, **dados)
        db.add(nova)
        await db.flush()
        for tarefa in entrada.tarefas:
            db.add(WorkflowTarefaModelo(etapa_id=nova.id, **tarefa.model_dump()))
    await db.commit()

    recarregada = (
        await db.execute(
            select(WorkflowVersao)
            .where(WorkflowVersao.id == versao.id)
            .options(
                selectinload(WorkflowVersao.etapas).selectinload(
                    WorkflowEtapa.tarefas_modelo
                ),
                selectinload(WorkflowVersao.etapas).selectinload(
                    WorkflowEtapa.setor_responsavel
                ),
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return VersaoOut.model_validate(recarregada)


@router.post("/workflows/{workflow_id}/rascunho/publicar", response_model=VersaoOut)
async def publicar_versao(
    workflow_id: uuid.UUID,
    payload: PublicarVersaoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    wf = await _carregar_workflow(db, workflow_id, user, para_editar=True)
    versao = _rascunho(wf)
    if not versao.etapas:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não é possível publicar um fluxo sem etapas",
        )

    anterior = wf.versao_publicada
    if anterior is not None:
        anterior.status = StatusWorkflowVersao.ARQUIVADA
    versao.status = StatusWorkflowVersao.PUBLICADA
    versao.publicada_em = datetime.now(timezone.utc)
    versao.publicada_por_id = user.id
    versao.notas = payload.notas
    await db.commit()

    recarregada = (
        await db.execute(
            select(WorkflowVersao)
            .where(WorkflowVersao.id == versao.id)
            .options(
                selectinload(WorkflowVersao.etapas).selectinload(
                    WorkflowEtapa.tarefas_modelo
                ),
                selectinload(WorkflowVersao.etapas).selectinload(
                    WorkflowEtapa.setor_responsavel
                ),
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return VersaoOut.model_validate(recarregada)


# ── Aplicação na demanda ────────────────────────────────────────────────────

async def _serializar_etapa(
    db: AsyncSession, demanda: Demanda, etapa: Etapa
) -> EtapaInstanciaOut:
    item = EtapaInstanciaOut.model_validate(etapa)
    vivas = [
        t for t in etapa.tarefas
        if t.deleted_at is None and t.status != StatusTarefa.CANCELADA
    ]
    item.qtd_tarefas = len(vivas)
    item.qtd_tarefas_concluidas = len(
        [t for t in vivas if t.status == StatusTarefa.CONCLUIDA]
    )
    item.documentos_faltantes = await motor.documentos_faltantes(db, demanda, etapa)
    return item


@router.post("/demandas/{demanda_id}/aplicar-fluxo", response_model=list[EtapaInstanciaOut])
async def aplicar_fluxo(
    demanda_id: uuid.UUID,
    payload: AplicarFluxoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    if demanda.concluida_em is not None:
        raise HTTPException(status_code=409, detail="Demanda encerrada")
    wf = await _carregar_workflow(db, payload.workflow_id, user)
    await motor.aplicar_workflow(db, demanda, wf, user)
    await marcar_movimentacao(demanda)
    await db.commit()
    return await listar_etapas(demanda_id, db, user)


async def _etapas_da_demanda(
    db: AsyncSession, demanda: Demanda
) -> list[EtapaInstanciaOut]:
    """Monta a lista de etapas de uma demanda já autorizada.

    Existe separada da rota porque os handlers de escrita a reaproveitam depois
    do commit — e reexecutar a autorização ali obrigaria a recarregar o usuário.
    """
    etapas = (
        await db.execute(
            select(Etapa)
            .where(Etapa.demanda_id == demanda.id, Etapa.deleted_at.is_(None))
            .options(selectinload(Etapa.tarefas))
            .order_by(Etapa.ordem)
            .execution_options(populate_existing=True)
        )
    ).scalars().unique().all()
    return [await _serializar_etapa(db, demanda, e) for e in etapas]


@router.get("/demandas/{demanda_id}/etapas", response_model=list[EtapaInstanciaOut])
async def listar_etapas(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return await _etapas_da_demanda(db, demanda)


@router.post("/demandas/{demanda_id}/etapas", response_model=EtapaInstanciaOut, status_code=201)
async def criar_etapa_avulsa(
    demanda_id: uuid.UUID,
    payload: EtapaAvulsaRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Etapa fora de modelo, para o fluxo livre (§19)."""
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    if demanda.concluida_em is not None:
        raise HTTPException(status_code=409, detail="Demanda encerrada")
    etapa = await motor.etapa_avulsa(
        db,
        demanda,
        payload.nome,
        user,
        descricao=payload.descricao,
        setor_responsavel_id=payload.setor_responsavel_id,
        prazo=payload.prazo,
        peso=payload.peso,
    )
    await motor.atualizar_progresso(db, demanda)
    await marcar_movimentacao(demanda)
    await db.commit()
    etapa.tarefas = []
    return await _serializar_etapa(db, demanda, etapa)


@router.post(
    "/demandas/{demanda_id}/etapas/{etapa_id}/concluir",
    response_model=list[EtapaInstanciaOut],
)
async def concluir_etapa(
    demanda_id: uuid.UUID,
    etapa_id: uuid.UUID,
    payload: ConcluirEtapaRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    etapa = (
        await db.execute(
            select(Etapa)
            .where(
                Etapa.id == etapa_id,
                Etapa.demanda_id == demanda_id,
                Etapa.deleted_at.is_(None),
            )
            .options(selectinload(Etapa.tarefas))
        )
    ).scalar_one_or_none()
    if etapa is None:
        raise HTTPException(status_code=404, detail="Etapa não encontrada")

    await motor.concluir_etapa_manualmente(db, demanda, etapa, user, payload.justificativa)
    await marcar_movimentacao(demanda)
    await db.commit()
    return await _etapas_da_demanda(db, demanda)
