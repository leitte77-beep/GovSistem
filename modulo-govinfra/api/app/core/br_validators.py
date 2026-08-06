"""Validação e normalização de dados brasileiros (CPF, CNPJ, telefone, placa).

Tudo aqui é puro (sem I/O) para ser testável isoladamente.
"""

import re
import unicodedata

_SO_DIGITOS = re.compile(r"\D+")


def apenas_digitos(valor: str | None) -> str:
    return _SO_DIGITOS.sub("", valor or "")


def cpf_valido(cpf: str | None) -> bool:
    """Valida os dois dígitos verificadores do CPF."""
    numeros = apenas_digitos(cpf)
    if len(numeros) != 11 or numeros == numeros[0] * 11:
        return False
    for tamanho in (9, 10):
        soma = sum(int(numeros[i]) * (tamanho + 1 - i) for i in range(tamanho))
        digito = (soma * 10) % 11
        if digito == 10:
            digito = 0
        if digito != int(numeros[tamanho]):
            return False
    return True


def cnpj_valido(cnpj: str | None) -> bool:
    numeros = apenas_digitos(cnpj)
    if len(numeros) != 14 or numeros == numeros[0] * 14:
        return False
    pesos_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos_2 = [6] + pesos_1
    for pesos, posicao in ((pesos_1, 12), (pesos_2, 13)):
        soma = sum(int(numeros[i]) * pesos[i] for i in range(posicao))
        resto = soma % 11
        digito = 0 if resto < 2 else 11 - resto
        if digito != int(numeros[posicao]):
            return False
    return True


def formatar_cpf(cpf: str | None) -> str:
    numeros = apenas_digitos(cpf)
    if len(numeros) != 11:
        return cpf or ""
    return f"{numeros[:3]}.{numeros[3:6]}.{numeros[6:9]}-{numeros[9:]}"


def mascarar_cpf(cpf: str | None) -> str:
    """CPF parcialmente oculto — usado sempre que o usuário não tem permissão
    de ver o documento completo (`govinfra.pessoas.ver_cpf`)."""
    numeros = apenas_digitos(cpf)
    if len(numeros) != 11:
        return "***"
    return f"***.{numeros[3:6]}.***-{numeros[9:]}"


def normalizar_telefone(telefone: str | None) -> str:
    """Padroniza para o formato nacional com DDD (só dígitos).

    Remove o código do país (55) quando presente para que a busca por telefone
    encontre o registro digitado de qualquer jeito.
    """
    numeros = apenas_digitos(telefone)
    if len(numeros) > 11 and numeros.startswith("55"):
        numeros = numeros[2:]
    return numeros[:11]


def formatar_telefone(telefone: str | None) -> str:
    numeros = normalizar_telefone(telefone)
    if len(numeros) == 11:
        return f"({numeros[:2]}) {numeros[2:7]}-{numeros[7:]}"
    if len(numeros) == 10:
        return f"({numeros[:2]}) {numeros[2:6]}-{numeros[6:]}"
    return telefone or ""


def normalizar_placa(placa: str | None) -> str:
    """Placa sem hífen e em maiúsculas (aceita padrão antigo e Mercosul)."""
    return re.sub(r"[^A-Z0-9]", "", (placa or "").upper())[:7]


def placa_valida(placa: str | None) -> bool:
    limpa = normalizar_placa(placa)
    if len(limpa) != 7:
        return False
    # Padrão antigo AAA9999 ou Mercosul AAA9A99.
    return bool(re.fullmatch(r"[A-Z]{3}\d{4}", limpa) or re.fullmatch(r"[A-Z]{3}\d[A-Z]\d{2}", limpa))


def normalizar_cep(cep: str | None) -> str:
    return apenas_digitos(cep)[:8]


def sem_acento(texto: str | None) -> str:
    """Texto sem acentos e em minúsculas — base da busca tolerante."""
    if not texto:
        return ""
    normalizado = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in normalizado if not unicodedata.combining(c)).lower()


def chave_busca(*partes: str | None) -> str:
    """Monta a chave normalizada gravada nas colunas `*_busca`.

    Permite pesquisar por nome com ou sem acento, por CPF com ou sem pontuação
    e por telefone em qualquer formatação, tudo com um LIKE simples.
    """
    limpas = [sem_acento(p) for p in partes if p]
    return re.sub(r"\s+", " ", " ".join(limpas)).strip()
