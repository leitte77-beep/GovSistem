"""Validações e formatações brasileiras com algoritmos REAIS de dígito verificador.

- CPF: DV pelo algoritmo oficial (pesos 10..2 e 11..2, mod 11).
- CNPJ: suporta o formato NUMÉRICO e o ALFANUMÉRICO (RFB/2026), onde os 12
  primeiros caracteres podem ser letras (A=10..Z=35) e os 2 últimos são DVs numéricos.
- NIS/PIS/PASEP e CEP.
- Máscaras LGPD (nunca expor documento completo em listagem).
"""

import re

_ONLY_DIGITS = re.compile(r"\D")


def only_digits(value: str | None) -> str:
    if not value:
        return ""
    return _ONLY_DIGITS.sub("", value)


def _cnpj_char_value(c: str) -> int:
    """Converte um caractere do CNPJ alfanumérico em valor numérico (A=10..Z=35)."""
    if "0" <= c <= "9":
        return ord(c) - ord("0")
    if "A" <= c <= "Z":
        return ord(c) - ord("A") + 10
    return -1


def _normalize_cnpj(cnpj: str | None) -> str:
    if not cnpj:
        return ""
    return re.sub(r"[^0-9A-Za-z]", "", cnpj).upper()


def _cnpj_dv(digits: str, pesos: list[int]) -> int:
    soma = sum(_cnpj_char_value(c) * p for c, p in zip(digits, pesos))
    resto = soma % 11
    return 0 if resto < 2 else 11 - resto


def compute_cnpj_dv(base12: str) -> str:
    """Calcula os 2 dígitos verificadores de um CNPJ (base de 12 caracteres alfanuméricos)."""
    base = _normalize_cnpj(base12)
    if len(base) != 12 or any(_cnpj_char_value(c) < 0 for c in base):
        raise ValueError("Base do CNPJ deve ter 12 caracteres alfanuméricos")
    dv1 = _cnpj_dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    dv2 = _cnpj_dv(base + str(dv1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return f"{dv1}{dv2}"


def validate_cnpj(cnpj: str | None) -> bool:
    """Valida CNPJ numérico OU alfanumérico pelo dígito verificador."""
    cnpj = _normalize_cnpj(cnpj)
    if len(cnpj) != 14:
        return False
    base = cnpj[:12]
    if any(_cnpj_char_value(c) < 0 for c in base):
        return False
    if not base[0].isdigit() or not cnpj[12].isdigit() or not cnpj[13].isdigit():
        return False
    return cnpj == base + compute_cnpj_dv(base)


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
    nis = only_digits(nis)
    if len(nis) != 11 or nis == nis[0] * 11:
        return False
    pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma = sum(int(nis[i]) * pesos[i] for i in range(10))
    resto = soma % 11
    dv = 0 if resto < 2 else 11 - resto
    return dv == int(nis[10])


def validate_cep(cep: str | None) -> bool:
    return len(only_digits(cep)) == 8


def normalize_cpf(cpf: str | None) -> str | None:
    digits = only_digits(cpf)
    return digits or None


def normalize_cnpj(cnpj: str | None) -> str | None:
    value = _normalize_cnpj(cnpj)
    return value or None


def mask_cpf(cpf: str | None) -> str | None:
    digits = only_digits(cpf)
    if len(digits) != 11:
        return None
    return f"***.***.***-{digits[-2:]}"


def mask_cnpj(cnpj: str | None) -> str | None:
    value = _normalize_cnpj(cnpj)
    if len(value) != 14:
        return None
    return f"**.***.***/****-{value[-2:]}"


def mask_cpf_cnpj(doc: str | None) -> str | None:
    digits = only_digits(doc)
    if len(digits) == 11:
        return mask_cpf(digits)
    if len(digits) == 14:
        return mask_cnpj(digits)
    return None


def format_cpf(cpf: str | None) -> str | None:
    digits = only_digits(cpf)
    if len(digits) != 11:
        return None
    return f"{digits[0:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:11]}"


def format_cnpj(cnpj: str | None) -> str | None:
    value = _normalize_cnpj(cnpj)
    if len(value) != 14:
        return None
    return f"{value[0:2]}.{value[2:5]}.{value[5:8]}/{value[8:12]}-{value[12:14]}"
