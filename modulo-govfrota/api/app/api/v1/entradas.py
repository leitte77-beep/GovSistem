import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.auth_models import User
from app.models.combustivel import Combustivel, Fornecedor, Tanque
from app.models.estoque import EntradaAnexo, EntradaCombustivel, MovimentacaoEstoque
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.schemas.schemas import EntradaCancelamento, EntradaCreate, EntradaResponse
from app.services.auditoria import registrar_auditoria
from app.services.abastecimento import get_configuracoes
from app.services.estoque import EstoqueError, aplicar_movimentacao

router = APIRouter(prefix="/entradas", tags=["entradas de combustível"])


async def _get_entrada(db: AsyncSession, user: User, entrada_id: uuid.UUID) -> EntradaCombustivel:
    result = await db.execute(
        select(EntradaCombustivel)
        .options(
            selectinload(EntradaCombustivel.tanque),
            selectinload(EntradaCombustivel.combustivel),
            selectinload(EntradaCombustivel.fornecedor),
            selectinload(EntradaCombustivel.anexos).selectinload(EntradaAnexo.anexo),
        )
        .where(
            EntradaCombustivel.id == entrada_id,
            EntradaCombustivel.organization_id == user.organization_id,
        )
    )
    entrada = result.scalar_one_or_none()
    if entrada is None:
        raise HTTPException(status_code=404, detail="Entrada não encontrada.")
    return entrada


async def _montar_entrada(db: AsyncSession, entrada: EntradaCombustivel) -> EntradaResponse:
    anexos = []
    for ea in entrada.anexos:
        if ea.anexo is not None:
            anexos.append({
                "id": str(ea.anexo.id),
                "nome": ea.anexo.nome_arquivo,
                "tipo": ea.anexo.tipo,
                "mime": ea.anexo.mime_type,
                "url": f"/api/govfrota/uploads/{ea.anexo.id}",
            })
    return EntradaResponse(
        id=entrada.id,
        tanque_id=entrada.tanque_id,
        combustivel_id=entrada.combustivel_id,
        fornecedor_id=entrada.fornecedor_id,
        quantidade_litros=entrada.quantidade_litros,
        data_entrada=entrada.data_entrada,
        numero_nota=entrada.numero_nota,
        serie_nota=entrada.serie_nota,
        chave_nfe=entrada.chave_nfe,
        valor_total=entrada.valor_total,
        valor_por_litro=entrada.valor_por_litro,
        observacoes=entrada.observacoes,
        cancelada=entrada.cancelada,
        cancelada_em=entrada.cancelada_em,
        motivo_cancelamento=entrada.motivo_cancelamento,
        responsavel_usuario_id=entrada.responsavel_usuario_id,
        tanque_nome=entrada.tanque.nome if entrada.tanque else None,
        combustivel_nome=entrada.combustivel.nome if entrada.combustivel else None,
        fornecedor_nome=(
            entrada.fornecedor.razao_social or entrada.fornecedor.nome_fantasia
            if entrada.fornecedor else None
        ),
        anexos=anexos,
    )


async def _validar_anexos(
    db: AsyncSession, organization_id: uuid.UUID, anexos_ids: list[uuid.UUID] | None
) -> list[Anexo]:
    """Valida que todos os anexos pertencem à organização (isolamento por tenant)."""
    if not anexos_ids:
        return []
    unicos = list(dict.fromkeys(anexos_ids))
    result = await db.execute(
        select(Anexo).where(
            Anexo.id.in_(unicos),
            Anexo.organization_id == organization_id,
            Anexo.deleted_at.is_(None),
        )
    )
    anexos = {a.id: a for a in result.scalars().all()}
    for aid in unicos:
        if aid not in anexos:
            raise HTTPException(status_code=422, detail="Anexo inválido.")
    return list(anexos.values())


@router.get("", response_model=list[EntradaResponse])
async def listar(
    tanque_id: uuid.UUID | None = None,
    fornecedor_id: uuid.UUID | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    numero_nota: str | None = None,
    cancelada: bool | None = None,
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    base = select(EntradaCombustivel).where(
        EntradaCombustivel.organization_id == user.organization_id
    )
    if tanque_id:
        base = base.where(EntradaCombustivel.tanque_id == tanque_id)
    if fornecedor_id:
        base = base.where(EntradaCombustivel.fornecedor_id == fornecedor_id)
    if data_inicio:
        base = base.where(EntradaCombustivel.data_entrada >= date.fromisoformat(data_inicio))
    if data_fim:
        base = base.where(EntradaCombustivel.data_entrada <= date.fromisoformat(data_fim))
    if numero_nota:
        base = base.where(EntradaCombustivel.numero_nota.ilike(f"%{numero_nota}%"))
    if cancelada is not None:
        base = base.where(EntradaCombustivel.cancelada == cancelada)

    total = await db.scalar(
        select(sa_func.count()).select_from(base.order_by(None).subquery())
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(int(total or 0))

    stmt = (
        base.options(
            selectinload(EntradaCombustivel.tanque),
            selectinload(EntradaCombustivel.combustivel),
            selectinload(EntradaCombustivel.fornecedor),
            selectinload(EntradaCombustivel.anexos).selectinload(EntradaAnexo.anexo),
        )
        .order_by(EntradaCombustivel.data_entrada.desc(), EntradaCombustivel.created_at.desc())
        .offset(skip)
        .limit(min(limit, 200))
    )
    entradas = (await db.execute(stmt)).scalars().all()
    respostas = []
    for e in entradas:
        respostas.append(await _montar_entrada(db, e))
    return respostas


@router.post("", response_model=EntradaResponse, status_code=201)
async def criar(
    body: EntradaCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Registra compra/recebimento de combustível e credita o estoque do tanque."""
    config = await get_configuracoes(db, user.organization_id)

    tanque = (
        await db.execute(
            select(Tanque).where(
                Tanque.id == body.tanque_id,
                Tanque.organization_id == user.organization_id,
                Tanque.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if tanque is None:
        raise HTTPException(status_code=422, detail="Tanque inválido.")

    combustivel = (
        await db.execute(
            select(Combustivel).where(
                Combustivel.id == body.combustivel_id,
                Combustivel.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if combustivel is None:
        raise HTTPException(status_code=422, detail="Combustível inválido.")
    if combustivel.id != tanque.combustivel_id:
        raise HTTPException(
            status_code=422, detail="O combustível da entrada não corresponde ao combustível do tanque."
        )
    if config.exigir_nf_entrada and not body.numero_nota:
        raise HTTPException(status_code=422, detail="Número da nota fiscal é obrigatório.")
    if config.exigir_fornecedor_entrada and not body.fornecedor_id:
        raise HTTPException(status_code=422, detail="Fornecedor é obrigatório.")
    if body.fornecedor_id:
        fornecedor_ok = (
            await db.execute(
                select(Fornecedor.id).where(
                    Fornecedor.id == body.fornecedor_id,
                    Fornecedor.organization_id == user.organization_id,
                )
            )
        ).scalar_one_or_none()
        if fornecedor_ok is None:
            raise HTTPException(status_code=422, detail="Fornecedor inválido.")

    # Valor por litro e valor total: aceita informar o total e/ou o unitário.
    # - Só total → unitário = total ÷ quantidade.
    # - Só unitário → total = unitário × quantidade.
    # - Ambos → respeita os dois valores informados (unitário vira o custo médio).
    valor_por_litro = body.valor_unitario
    valor_total = body.valor_total
    if body.valor_unitario is not None and body.valor_total is None:
        valor_total = (Decimal(body.valor_unitario) * Decimal(body.quantidade_litros)).quantize(Decimal("0.01"))
    if body.valor_total is not None and body.valor_unitario is None and Decimal(body.quantidade_litros) > 0:
        valor_por_litro = (Decimal(body.valor_total) / Decimal(body.quantidade_litros)).quantize(Decimal("0.0001"))

    # Unifica anexos: múltiplos (novo) ou único legado.
    anexos_ids = list(body.anexos_ids or [])
    if body.anexo_id and body.anexo_id not in anexos_ids:
        anexos_ids.append(body.anexo_id)
    anexos = await _validar_anexos(db, user.organization_id, anexos_ids)

    entrada = EntradaCombustivel(
        **body.model_dump(exclude={"anexos_ids", "valor_unitario", "valor_total"}),
        valor_total=valor_total,
        valor_por_litro=valor_por_litro,
        organization_id=user.organization_id,
        responsavel_usuario_id=user.id,
    )
    db.add(entrada)
    await db.flush()

    for anexo in anexos:
        db.add(EntradaAnexo(
            organization_id=user.organization_id,
            entrada_id=entrada.id,
            anexo_id=anexo.id,
        ))

    try:
        await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.ENTRADA.value,
            origem=OrigemMovimentacao.ENTRADA_COMPRA.value,
            sinal=1,
            quantidade=body.quantidade_litros,
            combustivel_id=body.combustivel_id,
            tanque_id=tanque.id,
            referencia_id=entrada.id,
            referencia_tipo="ENTRADA_COMBUSTIVEL",
            custo_unitario=valor_por_litro,
            descricao=f"NF {body.numero_nota or '-'}",
            responsavel_usuario_id=user.id,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)

    await db.flush()

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="entrada.registrar",
        entidade="entrada_combustivel",
        entidade_id=entrada.id,
        usuario_id=user.id,
        dados_novos={
            "tanque": str(tanque.id),
            "litros": str(body.quantidade_litros),
            "nota": body.numero_nota,
            "valor_total": str(body.valor_total) if body.valor_total else None,
        },
    )
    await db.commit()

    await db.refresh(entrada)
    entrada = await _get_entrada(db, user, entrada.id)
    return await _montar_entrada(db, entrada)


@router.get("/{entrada_id}", response_model=EntradaResponse)
async def obter(
    entrada_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    entrada = await _get_entrada(db, user, entrada_id)
    return await _montar_entrada(db, entrada)


@router.post("/{entrada_id}/cancelar", status_code=200)
async def cancelar(
    entrada_id: uuid.UUID,
    body: EntradaCancelamento,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Cancela a entrada com justificativa — estorna o crédito do estoque.

    O registro original permanece para auditoria; nunca é apagado.
    """
    entrada = await _get_entrada(db, user, entrada_id)
    if entrada.cancelada:
        raise HTTPException(status_code=422, detail="Entrada já cancelada.")

    # Segurança: o estorno não pode gerar estoque negativo. Se o saldo atual do
    # tanque for inferior ao volume da entrada, orienta-se ajuste administrativo.
    tanque = (
        await db.execute(
            select(Tanque).where(
                Tanque.id == entrada.tanque_id,
                Tanque.organization_id == user.organization_id,
                Tanque.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if tanque is not None and Decimal(tanque.estoque_atual) < Decimal(entrada.quantidade_litros):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Não é possível cancelar esta entrada: o estoque atual do tanque "
                f"({tanque.estoque_atual} L) é inferior ao volume da entrada "
                f"({entrada.quantidade_litros} L). Se necessário, solicite um ajuste "
                "administrativo de estoque."
            ),
        )

    try:
        await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.ESTORNO.value,
            origem=OrigemMovimentacao.CANCELAMENTO_ENTRADA.value,
            sinal=-1,
            quantidade=entrada.quantidade_litros,
            combustivel_id=entrada.combustivel_id,
            tanque_id=entrada.tanque_id,
            referencia_id=entrada.id,
            referencia_tipo="CANCELAMENTO_ENTRADA",
            descricao=f"Estorno da NF {entrada.numero_nota or '-'}: {body.justificativa}",
            responsavel_usuario_id=user.id,
            permitir_negativo=False,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)

    entrada.cancelada = True
    entrada.cancelada_em = datetime.now(timezone.utc)
    entrada.cancelada_por_id = user.id
    entrada.motivo_cancelamento = body.justificativa

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="entrada.cancelar",
        entidade="entrada_combustivel",
        entidade_id=entrada.id,
        usuario_id=user.id,
        dados_anteriores={"cancelada": False, "litros": str(entrada.quantidade_litros)},
        dados_novos={"cancelada": True},
        justificativa=body.justificativa,
    )
    await db.commit()
    await db.refresh(entrada)
    return {"ok": True, "id": str(entrada.id), "mensagem": "Entrada cancelada e estoque estornado."}
