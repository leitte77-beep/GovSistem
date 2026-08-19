import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_roles
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.obra import Obra, CronogramaItem, DiarioObra, RegistroFotografico, VistoriaObra
from app.models.user import User
from app.schemas.obra import (
    CronogramaItemCreate,
    CronogramaItemUpdate,
    DiarioCreate,
    DiarioOut,
    FotoCreate,
    FotoOut,
    ObraCreate,
    ObraOut,
    ObraUpdate,
    VistoriaCreate,
    VistoriaOut,
    VistoriaUpdate,
)
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/convenios/{convenio_id}/obras", tags=["obras"])


async def _get_convenio(db, convenio_id, user):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def _get_obra(db, convenio_id, obra_id, user):
    result = await db.execute(
        select(Obra)
        .join(Convenio, Convenio.id == Obra.convenio_id)
        .where(
            Obra.id == obra_id,
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Obra.deleted_at.is_(None),
        )
        .options(selectinload(Obra.cronograma))
    )
    return result.scalar_one_or_none()


@router.get("", response_model=list[ObraOut])
async def listar_obras(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    result = await db.execute(
        select(Obra)
        .where(Obra.convenio_id == convenio_id, Obra.deleted_at.is_(None))
        .options(selectinload(Obra.cronograma))
    )
    return result.scalars().all()


@router.post("", response_model=ObraOut, status_code=201)
async def criar_obra(
    request: Request,
    convenio_id: uuid.UUID,
    body: ObraCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    if not await _get_convenio(db, convenio_id, user):
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    obra = Obra(
        convenio_id=convenio_id,
        nome=body.nome,
        endereco=body.endereco,
        coordenadas=body.coordenadas,
        objeto=body.objeto,
        empresa=body.empresa,
        cnpj_empresa=body.cnpj_empresa,
        contrato_numero=body.contrato_numero,
        responsavel_tecnico=body.responsavel_tecnico,
        fiscal_id=body.fiscal_id,
        gestor_id=body.gestor_id,
        data_inicio=body.data_inicio,
        previsao_conclusao=body.previsao_conclusao,
        valor_contrato=body.valor_contrato,
        situacao=body.situacao,
        observacoes=body.observacoes,
    )
    db.add(obra)
    await db.flush()
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="obra.criar",
        convenio_id=convenio_id,
        entidade="obra",
        entidade_id=obra.id,
        request=request,
    )
    await db.commit()
    return await _get_obra(db, convenio_id, obra.id, user)


@router.patch("/{obra_id}", response_model=ObraOut)
async def atualizar_obra(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    body: ObraUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")

    for field in ("nome", "endereco", "coordenadas", "objeto", "empresa", "cnpj_empresa",
                  "contrato_numero", "responsavel_tecnico", "fiscal_id", "gestor_id",
                  "data_inicio", "previsao_conclusao", "valor_contrato", "situacao",
                  "percentual_fisico", "percentual_financeiro", "observacoes"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(obra, field, value)

    await db.commit()
    return await _get_obra(db, convenio_id, obra_id, user)


@router.post("/{obra_id}/cronograma", response_model=ObraOut)
async def adicionar_cronograma(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    body: CronogramaItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")

    item = CronogramaItem(
        obra_id=obra_id,
        descricao=body.descricao,
        valor=body.valor,
        percentual_previsto=body.percentual_previsto,
        percentual_realizado=body.percentual_realizado,
        data_inicio_prevista=body.data_inicio_prevista,
        data_fim_prevista=body.data_fim_prevista,
        ordem=body.ordem,
    )
    db.add(item)
    await db.commit()
    return await _get_obra(db, convenio_id, obra_id, user)


@router.patch("/{obra_id}/cronograma/{item_id}", response_model=ObraOut)
async def atualizar_cronograma(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    item_id: uuid.UUID,
    body: CronogramaItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(select(CronogramaItem).where(CronogramaItem.id == item_id, CronogramaItem.obra_id == obra_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item do cronograma não encontrado")

    for field in ("percentual_realizado", "valor", "percentual_previsto", "data_inicio_prevista", "data_fim_prevista"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(item, field, value)

    await db.commit()
    return await _get_obra(db, convenio_id, obra_id, user)


@router.get("/{obra_id}/diario", response_model=list[DiarioOut])
async def listar_diario(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(DiarioObra).where(DiarioObra.obra_id == obra_id, DiarioObra.deleted_at.is_(None)).order_by(DiarioObra.data.desc())
    )
    return result.scalars().all()


@router.post("/{obra_id}/diario", response_model=DiarioOut, status_code=201)
async def registrar_diario(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    body: DiarioCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")

    registro = DiarioObra(
        obra_id=obra_id,
        tipo=body.tipo,
        data=body.data or datetime.now(timezone.utc),
        titulo=body.titulo,
        descricao=body.descricao,
        registrado_por_id=user.id,
    )
    db.add(registro)
    await db.commit()
    await db.refresh(registro)
    return registro


@router.get("/{obra_id}/fotos", response_model=list[FotoOut])
async def listar_fotos(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(RegistroFotografico).where(RegistroFotografico.obra_id == obra_id, RegistroFotografico.deleted_at.is_(None)).order_by(RegistroFotografico.data.desc())
    )
    return result.scalars().all()


@router.post("/{obra_id}/fotos", response_model=FotoOut, status_code=201)
async def registrar_foto(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    body: FotoCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")

    foto = RegistroFotografico(
        obra_id=obra_id,
        data=body.data or datetime.now(timezone.utc),
        observacao=body.observacao,
        etapa=body.etapa,
        medicao_id=body.medicao_id,
        latitude=body.latitude,
        longitude=body.longitude,
        registrado_por_id=user.id,
    )
    db.add(foto)
    await db.commit()
    await db.refresh(foto)
    return foto


@router.post("/{obra_id}/fotos/{foto_id}/anexar", response_model=FotoOut)
async def anexar_foto(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    foto_id: uuid.UUID,
    anexo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(select(RegistroFotografico).where(RegistroFotografico.id == foto_id, RegistroFotografico.obra_id == obra_id))
    foto = result.scalar_one_or_none()
    if not foto:
        raise HTTPException(status_code=404, detail="Registro fotográfico não encontrado")
    foto.anexo_id = anexo_id
    await db.commit()
    await db.refresh(foto)
    return foto


@router.get("/{obra_id}/vistorias", response_model=list[VistoriaOut])
async def listar_vistorias(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(VistoriaObra).where(VistoriaObra.obra_id == obra_id, VistoriaObra.deleted_at.is_(None)).order_by(VistoriaObra.data.desc())
    )
    return result.scalars().all()


@router.post("/{obra_id}/vistorias", response_model=VistoriaOut, status_code=201)
async def registrar_vistoria(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    body: VistoriaCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")

    vistoria = VistoriaObra(
        obra_id=obra_id,
        data=body.data or datetime.now(timezone.utc),
        tipo=body.tipo or "ROTINEIRA",
        vistoriador=body.vistoriador,
        orgao_vistoriador=body.orgao_vistoriador,
        status=body.status or "AGENDADA",
        protocolo=body.protocolo,
        observacoes=body.observacoes,
        nao_conformidades=body.nao_conformidades,
        recomendacoes=body.recomendacoes,
        registrado_por_id=user.id,
    )
    db.add(vistoria)
    await db.commit()
    await db.refresh(vistoria)
    return vistoria


@router.patch("/{obra_id}/vistorias/{vistoria_id}", response_model=VistoriaOut)
async def atualizar_vistoria(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    vistoria_id: uuid.UUID,
    body: VistoriaUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN", "ENGENHEIRO_TECNICO")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(select(VistoriaObra).where(VistoriaObra.id == vistoria_id, VistoriaObra.obra_id == obra_id))
    vistoria = result.scalar_one_or_none()
    if not vistoria:
        raise HTTPException(status_code=404, detail="Vistoria não encontrada")

    for field in ("data", "tipo", "vistoriador", "orgao_vistoriador", "status",
                  "protocolo", "observacoes", "nao_conformidades", "recomendacoes"):
        value = getattr(body, field, None)
        if value is not None:
            setattr(vistoria, field, value)

    await db.commit()
    await db.refresh(vistoria)
    return vistoria


@router.delete("/{obra_id}/vistorias/{vistoria_id}", status_code=204)
async def excluir_vistoria(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    vistoria_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(select(VistoriaObra).where(VistoriaObra.id == vistoria_id, VistoriaObra.obra_id == obra_id))
    vistoria = result.scalar_one_or_none()
    if not vistoria:
        raise HTTPException(status_code=404, detail="Vistoria não encontrada")
    vistoria.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.delete("/{obra_id}", status_code=204)
async def excluir_obra(
    convenio_id: uuid.UUID,
    obra_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    obra = await _get_obra(db, convenio_id, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    obra.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
