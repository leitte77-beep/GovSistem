"""Erros e pendências do motor de modelos documentais."""

from __future__ import annotations

from dataclasses import dataclass


class DocumentModelError(Exception):
    """Erro de negócio do motor, com código estável."""

    code = "document_model_error"

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        if code:
            self.code = code


class ModelConfigError(DocumentModelError):
    code = "model_config_invalid"


class UnknownFieldError(DocumentModelError):
    """Valor fornecido para campo não declarado no modelo."""

    code = "unknown_field"


class InvalidFieldValueError(DocumentModelError):
    """Valor não passa na validação do tipo do campo."""

    code = "invalid_field_value"


class StructureError(DocumentModelError):
    code = "document_structure_invalid"


@dataclass(frozen=True)
class Pending:
    """Pendência que bloqueia o avanço (não impede salvar rascunho)."""

    code: str
    message: str
    field: str | None = None

    def as_dict(self) -> dict:
        return {"code": self.code, "message": self.message, "field": self.field}


__all__ = [
    "DocumentModelError",
    "ModelConfigError",
    "UnknownFieldError",
    "InvalidFieldValueError",
    "StructureError",
    "Pending",
]
