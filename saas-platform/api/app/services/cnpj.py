import re


def validate_cnpj(cnpj: str) -> bool:
    cleaned = re.sub(r"[^0-9A-Za-z]", "", cnpj)
    if len(cleaned) != 14:
        return False

    if cleaned.isdigit():
        if cleaned == cleaned[0] * 14:
            return False

        try:
            digits = [int(c) for c in cleaned]
        except ValueError:
            return False

        calc1 = sum(digits[i] * weight for i, weight in enumerate([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
        rest1 = calc1 % 11
        dig1 = 0 if rest1 < 2 else 11 - rest1
        if dig1 != digits[12]:
            return False

        calc2 = sum(digits[i] * weight for i, weight in enumerate([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]))
        rest2 = calc2 % 11
        dig2 = 0 if rest2 < 2 else 11 - rest2
        if dig2 != digits[13]:
            return False

        return True

    return True


def validate_cpf(cpf: str) -> bool:
    cleaned = re.sub(r"\D", "", cpf)
    if len(cleaned) != 11:
        return False

    if cleaned == cleaned[0] * 11:
        return False

    try:
        digits = [int(c) for c in cleaned]
    except ValueError:
        return False

    calc1 = sum(digits[i] * (10 - i) for i in range(9))
    rest1 = (calc1 * 10) % 11
    dig1 = 0 if rest1 == 10 else rest1
    if dig1 != digits[9]:
        return False

    calc2 = sum(digits[i] * (11 - i) for i in range(10))
    rest2 = (calc2 * 10) % 11
    dig2 = 0 if rest2 == 10 else rest2
    if dig2 != digits[10]:
        return False

    return True


def validate_document(doc: str) -> tuple[bool, str]:
    cleaned = re.sub(r"\D", "", doc)
    if len(cleaned) <= 11:
        return validate_cpf(cleaned), "CPF"
    else:
        return validate_cnpj(cleaned), "CNPJ"


def format_cnpj(cnpj: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z]", "", cnpj)
    if len(cleaned) == 14:
        return f"{cleaned[:2]}.{cleaned[2:5]}.{cleaned[5:8]}/{cleaned[8:12]}-{cleaned[12:]}"
    return cnpj


def format_cpf(cpf: str) -> str:
    cleaned = re.sub(r"\D", "", cpf)
    if len(cleaned) == 11:
        return f"{cleaned[:3]}.{cleaned[3:6]}.{cleaned[6:9]}-{cleaned[9:]}"
    return cpf
