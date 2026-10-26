"""Adaptador CADSUS sem contrato/credencial oficial do tenant."""

from __future__ import annotations

from app.integracoes.cadsus.porta import PortaCADSUS

STATUS_PENDENTE = "PENDENTE_ESPECIFICACAO_OFICIAL"


class AdaptadorCADSUSPendente(PortaCADSUS):
    async def consultar(
        self, *, cpf: str | None = None, cns: str | None = None
    ) -> dict:
        return {
            "status": STATUS_PENDENTE,
            "mensagem": (
                "Contrato/credencial oficial do CADSUS não configurado para o "
                "tenant. Consulte docs/pendencias-oficiais.md."
            ),
        }
