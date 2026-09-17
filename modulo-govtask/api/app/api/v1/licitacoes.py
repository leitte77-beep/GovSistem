import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.convenio import Convenio
from app.models.enums import TipoEvento
from app.models.licitacao import Licitacao
from app.models.user import User
from app.schemas.licitacao import LicitacaoCreate, LicitacaoOut, LicitacaoUpdate
from app.services.auditoria import registrar_auditoria
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/convenios/{convenio_id}/licitacoes", tags=["licitacoes"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_licitacao(db, convenio_id, licitacao_id, user):
    result = await db.execute(
        select(Licitacao)
        .join(Convenio, Convenio.id == Licitacao.convenio_id)
        .where(
            Licitacao.id == licitacao_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Licitacao.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[LicitacaoOut])
async def listar_licitacoes(
    request: Request,
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(Licitacao)
        .where(Licitacao.convenio_id == convenio_id, Licitacao.deleted_at.is_(None))
    )
    return result.scalars().all()


@router.post("", response_model=LicitacaoOut, status_code=201)
async def criar_licitacao(
    request: Request,
    convenio_id: uuid.UUID,
    body: LicitacaoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.LICITACAO_MANAGE)),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    licitacao = Licitacao(
        convenio_id=convenio_id,
        numero=body.numero,
        modalidade=body.modalidade,
        objeto=body.objeto,
        valor_estimado=body.valor_estimado,
        valor_contratado=body.valor_contratado,
        vencedor=body.vencedor,
        cnpj_vencedor=body.cnpj_vencedor,
        data_disputa=body.data_disputa,
        data_homologacao=body.data_homologacao,
        observacao=body.observacao,
    )
    db.add(licitacao)
    await db.flush()
    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.LICITACAO_VINCULADA,
        ator_id=user.id,
        descricao=f"Processo licitatório {body.numero or ''} vinculado",
        metadados={"numero": body.numero},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="licitacao.criar",
        convenio_id=convenio_id,
        entidade="licitacao",
        entidade_id=licitacao.id,
        request=request,
    )
    await db.commit()
    await db.refresh(licitacao)
    return licitacao


@router.patch("/{licitacao_id}", response_model=LicitacaoOut)
async def atualizar_licitacao(
    request: Request,
    convenio_id: uuid.UUID,
    licitacao_id: uuid.UUID,
    body: LicitacaoUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.LICITACAO_MANAGE)),
):
    licitacao = await _get_licitacao(db, convenio_id, licitacao_id, user)
    if not licitacao:
        raise HTTPException(status_code=404, detail="Licitação não encontrada")

    for field in ("situacao", "numero", "modalidade", "objeto", "valor_estimado",
                  "valor_contratado", "vencedor", "cnpj_vencedor", "data_disputa",
                  "data_homologacao", "observacao"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(licitacao, field, value)

    await db.commit()
    await db.refresh(licitacao)
    return licitacao


@router.delete("/{licitacao_id}", status_code=204)
async def excluir_licitacao(
    request: Request,
    convenio_id: uuid.UUID,
    licitacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.LICITACAO_MANAGE)),
):
    licitacao = await _get_licitacao(db, convenio_id, licitacao_id, user)
    if not licitacao:
        raise HTTPException(status_code=404, detail="Licitação não encontrada")
    licitacao.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
