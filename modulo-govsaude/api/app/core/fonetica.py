"""Normalização e fonética BuscaBR para o cadastro único (B.12-005).

O objetivo é fazer ``Luiz``/``Luis``, ``Thais``/``Taís``, ``Sousa``/``Souza`` e
``Ellen``/``Helen`` caírem na mesma chave, sem depender de extensão externa.
A coluna ``nome_busca`` guarda a forma sem acento/minúscula (GIN pg_trgm) e
``nome_fonetico`` a chave BuscaBR.
"""

from __future__ import annotations

import re
import unicodedata

_NAO_ALFA = re.compile(r"[^a-z ]+")
_ESPACOS = re.compile(r"\s+")


def remover_acentos(texto: str) -> str:
    decomposto = unicodedata.normalize("NFKD", texto or "")
    return "".join(ch for ch in decomposto if not unicodedata.combining(ch))


def normalizar_busca(texto: str | None) -> str:
    """Nome sem acento, minúsculo, só letras e espaços simples."""
    base = remover_acentos(texto or "").lower()
    base = _NAO_ALFA.sub(" ", base)
    return _ESPACOS.sub(" ", base).strip()


def _fonetica_palavra(palavra: str) -> str:
    p = normalizar_busca(palavra).replace(" ", "")
    if not p:
        return ""

    # Dígrafos e equivalências consonantais.
    p = p.replace("ph", "f")
    p = p.replace("th", "t")
    p = p.replace("ch", "x")
    p = p.replace("lh", "l")
    p = p.replace("nh", "n")
    p = p.replace("rr", "r")
    p = p.replace("ss", "s")
    p = p.replace("sc", "s")
    p = p.replace("sç", "s")
    p = p.replace("xc", "s")
    p = p.replace("qu", "k")
    p = p.replace("gu", "g")
    p = p.replace("ç", "s")
    p = p.replace("y", "i")
    p = p.replace("w", "v")
    p = p.replace("z", "s")

    # C/G antes de e/i.
    p = re.sub(r"c([ei])", r"s\1", p)
    p = re.sub(r"g([ei])", r"j\1", p)

    # S entre vogais soa como Z (Sousa → souza); X inicial/entre vogais → S.
    p = re.sub(r"(?<=[aeiou])s(?=[aeiou])", "z", p)
    p = re.sub(r"(?<=[aeiou])x(?=[aeiou])", "s", p)
    p = re.sub(r"^x", "s", p)

    # H não é pronunciado, exceto nos dígrafos já tratados.
    p = p.replace("h", "")
    p = p.replace("z", "s")

    # Colapsa letras repetidas e remove vogais repetidas consecutivas.
    p = re.sub(r"(.)\1+", r"\1", p)
    return p


def nome_fonetico(texto: str | None) -> str:
    """Chave fonética por token, preservando a ordem das palavras."""
    return " ".join(
        token for token in (_fonetica_palavra(p) for p in normalizar_busca(texto).split()) if token
    )


def tokens_foneticos(texto: str | None) -> list[str]:
    return [t for t in nome_fonetico(texto).split(" ") if t]
