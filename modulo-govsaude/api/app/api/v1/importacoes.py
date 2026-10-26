"""Importação CNES assíncrona (202 + job_id) e relatório (B.1-010, B.12-031)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.rede_helpers import (
    cache_idempotencia,
    gravar_idempotencia,
    resposta_cache,
)
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.comuns import Pagina
from app.schemas.rede import ImportacaoCNESOut, ImportacaoCNESRequest
from app.services import importacao_cnes
from app.services.auditoria import dados_do_cliente

router = APIRouter(prefix="/importacoes", tags=["Importações"])


@router.post("/cnes", response_model=ImportacaoCNESOut, status_code=202)
async def importar_cnes(
    corpo: ImportacaoCNESRequest,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.INTEGRACAO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-010, B.12-010, B.12-031 — importação CNES."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await importacao_cnes.executar(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        dados=corpo,
        cliente=dados_do_cliente(request),
    )
    saida = ImportacaoCNESOut.model_validate(registro)
    response.headers["Location"] = f"/api/govsaude/v1/jobs/{registro.job_id}"
    await gravar_idempotencia(
        db,
        tenant_id,
        chave,
        request,
        request_hash,
        202,
        jsonable_encoder(saida),
        usuario,
    )
    return saida


@router.get("/cnes", response_model=Pagina[ImportacaoCNESOut])
async def listar_importacoes_cnes(
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.INTEGRACAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-010, B.12-010, B.12-031 — importação CNES."""
    itens, proximo, total = await importacao_cnes.listar(
        db, tenant_id, limite=limite, cursor=cursor
    )
    return Pagina[ImportacaoCNESOut](
        itens=[ImportacaoCNESOut.model_validate(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.get("/cnes/{job_id}", response_model=ImportacaoCNESOut)
async def relatorio_importacao_cnes(
    job_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.INTEGRACAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-010, B.12-010, B.12-031 — importação CNES."""
    registro = await importacao_cnes.obter_por_job(db, tenant_id, job_id)
    return ImportacaoCNESOut.model_validate(registro)
