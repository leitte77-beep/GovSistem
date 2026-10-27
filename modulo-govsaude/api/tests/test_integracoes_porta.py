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


def test_b12_060_manifesto_invalido_volta_a_pendente(tmp_path, monkeypatch):
    from app.core.config import settings

    pasta = tmp_path / "LEDI_APS" / "x"
    pasta.mkdir(parents=True)
    (pasta / "manifest.json").write_text('{"sistema": "LEDI_APS"}', encoding="utf-8")
    monkeypatch.setattr(settings, "INTEGRACOES_ESPECIFICACOES_DIR", str(tmp_path))
    assert obter_adaptador("LEDI_APS").validar({})[0]["codigo"] == "PENDENTE_ESPECIFICACAO_OFICIAL"


def test_b12_061_mapeamento_por_manifesto_e_deterministico():
    from app.integracoes.manifesto import AdaptadorManifesto, Manifesto

    adaptador = AdaptadorManifesto(
        Manifesto(
            sistema="LEDI_APS",
            versao_layout="t",
            fonte="sintético",
            sintetico=True,
            transporte={"tipo": "ARQUIVO"},
            registros={
                "visita_domiciliar": {
                    "operacoes": ["INCLUSAO"],
                    "campos": [
                        {"destino": "a.b", "origem": "x.y", "obrigatorio": True, "max": 3},
                        {"destino": "c", "constante": 1},
                    ],
                }
            },
        )
    )
    base = {"tipo_registro": "visita_domiciliar", "operacao": "INCLUSAO", "registro_id": "1"}
    assert adaptador.validar({**base, "dados": {}})[0]["codigo"] == "CAMPO_OBRIGATORIO_LAYOUT"
    assert adaptador.validar({**base, "dados": {"x": {"y": "abcd"}}})[0]["codigo"] == "TAMANHO_EXCEDIDO"
    assert adaptador.validar({**base, "operacao": "EXCLUSAO", "dados": {}})[0]["codigo"] == "OPERACAO_NAO_ADMITIDA"
    assert adaptador.serializar({**base, "dados": {"x": {"y": "ab"}}}) == b'{"a":{"b":"ab"},"c":1}'
