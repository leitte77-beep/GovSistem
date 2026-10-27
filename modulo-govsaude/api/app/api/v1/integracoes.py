"""Fase 11 — central de integrações (LEDI/SIAPS, RNDS, BNAFAR).

Rotas finas: regras em ``app/services/integracoes.py``. Nenhuma rota devolve
dado clínico em claro: a fila mostra ids, situação e mensagens de validação.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.integracoes import ConfiguracaoIntegracao, Motivo, Retornos
from app.services import integracoes as svc
from app.services.auditoria import dados_do_cliente
from app.services.exportacao import responder

router = APIRouter(prefix="/integracoes", tags=["Integrações"])
Tenant = Depends(get_tenant_id)
Db = Depends(get_db)
Ler = Depends(exigir(Permissao.INTEGRACAO_LER))
Gerenciar = Depends(exigir(Permissao.INTEGRACAO_GERENCIAR))
Sistema = Path(pattern="^(LEDI_APS|RNDS|BNAFAR)$")
Competencia = Query(pattern=r"^\d{4}(0[1-9]|1[0-2])$")


@router.get("/painel")
async def painel(t: uuid.UUID = Tenant, _: Usuario = Ler, db: AsyncSession = Db):
    """B.7-019, B.7-023, B.12-061 — situação, última execução e alertas por sistema."""
    return await svc.painel(db, t)


@router.get("/configuracoes/{sistema}")
async def obter_configuracao(
    sistema: str = Sistema, t: uuid.UUID = Tenant, _: Usuario = Ler, db: AsyncSession = Db
):
    """B.7-016, B.7-022 — versão do layout, ambiente, credencial (referência) e periodicidade."""
    return svc._config_saida(sistema, await svc.configuracao(db, t, sistema))


@router.put("/configuracoes/{sistema}")
async def salvar_configuracao(
    c: ConfiguracaoIntegracao,
    r: Request,
    sistema: str = Sistema,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.7-016 — produção RNDS exige homologação aprovada; segredo fica fora do banco."""
    return await svc.salvar_configuracao(db, t, sistema, c, u, dados_do_cliente(r))


@router.post("/{sistema}/execucoes")
async def executar(
    sistema: str = Sistema,
    competencia: str = Competencia,
    t: uuid.UUID = Tenant,
    _: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.1-033/034, B.7-013 — gera, valida e transmite a competência (pode repetir)."""
    return await svc.executar(db, t, sistema, competencia)


@router.get("/{sistema}/competencias/{competencia}")
async def resumo(
    sistema: str = Sistema,
    competencia: str = Path(pattern=r"^\d{4}(0[1-9]|1[0-2])$"),
    t: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.1-034 — novos, alterados, rejeitados e enviados na competência."""
    return await svc.resumo_competencia(db, t, sistema, competencia)


@router.post("/{sistema}/lotes")
async def lote(
    r: Request,
    sistema: str = Sistema,
    competencia: str = Competencia,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.1-033, B.3-027, B.5-015 — arquivo do lote para envio por centralizador."""
    lote_id, conteudo = await svc.gerar_lote(db, t, sistema, competencia, u, dados_do_cliente(r))
    return Response(
        content=conteudo,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": f'attachment; filename="{lote_id}.jsonl"',
            "X-Lote-Id": lote_id,
            "Cache-Control": "no-store",
        },
    )


@router.post("/{sistema}/retornos")
async def retornos(
    c: Retornos,
    r: Request,
    sistema: str = Sistema,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.1-033, B.4-032 — protocolo e retorno oficial (aceite/rejeição com mensagens)."""
    return await svc.registrar_retornos(db, t, sistema, c.itens, u, dados_do_cliente(r))


@router.get("/envios")
async def envios(
    sistema: str | None = Query(default=None, pattern="^(LEDI_APS|RNDS|BNAFAR)$"),
    situacao: str | None = None,
    competencia: str | None = None,
    tipo: str | None = None,
    cidadao_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    limite: int = Query(default=200, ge=1, le=1000),
    t: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.4-032, B.7-019 — fila: pendentes, enviados, rejeitados, reenvios e protocolos."""
    return await svc.listar_envios(
        db,
        t,
        sistema=sistema,
        situacao=situacao,
        competencia=competencia,
        tipo=tipo,
        cidadao_id=cidadao_id,
        estabelecimento_id=estabelecimento_id,
        limite=limite,
    )


@router.get("/inconsistencias")
async def inconsistencias(
    sistema: str | None = Query(default=None, pattern="^(LEDI_APS|RNDS|BNAFAR)$"),
    motivo: str | None = None,
    tipo: str | None = None,
    cidadao_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    competencia: str | None = None,
    formato: str = Query(default="json", pattern="^(json|csv|xlsx|pdf)$"),
    t: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.1-035, B.7-021 — fila de correção por cidadão, unidade, tipo e motivo; exportável."""
    linhas = await svc.inconsistencias(
        db,
        t,
        sistema=sistema,
        motivo=motivo,
        tipo=tipo,
        cidadao_id=cidadao_id,
        estabelecimento_id=estabelecimento_id,
        competencia=competencia,
    )
    colunas = [
        (k, k)
        for k in (
            "sistema",
            "tipo_registro",
            "competencia",
            "situacao",
            "motivo",
            "campo",
            "texto",
            "estabelecimento_id",
            "cidadao_id",
        )
    ]
    return responder("Inconsistências de integração", colunas, linhas, formato, "paisagem")


@router.get("/registros/{tipo}/{registro_id}")
async def historico(
    tipo: str,
    registro_id: uuid.UUID,
    t: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.4-032, B.7-018 — histórico de envios do registro (versões preservadas)."""
    return await svc.historico_registro(db, t, tipo, registro_id)


@router.post("/envios/{id}/reprocessar")
async def reprocessar(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Gerenciar, db: AsyncSession = Db
):
    """B.1-035, B.12-061 — após a correção, revalida e volta à fila."""
    return await svc.reprocessar(db, t, id, u, dados_do_cliente(r))


@router.post("/envios/{id}/cancelar")
async def cancelar(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """Cancela envio ainda não transmitido, com motivo."""
    return await svc.cancelar(db, t, id, c.motivo, u, dados_do_cliente(r))
