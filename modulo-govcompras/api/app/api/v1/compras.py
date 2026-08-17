"""Catálogo, fornecedores e pesquisa de preços/cotações (seções 25-33)."""

import statistics
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Paginacao, buscar_da_organizacao, pagina_payload
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import NotFound
from app.core.permissoes import P
from app.models.compras import (
    CatalogoItem,
    Cotacao,
    CotacaoFornecedor,
    CotacaoItem,
    CotacaoPreco,
    Fornecedor,
    FornecedorDocumento,
)
from app.models.enums import StatusCotacao
from app.models.organizacao import User
from app.models.processo import ProcessoInstancia
from app.schemas.compras import (
    CatalogoItemIn,
    CatalogoItemOut,
    CotacaoFornecedorOut,
    CotacaoIn,
    CotacaoOut,
    CotacaoPrecoIn,
    FornecedorDocumentoIn,
    FornecedorIn,
    FornecedorOut,
    MapaComparativoLinha,
    MapaComparativoOut,
)
from app.schemas.comuns import Criado, Mensagem, Pagina

router = APIRouter(tags=["Compras"])


# ── Catálogo (seção 25) ──────────────────────────────────────────────────────
@router.get("/catalogo/itens", response_model=list[CatalogoItemOut])
async def listar_catalogo(
    q: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CATALOGO_VISUALIZAR))
):
    consulta = select(CatalogoItem).where(CatalogoItem.organizacao_id == user.organizacao_id)
    if q:
        consulta = consulta.where(CatalogoItem.descricao.ilike(f"%{q}%"))
    itens = list((await db.scalars(consulta.order_by(CatalogoItem.descricao))).all())
    saida = []
    for item in itens:
        valores = [h.valor for h in item.historico_precos]
        saida.append(
            CatalogoItemOut(
                **{k: getattr(item, k) for k in ["id", "codigo", "descricao", "unidade_medida", "categoria", "especificacao_padrao", "ativo"]},
                ultimo_valor=valores[0] if valores else None,
                media_historica=round(statistics.mean(valores), 2) if valores else None,
                historico_precos=item.historico_precos,
            )
        )
    return saida


@router.post("/catalogo/itens", response_model=Criado, status_code=201)
async def criar_item_catalogo(
    payload: CatalogoItemIn, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CATALOGO_GERENCIAR))
):
    item = CatalogoItem(organizacao_id=user.organizacao_id, created_by_id=user.id, **payload.model_dump())
    db.add(item)
    await db.flush()
    await db.commit()
    return Criado(id=item.id, mensagem="Item cadastrado no catálogo.")


# ── Fornecedores (seções 27-29) ───────────────────────────────────────────────
@router.get("/fornecedores", response_model=Pagina[FornecedorOut])
async def listar_fornecedores(
    q: str | None = None,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.FORNECEDORES_VISUALIZAR)),
):
    consulta = select(Fornecedor).where(
        Fornecedor.organizacao_id == user.organizacao_id, Fornecedor.deleted_at.is_(None)
    )
    if q:
        consulta = consulta.where(Fornecedor.razao_social.ilike(f"%{q}%"))
    total = len((await db.scalars(consulta)).all())
    itens = list(
        (await db.scalars(consulta.order_by(Fornecedor.razao_social).offset(paginacao.offset).limit(paginacao.por_pagina))).all()
    )
    return pagina_payload(itens, total, paginacao)


@router.post("/fornecedores", response_model=Criado, status_code=201)
async def criar_fornecedor(
    payload: FornecedorIn, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.FORNECEDORES_GERENCIAR))
):
    fornecedor = Fornecedor(organizacao_id=user.organizacao_id, created_by_id=user.id, **payload.model_dump())
    db.add(fornecedor)
    await db.flush()
    await db.commit()
    return Criado(id=fornecedor.id, mensagem="Fornecedor cadastrado.")


@router.get("/fornecedores/{fornecedor_id}", response_model=FornecedorOut)
async def obter_fornecedor(
    fornecedor_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.FORNECEDORES_VISUALIZAR))
):
    return await buscar_da_organizacao(db, Fornecedor, fornecedor_id, user)


@router.post("/fornecedores/{fornecedor_id}/documentos", response_model=Criado, status_code=201)
async def anexar_documento_fornecedor(
    fornecedor_id: uuid.UUID,
    payload: FornecedorDocumentoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.FORNECEDORES_GERENCIAR)),
):
    await buscar_da_organizacao(db, Fornecedor, fornecedor_id, user)
    documento = FornecedorDocumento(fornecedor_id=fornecedor_id, **payload.model_dump())
    db.add(documento)
    await db.commit()
    return Criado(id=documento.id, mensagem="Documento registrado.")


# ── Cotações / Pesquisa de preços (seções 30-33) ──────────────────────────────
@router.get("/processos/{processo_id}/cotacoes", response_model=list[CotacaoOut])
async def listar_cotacoes(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.COTACOES_VISUALIZAR))
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    cotacoes = list((await db.scalars(select(Cotacao).where(Cotacao.processo_id == processo_id))).all())
    saida = []
    for cotacao in cotacoes:
        fornecedores_out = []
        for cf in cotacao.fornecedores:
            fornecedor = await db.get(Fornecedor, cf.fornecedor_id)
            fornecedores_out.append(
                CotacaoFornecedorOut(
                    id=cf.id,
                    fornecedor_id=cf.fornecedor_id,
                    fornecedor_nome=fornecedor.razao_social if fornecedor else None,
                    situacao=cf.situacao,
                    enviada_em=cf.enviada_em.isoformat() if cf.enviada_em else None,
                    respondida_em=cf.respondida_em.isoformat() if cf.respondida_em else None,
                )
            )
        saida.append(
            CotacaoOut(
                id=cotacao.id, processo_id=cotacao.processo_id, numero=cotacao.numero,
                data_abertura=cotacao.data_abertura, prazo_resposta=cotacao.prazo_resposta,
                status=cotacao.status, fornecedores=fornecedores_out,
            )
        )
    return saida


@router.post("/processos/{processo_id}/cotacoes", response_model=Criado, status_code=201)
async def criar_cotacao(
    processo_id: uuid.UUID,
    payload: CotacaoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COTACOES_GERENCIAR)),
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    cotacao = Cotacao(
        processo_id=processo_id,
        numero=payload.numero,
        data_abertura=payload.data_abertura,
        prazo_resposta=payload.prazo_resposta,
        status=StatusCotacao.EM_ANDAMENTO.value,
        created_by_id=user.id,
    )
    db.add(cotacao)
    await db.flush()
    for fornecedor_id in payload.fornecedor_ids:
        db.add(CotacaoFornecedor(cotacao_id=cotacao.id, fornecedor_id=fornecedor_id, enviada_em=datetime.now(timezone.utc)))
    for item in payload.itens:
        db.add(CotacaoItem(cotacao_id=cotacao.id, catalogo_item_id=item.catalogo_item_id, descricao=item.descricao, quantidade=item.quantidade))
    await db.commit()
    return Criado(id=cotacao.id, mensagem="Cotação criada e enviada aos fornecedores selecionados.")


@router.post("/cotacoes/{cotacao_id}/precos", response_model=Mensagem)
async def registrar_preco(
    cotacao_id: uuid.UUID,
    payload: CotacaoPrecoIn,
    fornecedor_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COTACOES_GERENCIAR)),
):
    cotacao_fornecedor = await db.scalar(
        select(CotacaoFornecedor).where(
            CotacaoFornecedor.cotacao_id == cotacao_id, CotacaoFornecedor.fornecedor_id == fornecedor_id
        )
    )
    if cotacao_fornecedor is None:
        raise NotFound("Fornecedor não vinculado a esta cotação.")
    cotacao_fornecedor.respondida_em = datetime.now(timezone.utc)
    db.add(
        CotacaoPreco(
            cotacao_item_id=payload.cotacao_item_id,
            cotacao_fornecedor_id=cotacao_fornecedor.id,
            valor_unitario=payload.valor_unitario,
            marca_modelo=payload.marca_modelo,
        )
    )
    await db.commit()
    return Mensagem(mensagem="Preço registrado.")


@router.post("/cotacoes/{cotacao_id}/concluir", response_model=Mensagem)
async def concluir_cotacao(
    cotacao_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.COTACOES_GERENCIAR))
):
    cotacao = await db.get(Cotacao, cotacao_id)
    if cotacao is None:
        raise NotFound("Cotação não encontrada.")
    cotacao.status = StatusCotacao.CONCLUIDA.value
    await db.commit()
    return Mensagem(mensagem="Pesquisa de preços concluída.")


@router.get("/cotacoes/{cotacao_id}/mapa-comparativo", response_model=MapaComparativoOut)
async def mapa_comparativo(
    cotacao_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.COTACOES_VISUALIZAR))
):
    """Mapa comparativo (seção 31): calcula estatísticas item a item e sinaliza
    valores muito acima/abaixo da mediana — apenas alerta, nunca decide."""
    cotacao = await db.get(Cotacao, cotacao_id)
    if cotacao is None:
        raise NotFound("Cotação não encontrada.")

    linhas: list[MapaComparativoLinha] = []
    for item in cotacao.itens:
        precos_por_fornecedor: dict[str, float] = {}
        for preco in item.precos:
            cf = await db.get(CotacaoFornecedor, preco.cotacao_fornecedor_id)
            fornecedor = await db.get(Fornecedor, cf.fornecedor_id) if cf else None
            nome = fornecedor.razao_social if fornecedor else str(preco.cotacao_fornecedor_id)
            precos_por_fornecedor[nome] = preco.valor_unitario

        valores = list(precos_por_fornecedor.values())
        alerta = None
        mediana = None
        if valores:
            mediana = statistics.median(valores)
            for nome, valor in precos_por_fornecedor.items():
                if mediana and abs(valor - mediana) / mediana >= 0.3:
                    sinal = "acima" if valor > mediana else "abaixo"
                    percentual = round(abs(valor - mediana) / mediana * 100)
                    alerta = f"{nome}: valor {percentual}% {sinal} da mediana."
                    break

        linhas.append(
            MapaComparativoLinha(
                item_id=item.id,
                descricao=item.descricao,
                quantidade=item.quantidade,
                menor_preco=min(valores) if valores else None,
                media=round(statistics.mean(valores), 2) if valores else None,
                mediana=mediana,
                maior_preco=max(valores) if valores else None,
                precos_por_fornecedor=precos_por_fornecedor,
                alerta=alerta,
            )
        )
    return MapaComparativoOut(linhas=linhas)
