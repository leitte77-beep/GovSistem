import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import filtro_escopo, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.combustivel import Combustivel
from app.models.manutencao import Manutencao, PlanoPreventivo
from app.models.unidade import Unidade
from app.models.veiculo import AlteracaoQuilometragem, Veiculo, VeiculoDocumento, VeiculoTanque
from app.api.v1.manutencoes import _computar_proxima_execucao
from app.schemas.schemas import (
    AlterarKmRequest,
    DocumentoVeiculoCreate,
    DocumentoVeiculoResponse,
    VeiculoCreate,
    VeiculoResponse,
    VeiculoTanqueResponse,
    VeiculoUpdate,
)
from app.services.abastecimento import get_configuracoes
from app.services.auditoria import registrar_auditoria
from app.services.placa import normalizar_chassi, normalizar_placa, normalizar_renavam

router = APIRouter(prefix="/veiculos", tags=["veículos"])

# Campos de entrada que descrevem o reservatório principal — não existem no
# veículo; vão para `VeiculoTanque` (PRIMARY).
_CAMPOS_RESERVATORIO = ("combustivel_principal_id", "combustivel_secundario_id", "capacidade_tanque_litros")

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
            filtro_escopo(user, Veiculo.unidade_id),
        )
    )
    veiculo = result.scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")
    return veiculo


async def _validar_produtos_org(
    db: AsyncSession, user: User, ids: set[uuid.UUID] | None
) -> None:
    """Garante que produtos (combustíveis/fluidos) pertencem à organização."""
    if not ids:
        return
    validos = set(
        (
            await db.execute(
                select(Combustivel.id).where(
                    Combustivel.organization_id == user.organization_id,
                    Combustivel.deleted_at.is_(None),
                    Combustivel.id.in_(ids),
                )
            )
        ).scalars().all()
    )
    invalidos = ids - validos
    if invalidos:
        raise HTTPException(
            status_code=422, detail="Produto/combustível inválido para esta organização."
        )


_NAO_INFORMADO = object()


async def _sync_reservatorios(
    db: AsyncSession,
    veiculo: Veiculo,
    *,
    combustivel_principal_id: uuid.UUID | None,
    capacidade_principal: object | None,
    tanques_auxiliares: list | None,
    combustivel_alternativo_id: object = _NAO_INFORMADO,
) -> None:
    """Sincroniza os reservatórios do veículo — única fonte dos combustíveis.

    - PRIMARY: combustível principal + capacidade (+ alternativo, se flex).
      Campos não enviados preservam o valor atual.
    - AUXILIARY: substitui os reservatórios auxiliares pela lista enviada
      (None = mantém como está).
    """
    existentes = (
        await db.execute(
            select(VeiculoTanque).where(VeiculoTanque.veiculo_id == veiculo.id)
        )
    ).scalars().all()

    capacidade = (
        Decimal(capacidade_principal)
        if capacidade_principal is not None and Decimal(capacidade_principal) > 0
        else None
    )
    principal = next(
        (t for t in existentes if t.tank_type == "PRIMARY" and t.deleted_at is None), None
    )
    if principal is None and combustivel_principal_id is not None:
        principal = VeiculoTanque(
            organization_id=veiculo.organization_id,
            veiculo_id=veiculo.id,
            combustivel_id=combustivel_principal_id,
            tank_type="PRIMARY",
            capacidade=capacidade or Decimal("0"),
            identificacao="Tanque principal",
        )
        db.add(principal)
    elif principal is not None:
        if combustivel_principal_id is not None:
            principal.combustivel_id = combustivel_principal_id
        if capacidade is not None:
            principal.capacidade = capacidade
        principal.ativo = True
    if principal is not None and combustivel_alternativo_id is not _NAO_INFORMADO:
        alt = combustivel_alternativo_id
        principal.combustivel_alternativo_id = alt if alt != principal.combustivel_id else None

    if tanques_auxiliares is not None:
        # Remove auxiliares atuais e recria a partir da lista enviada.
        for t in existentes:
            if t.tank_type == "AUXILIARY":
                await db.delete(t)
        for aux in tanques_auxiliares:
            db.add(
                VeiculoTanque(
                    organization_id=veiculo.organization_id,
                    veiculo_id=veiculo.id,
                    combustivel_id=aux.combustivel_id,
                    tank_type="AUXILIARY",
                    capacidade=aux.capacidade,
                    identificacao=aux.identificacao,
                )
            )
    await db.flush()


async def _mapa_tanques_resposta(
    db: AsyncSession, user: User, veiculos: list[Veiculo]
) -> dict[uuid.UUID, list[VeiculoTanqueResponse]]:
    """Carrega reservatórios + nomes de produto em lote (evita N+1)."""
    if not veiculos:
        return {}
    ids = [v.id for v in veiculos]
    tanques = (
        await db.execute(
            select(VeiculoTanque)
            .where(
                VeiculoTanque.organization_id == user.organization_id,
                VeiculoTanque.veiculo_id.in_(ids),
                VeiculoTanque.deleted_at.is_(None),
            )
            .order_by(VeiculoTanque.tank_type, VeiculoTanque.identificacao)
        )
    ).scalars().all()
    comb_ids = {c for t in tanques for c in (t.combustivel_id, t.combustivel_alternativo_id) if c}
    nomes = {}
    if comb_ids:
        nomes = {
            c.id: c.nome
            for c in (
                await db.execute(select(Combustivel).where(Combustivel.id.in_(comb_ids)))
            ).scalars().all()
        }
    mapa: dict[uuid.UUID, list[VeiculoTanqueResponse]] = {}
    por_veiculo: dict[uuid.UUID, list] = {vid: [] for vid in ids}
    for t in tanques:
        por_veiculo[t.veiculo_id].append(
            VeiculoTanqueResponse(
                id=t.id,
                combustivel_id=t.combustivel_id,
                combustivel_nome=nomes.get(t.combustivel_id),
                combustivel_alternativo_id=t.combustivel_alternativo_id,
                combustivel_alternativo_nome=nomes.get(t.combustivel_alternativo_id),
                tank_type=t.tank_type,
                capacidade=t.capacidade,
                identificacao=t.identificacao,
                ativo=t.ativo,
            )
        )
    for v in veiculos:
        mapa[v.id] = por_veiculo.get(v.id, [])
    return mapa


def _aplicar_reservatorios(dados: dict, tanques: list[VeiculoTanqueResponse]) -> None:
    """Preenche principal/secundário/capacidade (campos de leitura) a partir
    do reservatório PRIMARY — o veículo não guarda cópia deles."""
    dados["tanques"] = tanques
    principal = next((t for t in tanques if t.tank_type == "PRIMARY"), None)
    if principal is not None:
        dados["combustivel_principal_id"] = principal.combustivel_id
        dados["combustivel_secundario_id"] = principal.combustivel_alternativo_id
        dados["capacidade_tanque_litros"] = principal.capacidade or None


async def _nomes_unidades(db: AsyncSession, ids: set) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {
        u.id: u.nome
        for u in (await db.execute(select(Unidade).where(Unidade.id.in_(ids)))).scalars().all()
    }


async def _validar_unidade(db: AsyncSession, user: User, unidade_id: uuid.UUID | None) -> None:
    if unidade_id is None:
        return
    ok = await db.scalar(
        select(Unidade.id).where(
            Unidade.id == unidade_id,
            Unidade.organization_id == user.organization_id,
            Unidade.deleted_at.is_(None),
        )
    )
    if ok is None:
        raise HTTPException(status_code=422, detail="Unidade/secretaria inválida.")


@router.get("", response_model=list[VeiculoResponse])
async def listar(
    search: str | None = None,
    situacao: str | None = None,
    tipo: str | None = None,
    combustivel_id: uuid.UUID | None = None,
    unidade_id: uuid.UUID | None = None,
    departamento: str | None = None,
    sort_by: str = "placa",
    order: str = "asc",
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    base = select(Veiculo).where(
        Veiculo.organization_id == user.organization_id,
        Veiculo.deleted_at.is_(None),
        filtro_escopo(user, Veiculo.unidade_id),
    ).options(selectinload(Veiculo.tanques))
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
        base = base.where(
            Veiculo.id.in_(
                select(VeiculoTanque.veiculo_id).where(
                    VeiculoTanque.deleted_at.is_(None),
                    (VeiculoTanque.combustivel_id == combustivel_id)
                    | (VeiculoTanque.combustivel_alternativo_id == combustivel_id),
                )
            )
        )
    if unidade_id:
        base = base.where(Veiculo.unidade_id == unidade_id)
    if departamento:
        base = base.where(Veiculo.departamento == departamento)

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
    antecedencia = (await get_configuracoes(db, user.organization_id)).antecedencia_alerta_manutencao_dias
    por_id = {v.id: v for v in veiculos}
    for plano in planos:
        proxima_km, proxima_data, situacao = _computar_proxima_execucao(
            plano, por_id.get(plano.veiculo_id), antecedencia
        )
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
    tanques_map = await _mapa_tanques_resposta(db, user, veiculos)
    unidades = await _nomes_unidades(db, {v.unidade_id for v in veiculos})
    itens = []
    for v in veiculos:
        dados = VeiculoResponse.model_validate(v, from_attributes=True).model_dump()
        dados["unidade_nome"] = unidades.get(v.unidade_id)
        dados["consumo_medio_km_l"] = consumo_map.get(v.id)
        dados["ultimo_abastecimento"] = ultimo_abast_map.get(v.id)
        dados["ultima_manutencao"] = ultima_manut_map.get(v.id)
        dados["proxima_manutencao"] = proxima_map.get(v.id)
        _aplicar_reservatorios(dados, tanques_map.get(v.id, []))
        itens.append(dados)
    return adapter.validate_python(itens)


async def _resposta(db: AsyncSession, user: User, veiculo: Veiculo) -> VeiculoResponse:
    """Resposta de um veículo com reservatórios estruturados e nomes de produto."""
    carregado = (
        await db.execute(
            select(Veiculo)
            .where(Veiculo.id == veiculo.id)
            .options(selectinload(Veiculo.tanques))
        )
    ).scalar_one()
    dados = VeiculoResponse.model_validate(carregado, from_attributes=True).model_dump()
    mapa = await _mapa_tanques_resposta(db, user, [carregado])
    _aplicar_reservatorios(dados, mapa.get(carregado.id, []))
    dados["unidade_nome"] = (await _nomes_unidades(db, {carregado.unidade_id})).get(carregado.unidade_id)
    return VeiculoResponse(**dados)


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
    dados = body.model_dump(exclude={"placa", "tanques_auxiliares", *_CAMPOS_RESERVATORIO})
    await _validar_unidade(db, user, body.unidade_id)
    renavam = normalizar_renavam(body.renavam)
    chassi = normalizar_chassi(body.chassi)
    dados["renavam"] = renavam or None
    dados["chassi"] = chassi or None

    # Valida produtos (principal e auxiliares) dentro da organização.
    await _validar_produtos_org(
        db,
        user,
        {
            c for c in [body.combustivel_principal_id, body.combustivel_secundario_id] if c
        }
        | {aux.combustivel_id for aux in body.tanques_auxiliares},
    )

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
    await _sync_reservatorios(
        db,
        veiculo,
        combustivel_principal_id=body.combustivel_principal_id or body.combustivel_secundario_id,
        capacidade_principal=body.capacidade_tanque_litros,
        tanques_auxiliares=body.tanques_auxiliares,
        combustivel_alternativo_id=body.combustivel_secundario_id if body.combustivel_principal_id else None,
    )
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
    return await _resposta(db, user, veiculo)


@router.get("/{veiculo_id}", response_model=VeiculoResponse)
async def obter(
    veiculo_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    veiculo = await _get_veiculo_tenant(db, user, veiculo_id)
    return await _resposta(db, user, veiculo)


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
        "unidade_id": str(veiculo.unidade_id) if veiculo.unidade_id else None,
    }
    enviados = body.model_dump(exclude_unset=True)
    dados = {k: v for k, v in enviados.items() if k not in ("tanques_auxiliares", *_CAMPOS_RESERVATORIO)}
    if "unidade_id" in dados:
        await _validar_unidade(db, user, dados["unidade_id"])
    for campo, valor in dados.items():
        setattr(veiculo, campo, valor)

    if any(k in enviados for k in _CAMPOS_RESERVATORIO) or body.tanques_auxiliares is not None:
        await _validar_produtos_org(
            db,
            user,
            {c for c in [body.combustivel_principal_id, body.combustivel_secundario_id] if c}
            | {aux.combustivel_id for aux in (body.tanques_auxiliares or [])},
        )
        await _sync_reservatorios(
            db,
            veiculo,
            combustivel_principal_id=body.combustivel_principal_id,
            capacidade_principal=body.capacidade_tanque_litros,
            tanques_auxiliares=body.tanques_auxiliares,
            combustivel_alternativo_id=(
                body.combustivel_secundario_id
                if "combustivel_secundario_id" in enviados
                else _NAO_INFORMADO
            ),
        )

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
    return await _resposta(db, user, veiculo)


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
    user: User = Depends(require_permission(Perm.REFUELING_MANAGE, Perm.VEHICLE_MANAGE)),
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
    # Resposta com reservatórios carregados em lote — serializar o ORM direto
    # tentaria lazy-load de `tanques` fora do contexto async (MissingGreenlet).
    return await _resposta(db, user, veiculo)


# ── Documentos do veículo ────────────────────────────────────────────────────


@router.get("/{veiculo_id}/documentos", response_model=list[DocumentoVeiculoResponse])
async def listar_documentos(
    veiculo_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
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
