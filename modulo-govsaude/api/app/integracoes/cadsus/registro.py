"""Ponto único de seleção do adaptador CADSUS."""

from __future__ import annotations

from app.integracoes.cadsus.adaptador_pendente import AdaptadorCADSUSPendente
from app.integracoes.cadsus.porta import PortaCADSUS


def obter_adaptador_cadsus() -> PortaCADSUS:
    # Um adaptador oficial só é registrado quando contrato/credencial existirem.
    return AdaptadorCADSUSPendente()
