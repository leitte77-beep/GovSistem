"""Administração do motor de workflow (seções 14-19, 109).

Editar um template ativo cria uma nova versão em vez de alterar a existente —
processos já abertos continuam presos à versão em que nasceram
(`app/models/workflow.py` documenta o porquê).
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.organizacao import User
from app.models.workflow import WorkflowEtapa, WorkflowEtapaRequisito, WorkflowTemplate, WorkflowTransicao
from app.schemas.comuns import Criado
from app.schemas.workflow import EtapaIn, RequisitoIn, TemplateIn, TemplateOut, TransicaoIn

router = APIRouter(prefix="/workflow", tags=["Administração — Workflow"])


@router.get("/templates", response_model=list[TemplateOut])
async def listar_templates(
    db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.WORKFLOW_GERENCIAR))
):
    resultado = await db.scalars(
        select(WorkflowTemplate)
        .where(WorkflowTemplate.organizacao_id == user.organizacao_id)
        .order_by(WorkflowTemplate.tipo_processo, WorkflowTemplate.versao.desc())
    )
    return list(resultado.all())


@router.get("/templates/{template_id}", response_model=TemplateOut)
async def obter_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.WORKFLOW_GERENCIAR)),
):
    return await buscar_da_organizacao(db, WorkflowTemplate, template_id, user)


@router.post("/templates", response_model=Criado, status_code=201)
async def criar_template(
    payload: TemplateIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.WORKFLOW_GERENCIAR)),
):
    ativo_existente = await db.scalar(
        select(WorkflowTemplate).where(
            WorkflowTemplate.organizacao_id == user.organizacao_id,
            WorkflowTemplate.tipo_processo == payload.tipo_processo,
            WorkflowTemplate.ativo.is_(True),
        )
    )
    versao = (ativo_existente.versao + 1) if ativo_existente else 1
    if ativo_existente:
        ativo_existente.ativo = False
    template = WorkflowTemplate(organizacao_id=user.organizacao_id, versao=versao, **payload.model_dump())
    db.add(template)
    await db.flush()
    await db.commit()
    return Criado(id=template.id, mensagem=f"Template criado (versão {versao}).")


@router.post("/templates/{template_id}/etapas", response_model=Criado, status_code=201)
async def adicionar_etapa(
    template_id: uuid.UUID,
    payload: EtapaIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.WORKFLOW_GERENCIAR)),
):
    await buscar_da_organizacao(db, WorkflowTemplate, template_id, user)
    etapa = WorkflowEtapa(template_id=template_id, **payload.model_dump())
    db.add(etapa)
    await db.flush()
    await db.commit()
    return Criado(id=etapa.id, mensagem="Etapa adicionada.")


@router.post("/etapas/{etapa_id}/requisitos", response_model=Criado, status_code=201)
async def adicionar_requisito(
    etapa_id: uuid.UUID,
    payload: RequisitoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.WORKFLOW_GERENCIAR)),
):
    requisito = WorkflowEtapaRequisito(etapa_id=etapa_id, **payload.model_dump())
    db.add(requisito)
    await db.flush()
    await db.commit()
    return Criado(id=requisito.id, mensagem="Requisito adicionado.")


@router.post("/etapas/{etapa_id}/transicoes", response_model=Criado, status_code=201)
async def adicionar_transicao(
    etapa_id: uuid.UUID,
    payload: TransicaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.WORKFLOW_GERENCIAR)),
):
    transicao = WorkflowTransicao(etapa_origem_id=etapa_id, **payload.model_dump())
    db.add(transicao)
    await db.flush()
    await db.commit()
    return Criado(id=transicao.id, mensagem="Transição adicionada.")


@router.get("/tipos-processo", response_model=list[str])
async def tipos_processo(user: User = Depends(exigir(P.WORKFLOW_GERENCIAR))):
    return WorkflowTemplate.tipos_disponiveis()
