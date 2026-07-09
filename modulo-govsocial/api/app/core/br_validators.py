"""Validações e formatações brasileiras (algoritmos reais de dígito verificador)."""

import re

_ONLY_DIGITS = re.compile(r"\D")


def only_digits(value: str | None) -> str:
    if not value:
        return ""
    return _ONLY_DIGITS.sub("", value)


def validate_cpf(cpf: str | None) -> bool:
    """Valida CPF pelo algoritmo oficial dos dígitos verificadores."""
    cpf = only_digits(cpf)
    if len(cpf) != 11:
        return False
    if cpf == cpf[0] * 11:
        return False

    for i in range(9, 11):
        soma = sum(int(cpf[num]) * ((i + 1) - num) for num in range(i))
        dv = ((soma * 10) % 11) % 10
        if dv != int(cpf[i]):
            return False
    return True


def validate_nis(nis: str | None) -> bool:
    """Valida NIS/PIS/PASEP pelo dígito verificador (peso 3..2 mod 11)."""
    nis = only_digits(nis)
    if len(nis) != 11:
        return False
    if nis == nis[0] * 11:
        return False

    pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma = sum(int(nis[i]) * pesos[i] for i in range(10))
    resto = soma % 11
    dv = 0 if resto < 2 else 11 - resto
    return dv == int(nis[10])


def validate_cep(cep: str | None) -> bool:
    """CEP: 8 dígitos."""
    return len(only_digits(cep)) == 8


def normalize_cpf(cpf: str | None) -> str | None:
    digits = only_digits(cpf)
    return digits or None


def mask_cpf(cpf: str | None) -> str | None:
    """Mascara CPF para listagens: ***.***.***-12 (LGPD)."""
    digits = only_digits(cpf)
    if len(digits) != 11:
        return None
    return f"***.***.***-{digits[-2:]}"


def format_cpf(cpf: str | None) -> str | None:
    digits = only_digits(cpf)
    if len(digits) != 11:
        return None
    return f"{digits[0:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:11]}"


def normalize_nis(nis: str | None) -> str | None:
    digits = only_digits(nis)
    return digits or None


def mask_nis(nis: str | None) -> str | None:
    """Mascara NIS para listagens (LGPD): mostra só os 3 últimos dígitos."""
    digits = only_digits(nis)
    if len(digits) != 11:
        return None
    return f"********{digits[-3:]}"
