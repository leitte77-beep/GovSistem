"""Regras de domínio transversais (níveis de acesso)."""

_NIVEL_RANKING = {"PUBLICO": 0, "RESTRITO": 1, "SIGILOSO": 2}


def nivel_ranking(nivel: str) -> int:
    return _NIVEL_RANKING.get(nivel, 0)


def nivel_mais_restritivo(a: str, b: str) -> str:
    return a if nivel_ranking(a) >= nivel_ranking(b) else b


def documento_menos_restritivo_que_processo(processo_nivel: str, documento_nivel: str) -> bool:
    """Verdadeiro se o documento for MENOS restritivo que o processo (proibido)."""
    return nivel_ranking(documento_nivel) < nivel_ranking(processo_nivel)
