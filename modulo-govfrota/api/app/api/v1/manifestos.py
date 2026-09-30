"""Manifestos de entrada — NF-e de combustível aguardando descarga no tanque.

Uma nota emitida contra o CNPJ do órgão (importada por XML da SEFAZ ou lançada
manualmente) vira um manifesto PENDENTE. Ao confirmar a descarga em um tanque,
o manifesto é vinculado e gera a ``EntradaCombustivel`` correspondente,
creditando o estoque com a mesma trilha de auditoria das entradas normais.
"""

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.storage import storage
from app.models.anexo import Anexo
from app.models.auth_models import User
from app.models.combustivel import Combustivel, Fornecedor, Tanque
from app.models.estoque import EntradaAnexo, EntradaCombustivel
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.models.manifesto import ManifestoEntrada
from app.schemas.schemas import (
    ManifestoCreate,
    ManifestoIgnorar,
    ManifestoImportacao,
    ManifestoResponse,
    ManifestoVinculo,
)
from app.services.abastecimento import get_configuracoes
from app.services.auditoria import registrar_auditoria
from app.services.estoque import EstoqueError, aplicar_movimentacao
from app.services.nfe import NFeInvalida, ler_nfe

router = APIRouter(prefix="/manifestos", tags=["manifestos de entrada"])

STATUS_PENDENTE = "PENDENTE"
STATUS_VINCULADO = "VINCULADO"
STATUS_IGNORADO = "IGNORADO"


async def _combustivel_por_item(
    db: AsyncSession, organization_id: uuid.UUID, codigo_anp: str | None, descricao: str | None
) -> Combustivel | None:
    """Casa o item da NF-e com um combustível cadastrado (ANP primeiro, nome depois)."""
    if codigo_anp:
        achado = (
            await db.execute(
                select(Combustivel).where(
                    Combustivel.organization_id == organization_id,
                    Combustivel.deleted_at.is_(None),
                    Combustivel.codigo_anp == codigo_anp,
                )
            )
        ).scalars().first()
        if achado is not None:
            return achado
    if descricao:
        termo = descricao.strip().lower()[:40]
        achado = (
            await db.execute(
                select(Combustivel)
                .where(
                    Combustivel.organization_id == organization_id,
                    Combustivel.deleted_at.is_(None),
                    sa_func.lower(Combustivel.nome).like(f"%{termo}%"),
                )
                .order_by(sa_func.length(Combustivel.nome))
                .limit(1)
            )
        ).scalars().first()
        if achado is not None:
            return achado
    return None


async def _montar(db: AsyncSession, manifestos: list[ManifestoEntrada]) -> list[ManifestoResponse]:
    ids = [m.combustivel_id for m in manifestos if m.combustivel_id]
    nomes: dict[uuid.UUID, str] = {}
    if ids:
        nomes = {
            c.id: c.nome
            for c in (
                await db.execute(select(Combustivel).where(Combustivel.id.in_(ids)))
            ).scalars().all()
        }
    return [
        ManifestoResponse(
            id=m.id,
            chave_nfe=m.chave_nfe,
            numero=m.numero,
            serie=m.serie,
            emitente_nome=m.emitente_nome,
            emitente_cnpj=m.emitente_cnpj,
            data_emissao=m.data_emissao,
            combustivel_id=m.combustivel_id,
            combustivel_nome=nomes.get(m.combustivel_id) if m.combustivel_id else None,
            descricao_item=m.descricao_item,
            codigo_anp=m.codigo_anp,
            quantidade_litros=m.quantidade_litros,
            valor_unitario=m.valor_unitario,
            valor_total=m.valor_total,
            status=m.status,
            origem=m.origem,
            entrada_id=m.entrada_id,
            anexo_id=m.anexo_id,
            observacoes=m.observacoes,
            created_at=m.created_at,
        )
        for m in manifestos
    ]


@router.get("", response_model=list[ManifestoResponse])
async def listar(
    status: str | None = STATUS_PENDENTE,
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    base = select(ManifestoEntrada).where(
        ManifestoEntrada.organization_id == user.organization_id
    )
    if status:
        base = base.where(ManifestoEntrada.status == status.upper())

    total = await db.scalar(select(sa_func.count()).select_from(base.order_by(None).subquery()))
    if response is not None:
        response.headers["X-Total-Count"] = str(int(total or 0))

    manifestos = (
        await db.execute(
            base.order_by(ManifestoEntrada.created_at.desc()).offset(skip).limit(min(limit, 200))
        )
    ).scalars().all()
    return await _montar(db, list(manifestos))


@router.post("", response_model=ManifestoResponse, status_code=201)
async def criar(
    body: ManifestoCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Lançamento manual de uma NF-e pendente (sem XML)."""
    if body.combustivel_id is not None:
        existe = await db.scalar(
            select(Combustivel.id).where(
                Combustivel.id == body.combustivel_id,
                Combustivel.organization_id == user.organization_id,
            )
        )
        if existe is None:
            raise HTTPException(status_code=422, detail="Combustível inválido.")
    manifesto = ManifestoEntrada(
        **body.model_dump(),
        organization_id=user.organization_id,
        origem="MANUAL",
        status=STATUS_PENDENTE,
    )
    db.add(manifesto)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="manifesto.criar",
        entidade="manifesto_entrada",
        entidade_id=manifesto.id,
        usuario_id=user.id,
        dados_novos={"numero": body.numero, "chave": body.chave_nfe},
    )
    await db.commit()
    await db.refresh(manifesto)
    return (await _montar(db, [manifesto]))[0]


@router.post("/importar", response_model=ManifestoResponse, status_code=201)
async def importar(
    body: ManifestoImportacao,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Lê o XML de uma NF-e já enviada via /uploads e cria o manifesto pendente."""
    anexo = (
        await db.execute(
            select(Anexo).where(
                Anexo.id == body.anexo_id,
                Anexo.organization_id == user.organization_id,
                Anexo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if anexo is None:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")
    if not storage.exists(anexo.caminho):
        raise HTTPException(status_code=404, detail="Arquivo do anexo não encontrado.")

    conteudo = storage.read(anexo.caminho)
    try:
        nfe = ler_nfe(conteudo)
    except NFeInvalida as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    existente = (
        await db.execute(
            select(ManifestoEntrada).where(
                ManifestoEntrada.organization_id == user.organization_id,
                ManifestoEntrada.chave_nfe == nfe.chave,
                ManifestoEntrada.status == STATUS_PENDENTE,
            )
        )
    ).scalars().first()
    if existente is not None:
        raise HTTPException(status_code=409, detail="Esta NF-e já está aguardando vinculação.")

    item = nfe.itens[0] if nfe.itens else None
    combustivel = await _combustivel_por_item(
        db, user.organization_id, item.codigo_anp if item else None, item.descricao if item else None
    )
    manifesto = ManifestoEntrada(
        organization_id=user.organization_id,
        chave_nfe=nfe.chave,
        numero=nfe.numero or None,
        serie=nfe.serie,
        emitente_nome=nfe.emitente_nome,
        emitente_cnpj=nfe.emitente_cnpj,
        data_emissao=nfe.emissao,
        combustivel_id=combustivel.id if combustivel else None,
        descricao_item=item.descricao if item else None,
        codigo_anp=item.codigo_anp if item else None,
        quantidade_litros=item.quantidade if item else None,
        valor_unitario=item.valor_unitario if item else None,
        valor_total=item.valor_total if item else nfe.valor_total,
        status=STATUS_PENDENTE,
        origem="XML",
        anexo_id=anexo.id,
    )
    db.add(manifesto)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="manifesto.importar",
        entidade="manifesto_entrada",
        entidade_id=manifesto.id,
        usuario_id=user.id,
        dados_novos={"chave": nfe.chave, "numero": nfe.numero},
    )
    await db.commit()
    await db.refresh(manifesto)
    return (await _montar(db, [manifesto]))[0]


@router.post("/{manifesto_id}/vincular", response_model=ManifestoResponse)
async def vincular(
    manifesto_id: uuid.UUID,
    body: ManifestoVinculo,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Confirma a descarga no tanque: gera a entrada e credita o estoque."""
    manifesto = (
        await db.execute(
            select(ManifestoEntrada).where(
                ManifestoEntrada.id == manifesto_id,
                ManifestoEntrada.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if manifesto is None:
        raise HTTPException(status_code=404, detail="Manifesto não encontrado.")
    if manifesto.status != STATUS_PENDENTE:
        raise HTTPException(status_code=422, detail="Este manifesto já foi processado.")

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
    if body.fornecedor_id is not None:
        fornecedor_ok = await db.scalar(
            select(Fornecedor.id).where(
                Fornecedor.id == body.fornecedor_id,
                Fornecedor.organization_id == user.organization_id,
            )
        )
        if fornecedor_ok is None:
            raise HTTPException(status_code=422, detail="Fornecedor inválido.")

    quantidade = body.quantidade_litros or manifesto.quantidade_litros
    if quantidade is None or Decimal(quantidade) <= 0:
        raise HTTPException(status_code=422, detail="Informe a quantidade de litros da entrada.")
    numero_nota = manifesto.numero
    if config.exigir_nf_entrada and not numero_nota:
        raise HTTPException(status_code=422, detail="Número da nota fiscal é obrigatório.")

    valor_por_litro = body.valor_unitario or manifesto.valor_unitario
    valor_total = body.valor_total or manifesto.valor_total
    if valor_por_litro is None and valor_total is not None and Decimal(quantidade) > 0:
        valor_por_litro = (Decimal(valor_total) / Decimal(quantidade)).quantize(Decimal("0.0001"))
    if valor_total is None and valor_por_litro is not None:
        valor_total = (Decimal(valor_por_litro) * Decimal(quantidade)).quantize(Decimal("0.01"))

    entrada = EntradaCombustivel(
        organization_id=user.organization_id,
        tanque_id=tanque.id,
        combustivel_id=tanque.combustivel_id,
        fornecedor_id=body.fornecedor_id,
        quantidade_litros=quantidade,
        data_entrada=body.data_entrada or date.today(),
        numero_nota=numero_nota,
        serie_nota=manifesto.serie,
        chave_nfe=manifesto.chave_nfe,
        valor_total=valor_total,
        valor_por_litro=valor_por_litro,
        observacoes=body.observacoes or manifesto.observacoes,
        responsavel_usuario_id=user.id,
    )
    db.add(entrada)
    await db.flush()

    # Preserva o XML da NF-e vinculado à entrada gerada.
    if manifesto.anexo_id is not None:
        db.add(
            EntradaAnexo(
                organization_id=user.organization_id,
                entrada_id=entrada.id,
                anexo_id=manifesto.anexo_id,
            )
        )

    try:
        await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.ENTRADA.value,
            origem=OrigemMovimentacao.ENTRADA_COMPRA.value,
            sinal=1,
            quantidade=quantidade,
            combustivel_id=tanque.combustivel_id,
            tanque_id=tanque.id,
            referencia_id=entrada.id,
            referencia_tipo="ENTRADA_COMBUSTIVEL",
            custo_unitario=valor_por_litro,
            descricao=f"NF {numero_nota or '-'} (manifesto)",
            responsavel_usuario_id=user.id,
        )
    except EstoqueError as exc:
        raise HTTPException(status_code=422, detail=exc.mensagem)

    manifesto.status = STATUS_VINCULADO
    manifesto.entrada_id = entrada.id
    if manifesto.combustivel_id is None:
        manifesto.combustivel_id = tanque.combustivel_id

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="manifesto.vincular",
        entidade="manifesto_entrada",
        entidade_id=manifesto.id,
        usuario_id=user.id,
        dados_novos={"entrada_id": str(entrada.id), "tanque": str(tanque.id)},
    )
    await db.commit()
    await db.refresh(manifesto)
    return (await _montar(db, [manifesto]))[0]


@router.post("/{manifesto_id}/ignorar", response_model=ManifestoResponse)
async def ignorar(
    manifesto_id: uuid.UUID,
    body: ManifestoIgnorar,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    manifesto = (
        await db.execute(
            select(ManifestoEntrada).where(
                ManifestoEntrada.id == manifesto_id,
                ManifestoEntrada.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if manifesto is None:
        raise HTTPException(status_code=404, detail="Manifesto não encontrado.")
    if manifesto.status == STATUS_VINCULADO:
        raise HTTPException(status_code=422, detail="Manifesto já vinculado não pode ser ignorado.")
    manifesto.status = STATUS_IGNORADO
    if body.justificativa:
        manifesto.observacoes = body.justificativa
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="manifesto.ignorar",
        entidade="manifesto_entrada",
        entidade_id=manifesto.id,
        usuario_id=user.id,
        justificativa=body.justificativa,
    )
    await db.commit()
    await db.refresh(manifesto)
    return (await _montar(db, [manifesto]))[0]
