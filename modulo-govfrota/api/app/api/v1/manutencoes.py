import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.combustivel import Oficina
from app.models.manutencao import Manutencao, ManutencaoItem, PlanoPreventivo
from app.models.veiculo import Veiculo
from app.schemas.schemas import (
    ManutencaoCreate,
    ManutencaoItemIn,
    ManutencaoResponse,
    ManutencaoUpdate,
    PlanoPreventivoCreate,
    PlanoPreventivoResponse,
)
from datetime import date

from app.services.auditoria import registrar_auditoria

router = APIRouter(tags=["manutenções"])


async def _get_manutencao(db: AsyncSession, user: User, manutencao_id: uuid.UUID) -> Manutencao:
    result = await db.execute(
        select(Manutencao)
        .where(
            Manutencao.id == manutencao_id,
            Manutencao.organization_id == user.organization_id,
            Manutencao.deleted_at.is_(None),
        )
        .options(selectinload(Manutencao.itens))
    )
    manutencao = result.scalar_one_or_none()
    if manutencao is None:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada.")
    return manutencao


async def _enriquecer(db: AsyncSession, registros: list[Manutencao]) -> list[dict]:
    """Junta veículo e ocorrência de origem em lote (sem N+1)."""
    from app.models.ocorrencia import Ocorrencia

    ids_veic = {r.veiculo_id for r in registros}
    ids_ocorr = {r.ocorrencia_origem_id for r in registros if r.ocorrencia_origem_id}

    veiculos = {}
    if ids_veic:
        veiculos = {
            v.id: v
            for v in (
                await db.execute(select(Veiculo).where(Veiculo.id.in_(ids_veic)))
            ).scalars().all()
        }
    ocorrencias = {}
    if ids_ocorr:
        ocorrencias = {
            o.id: o
            for o in (
                await db.execute(select(Ocorrencia).where(Ocorrencia.id.in_(ids_ocorr)))
            ).scalars().all()
        }

    from pydantic import TypeAdapter

    adapter = TypeAdapter(list[ManutencaoResponse])
    itens = []
    for r in registros:
        dados = ManutencaoResponse.model_validate(r, from_attributes=True).model_dump()
        v = veiculos.get(r.veiculo_id)
        dados["veiculo_placa"] = v.placa if v else None
        dados["veiculo_modelo"] = v.modelo if v else None
        dados["veiculo_marca"] = v.marca if v else None
        dados["veiculo_foto_url"] = v.foto_url if v else None
        dados["veiculo_usa_horimetro"] = v.usa_horimetro if v else None
        o = ocorrencias.get(r.ocorrencia_origem_id)
        ov = veiculos.get(o.veiculo_id) if o else None
        dados["ocorrencia_placa"] = ov.placa if ov else None
        dados["ocorrencia_descricao"] = o.descricao if o else None
        itens.append(dados)
    return adapter.validate_python(itens)


@router.get("/manutencoes", response_model=list[ManutencaoResponse])
async def listar_manutencoes(
    veiculo_id: uuid.UUID | None = None,
    oficina_id: uuid.UUID | None = None,
    status: str | None = None,
    tipo: str | None = None,
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(require_permission(Perm.MAINTENANCE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Manutencao).where(
        Manutencao.organization_id == user.organization_id,
        Manutencao.deleted_at.is_(None),
    )
    if veiculo_id:
        stmt = stmt.where(Manutencao.veiculo_id == veiculo_id)
    if oficina_id:
        stmt = stmt.where(Manutencao.oficina_id == oficina_id)
    if status:
        stmt = stmt.where(Manutencao.status == status.upper())
    if tipo:
        stmt = stmt.where(Manutencao.tipo == tipo.upper())
    stmt = stmt.order_by(Manutencao.data_solicitacao.desc()).offset(skip).limit(min(limit, 200))
    stmt = stmt.options(selectinload(Manutencao.itens))
    result = await db.execute(stmt)
    registros = list(result.scalars().all())
    if not registros:
        return registros
    return await _enriquecer(db, registros)


@router.post("/manutencoes", response_model=ManutencaoResponse, status_code=201)
async def criar_manutencao(
    body: ManutencaoCreate,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    veiculo_ok = (
        await db.execute(
            select(Veiculo.id).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo_ok is None:
        raise HTTPException(status_code=422, detail="Veículo inválido.")
    if body.oficina_id:
        oficina_ok = (
            await db.execute(
                select(Oficina.id).where(
                    Oficina.id == body.oficina_id,
                    Oficina.organization_id == user.organization_id,
                )
            )
        ).scalar_one_or_none()
        if oficina_ok is None:
            raise HTTPException(status_code=422, detail="Oficina inválida.")

    total_itens = sum(
        (Decimal(i.quantidade) * i.valor_unitario for i in body.itens), Decimal("0")
    )
    manutencao = Manutencao(
        **{k: v for k, v in body.model_dump().items() if k != "itens"},
        organization_id=user.organization_id,
        valor_total=total_itens.quantize(Decimal("0.01")),
    )
    db.add(manutencao)
    await db.flush()

    for item in body.itens:
        db.add(
            ManutencaoItem(
                organization_id=user.organization_id,
                manutencao_id=manutencao.id,
                categoria=item.categoria.upper(),
                descricao=item.descricao,
                quantidade=item.quantidade,
                valor_unitario=item.valor_unitario,
                valor_total=(Decimal(item.quantidade) * item.valor_unitario).quantize(Decimal("0.01")),
            )
        )

    # Abertura de manutenção coloca o veículo em manutenção quando apropriado
    if manutencao.status == "ABERTA" and body.tipo in ("CORRETIVA",):
        veiculo = await db.get(Veiculo, body.veiculo_id)
        if veiculo and veiculo.organization_id == user.organization_id:
            pass  # situação permanece; gestor decide via PATCH

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="manutencao.abrir",
        entidade="manutencao",
        entidade_id=manutencao.id,
        usuario_id=user.id,
        dados_novos={"veiculo": str(body.veiculo_id), "tipo": body.tipo},
    )
    await db.commit()
    # Recarrega com itens (response_model inclui a coleção; evitar lazy-load).
    result = await db.execute(
        select(Manutencao)
        .where(Manutencao.id == manutencao.id)
        .options(selectinload(Manutencao.itens))
    )
    return result.scalar_one()


@router.get("/manutencoes/{manutencao_id}", response_model=ManutencaoResponse)
async def obter_manutencao(
    manutencao_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.MAINTENANCE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    manutencao = await _get_manutencao(db, user, manutencao_id)
    return (await _enriquecer(db, [manutencao]))[0]


@router.patch("/manutencoes/{manutencao_id}", response_model=ManutencaoResponse)
async def atualizar_manutencao(
    manutencao_id: uuid.UUID,
    body: ManutencaoUpdate,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    manutencao = await _get_manutencao(db, user, manutencao_id)

    dados = body.model_dump(exclude_unset=True)
    if dados.get("status") == "CONCLUIDA" and not dados.get("data_conclusao") and not manutencao.data_conclusao:
        raise HTTPException(
            status_code=422,
            detail="Conclusão exige a data de conclusão.",
        )

    for campo, valor in dados.items():
        setattr(manutencao, campo, valor)

    # Conclusão atualiza o veículo para disponível e planos preventivos
    if manutencao.status == "CONCLUIDA" and manutencao.quilometragem is not None:
        planos = (
            await db.execute(
                select(PlanoPreventivo).where(
                    PlanoPreventivo.organization_id == user.organization_id,
                    PlanoPreventivo.veiculo_id == manutencao.veiculo_id,
                    PlanoPreventivo.ativo.is_(True),
                )
            )
        ).scalars().all()
        for plano in planos:
            if plano.base == "QUILOMETRAGEM":
                plano.ultima_execucao_km = manutencao.quilometragem
            elif plano.base == "DATA" or plano.base == "MESES":
                plano.ultima_execucao_data = date.today()

        veiculo = await db.get(Veiculo, manutencao.veiculo_id)
        if (
            veiculo
            and veiculo.organization_id == user.organization_id
            and veiculo.situacao == "EM_MANUTENCAO"
        ):
            veiculo.situacao = "DISPONIVEL"
            if manutencao.quilometragem > veiculo.quilometragem_atual:
                veiculo.quilometragem_atual = manutencao.quilometragem

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="manutencao.atualizar",
        entidade="manutencao",
        entidade_id=manutencao.id,
        usuario_id=user.id,
        dados_novos=dados,
    )
    await db.commit()
    return await _get_manutencao(db, user, manutencao.id)


@router.post("/manutencoes/{manutencao_id}/itens", response_model=ManutencaoResponse)
async def adicionar_item(
    manutencao_id: uuid.UUID,
    body: ManutencaoItemIn,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Adiciona custo (serviço/peça/mão de obra/outros) à manutenção."""
    manutencao = await _get_manutencao(db, user, manutencao_id)
    item = ManutencaoItem(
        organization_id=user.organization_id,
        descricao=body.descricao,
        categoria=body.categoria.upper(),
        quantidade=body.quantidade,
        valor_unitario=body.valor_unitario,
        valor_total=(Decimal(body.quantidade) * body.valor_unitario).quantize(Decimal("0.01")),
    )
    # Append na relação para manter a coleção carregada consistente.
    manutencao.itens.append(item)
    await db.flush()
    manutencao.valor_total = sum(Decimal(i.valor_total) for i in manutencao.itens).quantize(
        Decimal("0.01")
    )
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="manutencao.adicionar_custo",
        entidade="manutencao",
        entidade_id=manutencao.id,
        usuario_id=user.id,
        dados_novos={"descricao": body.descricao, "total": str(body.valor_unitario * body.quantidade)},
    )
    await db.commit()
    return await _get_manutencao(db, user, manutencao.id)


# ── Manutenção preventiva (§27) ─────────────────────────────────────────────


def _computar_proxima_execucao(plano: PlanoPreventivo, km_atual: int) -> tuple:
    """Retorna (proxima_km, proxima_data, situacao_alerta) do plano preventivo."""
    from datetime import timedelta

    hoje = date.today()
    proxima_km = None
    proxima_data = None
    situacao = "OK"

    if plano.base == "QUILOMETRAGEM" and plano.intervalo_km:
        base_km = plano.ultima_execucao_km or 0
        proxima_km = base_km + plano.intervalo_km
        restante = proxima_km - km_atual
        if restante <= 0:
            situacao = "VENCIDA"
        elif restante <= max(int(plano.intervalo_km * 0.1), 500):
            situacao = "PROXIMA"
    elif plano.base in ("DATA", "MESES") and plano.intervalo_meses:
        base_data = plano.ultima_execucao_data or (
            plano.created_at.date() if plano.created_at else hoje
        )
        proxima_data = base_data + timedelta(days=30 * plano.intervalo_meses)
        dias_restantes = (proxima_data - hoje).days
        antecedencia = 15
        if dias_restantes <= 0:
            situacao = "VENCIDA"
        elif dias_restantes <= antecedencia:
            situacao = "PROXIMA"

    return proxima_km, proxima_data, situacao


@router.get("/planos-preventivos", response_model=list[PlanoPreventivoResponse])
async def listar_planos(
    veiculo_id: uuid.UUID | None = None,
    user: User = Depends(require_permission(Perm.MAINTENANCE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PlanoPreventivo).where(
        PlanoPreventivo.organization_id == user.organization_id,
        PlanoPreventivo.deleted_at.is_(None),
    )
    if veiculo_id:
        stmt = stmt.where(PlanoPreventivo.veiculo_id == veiculo_id)
    planos = (await db.execute(stmt)).scalars().all()

    resposta = []
    for plano in planos:
        veiculo = await db.get(Veiculo, plano.veiculo_id)
        km_atual = veiculo.quilometragem_atual if veiculo else 0
        proxima_km, proxima_data, situacao = _computar_proxima_execucao(plano, km_atual)

        resposta.append(
            PlanoPreventivoResponse(
                id=plano.id,
                veiculo_id=plano.veiculo_id,
                nome=plano.nome,
                base=plano.base,
                intervalo_km=plano.intervalo_km,
                intervalo_horimetro=plano.intervalo_horimetro,
                intervalo_meses=plano.intervalo_meses,
                ativo=plano.ativo,
                ultima_execucao_km=plano.ultima_execucao_km,
                ultima_execucao_data=plano.ultima_execucao_data,
                proxima_execucao_km=proxima_km,
                proxima_execucao_data=proxima_data,
                situacao_alerta=situacao,
            )
        )
    return resposta


@router.post("/planos-preventivos", response_model=PlanoPreventivoResponse, status_code=201)
async def criar_plano(
    body: PlanoPreventivoCreate,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    veiculo_ok = (
        await db.execute(
            select(Veiculo.id).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo_ok is None:
        raise HTTPException(status_code=422, detail="Veículo inválido.")

    plano = PlanoPreventivo(**body.model_dump(), organization_id=user.organization_id)
    db.add(plano)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="plano_preventivo.criar",
        entidade="plano_preventivo",
        usuario_id=user.id,
        dados_novos={"nome": body.nome, "base": body.base},
    )
    await db.commit()
    await db.refresh(plano)
    veiculo = await db.get(Veiculo, plano.veiculo_id)
    km_atual = veiculo.quilometragem_atual if veiculo else 0
    proxima_km, proxima_data, situacao = _computar_proxima_execucao(plano, km_atual)
    return PlanoPreventivoResponse(
        id=plano.id,
        veiculo_id=plano.veiculo_id,
        nome=plano.nome,
        base=plano.base,
        intervalo_km=plano.intervalo_km,
        intervalo_horimetro=plano.intervalo_horimetro,
        intervalo_meses=plano.intervalo_meses,
        ativo=plano.ativo,
        ultima_execucao_km=plano.ultima_execucao_km,
        ultima_execucao_data=plano.ultima_execucao_data,
        proxima_execucao_km=proxima_km,
        proxima_execucao_data=proxima_data,
        situacao_alerta=situacao,
    )


# ── Ocorrências (§26) ───────────────────────────────────────────────────────
