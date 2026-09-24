"""Dependências e utilitários compartilhados pelas rotas."""

import uuid
from collections.abc import Iterable, Sequence
from datetime import date, datetime, timezone
from typing import Any, TypeVar

from fastapi import Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import dados_do_cliente, get_current_user, usuario_pode
from app.core.br_validators import formatar_cpf, mascarar_cpf
from app.core.database import get_db
from app.core.errors import Conflict, NotFound
from app.core.permissoes import P
from app.models.enums import rotulo
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


class Periodo:
    """Filtro de período usado por relatórios e listagens."""

    def __init__(
        self,
        inicio: date | None = Query(None, description="Data inicial (AAAA-MM-DD)"),
        fim: date | None = Query(None, description="Data final (AAAA-MM-DD)"),
    ):
        self.inicio = inicio
        self.fim = fim

    @property
    def descricao(self) -> str:
        if self.inicio and self.fim:
            return f"{self.inicio.strftime('%d/%m/%Y')} a {self.fim.strftime('%d/%m/%Y')}"
        if self.inicio:
            return f"a partir de {self.inicio.strftime('%d/%m/%Y')}"
        if self.fim:
            return f"até {self.fim.strftime('%d/%m/%Y')}"
        return "todo o período"


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
    """Busca garantindo que o registro pertence à organização do usuário.

    É a barreira de isolamento entre municípios: sem ela, um identificador
    adivinhado daria acesso a dado de outra prefeitura.
    """
    registro = await buscar_ou_404(db, modelo, registro_id, mensagem)
    organizacao = getattr(registro, "organizacao_id", None)
    if organizacao is not None and organizacao != user.organizacao_id:
        raise NotFound(mensagem)
    return registro


def conferir_versao(registro: Any, versao_informada: int | None) -> None:
    """Controle otimista de concorrência (item 52).

    Se o cliente enviou a versão que leu e ela não é mais a atual, alguém
    alterou o registro no meio do caminho — melhor avisar do que sobrescrever.
    """
    if versao_informada is None:
        return
    atual = getattr(registro, "row_version", None)
    if atual is not None and int(versao_informada) != int(atual):
        raise Conflict(
            (
                "Este registro foi alterado por outro usuário enquanto você editava. "
                "Recarregue a tela para ver a versão atual antes de salvar de novo."
            ),
            "conflito_versao",
        )


def nova_versao(registro: Any) -> None:
    registro.row_version = (getattr(registro, "row_version", 1) or 1) + 1


def pagina_payload(itens: Sequence[Any], total: int, paginacao: Paginacao) -> dict:
    return {
        "itens": list(itens),
        "total": total,
        "pagina": paginacao.pagina,
        "por_pagina": paginacao.por_pagina,
        "paginas": (total + paginacao.por_pagina - 1) // paginacao.por_pagina,
    }


async def nomes_de_usuarios(
    db: AsyncSession, ids: Iterable[uuid.UUID | None]
) -> dict[uuid.UUID, str]:
    limpos = {i for i in ids if i}
    if not limpos:
        return {}
    linhas = (await db.execute(select(User.id, User.nome).where(User.id.in_(limpos)))).all()
    return {linha[0]: linha[1] for linha in linhas}


def documento_visivel(user: User, documento: str | None) -> tuple[str | None, bool]:
    """CPF/CNPJ conforme a permissão do usuário.

    Retorna (valor exibido, foi mascarado). Sem `govinfra.pessoas.ver_cpf` o
    servidor recebe apenas ***.456.***-89 — mascaramento feito no backend, não
    escondido na tela.
    """
    if not documento:
        return None, False
    if usuario_pode(user, P.PESSOAS_VER_CPF):
        return formatar_cpf(documento) if len(documento) == 11 else documento, False
    return mascarar_cpf(documento) if len(documento) == 11 else "***", True


def renavam_visivel(user: User, renavam: str | None) -> tuple[str | None, bool]:
    if not renavam:
        return None, False
    if usuario_pode(user, P.VEICULOS_VER_RENAVAM):
        return renavam, False
    return f"*******{renavam[-2:]}", True


def com_rotulo(valor: str | None) -> str:
    return rotulo(valor or "")


def agora() -> datetime:
    return datetime.now(timezone.utc)


def dias_entre(inicio: date | None, fim: date | None) -> int | None:
    if inicio is None or fim is None:
        return None
    return (fim - inicio).days


UsuarioAtual = Depends(get_current_user)
Sessao = Depends(get_db)
