import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento, CorrecaoAbastecimento
from app.models.auth_models import User
from app.models.combustivel import Tanque
from app.models.estoque import MovimentacaoEstoque
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.models.motorista import Motorista
from app.models.veiculo import Veiculo
from app.schemas.schemas import (
    AbastecimentoAdminCreate,
    AbastecimentoCancelar,
    AbastecimentoCorrecao,
    AbastecimentoResponse,
    CorrecaoAbastecimentoResponse,
    ResumoAbastecimento,
)
from app.services.abastecimento import (
    find_abastecimento_by_idempotency,
    get_configuracoes,
    registrar_abastecimento,
)
from app.services.auditoria import registrar_auditoria
from app.services.estoque import EstoqueError, aplicar_movimentacao

router = APIRouter(prefix="/abastecimentos", tags=["abastecimentos"])

# Colunas ordenáveis (whitelist — evita SQL injection por sort_by).
_SORTABLE = {
    "data": Abastecimento.data_abastecimento,
    "litros": Abastecimento.quantidade_litros,
    "custo": Abastecimento.custo_total,
    "created_at": Abastecimento.created_at,
    "veiculo": Veiculo.placa,
    "motorista": Motorista.nome,
}

_ORIGEM_LABEL = {"ADMIN": "Administrativo", "APP_MOTORISTA": "Motorista"}


async def _get_abastecimento(
    db: AsyncSession, user: User, abastecimento_id: uuid.UUID
) -> Abastecimento:
    result = await db.execute(
        select(Abastecimento).where(
            Abastecimento.id == abastecimento_id,
            Abastecimento.organization_id == user.organization_id,
            Abastecimento.deleted_at.is_(None),
        )
    )
    abast = result.scalar_one_or_none()
    if abast is None:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado.")
    return abast


def _snapshot(abast: Abastecimento) -> dict:
    return {
        "litros": str(abast.quantidade_litros),
        "km": abast.quilometragem,
        "veiculo": str(abast.veiculo_id),
        "tanque": str(abast.tanque_id),
        "combustivel": str(abast.combustivel_id),
        "status": abast.status,
    }


def _base_consulta(user: User):
    return (
        select(Abastecimento)
        .join(Veiculo, Abastecimento.veiculo_id == Veiculo.id)
        .outerjoin(Motorista, Abastecimento.motorista_id == Motorista.id)
        .where(Abastecimento.organization_id == user.organization_id)
    )


async def _enriquecer(
    db: AsyncSession, user: User, registros: list[Abastecimento]
) -> list[dict]:
    """Junta nomes (veículo, combustível, tanque, motorista, usuários) em lote.

    Evita N+1: todos os `in_(...)` em pouquíssimas queries.
    """
    from app.models.combustivel import Combustivel

    ids_veic = {r.veiculo_id for r in registros}
    ids_comb = {r.combustivel_id for r in registros}
    ids_tanque = {r.tanque_id for r in registros}
    ids_mot = {r.motorista_id for r in registros if r.motorista_id}
    ids_user = {
        u
        for r in registros
        for u in (r.lancado_por_usuario_id, r.cancelado_por_id)
        if u is not None
    }

    veiculos = {
        v.id: v
        for v in (
            await db.execute(select(Veiculo).where(Veiculo.id.in_(ids_veic)))
        ).scalars().all()
    }
    combustiveis = {
        c.id: c.nome
        for c in (
            await db.execute(select(Combustivel).where(Combustivel.id.in_(ids_comb)))
        ).scalars().all()
    }
    tanques = {
        t.id: t
        for t in (
            await db.execute(select(Tanque).where(Tanque.id.in_(ids_tanque)))
        ).scalars().all()
    }
    motores = {}
    if ids_mot:
        motores = {
            m.id: m.nome
            for m in (
                await db.execute(select(Motorista).where(Motorista.id.in_(ids_mot)))
            ).scalars().all()
        }
    usuarios = {}
    if ids_user:
        usuarios = {
            u.id: u.name
            for u in (
                await db.execute(select(User).where(User.id.in_(ids_user)))
            ).scalars().all()
        }

    from pydantic import TypeAdapter

    adapter = TypeAdapter(list[AbastecimentoResponse])
    itens = []
    for r in registros:
        dados = AbastecimentoResponse.model_validate(r, from_attributes=True).model_dump()
        v = veiculos.get(r.veiculo_id)
        dados["veiculo_placa"] = v.placa if v else None
        dados["veiculo_modelo"] = v.modelo if v else None
        dados["veiculo_marca"] = v.marca if v else None
        dados["veiculo_foto_url"] = v.foto_url if v else None
        dados["veiculo_usa_horimetro"] = v.usa_horimetro if v else None
        dados["combustivel_nome"] = combustiveis.get(r.combustivel_id)
        t = tanques.get(r.tanque_id)
        dados["tanque_nome"] = t.nome if t else None
        dados["motorista_nome"] = (
            motores.get(r.motorista_id) if r.motorista_id else None
        )
        dados["lancado_por_nome"] = (
            usuarios.get(r.lancado_por_usuario_id) if r.lancado_por_usuario_id else None
        )
        dados["cancelado_por_nome"] = (
            usuarios.get(r.cancelado_por_id) if r.cancelado_por_id else None
        )
        itens.append(dados)
    return adapter.validate_python(itens)


def _parse_uuid(valor: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(valor)
    except (ValueError, AttributeError, TypeError):
        return None


@router.get("", response_model=list[AbastecimentoResponse])
async def listar(
    search: str | None = None,
    veiculo_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    tanque_id: uuid.UUID | None = None,
    combustivel_id: uuid.UUID | None = None,
    origem: str | None = None,
    status: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    sort_by: str = "data",
    order: str = "desc",
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = _base_consulta(user)
    if veiculo_id:
        stmt = stmt.where(Abastecimento.veiculo_id == veiculo_id)
    if motorista_id:
        stmt = stmt.where(Abastecimento.motorista_id == motorista_id)
    if tanque_id:
        stmt = stmt.where(Abastecimento.tanque_id == tanque_id)
    if combustivel_id:
        stmt = stmt.where(Abastecimento.combustivel_id == combustivel_id)
    if origem:
        stmt = stmt.where(Abastecimento.origem == origem.upper())
    if status:
        stmt = stmt.where(Abastecimento.status == status.upper())
    if data_inicio:
        from datetime import date

        stmt = stmt.where(
            Abastecimento.data_abastecimento
            >= datetime.combine(date.fromisoformat(data_inicio), datetime.min.time())
        )
    if data_fim:
        from datetime import date, time as dtime

        stmt = stmt.where(
            Abastecimento.data_abastecimento
            <= datetime.combine(date.fromisoformat(data_fim), dtime.max)
        )
    if search:
        like = f"%{search}%"
        cond = (
            Veiculo.placa.ilike(like)
            | Veiculo.modelo.ilike(like)
            | Veiculo.marca.ilike(like)
            | Motorista.nome.ilike(like)
        )
        id_uuid = _parse_uuid(search)
        if id_uuid is not None:
            cond = cond | (Abastecimento.id == id_uuid)
        stmt = stmt.where(cond)

    # Total (paginação server-side) via header.
    total = await db.scalar(
        select(sa_func.count()).select_from(stmt.order_by(None).subquery())
    )
    total = int(total or 0)

    coluna = _SORTABLE.get(sort_by, Abastecimento.data_abastecimento)
    ordenado = coluna.desc() if order.lower() == "desc" else coluna.asc()
    stmt = stmt.order_by(ordenado).offset(skip).limit(min(limit, 200))
    registros = list((await db.execute(stmt)).scalars().unique().all())

    if response is not None:
        response.headers["X-Total-Count"] = str(total)
    if not registros:
        return registros
    return await _enriquecer(db, user, registros)


@router.get("/resumo", response_model=ResumoAbastecimento)
async def resumo(
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Indicadores resumidos para o cabeçalho da área de abastecimentos."""
    agora = datetime.now(timezone.utc)
    inicio_hoje = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    inicio_mes = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    async def _agregado(inicio: datetime) -> tuple[int, float, float]:
        row = await db.execute(
            select(
                sa_func.count(Abastecimento.id),
                sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
                sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
            ).where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.status == "CONFIRMADO",
                Abastecimento.data_abastecimento >= inicio,
            )
        )
        qtd, litros, gasto = row.one()
        return int(qtd or 0), float(litros or 0), float(gasto or 0)

    hoje_qtd, hoje_litros, _ = await _agregado(inicio_hoje)
    mes_qtd, mes_litros, mes_gasto = await _agregado(inicio_mes)

    consumo = await db.scalar(
        select(sa_func.avg(Abastecimento.consumo_km_l)).where(
            Abastecimento.organization_id == user.organization_id,
            Abastecimento.status == "CONFIRMADO",
            Abastecimento.consumo_km_l.isnot(None),
            Abastecimento.data_abastecimento >= agora - timedelta(days=90),
        )
    )
    consumo_frota = (
        float(Decimal(str(consumo)).quantize(Decimal("0.1"))) if consumo else None
    )

    return ResumoAbastecimento(
        hoje_quantidade=hoje_qtd,
        hoje_litros=hoje_litros,
        mes_litros=mes_litros,
        mes_gasto=mes_gasto,
        consumo_medio_frota=consumo_frota,
    )


@router.get("/{abastecimento_id}/correcoes", response_model=list[CorrecaoAbastecimentoResponse])
async def correcoes(
    abastecimento_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Linha do tempo de correções/cancelamentos do abastecimento (auditoria)."""
    await _get_abastecimento(db, user, abastecimento_id)
    result = await db.execute(
        select(CorrecaoAbastecimento)
        .where(
            CorrecaoAbastecimento.organization_id == user.organization_id,
            CorrecaoAbastecimento.abastecimento_id == abastecimento_id,
        )
        .order_by(CorrecaoAbastecimento.created_at.asc())
    )
    return list(result.scalars().all())


@router.get("/{abastecimento_id}", response_model=AbastecimentoResponse)
async def obter(
    abastecimento_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    abast = await _get_abastecimento(db, user, abastecimento_id)
    return (await _enriquecer(db, user, [abast]))[0]


@router.post("", response_model=AbastecimentoResponse, status_code=201)
async def criar_admin(
    body: AbastecimentoAdminCreate,
    request: Request,
    user: User = Depends(require_permission(Perm.REFUELING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Lançamento administrativo de abastecimento (permite retroativo se configurado)."""
    config = await get_configuracoes(db, user.organization_id)

    agora = datetime.now(timezone.utc)
    data_informada = body.data_abastecimento
    if data_informada.tzinfo is None:
        data_informada = data_informada.replace(tzinfo=timezone.utc)
    if data_informada < agora - timedelta(hours=1) and not config.permitir_retroativo:
        raise HTTPException(
            status_code=422,
            detail="Lançamento retroativo desabilitado nas configurações da organização.",
        )

    veiculo = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")

    if body.motorista_id is not None:
        motorista_ok = (
            await db.execute(
                select(Motorista.id).where(
                    Motorista.id == body.motorista_id,
                    Motorista.organization_id == user.organization_id,
                    Motorista.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if motorista_ok is None:
            raise HTTPException(status_code=422, detail="Motorista inválido.")

    tanque_ok = (
        await db.execute(
            select(Tanque.id).where(
                Tanque.id == body.tanque_id,
                Tanque.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if tanque_ok is None:
        raise HTTPException(status_code=422, detail="Tanque inválido.")

    info = get_client_info(request) if request else {"ip_address": None}

    # Idempotência: reenvio seguro.
    if body.idempotency_key:
        existente = await find_abastecimento_by_idempotency(
            db, user.organization_id, body.idempotency_key
        )
        if existente:
            return (await _enriquecer(db, user, [existente]))[0]

    try:
        abastecimento, avisos = await registrar_abastecimento(
            db,
            organization_id=user.organization_id,
            veiculo=veiculo,
            tanque_id=body.tanque_id,
            combustivel_id=body.combustivel_id,
            quantidade_litros=Decimal(body.quantidade_litros),
            quilometragem=body.quilometragem,
            data_abastecimento=data_informada,
            motorista_id=body.motorista_id,
            responsavel_usuario_id=user.id,
            origem="ADMIN",
            completou_tanque=body.completou_tanque,
            foto_bomba_url=body.foto_bomba_url,
            foto_painel_url=body.foto_painel_url,
            observacoes=body.observacoes,
            ip_origem=info.get("ip_address"),
            idempotency_key=body.idempotency_key,
            permitir_estoque_negativo=(
                config.permitir_estoque_negativo
                and Perm.FUEL_MANAGE in get_user_permissions(user)
            ),
        )
        await db.commit()
    except EstoqueError as e:
        await db.rollback()
        raise HTTPException(status_code=422, detail=e.mensagem)
    except Exception as exc:
        from sqlalchemy.exc import IntegrityError

        if isinstance(exc, IntegrityError) and body.idempotency_key:
            await db.rollback()
            existente = await find_abastecimento_by_idempotency(
                db, user.organization_id, body.idempotency_key
            )
            if existente:
                return (await _enriquecer(db, user, [existente]))[0]
            raise HTTPException(
                status_code=409,
                detail="Este abastecimento já está sendo processado. Aguarde e verifique.",
            )
        await db.rollback()
        raise exc
    await db.refresh(abastecimento)
    return (await _enriquecer(db, user, [abastecimento]))[0]


@router.post("/{abastecimento_id}/cancelar")
async def cancelar(
    abastecimento_id: uuid.UUID,
    body: AbastecimentoCancelar,
    user: User = Depends(require_permission(Perm.REFUELING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Cancela o abastecimento com justificativa e estorna a saída do estoque."""
    abast = await _get_abastecimento(db, user, abastecimento_id)
    if abast.status != "CONFIRMADO":
        raise HTTPException(status_code=422, detail="Abastecimento já cancelado.")

    try:
        await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.ESTORNO.value,
            origem=OrigemMovimentacao.ESTORNO_ABASTECIMENTO.value,
            sinal=1,
            quantidade=abast.quantidade_litros,
            combustivel_id=abast.combustivel_id,
            tanque_id=abast.tanque_id,
            referencia_tipo="ESTORNO_ABASTECIMENTO",
            descricao=f"Estorno do abastecimento {abast.id}: {body.justificativa}",
            responsavel_usuario_id=user.id,
            permitir_negativo=True,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)

    anteriores = _snapshot(abast)
    abast.status = "CANCELADO"
    abast.cancelado_em = datetime.now(timezone.utc)
    abast.cancelado_por_id = user.id
    abast.motivo_cancelamento = body.justificativa

    db.add(
        CorrecaoAbastecimento(
            organization_id=user.organization_id,
            abastecimento_id=abast.id,
            tipo_correcao="CANCELAMENTO",
            dados_anteriores_json=json.dumps(anteriores),
            justificativa=body.justificativa,
            usuario_id=user.id,
        )
    )
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="abastecimento.cancelar",
        entidade="abastecimento",
        entidade_id=abast.id,
        usuario_id=user.id,
        dados_anteriores=anteriores,
        justificativa=body.justificativa,
    )
    await db.commit()
    return {"ok": True, "id": str(abast.id), "mensagem": "Abastecimento cancelado e estoque estornado."}


@router.post("/{abastecimento_id}/corrigir", response_model=AbastecimentoResponse)
async def corrigir(
    abastecimento_id: uuid.UUID,
    body: AbastecimentoCorrecao,
    user: User = Depends(require_permission(Perm.REFUELING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Corrige litros/km de um abastecimento confirmado — mantém rastreabilidade.

    Ajusta a diferença de litros no estoque (nova movimentação auditável).
    """
    abast = await _get_abastecimento(db, user, abastecimento_id)
    if abast.status != "CONFIRMADO":
        raise HTTPException(status_code=422, detail="Não é possível corrigir um abastecimento cancelado.")

    anteriores = _snapshot(abast)
    novo_litros = Decimal(body.quantidade_litros) if body.quantidade_litros is not None else Decimal(abast.quantidade_litros)
    novo_km = body.quilometragem if body.quilometragem is not None else abast.quilometragem

    # Diferença de estoque decorrente da correção de litros
    diferenca = novo_litros - Decimal(abast.quantidade_litros)
    if diferenca > 0:
        try:
            await aplicar_movimentacao(
                db,
                organization_id=user.organization_id,
                tipo=TipoMovimentacao.SAIDA.value,
                origem=OrigemMovimentacao.ABASTECIMENTO.value,
                sinal=-1,
                quantidade=diferenca,
                combustivel_id=abast.combustivel_id,
                tanque_id=abast.tanque_id,
                referencia_tipo="CORRECAO_ABASTECIMENTO",
                descricao=f"Diferença por correção do abastecimento {abast.id}",
                responsavel_usuario_id=user.id,
                permitir_negativo=True,
            )
        except EstoqueError as e:
            raise HTTPException(status_code=422, detail=e.mensagem)
    elif diferenca < 0:
        await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.ESTORNO.value,
            origem=OrigemMovimentacao.ESTORNO_ABASTECIMENTO.value,
            sinal=1,
            quantidade=abs(diferenca),
            combustivel_id=abast.combustivel_id,
            tanque_id=abast.tanque_id,
            referencia_tipo="CORRECAO_ABASTECIMENTO",
            descricao=f"Devolução por correção do abastecimento {abast.id}",
            responsavel_usuario_id=user.id,
            permitir_negativo=True,
        )

    abast.quantidade_litros = novo_litros
    if novo_km >= abast.quilometragem:
        abast.quilometragem = novo_km
    veiculo = await db.get(Veiculo, abast.veiculo_id)
    if veiculo and veiculo.organization_id == user.organization_id and novo_km > veiculo.quilometragem_atual:
        veiculo.quilometragem_atual = novo_km

    novos = _snapshot(abast)
    db.add(
        CorrecaoAbastecimento(
            organization_id=user.organization_id,
            abastecimento_id=abast.id,
            tipo_correcao="CORRECAO",
            dados_anteriores_json=json.dumps(anteriores),
            dados_novos_json=json.dumps(novos),
            justificativa=body.justificativa,
            usuario_id=user.id,
        )
    )
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="abastecimento.corrigir",
        entidade="abastecimento",
        entidade_id=abast.id,
        usuario_id=user.id,
        dados_anteriores=anteriores,
        dados_novos=novos,
        justificativa=body.justificativa,
    )
    await db.commit()
    await db.refresh(abast)
    return (await _enriquecer(db, user, [abast]))[0]


# evita import não usado
_ = MovimentacaoEstoque
