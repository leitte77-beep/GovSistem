"""Número Único de Protocolo (NUP) — 17 dígitos no formato NNNNN.NNNNNN/AAAA-DD.

Cálculo dos dígitos verificadores conforme o Anexo da Portaria Interministerial
MJSP/ME nº 11, de 25/11/2019 (idêntico ao Anexo da Portaria SLTI/MP nº 3/2003):

- 1º DV: os 15 primeiros dígitos multiplicados por pesos 2..16, da DIREITA para a
  ESQUERDA; resto = soma mod 11; DV = (11 - resto) mod 10.
- 2º DV: os 16 dígitos (15 + 1º DV) multiplicados por pesos 2..17; mesma regra.

Vetores oficiais (Anexo):
    35041.000387/2000 -> 19
    04000.001412/2000 -> 26
"""

import re

_BASE_RE = re.compile(r"^(\d{5})(\d{6})(\d{4})$")
_NUP_RE = re.compile(r"^(\d{5})\.(\d{6})/(\d{4})-(\d{2})$")


def _dv(digits: str, peso_max: int) -> int:
    """Calcula um DV: pesos 2..peso_max da direita para a esquerda, mod 11."""
    pesos = range(2, peso_max + 1)
    soma = sum(int(d) * p for d, p in zip(reversed(digits), pesos))
    return (11 - (soma % 11)) % 10


def calcular_dv(base: str) -> str:
    """Retorna os 2 dígitos verificadores de uma base de 15 dígitos (sem pontuação)."""
    base = only_digits(base)
    if len(base) != 15:
        raise ValueError("A base do NUP deve conter 15 dígitos")
    dv1 = _dv(base, 16)
    dv2 = _dv(base + str(dv1), 17)
    return f"{dv1}{dv2}"


def only_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def formatar_nup(codigo_unidade: int, sequencial: int, ano: int, dv: str | None = None) -> str:
    if dv is None:
        base = f"{codigo_unidade:05d}{sequencial:06d}{ano:04d}"
        dv = calcular_dv(base)
    return f"{codigo_unidade:05d}.{sequencial:06d}/{ano:04d}-{dv}"


def validar_nup(nup: str) -> bool:
    """Valida a estrutura e o DV de um NUP formatado (ex.: 35041.000387/2000-19)."""
    m = _NUP_RE.match((nup or "").strip())
    if not m:
        return False
    codigo, sequencial, ano, dv = m.groups()
    base = f"{codigo}{sequencial}{ano}"
    return calcular_dv(base) == dv


def parse_nup(nup: str) -> dict | None:
    """Quebra um NUP formatado em suas partes (ou None se inválido)."""
    m = _NUP_RE.match((nup or "").strip())
    if not m:
        return None
    codigo, sequencial, ano, dv = m.groups()
    return {
        "codigo_unidade": codigo,
        "sequencial": int(sequencial),
        "ano": int(ano),
        "dv": dv,
        "nup": nup.strip(),
    }
