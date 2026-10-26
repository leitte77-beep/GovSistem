"""Validadores brasileiros com dígito verificador.

Nenhum algoritmo é "de memória": CPF, CNS, CNPJ (numérico e alfanumérico),
PIS/NIS seguem as regras publicadas. CNES, CBO, SIGTAP, CID-10 e CIAP-2 são
validados estruturalmente e, quando a base oficial foi importada, também
contra a tabela de referência (``validar_*`` aceita ``universo`` opcional).

O código IBGE de município é validado estruturalmente (UF 11..53 + 5 dígitos)
e contra a base oficial quando disponível. O algoritmo de DV do código IBGE
não é utilizado como fonte de verdade: a tabela oficial é a referência,
conforme docs/pendencias-oficiais.md.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

CPF_RE = re.compile(r"^\d{11}$")
CNS_RE = re.compile(r"^[12789]\d{14}$")
CNPJ_RE = re.compile(r"^[0-9A-Z]{12}\d{2}$")
CEP_RE = re.compile(r"^\d{8}$")
CNES_RE = re.compile(r"^\d{7}$")
INE_RE = re.compile(r"^\d{10}$")
CBO_RE = re.compile(r"^\d{6}$")
SIGTAP_RE = re.compile(r"^\d{10}$")
CID10_RE = re.compile(r"^[A-Z]\d{2}(?:\.?\d)?$")
CIAP2_RE = re.compile(r"^[A-Z]\d{2}(?:\.?\d)?$")
COMPETENCIA_RE = re.compile(r"^\d{6}$")


def somente_digitos(valor: str | None) -> str:
    return "".join(ch for ch in (valor or "") if ch.isdigit())


def normalizar_cnpj(valor: str | None) -> str:
    return "".join(ch for ch in (valor or "").upper() if ch.isalnum())


def _todos_iguais(digitos: str) -> bool:
    return bool(digitos) and len(set(digitos)) == 1


def _digito_mod11(soma: int) -> int:
    resto = soma % 11
    return 0 if resto < 2 else 11 - resto


# ── CPF ─────────────────────────────────────────────────────────────────────


def validar_cpf(valor: str | None) -> bool:
    digitos = somente_digitos(valor)
    if not CPF_RE.match(digitos) or _todos_iguais(digitos):
        return False
    for posicao in (9, 10):
        soma = sum(int(digitos[i]) * (posicao + 1 - i) for i in range(posicao))
        esperado = _digito_mod11(soma)
        if int(digitos[posicao]) != esperado:
            return False
    return True


def mascarar_cpf(valor: str | None) -> str | None:
    digitos = somente_digitos(valor)
    if len(digitos) != 11:
        return None
    return f"***.***.***-{digitos[-2:]}"


def formatar_cpf(valor: str | None) -> str | None:
    digitos = somente_digitos(valor)
    if len(digitos) != 11:
        return None
    return f"{digitos[:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:]}"


# ── CNS ─────────────────────────────────────────────────────────────────────


def validar_cns(valor: str | None) -> bool:
    """CNS: 15 dígitos, inicia em 1/2/7/8/9 e soma(dígito × peso 15..1) ≡ 0 mod 11."""
    digitos = somente_digitos(valor)
    if not CNS_RE.match(digitos):
        return False
    soma = sum(int(digito) * (15 - indice) for indice, digito in enumerate(digitos))
    return soma % 11 == 0


def mascarar_cns(valor: str | None) -> str | None:
    digitos = somente_digitos(valor)
    if len(digitos) != 15:
        return None
    return f"*** *** *** {digitos[-4:]}"


# ── CNPJ numérico e alfanumérico ────────────────────────────────────────────


def _valor_caractere(caractere: str) -> int:
    # Regra da IN RFB 2.229/2024: valor = ASCII - 48 (A=17 ... Z=42).
    return ord(caractere) - 48


def _cnpj_dv(base: str) -> tuple[int, int]:
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma1 = sum(_valor_caractere(c) * peso for c, peso in zip(base[:12], pesos1))
    dv1 = _digito_mod11(soma1)
    pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    base2 = base[:12] + str(dv1)
    soma2 = sum(_valor_caractere(c) * peso for c, peso in zip(base2, pesos2))
    dv2 = _digito_mod11(soma2)
    return dv1, dv2


def validar_cnpj(valor: str | None) -> bool:
    normalizado = normalizar_cnpj(valor)
    if not CNPJ_RE.match(normalizado) or _todos_iguais(normalizado):
        return False
    dv1, dv2 = _cnpj_dv(normalizado)
    return int(normalizado[12]) == dv1 and int(normalizado[13]) == dv2


def gerar_cnpj_alfanumerico(base12: str) -> str:
    """Auxiliar de testes/seed: calcula os DVs de uma base alfanumérica de 12 posições."""
    base = normalizar_cnpj(base12)
    if len(base) != 12 or not re.match(r"^[0-9A-Z]{12}$", base):
        raise ValueError("A base deve ter 12 caracteres [0-9A-Z].")
    dv1, dv2 = _cnpj_dv(base)
    return f"{base}{dv1}{dv2}"


def formatar_cnpj(valor: str | None) -> str | None:
    normalizado = normalizar_cnpj(valor)
    if len(normalizado) != 14:
        return None
    return (
        f"{normalizado[:2]}.{normalizado[2:5]}.{normalizado[5:8]}/"
        f"{normalizado[8:12]}-{normalizado[12:]}"
    )


# ── PIS/NIS ─────────────────────────────────────────────────────────────────


def validar_pis(valor: str | None) -> bool:
    digitos = somente_digitos(valor)
    if len(digitos) != 11 or _todos_iguais(digitos):
        return False
    pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma = sum(int(d) * p for d, p in zip(digitos[:10], pesos))
    resto = soma % 11
    dv = 0 if resto < 2 else 11 - resto
    return int(digitos[10]) == dv


# ── CEP, CNES, CBO, SIGTAP ──────────────────────────────────────────────────


def validar_cep(valor: str | None) -> bool:
    return bool(CEP_RE.match(somente_digitos(valor)))


def validar_cnes(valor: str | None, universo: set[str] | None = None) -> bool:
    codigo = somente_digitos(valor)
    if not CNES_RE.match(codigo):
        return False
    return codigo in universo if universo is not None else True


def validar_ine(valor: str | None, universo: set[str] | None = None) -> bool:
    """INE é validado estruturalmente (10 dígitos).

    Não há algoritmo de dígito verificador publicado no material recebido; a
    base oficial do CNES é a fonte de verdade quando importada.
    """
    codigo = somente_digitos(valor)
    if not INE_RE.match(codigo):
        return False
    return codigo in universo if universo is not None else True


def validar_cbo(valor: str | None, universo: set[str] | None = None) -> bool:
    codigo = somente_digitos(valor)
    if not CBO_RE.match(codigo):
        return False
    return codigo in universo if universo is not None else True


def validar_sigtap(valor: str | None, universo: set[str] | None = None) -> bool:
    codigo = somente_digitos(valor)
    if not SIGTAP_RE.match(codigo):
        return False
    return codigo in universo if universo is not None else True


# ── Código IBGE de município ────────────────────────────────────────────────


def validar_codigo_ibge(valor: str | None, universo: set[str] | None = None) -> bool:
    codigo = somente_digitos(valor)
    if len(codigo) != 7:
        return False
    uf = int(codigo[:2])
    if not 11 <= uf <= 53:
        return False
    return codigo in universo if universo is not None else True


# ── CID-10 / CIAP-2 / competência ───────────────────────────────────────────


def validar_cid10(valor: str | None) -> bool:
    return bool(CID10_RE.match((valor or "").strip().upper()))


def validar_ciap2(valor: str | None) -> bool:
    return bool(CIAP2_RE.match((valor or "").strip().upper()))


def validar_competencia(valor: str | None) -> bool:
    codigo = (valor or "").strip()
    if not COMPETENCIA_RE.match(codigo):
        return False
    ano = int(codigo[:4])
    mes = int(codigo[4:])
    return 1900 <= ano <= 2100 and 1 <= mes <= 12


def competencia_atual(fuso_horario: str | None = None) -> str:
    try:
        tz = ZoneInfo(fuso_horario or "America/Sao_Paulo")
    except Exception:  # noqa: BLE001 - fuso inválido cai no padrão do SUS
        tz = ZoneInfo("America/Sao_Paulo")
    hoje = datetime.now(tz).date()
    return f"{hoje.year:04d}{hoje.month:02d}"


def competencia_de(data_ref: date, fuso_horario: str | None = None) -> str:
    try:
        tz = ZoneInfo(fuso_horario or "America/Sao_Paulo")
    except Exception:  # noqa: BLE001
        tz = ZoneInfo("America/Sao_Paulo")
    local = data_ref
    if isinstance(local, datetime):
        local = local.astimezone(tz).date()
    return f"{local.year:04d}{local.month:02d}"


__all__ = [
    "competencia_atual",
    "competencia_de",
    "formatar_cnpj",
    "formatar_cpf",
    "gerar_cnpj_alfanumerico",
    "mascarar_cnpj",
    "mascarar_cns",
    "mascarar_cpf",
    "normalizar_cnpj",
    "somente_digitos",
    "validar_cbo",
    "validar_cep",
    "validar_ciap2",
    "validar_cid10",
    "validar_cnes",
    "validar_cnpj",
    "validar_cns",
    "validar_codigo_ibge",
    "validar_competencia",
    "validar_cpf",
    "validar_ine",
    "validar_pis",
    "validar_sigtap",
]


def mascarar_cnpj(valor: str | None) -> str | None:
    normalizado = normalizar_cnpj(valor)
    if len(normalizado) != 14:
        return None
    return f"**.***.***/****-{normalizado[-2:]}"
