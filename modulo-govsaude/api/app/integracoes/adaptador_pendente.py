"""Adaptador seguro para sistema sem artefato oficial."""

from __future__ import annotations

from app.integracoes.porta import PendenteEspecificacaoOficialError


class AdaptadorPendente:
    def __init__(self, sistema: str, versao: str | None = None):
        self.sistema = sistema
        self.versao = versao or "PENDENTE"

    def validar(self, payload: dict) -> list[dict]:
        return [
            {
                "codigo": "PENDENTE_ESPECIFICACAO_OFICIAL",
                "texto": (
                    f"O layout oficial de {self.sistema} ainda não foi carregado. "
                    "Consulte docs/pendencias-oficiais.md."
                ),
            }
        ]

    def serializar(self, payload: dict) -> bytes:
        raise PendenteEspecificacaoOficialError(self.sistema)

    async def enviar(self, payload: dict) -> dict:
        raise PendenteEspecificacaoOficialError(self.sistema)
