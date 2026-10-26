"""Porta de integração nunca inventa payload sem artefato oficial."""

import pytest

from app.integracoes.porta import PendenteEspecificacaoOficialError
from app.integracoes.registro import obter_adaptador


def test_adaptador_pendente_nao_serializa():
    adaptador = obter_adaptador("RNDS", "4.0.0")
    assert adaptador.validar({})[0]["codigo"] == "PENDENTE_ESPECIFICACAO_OFICIAL"
    with pytest.raises(PendenteEspecificacaoOficialError):
        adaptador.serializar({})


def test_sistema_desconhecido():
    with pytest.raises(KeyError):
        obter_adaptador("SISTEMA_INVENTADO")
