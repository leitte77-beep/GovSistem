"""Relatórios gerenciais e comparativos — B.6-047/048/049, B.3-019/021, B.4-026/028, B.12-055.

Agregados sem dado pessoal, no escopo do usuário, em JSON, CSV, XLSX ou PDF.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.services import relatorios as svc
from app.services.exportacao import Formato, Orientacao, responder

router = APIRouter(prefix="/relatorios", tags=["Relatórios"])
Relatorio = Depends(exigir(Permissao.RELATORIO_LER))


def _saida(titulo: str, dados: dict, formato: Formato, orientacao: Orientacao, comparar: bool):
    colunas = [("chave", dados["agrupar_por"])]
    for m in dados["metricas"]:
        colunas.append((m, m))
        if comparar:
            colunas += [
                (f"{m}_anterior", f"{m} (anterior)"),
                (f"{m}_variacao_pct", f"{m} (var. %)"),
            ]
    extra = {k: v for k, v in dados.items() if k != "linhas"}
    return responder(titulo, colunas, dados["linhas"], formato, orientacao, extra)


@router.get("/prontuario/atendimentos")
async def pec(
    inicio: date,
    fim: date,
    agrupar_por: str = Query(default="mes", pattern="^(mes|estabelecimento|tipo|diagnostico)$"),
    comparar: bool = False,
    formato: Formato = "json",
    orientacao: Orientacao = "retrato",
    t: uuid.UUID = Depends(get_tenant_id),
    _r: Usuario = Relatorio,
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-048, B.6-049 — atendimentos, diagnósticos, prescrições e registros (exames,
    encaminhamentos…) por período, unidade ou tipo, com comparativo temporal."""
    dados = await svc.com_comparativo(
        svc.atendimentos_pec, db, t, inicio, fim, comparar, ator=u, agrupar_por=agrupar_por
    )
    return _saida("Atendimentos do prontuário", dados, formato, orientacao, comparar)


@router.get("/odontologia/atendimentos")
async def odonto(
    inicio: date,
    fim: date,
    agrupar_por: str = Query(
        default="mes", pattern="^(mes|estabelecimento|profissional|tipo|faixa_etaria)$"
    ),
    comparar: bool = False,
    formato: Formato = "json",
    orientacao: Orientacao = "retrato",
    t: uuid.UUID = Depends(get_tenant_id),
    _r: Usuario = Relatorio,
    u: Usuario = Depends(exigir(Permissao.ODONTOLOGIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.3-019, B.3-021 — atendimentos e procedimentos odontológicos por profissional,
    unidade, tipo, faixa etária ou mês, com comparativo temporal."""
    dados = await svc.com_comparativo(
        svc.atendimentos_odonto, db, t, inicio, fim, comparar, ator=u, agrupar_por=agrupar_por
    )
    return _saida("Atendimentos odontológicos", dados, formato, orientacao, comparar)


@router.get("/estoque/locais/{local_id}/movimentacoes")
async def estoque(
    local_id: uuid.UUID,
    inicio: date,
    fim: date,
    agrupar_por: str = Query(default="mes", pattern="^(mes|tipo|produto)$"),
    comparar: bool = False,
    formato: Formato = "json",
    orientacao: Orientacao = "paisagem",
    t: uuid.UUID = Depends(get_tenant_id),
    _r: Usuario = Relatorio,
    u: Usuario = Depends(exigir(Permissao.ESTOQUE_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.4-026, B.4-028 — entradas, saídas, dispensações, transferências, perdas e
    ajustes (quantidade e valor), com comparativo."""
    dados = await svc.com_comparativo(
        svc.movimentacoes_estoque,
        db,
        t,
        inicio,
        fim,
        comparar,
        ator=u,
        local_id=local_id,
        agrupar_por=agrupar_por,
    )
    return _saida("Movimentações de estoque", dados, formato, orientacao, comparar)


@router.get("/filas/tempos")
async def tempos(
    inicio: date,
    fim: date,
    agrupar_por: str = Query(default="estabelecimento", pattern="^(mes|estabelecimento|setor)$"),
    comparar: bool = False,
    formato: Formato = "json",
    orientacao: Orientacao = "retrato",
    t: uuid.UUID = Depends(get_tenant_id),
    _r: Usuario = Relatorio,
    u: Usuario = Depends(exigir(Permissao.FILA_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.6-047 — tempos médios de espera, triagem e consulta por unidade, setor ou mês."""
    dados = await svc.com_comparativo(
        svc.tempos_fila, db, t, inicio, fim, comparar, ator=u, agrupar_por=agrupar_por
    )
    return _saida("Tempos de atendimento", dados, formato, orientacao, comparar)
