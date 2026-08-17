"""Regras de nível de acesso (publicidade como regra; sigilo como exceção)."""

from app.core.regras import documento_menos_restritivo_que_processo, nivel_ranking


def test_ranking_niveis():
    assert nivel_ranking("PUBLICO") < nivel_ranking("RESTRITO") < nivel_ranking("SIGILOSO")


def test_documento_nao_pode_ser_menos_restritivo():
    # processo SIGILOSO não pode ter documento PUBLICO
    assert documento_menos_restritivo_que_processo("SIGILOSO", "PUBLICO") is True
    assert documento_menos_restritivo_que_processo("SIGILOSO", "RESTRITO") is True
    assert documento_menos_restritivo_que_processo("SIGILOSO", "SIGILOSO") is False


def test_documento_restrito_em_processo_publico_permitido():
    # documento mais restritivo que o processo é permitido
    assert documento_menos_restritivo_que_processo("PUBLICO", "RESTRITO") is False
