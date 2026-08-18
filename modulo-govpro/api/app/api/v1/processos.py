import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_ATUANTES,
    PAPEIS_LEITURA,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.andamento import Andamento
from app.models.enums import NivelAcesso
from app.models.interessado import Interessado
from app.models.processo import Processo, ProcessoVisualizacao
from app.models.user import User
from app.schemas import AndamentoOut, InteressadoOut, ProcessoAutuarInput, ProcessoOut
from app.services import auditoria, autuacao
from app.services import processo as processo_service

router = APIRouter(tags=["processos"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


@router.post("/processos", response_model=ProcessoOut, status_code=201)
async def criar_processo(
    payload: ProcessoAutuarInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await autuacao.autuar(
        db,
        tenant_id,
        user,
        tipo_processo_id=payload.tipo_processo_id,
        especificacao=payload.especificacao,
        interessados=[i.model_dump() for i in payload.interessados],
        nivel_acesso=payload.nivel_acesso,
        hipotese_legal_id=payload.hipotese_legal_id,
        classe_id=payload.classe_id,
        observacoes=payload.observacoes,
        unidade_protocolizadora_id=payload.unidade_protocolizadora_id,
        client=get_client_info(request),
    )


@router.get("/processos", response_model=list[ProcessoOut])
async def listar_processos(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
    q: str | None = Query(default=None, max_length=200),
    tipo_processo_id: Optional[uuid.UUID] = Query(default=None),
    situacao: str | None = Query(default=None),
    nivel_acesso: str | None = Query(default=None),
    data_inicio: Optional[datetime] = Query(default=None),
    data_fim: Optional[datetime] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
):
    stmt = select(Processo).where(Processo.tenant_id == tenant_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where((Processo.nup.ilike(like)) | (Processo.especificacao.ilike(like)))
    if tipo_processo_id:
        stmt = stmt.where(Processo.tipo_processo_id == tipo_processo_id)
    if situacao:
        stmt = stmt.where(Processo.situacao == situacao)
    if nivel_acesso:
        stmt = stmt.where(Processo.nivel_acesso == nivel_acesso)
    if data_inicio:
        stmt = stmt.where(Processo.created_at >= data_inicio)
    if data_fim:
        stmt = stmt.where(Processo.created_at <= data_fim)
    stmt = stmt.order_by(Processo.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars())


@router.get("/processos/{processo_id}", response_model=ProcessoOut)
async def detalhe_processo(
    processo_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    # Processo sigiloso exige credencial nominal (ou papel de gestão de sigilo).
    from app.services import sigilo

    await sigilo.verificar_acesso_sigiloso(db, user, processo)

    # Leitura de conteúdo restrito/sigiloso é auditada (prova).
    if processo.nivel_acesso != NivelAcesso.PUBLICO.value:
        await auditoria.registrar(
            db,
            tenant_id=tenant_id,
            action="LEITURA",
            entity="processo",
            entity_id=str(processo.id),
            actor_user_id=user.id,
            processo_id=processo.id,
            nup=processo.nup,
            ip_address=get_client_info(request)["ip_address"],
            user_agent=get_client_info(request)["user_agent"],
            base_legal="Lei 12.527/2011 art. 23-31",
        )
        await db.commit()

    await _marcar_visualizado(db, tenant_id, processo_id, user.id)

    return processo


async def _marcar_visualizado(
    db: AsyncSession, tenant_id: uuid.UUID, processo_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    """Registra que o usuário abriu o processo (idempotente; sem duplicar linha)."""
    existente = await db.execute(
        select(ProcessoVisualizacao.id).where(
            ProcessoVisualizacao.tenant_id == tenant_id,
            ProcessoVisualizacao.processo_id == processo_id,
            ProcessoVisualizacao.user_id == user_id,
        )
    )
    if existente.scalar_one_or_none() is not None:
        return
    db.add(
        ProcessoVisualizacao(
            tenant_id=tenant_id,
            processo_id=processo_id,
            user_id=user_id,
            visualizado_em=datetime.now(timezone.utc),
        )
    )
    await db.commit()


class AtribuirInput(BaseModel):
    usuario_id: Optional[uuid.UUID] = None


@router.patch("/processos/{processo_id}/atribuir", response_model=ProcessoOut)
async def atribuir_processo(
    processo_id: uuid.UUID,
    payload: AtribuirInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    """Atribui (ou remove a atribuição de) um responsável direto pelo processo."""
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    antes = str(processo.responsavel_id) if processo.responsavel_id else None
    processo.responsavel_id = payload.usuario_id
    await auditoria.registrar(
        db,
        tenant_id=tenant_id,
        action="EDICAO",
        entity="processo_atribuicao",
        entity_id=str(processo.id),
        actor_user_id=user.id,
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=get_client_info(request)["ip_address"],
        user_agent=get_client_info(request)["user_agent"],
        dados_antes={"responsavel_id": antes},
        dados_depois={"responsavel_id": str(payload.usuario_id) if payload.usuario_id else None},
    )
    await db.commit()
    await db.refresh(processo)
    return processo


@router.get("/processos/{processo_id}/interessados", response_model=list[InteressadoOut])
async def interessados_processo(
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(Interessado).where(
            Interessado.processo_id == processo_id, Interessado.tenant_id == tenant_id
        )
    )
    return list(result.scalars())


@router.get("/processos/{processo_id}/andamentos", response_model=list[AndamentoOut])
async def andamentos_processo(
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(Andamento)
        .where(Andamento.processo_id == processo_id, Andamento.tenant_id == tenant_id)
        .order_by(Andamento.created_at)
    )
    return list(result.scalars())


@router.post("/processos/{processo_id}/concluir", response_model=ProcessoOut)
async def concluir_processo(
    processo_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    motivo: Optional[str] = Query(default=None),
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await processo_service.concluir(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        motivo=motivo,
        client=get_client_info(request),
    )


@router.post("/processos/{processo_id}/arquivar", response_model=ProcessoOut)
async def arquivar_processo(
    processo_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    motivo: Optional[str] = Query(default=None),
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await processo_service.arquivar(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        motivo=motivo,
        client=get_client_info(request),
    )


@router.post("/processos/{processo_id}/reabrir", response_model=ProcessoOut)
async def reabrir_processo(
    processo_id: uuid.UUID,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    motivo: Optional[str] = Query(default=None),
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    return await processo_service.reabrir(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        motivo=motivo,
        client=get_client_info(request),
    )
