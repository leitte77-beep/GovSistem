"""Porta comum dos sistemas oficiais (seção 9 do prompt)."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


class PendenteEspecificacaoOficialError(RuntimeError):
    """Artefato oficial ausente: o adaptador não pode transmitir nem inventar."""


@runtime_checkable
class PortaSistemaOficial(Protocol):
    sistema: str
    versao: str

    def validar(self, payload: dict) -> list[dict]:
        ...

    def serializar(self, payload: dict) -> bytes:
        ...

    async def enviar(self, payload: dict) -> dict:
        ...
