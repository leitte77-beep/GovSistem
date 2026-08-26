"""Validação e normalização de placas de veículos.

Suporta:
  - Padrão antigo (pré-Mercosul): LLL-NNNN  → ``ABC1234``
  - Padrão Mercosul:                LLL-NLD  → ``ABC1D23``

A normalização remove separadores (hífen/espaço) e normaliza para maiúsculas,
de modo que a placa é sempre armazenada canônica (ex.: ``ABC1D23``) e única
por organização.
"""

import re

# Padrão antigo: 3 letras + 4 dígitos (ABC1234)
_RE_ANTIGO = re.compile(r"^[A-Z]{3}[0-9]{4}$")
# Padrão Mercosul: 3 letras + 1 dígito + 1 letra + 2 dígitos (ABC1D23)
_RE_MERCOSUL = re.compile(r"^[A-Z]{3}[0-9][A-Z][0-9]{2}$")


def normalizar_placa(placa: str | None) -> str:
    """Normaliza a placa para o formato canônico (sem separador, maiúsculas)."""
    if placa is None:
        return ""
    return placa.upper().replace("-", "").replace(" ", "").strip()


def placa_valida(placa: str | None) -> bool:
    """Verifica se a placa está em um formato aceito (antigo ou Mercosul)."""
    placa = normalizar_placa(placa)
    if not placa:
        return False
    return bool(_RE_ANTIGO.match(placa) or _RE_MERCOSUL.match(placa))


def normalizar_renavam(renavam: str | None) -> str:
    """Normaliza RENAVAM: apenas dígitos numéricos."""
    if renavam is None:
        return ""
    return "".join(ch for ch in renavam if ch.isdigit())


def normalizar_chassi(chassi: str | None) -> str:
    """Normaliza chassi: maiúsculas, sem espaços e separadores."""
    if chassi is None:
        return ""
    return chassi.upper().replace("-", "").replace(" ", "").strip()
