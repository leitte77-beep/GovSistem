"""Fase 9 — imunização (B.7-001…013, B.7-024…029).

Rotas finas: regras em ``app/services/imunizacao.py``. A verificação do QR da
carteira é pública e não expõe dado sensível.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.config import settings
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.imunizacao import (
    AgendamentoCreate,
    AgendamentoOut,
    AplicacaoCreate,
    AplicacaoOut,
    AplicacaoRetificar,
    AtivacaoEsquema,
    EsquemaCreate,
    EsquemaOut,
    FrascoAbrir,
    FrascoOut,
    Motivo,
    Reagendar,
    VacinaCreate,
    VacinaOut,
)
from app.services import imunizacao as svc
from app.services.auditoria import dados_do_cliente
from app.services.exportacao import pdf

router = APIRouter(prefix="/imunizacao", tags=["Imunização"])
Tenant = Depends(get_tenant_id)
Db = Depends(get_db)
Ler = Depends(exigir(Permissao.IMUNIZACAO_LER))
Aplicar = Depends(exigir(Permissao.IMUNIZACAO_APLICAR))
Gerenciar = Depends(exigir(Permissao.IMUNIZACAO_GERENCIAR))


# ── Cadastros ───────────────────────────────────────────────────────────────
@router.post("/vacinas", response_model=VacinaOut, status_code=201)
async def criar_vacina(
    c: VacinaCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.7-001 — imunobiológico: produto de estoque, fabricante, apresentação, doses/frasco."""
    return await svc.criar_vacina(db, t, c, u, dados_do_cliente(r))


@router.get("/vacinas", response_model=list[VacinaOut])
async def listar_vacinas(t: uuid.UUID = Tenant, _: Usuario = Ler, db: AsyncSession = Db):
    """B.7-001."""
    return await svc.listar_vacinas(db, t)


@router.post("/esquemas", response_model=EsquemaOut, status_code=201)
async def criar_esquema(
    c: EsquemaCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.7-001, B.7-011, B.7-029 — nova versão do esquema (doses, idades, intervalos, sexo)."""
    return await svc.criar_esquema(db, t, c, u, dados_do_cliente(r))


@router.get("/esquemas", response_model=list[EsquemaOut])
async def listar_esquemas(
    vacina_id: uuid.UUID | None = None,
    t: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.7-029 — versões e vigências."""
    return await svc.listar_esquemas(db, t, vacina_id)


@router.post("/esquemas/{id}/ativacao", response_model=EsquemaOut)
async def ativacao(
    id: uuid.UUID,
    c: AtivacaoEsquema,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.7-029 — ativa com fonte normativa; a versão anterior encerra a vigência."""
    return await svc.ativar_esquema(db, t, id, c.ativo, c.fonte_normativa, u, dados_do_cliente(r))


# ── Frascos ─────────────────────────────────────────────────────────────────
@router.post("/frascos", response_model=FrascoOut, status_code=201)
async def abrir_frasco(
    c: FrascoAbrir, r: Request, t: uuid.UUID = Tenant, u: Usuario = Aplicar, db: AsyncSession = Db
):
    """B.7-003, B.7-004 — abertura com prazo de uso; o frasco sai do estoque."""
    return await svc.abrir_frasco(db, t, c, u, dados_do_cliente(r))


@router.get("/locais/{local_id}/frascos", response_model=list[FrascoOut])
async def frascos(
    local_id: uuid.UUID,
    situacao: str | None = Query(default="ABERTO", pattern="^(ABERTO|ESGOTADO|DESCARTADO)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.7-003 — frascos do local por situação."""
    return await svc.listar_frascos(db, t, local_id, u, situacao)


@router.post("/frascos/{id}/descartar", response_model=FrascoOut)
async def descartar(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Aplicar,
    db: AsyncSession = Db,
):
    """B.7-003, B.7-005 — descarte com motivo; doses restantes viram perda."""
    return await svc.descartar_frasco(db, t, id, c.motivo, u, dados_do_cliente(r))


@router.post("/frascos/descartar-vencidos")
async def descartar_vencidos(t: uuid.UUID = Tenant, _: Usuario = Aplicar, db: AsyncSession = Db):
    """B.7-005 — descarte assistido dos frascos com prazo de uso expirado."""
    return await svc.descartar_vencidos(db, t)


# ── Aplicações ──────────────────────────────────────────────────────────────
@router.post("/aplicacoes", response_model=AplicacaoOut, status_code=201)
async def aplicar(
    c: AplicacaoCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Aplicar,
    db: AsyncSession = Db,
):
    """B.7-002, B.7-008, B.7-009, B.7-010, B.7-027 — aplicação nominal com regras,
    baixa de estoque/frasco e registro externo."""
    return await svc.aplicar(db, t, c, u, dados_do_cliente(r))


@router.get("/aplicacoes/{id}", response_model=AplicacaoOut)
async def obter(id: uuid.UUID, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db):
    """B.7-028."""
    return await svc.obter_aplicacao(db, t, id, u)


@router.post("/aplicacoes/{id}/retificar", response_model=AplicacaoOut, status_code=201)
async def retificar(
    id: uuid.UUID,
    c: AplicacaoRetificar,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Aplicar,
    db: AsyncSession = Db,
):
    """B.7-028 — retificação com nova versão e justificativa."""
    return await svc.retificar(db, t, id, c, u, dados_do_cliente(r))


@router.post("/aplicacoes/{id}/invalidar", response_model=AplicacaoOut)
async def invalidar(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Aplicar,
    db: AsyncSession = Db,
):
    """B.7-028 — invalida registro indevido sem apagá-lo."""
    return await svc.invalidar(db, t, id, c.motivo, u, dados_do_cliente(r))


@router.get("/aplicacoes/{id}/exportacao-rnds")
async def exportacao_rnds(
    id: uuid.UUID, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db
):
    """B.7-013 — RIA/RNDS; pendente sem os artefatos oficiais (Fase 11)."""
    return await svc.exportacao_rnds(db, t, id, u)


@router.get("/cidadaos/{cidadao_id}/aplicacoes", response_model=list[AplicacaoOut])
async def historico(
    cidadao_id: uuid.UUID,
    r: Request,
    todas: bool = False,
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.7-009, B.7-028 — histórico vacinal (``todas`` inclui retificadas/invalidadas)."""
    return await svc.historico(db, t, cidadao_id, u, dados_do_cliente(r), todas)


@router.get("/cidadaos/{cidadao_id}/aprazamento")
async def aprazamento(
    cidadao_id: uuid.UUID, t: uuid.UUID = Tenant, _: Usuario = Ler, db: AsyncSession = Db
):
    """B.7-011 — próximas doses pelos esquemas vigentes, com memória de cálculo."""
    return await svc.aprazamento(db, t, cidadao_id)


@router.get("/cidadaos/{cidadao_id}/carteira")
async def carteira(
    cidadao_id: uuid.UUID,
    r: Request,
    formato: str = Query(default="json", pattern="^(json|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.7-012 — carteira/certificado com histórico, doses futuras e QR de verificação."""
    dados = await svc.carteira(db, t, cidadao_id, u, dados_do_cliente(r))
    caminho = f"/api/govsaude/v1/imunizacao/verificar/{dados['token_verificacao']}"
    url = f"{settings.PUBLIC_BASE_URL}{caminho}"
    if formato == "json":
        return {**dados, "url_verificacao": url}
    return Response(
        content=pdf(svc.carteira_html(dados, url)),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="carteira-vacinacao.pdf"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/verificar/{token}")
async def verificar(token: str, db: AsyncSession = Db):
    """B.7-012 — verificação pública do QR (titular abreviado, sem dado clínico)."""
    return await svc.verificar(db, token)


@router.get("/busca-ativa")
async def busca_ativa(
    r: Request,
    vacina_id: uuid.UUID | None = None,
    limite: int = Query(default=200, ge=1, le=1000),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.7-024 — cidadãos com doses atrasadas pelo aprazamento."""
    return await svc.busca_ativa(db, t, u, dados_do_cliente(r), vacina_id, limite)


# ── Agendamento ─────────────────────────────────────────────────────────────
@router.post("/agendamentos", response_model=AgendamentoOut, status_code=201)
async def agendar(
    c: AgendamentoCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Aplicar,
    db: AsyncSession = Db,
):
    """B.7-006 — agendamento por cidadão, unidade, vacina e dose."""
    return await svc.agendar(db, t, c, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/agendamentos", response_model=list[AgendamentoOut])
async def agendamentos(
    cidadao_id: uuid.UUID, t: uuid.UUID = Tenant, _: Usuario = Ler, db: AsyncSession = Db
):
    """B.7-006, B.7-007."""
    return await svc.agendamentos_do_cidadao(db, t, cidadao_id)


@router.post("/agendamentos/{id}/falta", response_model=AgendamentoOut)
async def falta(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Aplicar,
    db: AsyncSession = Db,
):
    """B.7-007 — falta registrada."""
    return await svc.marcar_falta(db, t, id, c.motivo, u, dados_do_cliente(r))


@router.post("/agendamentos/{id}/reagendar", response_model=AgendamentoOut, status_code=201)
async def reagendar(
    id: uuid.UUID,
    c: Reagendar,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Aplicar,
    db: AsyncSession = Db,
):
    """B.7-007 — reagendamento encadeado."""
    return await svc.reagendar(db, t, id, c.data_prevista, c.motivo, u, dados_do_cliente(r))


# ── Relatórios ──────────────────────────────────────────────────────────────
@router.get("/relatorios/aplicacoes")
async def relatorio_aplicacoes(
    inicio: date,
    fim: date,
    agrupar_por: str = Query(
        default="mes",
        pattern="^(mes|estabelecimento|profissional|vacina|dose|estrategia|faixa_etaria)$",
    ),
    comparar: bool = False,
    formato: str = Query(default="json", pattern="^(json|csv|xlsx|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.7-025 — aplicações por unidade, profissional, vacina, dose, estratégia, idade ou mês."""
    from app.api.v1.relatorios import _saida
    from app.services.relatorios import com_comparativo

    dados = await com_comparativo(
        svc.relatorio_aplicacoes, db, t, inicio, fim, comparar, ator=u, agrupar_por=agrupar_por
    )
    return _saida("Aplicações de vacinas", dados, formato, "retrato", comparar)


@router.get("/relatorios/locais/{local_id}/frascos")
async def relatorio_frascos(
    local_id: uuid.UUID,
    inicio: date,
    fim: date,
    formato: str = Query(default="json", pattern="^(json|csv|xlsx|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.7-026 — frascos, aplicações, perdas e saldo por lote."""
    from app.api.v1.relatorios import _saida

    dados = await svc.relatorio_frascos(db, t, inicio, fim, ator=u, local_id=local_id)
    return _saida("Frascos e perdas por lote", dados, formato, "retrato", False)
