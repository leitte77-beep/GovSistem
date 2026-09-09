"""Preenchimento: coerção/validação de valores e regras de obrigatoriedade.

Regras (spec): valores vindos da IA são dados não confiáveis. Antes de usar,
cada valor é validado contra o schema do campo (tipo + limites). Chaves
inesperadas são rejeitadas. Obrigatoriedade (direta ou condicional) gera
pendências que bloqueiam o avanço, mas o trabalho parcial fica recuperável.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

from app.document_model.errors import (
    InvalidFieldValueError,
    Pending,
    UnknownFieldError,
)
from app.document_model.schemas import (
    DocumentField,
    DocumentModelConfig,
    FieldType,
)

_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_BR_DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")


@dataclass
class FillData:
    """Resultado do preenchimento: valores resolvidos + pendências."""

    resolved: dict[str, str] = field(default_factory=dict)
    pending: list[Pending] = field(default_factory=list)

    @property
    def complete(self) -> bool:
        return not self.pending


def _empty(value: object) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")


def coerce_value(field: DocumentField, raw: object) -> str:
    """Valida ``raw`` contra o tipo do campo e devolve representação canônica."""
    if _empty(raw):
        if field.required:
            # Obrigatório tratado como pendência em validate_and_resolve.
            return ""
        return ""
    value = str(raw).strip()
    ftype = field.type

    if ftype == FieldType.SELECT:
        if value not in field.options:
            raise InvalidFieldValueError(
                f"Valor '{value}' não está entre as opções de '{field.label}'."
            )
        return value

    if ftype == FieldType.DATE:
        parsed = _parse_date(value)
        return parsed.isoformat()

    if ftype in (FieldType.INTEGER, FieldType.DECIMAL, FieldType.MONEY):
        number = _parse_number(value, field)
        _check_range(number, field)
        return _format_number(number, ftype)

    if ftype == FieldType.REFERENCE:
        return value

    # TEXT (default)
    if field.regex:
        if not re.fullmatch(field.regex, value):
            raise InvalidFieldValueError(f"Valor de '{field.label}' não respeita o padrão exigido.")
    return value


def _parse_date(value: str) -> date:
    if _ISO_DATE_RE.match(value):
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise InvalidFieldValueError(f"Data inválida: {value}") from exc
    if _BR_DATE_RE.match(value):
        try:
            return datetime.strptime(value, "%d/%m/%Y").date()
        except ValueError as exc:
            raise InvalidFieldValueError(f"Data inválida: {value}") from exc
    raise InvalidFieldValueError(f"Data em formato inválido: {value}")


def _parse_number(value: str, field: DocumentField) -> float:
    cleaned = value.replace("R$", "").replace(" ", "").strip()
    if not cleaned:
        raise InvalidFieldValueError(f"Valor numérico vazio para '{field.label}'.")
    # pt-BR: separador de milhar é ".", decimal é ","  → ex.: 1.234,56
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError as exc:
        raise InvalidFieldValueError(f"Valor numérico inválido para '{field.label}'.") from exc


def _check_range(number: float, field: DocumentField) -> None:
    if field.min_value is not None and number < field.min_value:
        raise InvalidFieldValueError(f"'{field.label}' deve ser >= {field.min_value}.")
    if field.max_value is not None and number > field.max_value:
        raise InvalidFieldValueError(f"'{field.label}' deve ser <= {field.max_value}.")


def _format_number(number: float, ftype: FieldType) -> str:
    if ftype == FieldType.INTEGER:
        return str(int(number))
    if ftype == FieldType.MONEY:
        # pt-BR: separador de milhar "." e decimal ","
        formatted = f"{number:,.2f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")
        return formatted
    # decimal — representação simples, ponto decimal.
    formatted = f"{number:.2f}".rstrip("0").rstrip(".")
    return formatted if formatted else "0"


def _condition_met(cond_field: str, cond_value: str, resolved: dict[str, str]) -> bool:
    return resolved.get(cond_field, "") == cond_value


def validate_and_resolve(config: DocumentModelConfig, raw_values: dict[str, object]) -> FillData:
    """Coage/valida todos os valores e computa pendências de obrigatórios."""
    fields_by_key = {f.key: f for f in config.fields}
    known = set(fields_by_key)

    # 1) Rejeita chaves inesperadas.
    unknown = set(raw_values) - known
    if unknown:
        raise UnknownFieldError(f"Campo(s) não declarado(s) no modelo: {sorted(unknown)}")
    resolved: dict[str, str] = {}
    for key, fld in fields_by_key.items():
        raw = raw_values.get(key, "")
        resolved[key] = coerce_value(fld, raw)  # levanta InvalidFieldValueError

    # 2) Obrigatoriedade (direta e condicional) -> pendências.
    pending: list[Pending] = []
    for fld in fields_by_key.values():
        required_now = fld.required and not fld.required_when
        if fld.required_when:
            required_now = any(
                _condition_met(c.field, c.value, resolved) for c in fld.required_when
            )
        if required_now and _empty(resolved.get(fld.key, "")):
            pending.append(
                Pending(
                    code="missing_required",
                    message=f"Campo obrigatório '{fld.label}' não preenchido.",
                    field=fld.key,
                )
            )
    return FillData(resolved=resolved, pending=pending)


def interpolate(text: str, resolved: dict[str, str]) -> str:
    """Substitui ``{{campo}}`` pelo valor canônico (ou vazio se não informado)."""
    from app.document_model.schemas import MARKER_RE

    def _repl(match: re.Match) -> str:
        return resolved.get(match.group(1), "")

    return MARKER_RE.sub(_repl, text)


__all__ = [
    "FillData",
    "coerce_value",
    "validate_and_resolve",
    "interpolate",
    "Pending",
]
