"""Registro de adaptadores oficiais por sistema/versão.

Com manifesto oficial em ``especificacoes/<SISTEMA>/<versao>/manifest.json``
o sistema ganha o ``AdaptadorManifesto``; sem ele, ``AdaptadorPendente``
(nada é serializado nem transmitido).
"""

from __future__ import annotations

from app.integracoes.adaptador_pendente import AdaptadorPendente
from app.integracoes.manifesto import (
    AdaptadorManifesto,
    ManifestoInvalidoError,
    ler_manifesto,
    manifestos_do_sistema,
)
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
    disponiveis = manifestos_do_sistema(sistema)
    caminho = (
        disponiveis.get(versao)
        if versao
        else (disponiveis[sorted(disponiveis)[-1]] if disponiveis else None)
    )
    if caminho is None:
        return AdaptadorPendente(sistema, versao)
    try:
        return AdaptadorManifesto(ler_manifesto(caminho))
    except ManifestoInvalidoError:
        return AdaptadorPendente(sistema, versao)


def eh_pendente(adaptador) -> bool:
    return isinstance(adaptador, AdaptadorPendente)
