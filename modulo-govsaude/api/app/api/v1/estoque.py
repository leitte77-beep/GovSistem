"""Fase 8 — estoque, almoxarifado e assistência farmacêutica (B.4-001…043).

Rotas finas: regras em ``app/services/estoque.py``. Local de outro tenant ou
fora do escopo do estabelecimento responde 404.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Header, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.estoque import (
    CompetenciaOut,
    ContagensSet,
    DispensacaoCreate,
    DispensacaoOut,
    InventarioCreate,
    InventarioOut,
    LocalCreate,
    LocalOut,
    LoteBloqueio,
    LoteOut,
    Motivo,
    MovimentacaoCreate,
    MovimentacaoOut,
    ParametroOut,
    ParametroSet,
    ProdutoCreate,
    ProdutoOut,
    ProdutoUpdate,
    RequisicaoAtender,
    RequisicaoCreate,
    RequisicaoOut,
    TemperaturaCreate,
    TemperaturaOut,
)
from app.services import estoque as svc
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_versao

router = APIRouter(prefix="/estoque", tags=["Estoque e assistência farmacêutica"])
COMPETENCIA = Path(pattern=r"^\d{4}(0[1-9]|1[0-2])$")


# ── Cadastros ───────────────────────────────────────────────────────────────
@router.post("/produtos", response_model=ProdutoOut, status_code=201)
async def criar_produto(
    c: ProdutoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_AJUSTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-003 — produto (Rename/Remume, CATMAT, OBM, controlado, antimicrobiano)."""
    return await svc.criar_produto(db, t, c, u, dados_do_cliente(r))


@router.get("/produtos", response_model=list[ProdutoOut])
async def listar_produtos(
    busca: str | None = Query(default=None, max_length=100),
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-003."""
    return await svc.listar_produtos(db, t, busca)


@router.patch("/produtos/{id}", response_model=ProdutoOut)
async def atualizar_produto(
    id: uuid.UUID,
    c: ProdutoUpdate,
    r: Request,
    if_match: str | None = Header(default=None, alias="If-Match"),
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_AJUSTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-003 — alteração com If-Match."""
    return await svc.atualizar_produto(
        db, t, id, c, exigir_versao(if_match), u, dados_do_cliente(r)
    )


@router.get("/produtos/{id}/lotes", response_model=list[LoteOut])
async def lotes(
    id: uuid.UUID,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-001 — lotes do produto."""
    return await svc.listar_lotes(db, t, id)


@router.post("/lotes/{id}/bloqueio", response_model=LoteOut)
async def bloqueio(
    id: uuid.UUID,
    c: LoteBloqueio,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_AJUSTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-002 — bloqueia/desbloqueia lote com motivo."""
    return await svc.bloquear_lote(db, t, id, c.bloqueado, c.motivo, u, dados_do_cliente(r))


@router.post("/locais", response_model=LocalOut, status_code=201)
async def criar_local(
    c: LocalCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_AJUSTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-001 — local de estoque do estabelecimento, com faixa de temperatura."""
    return await svc.criar_local(db, t, c, u, dados_do_cliente(r))


@router.get("/locais", response_model=list[LocalOut])
async def listar_locais(
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-001 — locais no escopo do usuário."""
    return await svc.listar_locais(db, t, u)


@router.put("/locais/{id}/parametros", response_model=ParametroOut)
async def parametro(
    id: uuid.UUID,
    c: ParametroSet,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_AJUSTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-004 — mínimo, máximo, ideal e ponto de pedido."""
    return await svc.definir_parametro(db, t, id, c, u, dados_do_cliente(r))


# ── Ledger ──────────────────────────────────────────────────────────────────
@router.post("/movimentacoes", response_model=list[MovimentacaoOut], status_code=201)
async def movimentar(
    c: MovimentacaoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_MOVIMENTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-007, B.4-009, B.4-012, B.4-035 — lançamento no ledger imutável; FEFO sem lote."""
    return await svc.movimentar(db, t, c, u, dados_do_cliente(r))


@router.get("/locais/{id}/movimentacoes", response_model=list[MovimentacaoOut])
async def extrato(
    id: uuid.UUID,
    produto_id: uuid.UUID | None = None,
    inicio: date | None = None,
    fim: date | None = None,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-036 — extrato/rastreabilidade do local (até 500 lançamentos)."""
    return await svc.extrato(db, t, id, u, produto_id, inicio, fim)


@router.get("/locais/{id}/saldos")
async def saldos(
    id: uuid.UUID,
    em: date | None = Query(default=None, description="Saldo ao fim deste dia (fuso do tenant)."),
    produto_id: uuid.UUID | None = None,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-006, B.4-027 — saldo por lote em qualquer data, custo e pedidos pendentes."""
    return await svc.posicao(db, t, id, u, em, produto_id)


# ── Requisições ─────────────────────────────────────────────────────────────
@router.post("/requisicoes", response_model=RequisicaoOut, status_code=201)
async def criar_requisicao(
    c: RequisicaoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_MOVIMENTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-014 — requisição do destino à origem, com número por tenant/ano."""
    return await svc.criar_requisicao(db, t, c, u, dados_do_cliente(r))


@router.get("/requisicoes/{id}", response_model=RequisicaoOut)
async def obter_requisicao(
    id: uuid.UUID,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-014."""
    return await svc.obter_requisicao(db, t, id, u)


@router.post("/requisicoes/{id}/atender", response_model=RequisicaoOut)
async def atender(
    id: uuid.UUID,
    c: RequisicaoAtender,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_MOVIMENTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-005, B.4-014 — atendimento total ou parcial pela origem (redistribuição)."""
    return await svc.atender_requisicao(db, t, id, c, u, dados_do_cliente(r))


@router.post("/requisicoes/{id}/receber", response_model=RequisicaoOut)
async def receber(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_MOVIMENTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-015 — aceite da transferência pelo destino."""
    return await svc.receber_requisicao(db, t, id, u, dados_do_cliente(r))


@router.post("/requisicoes/{id}/recusar", response_model=RequisicaoOut)
async def recusar(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_MOVIMENTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-015 — recusa com motivo; o saldo volta à origem."""
    return await svc.recusar_requisicao(db, t, id, c.motivo, u, dados_do_cliente(r))


@router.post("/requisicoes/{id}/cancelar", response_model=RequisicaoOut)
async def cancelar(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_MOVIMENTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-014 — cancelamento antes do atendimento."""
    return await svc.cancelar_requisicao(db, t, id, c.motivo, u, dados_do_cliente(r))


# ── Inventário e competência ────────────────────────────────────────────────
@router.post("/inventarios", response_model=InventarioOut, status_code=201)
async def abrir_inventario(
    c: InventarioCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_INVENTARIO)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-017 — abre inventário e bloqueia movimentação do local."""
    return await svc.abrir_inventario(db, t, c.local_id, u, dados_do_cliente(r))


@router.put("/inventarios/{id}/contagens", response_model=InventarioOut)
async def contagens(
    id: uuid.UUID,
    c: ContagensSet,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_INVENTARIO)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-017 — contagem por lote (regrava o lote já contado)."""
    return await svc.registrar_contagens(db, t, id, c.contagens, u, dados_do_cliente(r))


@router.post("/inventarios/{id}/encerrar", response_model=InventarioOut)
async def encerrar_inventario(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_INVENTARIO)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-017 — divergências viram ajustes no ledger."""
    return await svc.encerrar_inventario(db, t, id, u, dados_do_cliente(r))


@router.post("/competencias/{competencia}/encerrar", response_model=CompetenciaOut)
async def encerrar_competencia(
    r: Request,
    competencia: str = COMPETENCIA,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_AJUSTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-018 — encerra competência; movimentação nela passa a ser recusada."""
    return await svc.encerrar_competencia(db, t, competencia, u, dados_do_cliente(r))


@router.post("/competencias/{competencia}/reabrir", response_model=CompetenciaOut)
async def reabrir_competencia(
    c: Motivo,
    r: Request,
    competencia: str = COMPETENCIA,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_AJUSTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-018 — reabertura justificada."""
    return await svc.reabrir_competencia(db, t, competencia, c.motivo, u, dados_do_cliente(r))


# ── Dispensação ─────────────────────────────────────────────────────────────
@router.post("/dispensacoes", response_model=DispensacaoOut, status_code=201)
async def dispensar(
    c: DispensacaoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.DISPENSACAO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-020…022, B.4-035 — total/parcial por lote; duplicidade bloqueia salvo
    justificativa."""
    return await svc.dispensar(db, t, c, u, dados_do_cliente(r))


@router.post("/dispensacoes/{id}/estornar", response_model=DispensacaoOut)
async def estornar(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.DISPENSACAO_ESTORNAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-020 — estorno devolve os mesmos lotes."""
    return await svc.estornar_dispensacao(db, t, id, c.motivo, u, dados_do_cliente(r))


@router.get("/dispensacoes/{id}/comprovante")
async def comprovante(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.DISPENSACAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-023 — comprovante de dispensação (impressão auditada)."""
    return await svc.comprovante_dispensacao(db, t, id, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/dispensacoes", response_model=list[DispensacaoOut])
async def historico(
    cidadao_id: uuid.UUID,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.DISPENSACAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-021 — histórico do cidadão em qualquer unidade."""
    return await svc.historico_dispensacoes(db, t, cidadao_id, u)


# ── Temperatura e indicadores ───────────────────────────────────────────────
@router.post("/locais/{id}/temperaturas", response_model=TemperaturaOut, status_code=201)
async def temperatura(
    id: uuid.UUID,
    c: TemperaturaCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_MOVIMENTAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-037 — leitura manual ou de equipamento; fora da faixa do local alerta."""
    return await svc.registrar_temperatura(db, t, id, c, u, dados_do_cliente(r))


@router.get("/locais/{id}/temperaturas", response_model=list[TemperaturaOut])
async def temperaturas(
    id: uuid.UUID,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-037."""
    return await svc.listar_temperaturas(db, t, id, u)


@router.get("/locais/{id}/alertas")
async def alertas(
    id: uuid.UUID,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-004, B.4-016, B.4-037 — mínimo, ponto de pedido, vencimento,
    lote bloqueado, consumo anormal (desvio estatístico) e temperatura."""
    return await svc.alertas(db, t, id, u)


@router.get("/locais/{id}/curva-abc")
async def curva_abc(
    id: uuid.UUID,
    inicio: date,
    fim: date,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-026 — curva ABC por valor consumido."""
    return await svc.curva_abc(db, t, id, inicio, fim, u)


@router.get("/locais/{id}/sugestao-compra")
async def sugestao(
    id: uuid.UUID,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-005, B.4-026 — sugestão com memória de cálculo, cobertura e giro."""
    return await svc.sugestao_compra(db, t, id, u)
