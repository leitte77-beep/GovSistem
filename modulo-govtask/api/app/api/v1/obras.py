import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission
from app.core.permissions import Perm
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

# Sem prefixo: o mesmo conjunto de rotas é montado duas vezes em `router.py`,
# sob o convênio (entidades anteriores à v2) e sob a demanda (§54). O pai vem do
# contexto, não de um parâmetro fixo, para que diário, fotos e vistorias
# funcionem igual nos dois caminhos em vez de existirem só para um deles.
router = APIRouter(tags=["obras"])


@dataclass
class ContextoObra:
    """Pai autorizado da obra: um convênio ou uma demanda, nunca os dois."""

    convenio_id: uuid.UUID | None = None
    demanda_id: uuid.UUID | None = None

    @property
    def filtro(self):
        if self.demanda_id is not None:
            return Obra.demanda_id == self.demanda_id
        return Obra.convenio_id == self.convenio_id


async def contexto_obra(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContextoObra:
    """Resolve e autoriza o pai da obra a partir do caminho da requisição.

    A autorização acontece aqui, antes de qualquer handler tocar na obra: é o
    que garante que nenhum id de obra alcance o acervo de outro município, seja
    pelo caminho do convênio ou pelo da demanda.
    """
    parametros = request.path_params
    if "demanda_id" in parametros:
        from app.core.auth import get_user_permissions
        from app.services.demandas import get_demanda_ou_404

        demanda = await get_demanda_ou_404(
            db, uuid.UUID(str(parametros["demanda_id"])), user, get_user_permissions(user)
        )
        return ContextoObra(demanda_id=demanda.id)

    convenio_id = uuid.UUID(str(parametros["convenio_id"]))
    convenio = (
        await db.execute(
            select(Convenio).where(
                Convenio.id == convenio_id,
                Convenio.organization_id == user.organization_id,
                Convenio.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if convenio is None:
        raise HTTPException(status_code=404, detail="Processo não encontrado")
    return ContextoObra(convenio_id=convenio.id)


async def _get_obra(db, ctx: ContextoObra, obra_id, user, *, recarregar: bool = False):
    result = await db.execute(
        select(Obra)
        .where(Obra.id == obra_id, ctx.filtro, Obra.deleted_at.is_(None))
        .options(selectinload(Obra.cronograma))
    )
    obra = result.scalar_one_or_none()
    # A sessão roda com `expire_on_commit=False`: uma coleção lida antes do
    # commit continuaria devolvendo a lista antiga, e a resposta esconderia o
    # item de cronograma que o usuário acabou de inserir.
    if obra is not None and recarregar:
        await db.refresh(obra, attribute_names=["cronograma"])
    return obra


@router.get("", response_model=list[ObraOut])
async def listar_obras(
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Obra)
        .where(ctx.filtro, Obra.deleted_at.is_(None))
        .options(selectinload(Obra.cronograma))
    )
    return result.scalars().all()


@router.post("", response_model=ObraOut, status_code=201)
async def criar_obra(
    request: Request,
    body: ObraCreate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = Obra(
        convenio_id=ctx.convenio_id,
        demanda_id=ctx.demanda_id,
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
        convenio_id=ctx.convenio_id,
        entidade="obra",
        entidade_id=obra.id,
        request=request,
    )
    await db.commit()
    return await _get_obra(db, ctx, obra.id, user, recarregar=True)


@router.patch("/{obra_id}", response_model=ObraOut)
async def atualizar_obra(
    obra_id: uuid.UUID,
    body: ObraUpdate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    return await _get_obra(db, ctx, obra_id, user, recarregar=True)


@router.post("/{obra_id}/cronograma", response_model=ObraOut)
async def adicionar_cronograma(
    obra_id: uuid.UUID,
    body: CronogramaItemCreate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    return await _get_obra(db, ctx, obra_id, user, recarregar=True)


@router.patch("/{obra_id}/cronograma/{item_id}", response_model=ObraOut)
async def atualizar_cronograma(
    obra_id: uuid.UUID,
    item_id: uuid.UUID,
    body: CronogramaItemUpdate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    return await _get_obra(db, ctx, obra_id, user, recarregar=True)


@router.get("/{obra_id}/diario", response_model=list[DiarioOut])
async def listar_diario(
    obra_id: uuid.UUID,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obra = await _get_obra(db, ctx, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(DiarioObra).where(DiarioObra.obra_id == obra_id, DiarioObra.deleted_at.is_(None)).order_by(DiarioObra.data.desc())
    )
    return result.scalars().all()


@router.post("/{obra_id}/diario", response_model=DiarioOut, status_code=201)
async def registrar_diario(
    obra_id: uuid.UUID,
    body: DiarioCreate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")

    registro = DiarioObra(
        obra_id=obra_id,
        tipo=body.tipo,
        data=body.data or datetime.now(timezone.utc),
        titulo=body.titulo,
        descricao=body.descricao,
        clima=body.clima,
        temperatura=body.temperatura,
        efetivo=body.efetivo,
        equipe=body.equipe,
        atividades=body.atividades,
        equipamentos=body.equipamentos,
        ocorrencias=body.ocorrencias,
        impedimentos=body.impedimentos,
        registrado_por_id=user.id,
    )
    db.add(registro)
    await db.commit()
    await db.refresh(registro)
    return registro


@router.patch("/{obra_id}/diario/{registro_id}", response_model=DiarioOut)
async def atualizar_diario(
    obra_id: uuid.UUID,
    registro_id: uuid.UUID,
    body: DiarioCreate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(DiarioObra).where(
            DiarioObra.id == registro_id,
            DiarioObra.obra_id == obra_id,
            DiarioObra.deleted_at.is_(None),
        )
    )
    registro = result.scalar_one_or_none()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro não encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(registro, field, value)
    await db.commit()
    await db.refresh(registro)
    return registro


@router.delete("/{obra_id}/diario/{registro_id}", status_code=204)
async def excluir_diario(
    obra_id: uuid.UUID,
    registro_id: uuid.UUID,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(DiarioObra).where(
            DiarioObra.id == registro_id,
            DiarioObra.obra_id == obra_id,
            DiarioObra.deleted_at.is_(None),
        )
    )
    registro = result.scalar_one_or_none()
    if not registro:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    registro.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.get("/{obra_id}/fotos", response_model=list[FotoOut])
async def listar_fotos(
    obra_id: uuid.UUID,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obra = await _get_obra(db, ctx, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(RegistroFotografico).where(RegistroFotografico.obra_id == obra_id, RegistroFotografico.deleted_at.is_(None)).order_by(RegistroFotografico.data.desc())
    )
    return result.scalars().all()


@router.post("/{obra_id}/fotos", response_model=FotoOut, status_code=201)
async def registrar_foto(
    obra_id: uuid.UUID,
    body: FotoCreate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    obra_id: uuid.UUID,
    foto_id: uuid.UUID,
    anexo_id: uuid.UUID,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    obra_id: uuid.UUID,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    obra = await _get_obra(db, ctx, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    result = await db.execute(
        select(VistoriaObra).where(VistoriaObra.obra_id == obra_id, VistoriaObra.deleted_at.is_(None)).order_by(VistoriaObra.data.desc())
    )
    return result.scalars().all()


@router.post("/{obra_id}/vistorias", response_model=VistoriaOut, status_code=201)
async def registrar_vistoria(
    obra_id: uuid.UUID,
    body: VistoriaCreate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    obra_id: uuid.UUID,
    vistoria_id: uuid.UUID,
    body: VistoriaUpdate,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ENGINEERING_MANAGE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    obra_id: uuid.UUID,
    vistoria_id: uuid.UUID,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_DELETE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
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
    obra_id: uuid.UUID,
    ctx: ContextoObra = Depends(contexto_obra),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_DELETE)),
):
    obra = await _get_obra(db, ctx, obra_id, user)
    if not obra:
        raise HTTPException(status_code=404, detail="Obra não encontrada")
    obra.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
