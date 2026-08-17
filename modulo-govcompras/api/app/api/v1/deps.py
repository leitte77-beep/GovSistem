"""Dependências e utilitários compartilhados pelas rotas."""

import uuid
from collections.abc import Sequence
from typing import Any, TypeVar

from fastapi import Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import dados_do_cliente
from app.core.errors import Conflict, NotFound
from app.models.organizacao import User

T = TypeVar("T")


def cliente(request: Request) -> dict:
    return dados_do_cliente(request)


class Paginacao:
    def __init__(
        self,
        pagina: int = Query(1, ge=1, description="Página desejada"),
        por_pagina: int = Query(25, ge=1, le=200, description="Registros por página"),
    ):
        self.pagina = pagina
        self.por_pagina = por_pagina
        self.offset = (pagina - 1) * por_pagina


async def buscar_ou_404(
    db: AsyncSession, modelo: type[T], registro_id: uuid.UUID, mensagem: str = "Registro não encontrado."
) -> T:
    registro = await db.get(modelo, registro_id)
    if registro is None or getattr(registro, "deleted_at", None) is not None:
        raise NotFound(mensagem)
    return registro


async def buscar_da_organizacao(
    db: AsyncSession,
    modelo: type[T],
    registro_id: uuid.UUID,
    user: User,
    mensagem: str = "Registro não encontrado.",
) -> T:
    """Busca garantindo que o registro pertence à organização do usuário —
    barreira de isolamento entre municípios (multi-tenant)."""
    registro = await buscar_ou_404(db, modelo, registro_id, mensagem)
    organizacao = getattr(registro, "organizacao_id", None)
    if organizacao is not None and organizacao != user.organizacao_id:
        raise NotFound(mensagem)
    return registro


def conferir_versao(registro: Any, versao_informada: int | None) -> None:
    if versao_informada is None:
        return
    atual = getattr(registro, "row_version", None)
    if atual is not None and int(versao_informada) != int(atual):
        raise Conflict(
            "Este registro foi alterado por outro usuário enquanto você editava. "
            "Recarregue a tela para ver a versão atual antes de salvar de novo.",
            "conflito_versao",
        )


def pagina_payload(itens: Sequence[Any], total: int, paginacao: Paginacao) -> dict:
    return {
        "itens": list(itens),
        "total": total,
        "pagina": paginacao.pagina,
        "por_pagina": paginacao.por_pagina,
        "paginas": (total + paginacao.por_pagina - 1) // paginacao.por_pagina,
    }
