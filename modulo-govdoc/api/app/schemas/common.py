"""Schemas comuns: paginação, mensagens, e-mail e respostas padronizadas."""

import re
from typing import Annotated, Generic, List, Optional, TypeVar

from pydantic import AfterValidator, BaseModel, Field

T = TypeVar("T")


class Message(BaseModel):
    mensagem: str
    detalhe: Optional[str] = None


class Page(BaseModel, Generic[T]):
    itens: List[T]
    total: int
    pagina: int
    por_pagina: int
    paginas: int


def paginate(itens: list, total: int, page: int, per_page: int) -> dict:
    return {
        "itens": itens,
        "total": total,
        "pagina": page,
        "por_pagina": per_page,
        "paginas": (total + per_page - 1) // per_page if per_page else 1,
    }


class PageParams(BaseModel):
    pagina: int = Field(1, ge=1)
    por_pagina: int = Field(25, ge=1, le=200)

    @property
    def offset(self) -> int:
        return (self.pagina - 1) * self.por_pagina


# ── E-mail ───────────────────────────────────────────────────────────────────

# Validação própria (em vez de `EmailStr`): instalações municipais costumam usar
# domínios internos como `prefeitura.local`, que a biblioteca padrão recusa por
# serem reservados. Aqui exigimos apenas um formato válido.
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$")


def validar_email(value: str) -> str:
    value = (value or "").strip().lower()
    if not EMAIL_RE.match(value):
        raise ValueError("Informe um e-mail válido.")
    return value


Email = Annotated[str, AfterValidator(validar_email)]
