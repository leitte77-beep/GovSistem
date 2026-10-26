"""Porta oficial do CADSUS (consulta por CPF principal / CNS alternativo)."""

from __future__ import annotations

from typing import Protocol


class PortaCADSUS(Protocol):
    async def consultar(
        self, *, cpf: str | None = None, cns: str | None = None
    ) -> dict:
        ...
