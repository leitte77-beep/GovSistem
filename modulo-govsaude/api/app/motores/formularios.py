"""Motor de formulários dinâmicos (B.2-004, B.12-013).

O schema é JSON Schema versionado, mas o motor implementa apenas o subconjunto
usado pelas fichas do GovSaúde para não adicionar dependência fora da lista
permitida: ``type``, ``required``, ``properties``, ``additionalProperties``,
``enum``/``const``, ``minimum``/``maximum``, ``minLength``/``maxLength``,
``pattern``, ``minItems``/``maxItems``, ``items`` e ``format`` (date/date-time).

Nada de regra clínica oficial é codificado aqui: o schema é dado do tenant e os
seeds entram marcados como ``A_VALIDAR``.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

_TIPOS = {
    "object",
    "array",
    "string",
    "integer",
    "number",
    "boolean",
    "null",
}


def _erro(campo: str, mensagem: str, codigo: str) -> dict:
    return {"campo": campo, "mensagem": mensagem, "codigo_regra": codigo}


def validar_schema(schema: Any) -> list[dict]:
    """Valida a estrutura mínima de um schema antes de gravá-lo."""
    if not isinstance(schema, dict):
        return [_erro("schema_json", "O schema deve ser um objeto JSON.", "schema_invalido")]
    erros: list[dict] = []
    tipo = schema.get("type")
    if tipo is not None and tipo not in _TIPOS and not (
        isinstance(tipo, list) and all(item in _TIPOS for item in tipo)
    ):
        erros.append(
            _erro("schema_json.type", "Tipo JSON Schema não suportado.", "schema_tipo")
        )
    propriedades = schema.get("properties")
    if propriedades is not None and not isinstance(propriedades, dict):
        erros.append(
            _erro(
                "schema_json.properties",
                "properties deve ser um objeto.",
                "schema_propriedades",
            )
        )
    requeridos = schema.get("required")
    if requeridos is not None and (
        not isinstance(requeridos, list)
        or any(not isinstance(item, str) for item in requeridos)
    ):
        erros.append(
            _erro(
                "schema_json.required",
                "required deve ser uma lista de nomes de campos.",
                "schema_required",
            )
        )
    if isinstance(propriedades, dict):
        for nome, definicao in propriedades.items():
            if not isinstance(definicao, dict):
                erros.append(
                    _erro(
                        f"schema_json.properties.{nome}",
                        "A definição do campo deve ser um objeto.",
                        "schema_propriedade",
                    )
                )
                continue
            tipo_campo = definicao.get("type")
            if tipo_campo is not None and tipo_campo not in _TIPOS and not (
                isinstance(tipo_campo, list)
                and all(item in _TIPOS for item in tipo_campo)
            ):
                erros.append(
                    _erro(
                        f"schema_json.properties.{nome}.type",
                        "Tipo JSON Schema não suportado.",
                        "schema_tipo",
                    )
                )
            padrao = definicao.get("pattern")
            if padrao is not None:
                try:
                    re.compile(str(padrao))
                except re.error:
                    erros.append(
                        _erro(
                            f"schema_json.properties.{nome}.pattern",
                            "Expressão regular inválida.",
                            "schema_pattern",
                        )
                    )
    return erros


def _tipo_valor(valor: Any) -> str:
    if valor is None:
        return "null"
    if isinstance(valor, bool):
        return "boolean"
    if isinstance(valor, int) and not isinstance(valor, bool):
        return "integer"
    if isinstance(valor, float):
        return "number"
    if isinstance(valor, str):
        return "string"
    if isinstance(valor, list):
        return "array"
    if isinstance(valor, dict):
        return "object"
    return "desconhecido"


def _tipo_aceito(valor: Any, esperado: Any) -> bool:
    if esperado is None:
        return True
    tipos = esperado if isinstance(esperado, list) else [esperado]
    atual = _tipo_valor(valor)
    for tipo in tipos:
        if tipo == atual:
            return True
        if tipo == "number" and atual == "integer":
            return True
    return False


def _validar_campo(
    campo: str, valor: Any, definicao: dict, erros: list[dict]
) -> None:
    if not _tipo_aceito(valor, definicao.get("type")):
        erros.append(
            _erro(
                campo,
                f"Tipo esperado: {definicao.get('type')} (recebido: {_tipo_valor(valor)}).",
                "tipo_invalido",
            )
        )
        return

    if "const" in definicao and valor != definicao["const"]:
        erros.append(_erro(campo, "Valor diferente do permitido.", "valor_const"))
    if "enum" in definicao and valor not in definicao["enum"]:
        erros.append(
            _erro(
                campo,
                f"Valor deve estar entre: {', '.join(map(str, definicao['enum']))}.",
                "valor_enum",
            )
        )

    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        if "minimum" in definicao and valor < definicao["minimum"]:
            erros.append(
                _erro(campo, f"Valor mínimo: {definicao['minimum']}.", "valor_minimo")
            )
        if "maximum" in definicao and valor > definicao["maximum"]:
            erros.append(
                _erro(campo, f"Valor máximo: {definicao['maximum']}.", "valor_maximo")
            )
    if isinstance(valor, str):
        if "minLength" in definicao and len(valor) < definicao["minLength"]:
            erros.append(
                _erro(
                    campo,
                    f"Tamanho mínimo: {definicao['minLength']} caracteres.",
                    "tamanho_minimo",
                )
            )
        if "maxLength" in definicao and len(valor) > definicao["maxLength"]:
            erros.append(
                _erro(
                    campo,
                    f"Tamanho máximo: {definicao['maxLength']} caracteres.",
                    "tamanho_maximo",
                )
            )
        if "pattern" in definicao and not re.search(str(definicao["pattern"]), valor):
            erros.append(
                _erro(campo, "Valor não corresponde ao formato esperado.", "formato")
            )
        formato = definicao.get("format")
        if formato == "date":
            try:
                date.fromisoformat(valor)
            except ValueError:
                erros.append(_erro(campo, "Data inválida (use AAAA-MM-DD).", "data_invalida"))
        elif formato == "date-time":
            try:
                datetime.fromisoformat(valor.replace("Z", "+00:00"))
            except ValueError:
                erros.append(_erro(campo, "Data/hora inválida (ISO 8601).", "data_hora_invalida"))
    if isinstance(valor, list):
        if "minItems" in definicao and len(valor) < definicao["minItems"]:
            erros.append(
                _erro(
                    campo,
                    f"Mínimo de {definicao['minItems']} itens.",
                    "itens_minimo",
                )
            )
        if "maxItems" in definicao and len(valor) > definicao["maxItems"]:
            erros.append(
                _erro(
                    campo,
                    f"Máximo de {definicao['maxItems']} itens.",
                    "itens_maximo",
                )
            )
        item_schema = definicao.get("items")
        if isinstance(item_schema, dict):
            for indice, item in enumerate(valor):
                _validar_campo(f"{campo}[{indice}]", item, item_schema, erros)
    if isinstance(valor, dict):
        _validar_objeto(campo, valor, definicao, erros)


def _validar_objeto(campo: str, valor: dict, schema: dict, erros: list[dict]) -> None:
    propriedades = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    faltantes = [nome for nome in required if nome not in valor]
    for nome in faltantes:
        erros.append(
            _erro(
                f"{campo}.{nome}" if campo else nome,
                "Campo obrigatório.",
                "campo_obrigatorio",
            )
        )
    adicional = schema.get("additionalProperties", True)
    for nome, item in valor.items():
        caminho = f"{campo}.{nome}" if campo else nome
        if nome in propriedades:
            definicao = propriedades[nome]
            if isinstance(definicao, dict):
                _validar_campo(caminho, item, definicao, erros)
        elif adicional is False:
            erros.append(_erro(caminho, "Campo não previsto no formulário.", "campo_extra"))
        elif isinstance(adicional, dict):
            _validar_campo(caminho, item, adicional, erros)


def validar_resposta(schema: dict, dados: Any) -> list[dict]:
    """Valida a resposta contra o schema. Retorna lista de erros (vazia = válido)."""
    erros: list[dict] = []
    if not isinstance(dados, dict):
        return [_erro("resposta", "A resposta deve ser um objeto JSON.", "tipo_invalido")]
    _validar_objeto("", dados, schema, erros)
    return erros


__all__ = ["validar_resposta", "validar_schema"]
