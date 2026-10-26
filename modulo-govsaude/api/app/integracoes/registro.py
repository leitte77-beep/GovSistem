"""Registro de adaptadores oficiais por sistema/versão."""

from __future__ import annotations

from app.integracoes.adaptador_pendente import AdaptadorPendente
from app.integracoes.porta import PortaSistemaOficial

SISTEMAS = {
    "LEDI_APS",
    "RNDS",
    "BNAFAR",
    "CADSUS",
    "CNES",
    "SIGTAP",
    "SIA",
    "SIH",
    "RAAS",
    "APAC",
    "SISCAN",
    "BPS",
    "SIOPS",
    "LOTE01",
    "LABORATORIO",
    "GEOPROCESSAMENTO",
}


def obter_adaptador(sistema: str, versao: str | None = None) -> PortaSistemaOficial:
    if sistema not in SISTEMAS:
        raise KeyError(sistema)
    # Nenhum adaptador oficial é registrado enquanto o artefato não existir.
    return AdaptadorPendente(sistema, versao)
