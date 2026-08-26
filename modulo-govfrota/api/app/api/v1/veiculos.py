import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.manutencao import Manutencao, PlanoPreventivo
from app.models.veiculo import AlteracaoQuilometragem, Veiculo, VeiculoDocumento
from app.api.v1.manutencoes import _computar_proxima_execucao
from app.schemas.schemas import (
    AlterarKmRequest,
    DocumentoVeiculoCreate,
    DocumentoVeiculoResponse,
    VeiculoCreate,
    VeiculoResponse,
    VeiculoUpdate,
)
from app.services.auditoria import registrar_auditoria
from app.services.placa import normalizar_chassi, normalizar_placa, normalizar_renavam

router = APIRouter(prefix="/veiculos", tags=["veículos"])

# Colunas ordenáveis na listagem (whitelist — evita SQL injection por sort_by).
_SORTABLE = {
    "placa": Veiculo.placa,
    "marca": Veiculo.marca,
    "modelo": Veiculo.modelo,
    "tipo": Veiculo.tipo,
    "situacao": Veiculo.situacao,
    "quilometragem_atual": Veiculo.quilometragem_atual,
    "created_at": Veiculo.created_at,
}


async def _get_veiculo_tenant(
    db: AsyncSession, user: User, veiculo_id: uuid.UUID
) -> Veiculo:
    result = await db.execute(
        select(Veiculo).where(
            Veiculo.id == veiculo_id,
            Veiculo.organization_id == user.organization_id,
            Veiculo.deleted_at.is_(None),
        )
    )
    veiculo = result.scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")
    return veiculo


@router.get("", response_model=list[VeiculoResponse])
async def listar(
    search: str | None = None,
    situacao: str | None = None,
    tipo: str | None = None,
    combustivel_id: str | None = None,
    centro_custo: str | None = None,
    unidade: str | None = None,
    departamento: str | None = None,
    filial: str | None = None,
    sort_by: str = "placa",
    order: str = "asc",
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    base = select(Veiculo).where(
        Veiculo.organization_id == user.organization_id,
        Veiculo.deleted_at.is_(None),
    )
    if search:
        like = f"%{search}%"
        base = base.where(
            (Veiculo.placa.ilike(like))
            | (Veiculo.renavam.ilike(like))
            | (Veiculo.chassi.ilike(like))
            | (Veiculo.modelo.ilike(like))
            | (Veiculo.marca.ilike(like))
            | (Veiculo.codigo_interno.ilike(like))
            | (Veiculo.patrimonio.ilike(like))
        )
    if situacao:
        base = base.where(Veiculo.situacao == situacao.upper())
    if tipo:
        base = base.where(Veiculo.tipo == tipo.upper())
    if combustivel_id:
        base = base.where(Veiculo.combustivel_principal_id == combustivel_id)
    if centro_custo:
        base = base.where(Veiculo.centro_custo == centro_custo)
    if unidade:
        base = base.where(Veiculo.unidade == unidade)
    if departamento:
        base = base.where(Veiculo.departamento == departamento)
    if filial:
        base = base.where(Veiculo.filial == filial)

    # Total de registros (para paginação server-side) via header.
    total = await db.scalar(
        select(sa_func.count()).select_from(base.order_by(None).subquery())
    )
    total = int(total or 0)

    coluna = _SORTABLE.get(sort_by, Veiculo.placa)
    ordenado = coluna.desc() if order.lower() == "desc" else coluna.asc()
    stmt = base.order_by(ordenado).offset(skip).limit(min(limit, 200))
    result = await db.execute(stmt)
    veiculos = list(result.scalars().all())
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
    if not veiculos:
        return veiculos

    ids = [v.id for v in veiculos]

    # Consumo médio (km/L) por veículo — estimado entre registros (§35)
    consumo_map: dict[uuid.UUID, float] = {}
    consumo_result = await db.execute(
        select(
            Abastecimento.veiculo_id,
            sa_func.avg(Abastecimento.consumo_km_l),
        )
        .where(
            Abastecimento.organization_id == user.organization_id,
            Abastecimento.veiculo_id.in_(ids),
            Abastecimento.status == "CONFIRMADO",
            Abastecimento.consumo_km_l.isnot(None),
        )
        .group_by(Abastecimento.veiculo_id)
    )
    for vid, avg_consumo in consumo_result.all():
        consumo_map[vid] = float(avg_consumo)

    # Último abastecimento por veículo (janela — evita N+1)
    ultimo_abast_map: dict[uuid.UUID, dict] = {}
    abast_subq = (
        select(
            Abastecimento.veiculo_id,
            Abastecimento.data_abastecimento,
            Abastecimento.quantidade_litros,
            sa_func.row_number()
            .over(
                partition_by=Abastecimento.veiculo_id,
                order_by=Abastecimento.data_abastecimento.desc(),
            )
            .label("rn"),
        )
        .where(
            Abastecimento.organization_id == user.organization_id,
            Abastecimento.veiculo_id.in_(ids),
            Abastecimento.status == "CONFIRMADO",
        )
        .subquery()
    )
    for vid, data, litros, rn in (
        await db.execute(select(abast_subq).where(abast_subq.c.rn == 1))
    ).all():
        ultimo_abast_map[vid] = {
            "data": data.isoformat(),
            "litros": float(litros),
        }

    # Última manutenção por veículo
    ultima_manut_map: dict[uuid.UUID, dict] = {}
    manut_subq = (
        select(
            Manutencao.veiculo_id,
            Manutencao.data_solicitacao,
            Manutencao.status,
            sa_func.row_number()
            .over(
                partition_by=Manutencao.veiculo_id,
                order_by=Manutencao.data_solicitacao.desc(),
            )
            .label("rn"),
        )
        .where(
            Manutencao.organization_id == user.organization_id,
            Manutencao.veiculo_id.in_(ids),
            Manutencao.deleted_at.is_(None),
        )
        .subquery()
    )
    for vid, data, status, rn in (
        await db.execute(select(manut_subq).where(manut_subq.c.rn == 1))
    ).all():
        ultima_manut_map[vid] = {"data": data.isoformat(), "status": status}

    # Próxima manutenção preventiva por veículo (plano mais próximo)
    proxima_map: dict[uuid.UUID, dict] = {}
    planos = (
        await db.execute(
            select(PlanoPreventivo).where(
                PlanoPreventivo.organization_id == user.organization_id,
                PlanoPreventivo.veiculo_id.in_(ids),
                PlanoPreventivo.deleted_at.is_(None),
                PlanoPreventivo.ativo.is_(True),
            )
        )
    ).scalars().all()
    for plano in planos:
        km_atual = next((v.quilometragem_atual for v in veiculos if v.id == plano.veiculo_id), 0)
        proxima_km, proxima_data, situacao = _computar_proxima_execucao(plano, km_atual)
        atual = proxima_map.get(plano.veiculo_id)
        if atual is not None and atual.get("situacao") == "OK" and situacao == "OK":
            continue
        if atual is None or situacao == "VENCIDA" or (situacao == "PROXIMA" and atual.get("situacao") != "VENCIDA"):
            proxima_map[plano.veiculo_id] = {
                "nome": plano.nome,
                "proxima_km": proxima_km,
                "proxima_data": proxima_data.isoformat() if proxima_data else None,
                "situacao": situacao,
            }

    from pydantic import TypeAdapter

    adapter = TypeAdapter(list[VeiculoResponse])
    itens = []
    for v in veiculos:
        dados = VeiculoResponse.model_validate(v, from_attributes=True).model_dump()
        dados["consumo_medio_km_l"] = consumo_map.get(v.id)
        dados["ultimo_abastecimento"] = ultimo_abast_map.get(v.id)
        dados["ultima_manutencao"] = ultima_manut_map.get(v.id)
        dados["proxima_manutencao"] = proxima_map.get(v.id)
        itens.append(dados)
    return adapter.validate_python(itens)


@router.post("", response_model=VeiculoResponse, status_code=201)
async def criar(
    body: VeiculoCreate,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    placa = normalizar_placa(body.placa)
    existente = await db.execute(
        select(Veiculo.id).where(
            Veiculo.organization_id == user.organization_id,
            Veiculo.placa == placa,
            Veiculo.deleted_at.is_(None),
        )
    )
    if existente.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Já existe um veículo com esta placa.")

    # Normaliza identificadores opcionais e bloqueia duplicidade por organização.
    dados = body.model_dump(exclude={"placa"})
    renavam = normalizar_renavam(body.renavam)
    chassi = normalizar_chassi(body.chassi)
    dados["renavam"] = renavam or None
    dados["chassi"] = chassi or None

    for campo, valor, rotulo in (
        ("renavam", renavam, "RENAVAM"),
        ("chassi", chassi, "chassi"),
    ):
        if not valor:
            continue
        duplicado = await db.scalar(
            select(Veiculo.id)
            .where(
                Veiculo.organization_id == user.organization_id,
                getattr(Veiculo, campo) == valor,
                Veiculo.deleted_at.is_(None),
            )
            .limit(1)
        )
        if duplicado:
            raise HTTPException(
                status_code=422, detail=f"Já existe um veículo com este {rotulo}."
            )

    veiculo = Veiculo(
        **dados,
        organization_id=user.organization_id,
        placa=placa,
    )
    db.add(veiculo)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="veiculo.criar",
        entidade="veiculo",
        entidade_id=veiculo.id,
        usuario_id=user.id,
        dados_novos={"placa": veiculo.placa},
    )
    await db.commit()
    await db.refresh(veiculo)
    return veiculo


@router.get("/{veiculo_id}", response_model=VeiculoResponse)
async def obter(
    veiculo_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await _get_veiculo_tenant(db, user, veiculo_id)


@router.patch("/{veiculo_id}", response_model=VeiculoResponse)
async def atualizar(
    veiculo_id: uuid.UUID,
    body: VeiculoUpdate,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    veiculo = await _get_veiculo_tenant(db, user, veiculo_id)
    anteriores = {
        "situacao": veiculo.situacao,
        "observacoes": veiculo.observacoes,
        "centro_custo": veiculo.centro_custo,
    }
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(veiculo, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="veiculo.atualizar",
        entidade="veiculo",
        entidade_id=veiculo.id,
        usuario_id=user.id,
        dados_anteriores=anteriores,
        dados_novos=body.model_dump(exclude_unset=True, mode="json"),
    )
    await db.commit()
    await db.refresh(veiculo)
    return veiculo


@router.delete("/{veiculo_id}", status_code=204)
async def excluir(
    veiculo_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Inativação lógica — histórico permanece disponível para auditoria."""
    from datetime import datetime, timezone

    veiculo = await _get_veiculo_tenant(db, user, veiculo_id)
    veiculo.deleted_at = datetime.now(timezone.utc)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="veiculo.inativar",
        entidade="veiculo",
        entidade_id=veiculo.id,
        usuario_id=user.id,
    )
    await db.commit()


@router.post("/{veiculo_id}/quilometragem", response_model=VeiculoResponse)
async def alterar_quilometragem(
    veiculo_id: uuid.UUID,
    body: AlterarKmRequest,
    user: User = Depends(require_permission(Perm.REFUELING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Correção autorizada de quilometragem — sempre auditada com justificativa."""
    veiculo = await _get_veiculo_tenant(db, user, veiculo_id)
    km_anterior = veiculo.quilometragem_atual
    veiculo.quilometragem_atual = body.quilometragem_atual
    db.add(
        AlteracaoQuilometragem(
            organization_id=user.organization_id,
            veiculo_id=veiculo.id,
            km_anterior=km_anterior,
            km_novo=body.quilometragem_atual,
            usuario_id=user.id,
            justificativa=body.justificativa,
        )
    )
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="veiculo.alterar_km",
        entidade="veiculo",
        entidade_id=veiculo.id,
        usuario_id=user.id,
        dados_anteriores={"km": km_anterior},
        dados_novos={"km": body.quilometragem_atual},
        justificativa=body.justificativa,
    )
    await db.commit()
    await db.refresh(veiculo)
    return veiculo


# ── Documentos do veículo ────────────────────────────────────────────────────


@router.get("/{veiculo_id}/documentos", response_model=list[DocumentoVeiculoResponse])
async def listar_documentos(
    veiculo_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    await _get_veiculo_tenant(db, user, veiculo_id)
    result = await db.execute(
        select(VeiculoDocumento)
        .where(
            VeiculoDocumento.organization_id == user.organization_id,
            VeiculoDocumento.veiculo_id == veiculo_id,
        )
        .order_by(VeiculoDocumento.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{veiculo_id}/documentos", response_model=DocumentoVeiculoResponse, status_code=201)
async def criar_documento(
    veiculo_id: uuid.UUID,
    body: DocumentoVeiculoCreate,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    await _get_veiculo_tenant(db, user, veiculo_id)
    documento = VeiculoDocumento(
        **body.model_dump(),
        organization_id=user.organization_id,
        veiculo_id=veiculo_id,
    )
    db.add(documento)
    await db.commit()
    await db.refresh(documento)
    return documento


@router.delete("/{veiculo_id}/documentos/{documento_id}", status_code=204)
async def excluir_documento(
    veiculo_id: uuid.UUID,
    documento_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VeiculoDocumento).where(
            VeiculoDocumento.id == documento_id,
            VeiculoDocumento.organization_id == user.organization_id,
            VeiculoDocumento.veiculo_id == veiculo_id,
        )
    )
    documento = result.scalar_one_or_none()
    if documento is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")
    await db.delete(documento)
    await db.commit()
