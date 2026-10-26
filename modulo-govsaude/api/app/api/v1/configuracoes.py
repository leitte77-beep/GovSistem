"""Configurações versionadas por tenant."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.errors import AppError
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.comuns import ConfiguracaoOut, ConfiguracaoUpdate
from app.services.auditoria import dados_do_cliente
from app.services.configuracoes import (
    configuracao_vigente,
    definir,
    listar,
    obter,
    parse_if_match,
)

router = APIRouter(prefix="/configuracoes", tags=["Configurações"])


@router.get("", response_model=list[ConfiguracaoOut], summary="Listar configurações vigentes")
async def listar_configuracoes(
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.CONFIGURACAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    registros = await listar(db, tenant_id)
    return [ConfiguracaoOut.model_validate(r) for r in registros]


@router.get("/{chave}", response_model=ConfiguracaoOut, summary="Obter configuração")
async def obter_configuracao(
    chave: str,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.CONFIGURACAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    registro = await obter(db, tenant_id, chave)
    response.headers["ETag"] = f'"{registro.versao}"'
    return ConfiguracaoOut.model_validate(registro)


@router.put("/{chave}", response_model=ConfiguracaoOut, summary="Alterar configuração (If-Match)")
async def alterar_configuracao(
    chave: str,
    corpo: ConfiguracaoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CONFIGURACAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    atual = await configuracao_vigente(db, tenant_id, chave)
    if atual is not None and if_match is None:
        raise AppError(
            "Envie o cabeçalho If-Match com a versão atual da configuração.",
            428,
            "if_match_obrigatorio",
        )
    versao = parse_if_match(if_match)
    registro = await definir(
        db,
        tenant_id=tenant_id,
        chave=chave,
        valor=corpo.valor,
        usuario=usuario,
        if_match=versao,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return ConfiguracaoOut.model_validate(registro)
