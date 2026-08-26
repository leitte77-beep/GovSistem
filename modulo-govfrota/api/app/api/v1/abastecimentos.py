import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
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
)
from app.services.abastecimento import (
    find_abastecimento_by_idempotency,
    get_configuracoes,
    registrar_abastecimento,
)
from app.services.auditoria import registrar_auditoria
from app.services.estoque import EstoqueError, aplicar_movimentacao

router = APIRouter(prefix="/abastecimentos", tags=["abastecimentos"])


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


@router.get("", response_model=list[AbastecimentoResponse])
async def listar(
    veiculo_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    tanque_id: uuid.UUID | None = None,
    combustivel_id: uuid.UUID | None = None,
    status: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    skip: int = 0,
    limit: int = 50,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Abastecimento).where(Abastecimento.organization_id == user.organization_id)
    if veiculo_id:
        stmt = stmt.where(Abastecimento.veiculo_id == veiculo_id)
    if motorista_id:
        stmt = stmt.where(Abastecimento.motorista_id == motorista_id)
    if tanque_id:
        stmt = stmt.where(Abastecimento.tanque_id == tanque_id)
    if combustivel_id:
        stmt = stmt.where(Abastecimento.combustivel_id == combustivel_id)
    if status:
        stmt = stmt.where(Abastecimento.status == status.upper())
    if data_inicio:
        from datetime import date

        stmt = stmt.where(Abastecimento.data_abastecimento >= datetime.combine(date.fromisoformat(data_inicio), datetime.min.time()))
    if data_fim:
        from datetime import date, time as dtime

        stmt = stmt.where(Abastecimento.data_abastecimento <= datetime.combine(date.fromisoformat(data_fim), dtime.max))
    stmt = stmt.order_by(Abastecimento.data_abastecimento.desc()).offset(skip).limit(min(limit, 200))
    registros = list((await db.execute(stmt)).scalars().all())
    if not registros:
        return registros

    # Nomes juntados (placa, combustível, tanque, motorista) — evita N+1.
    from app.models.combustivel import Combustivel
    from app.models.combustivel import Tanque as TanqueModel

    ids_veic = {r.veiculo_id for r in registros}
    ids_comb = {r.combustivel_id for r in registros}
    ids_tanque = {r.tanque_id for r in registros}
    ids_mot = {r.motorista_id for r in registros if r.motorista_id}

    placas = {
        v.id: v.placa
        for v in (
            await db.execute(select(Veiculo).where(Veiculo.id.in_(ids_veic)))
        ).scalars().all()
    }
    nomes_comb = {
        c.id: c.nome
        for c in (
            await db.execute(select(Combustivel).where(Combustivel.id.in_(ids_comb)))
        ).scalars().all()
    }
    nomes_tanque = {
        t.id: t.nome
        for t in (
            await db.execute(select(TanqueModel).where(TanqueModel.id.in_(ids_tanque)))
        ).scalars().all()
    }
    nomes_mot = {}
    if ids_mot:
        nomes_mot = {
            m.id: m.nome
            for m in (
                await db.execute(select(Motorista).where(Motorista.id.in_(ids_mot)))
            ).scalars().all()
        }

    from pydantic import TypeAdapter

    adapter = TypeAdapter(list[AbastecimentoResponse])
    itens = []
    for r in registros:
        dados = AbastecimentoResponse.model_validate(r, from_attributes=True).model_dump()
        dados["veiculo_placa"] = placas.get(r.veiculo_id)
        dados["combustivel_nome"] = nomes_comb.get(r.combustivel_id)
        dados["tanque_nome"] = nomes_tanque.get(r.tanque_id)
        dados["motorista_nome"] = nomes_mot.get(r.motorista_id) if r.motorista_id else None
        itens.append(dados)
    return adapter.validate_python(itens)


@router.get("/{abastecimento_id}", response_model=AbastecimentoResponse)
async def obter(
    abastecimento_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await _get_abastecimento(db, user, abastecimento_id)


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
            return existente

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
                return existente
            raise HTTPException(
                status_code=409,
                detail="Este abastecimento já está sendo processado. Aguarde e verifique.",
            )
        await db.rollback()
        raise exc
    await db.refresh(abastecimento)
    return abastecimento


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
    if novo_km > abast.quilometragem or novo_km >= abast.quilometragem:
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
    return abast


# evita import não usado
_ = MovimentacaoEstoque
