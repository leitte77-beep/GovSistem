import logging
import re
from typing import Any

SENSITIVE_FIELDS = {
    "api_key", "apiKey", "api_key_encrypted", "access_token",
    "password", "senha", "secret", "token", "creditCard",
    "credit_card", "card_number", "cardNumber", "cvv",
    "creditCardNumber", "creditCardCvv",
}

DOCUMENT_PATTERNS = [
    (re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b"), "CPF"),
    (re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b"), "CNPJ"),
]


def sanitize_value(key: str, value: Any) -> Any:
    if key.lower() in SENSITIVE_FIELDS:
        if isinstance(value, str) and len(value) > 4:
            if len(value) > 8:
                return value[:4] + "***" + value[-2:]
            return value[:2] + "***" + value[-1:]
        return "***"
    return value


def mask_document(doc: str) -> str:
    if not doc:
        return doc
    digits = re.sub(r"\D", "", doc)
    if len(digits) == 11:
        return f"{digits[:3]}.***.***-{digits[-2:]}"
    elif len(digits) == 14:
        return f"{digits[:2]}.***.***/****-{digits[-2:]}"
    return doc


def sanitize_payload(payload: dict) -> dict:
    result: dict = {}
    for key, value in payload.items():
        if isinstance(value, dict):
            result[key] = sanitize_payload(value)
        elif isinstance(value, list):
            result[key] = [
                sanitize_payload(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            result[key] = sanitize_value(key, value)
    return result


def sanitize_log(record: logging.LogRecord) -> str:
    msg = record.getMessage()
    for pattern, _ in DOCUMENT_PATTERNS:
        msg = pattern.sub("***", msg)
    return msg


class SanitizingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if hasattr(record, "msg") and isinstance(record.msg, str):
            record.msg = sanitize_log(record)
        return True
