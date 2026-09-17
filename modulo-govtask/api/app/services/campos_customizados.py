"""Validação dos campos adicionais por tipo de demanda (§205, §206).

`demandas.campos_extras` é JSON livre no banco — o que seria uma porta aberta
para mass assignment. A validação aqui é a barreira: só aceita chaves que
tenham definição ativa para o tipo, confere o tipo do valor, as opções e as
regras declaradas (`min`, `max`, `max_len`, `regex`) e exige os obrigatórios.
"""

import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campo_customizado import CampoCustomizado
from app.models.enums import TipoCampoCustomizado

# Chaves e limites — o administrador configura dentro destes tetos.
_CHAVE_RE = re.compile(r"^[a-z][a-z0-9_]{0,59}$")
_TIPOS_VALIDOS = {t.value for t in TipoCampoCustomizado}
_REGRAS_VALIDAS = {"min", "max", "max_len", "regex"}
_MAX_TEXTO = 5000


async def definicoes(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tipo_demanda_id: uuid.UUID | None,
    *,
    somente_ativos: bool = True,
) -> list[CampoCustomizado]:
    """Campos do tipo informado mais os globais (tipo nulo) da organização."""
    stmt = select(CampoCustomizado).where(
        CampoCustomizado.organization_id == organization_id,
        CampoCustomizado.deleted_at.is_(None),
        or_(
            CampoCustomizado.tipo_demanda_id.is_(None),
            CampoCustomizado.tipo_demanda_id == tipo_demanda_id,
        ),
    )
    if somente_ativos:
        stmt = stmt.where(CampoCustomizado.ativo.is_(True))
    itens = (await db.execute(stmt.order_by(CampoCustomizado.ordem))).scalars().all()
    return list(itens)


def validar_definicao(
    *,
    chave: str,
    tipo: str,
    opcoes: list | None,
    validacao: dict | None,
) -> None:
    """Confere a definição no momento em que o administrador a cria/edita."""
    if not _CHAVE_RE.match(chave or ""):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A chave deve começar por letra minúscula e conter apenas letras, números e _",
        )
    if tipo not in _TIPOS_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de campo inválido: {tipo}",
        )
    if tipo in (TipoCampoCustomizado.SELECAO.value, TipoCampoCustomizado.MULTIPLA_ESCOLHA.value):
        if not opcoes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Campos de seleção exigem a lista de opções",
            )
    if validacao:
        invalidas = set(validacao) - _REGRAS_VALIDAS
        if invalidas:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Regra de validação não permitida: {', '.join(sorted(invalidas))}",
            )
        if "regex" in validacao:
            try:
                re.compile(validacao["regex"])
            except re.error as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Expressão regular inválida: {exc}",
                ) from exc


def _texto(valor: Any, definicao: CampoCustomizado) -> str:
    texto = str(valor).strip()
    limite = (definicao.validacao or {}).get("max_len", _MAX_TEXTO)
    if len(texto) > limite:
        raise ValueError(f"texto maior que o limite de {limite} caracteres")
    regex = (definicao.validacao or {}).get("regex")
    if regex and not re.match(regex, texto):
        raise ValueError("valor não corresponde ao formato esperado")
    return texto


def _numero(valor: Any, definicao: CampoCustomizado) -> float | int:
    try:
        numero = Decimal(str(valor).replace(",", "."))
    except (InvalidOperation, ValueError):
        raise ValueError("valor numérico inválido") from None
    regras = definicao.validacao or {}
    if "min" in regras and numero < Decimal(str(regras["min"])):
        raise ValueError(f"valor abaixo do mínimo ({regras['min']})")
    if "max" in regras and numero > Decimal(str(regras["max"])):
        raise ValueError(f"valor acima do máximo ({regras['max']})")
    if definicao.tipo == TipoCampoCustomizado.MOEDA.value:
        return float(numero.quantize(Decimal("0.01")))
    return int(numero) if numero == numero.to_integral_value() else float(numero)


def _data(valor: Any) -> str:
    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    try:
        return date.fromisoformat(str(valor)[:10]).isoformat()
    except ValueError:
        raise ValueError("data inválida (use AAAA-MM-DD)") from None


def _uuid(valor: Any) -> str:
    try:
        return str(uuid.UUID(str(valor)))
    except (ValueError, AttributeError, TypeError):
        raise ValueError("identificador inválido") from None


def _validar_valor(definicao: CampoCustomizado, valor: Any) -> Any:
    tipo = definicao.tipo
    if tipo in (TipoCampoCustomizado.TEXTO.value, TipoCampoCustomizado.TEXTO_LONGO.value):
        return _texto(valor, definicao)
    if tipo in (TipoCampoCustomizado.NUMERO.value, TipoCampoCustomizado.MOEDA.value):
        return _numero(valor, definicao)
    if tipo == TipoCampoCustomizado.DATA.value:
        return _data(valor)
    if tipo in (TipoCampoCustomizado.USUARIO.value, TipoCampoCustomizado.DEPARTAMENTO.value):
        return _uuid(valor)
    if tipo == TipoCampoCustomizado.BOOLEANO.value:
        if isinstance(valor, bool):
            return valor
        return str(valor).strip().lower() in {"1", "true", "sim", "yes"}
    if tipo == TipoCampoCustomizado.URL.value:
        texto = _texto(valor, definicao)
        if not texto.startswith(("http://", "https://")):
            raise ValueError("URL deve começar por http:// ou https://")
        return texto
    if tipo == TipoCampoCustomizado.SELECAO.value:
        permitidas = definicao.opcoes or []
        if valor not in permitidas:
            raise ValueError(f"valor deve ser um de: {', '.join(map(str, permitidas))}")
        return valor
    if tipo == TipoCampoCustomizado.MULTIPLA_ESCOLHA.value:
        if not isinstance(valor, list):
            raise ValueError("valor deve ser uma lista de opções")
        permitidas = set(definicao.opcoes or [])
        invalidos = [v for v in valor if v not in permitidas]
        if invalidos:
            raise ValueError(f"opção inválida: {', '.join(map(str, invalidos))}")
        return valor
    raise ValueError("tipo de campo não suportado")


async def validar_e_normalizar(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tipo_demanda_id: uuid.UUID | None,
    valores: dict | None,
) -> dict:
    """Valida e devolve só o que pode ser gravado em `campos_extras`."""
    campos = await definicoes(db, organization_id, tipo_demanda_id)
    por_chave = {c.chave: c for c in campos}
    valores = dict(valores or {})

    desconhecidas = sorted(set(valores) - set(por_chave))
    if desconhecidas:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Campo(s) adicional(is) não configurado(s) para este tipo: "
                + ", ".join(desconhecidas)
            ),
        )

    normalizado: dict[str, Any] = {}
    erros: list[str] = []
    for chave, definicao in por_chave.items():
        presente = chave in valores and valores[chave] not in (None, "")
        if not presente:
            if definicao.obrigatorio:
                erros.append(f"'{definicao.rotulo}' é obrigatório")
            continue
        try:
            normalizado[chave] = _validar_valor(definicao, valores[chave])
        except ValueError as exc:
            erros.append(f"'{definicao.rotulo}': {exc}")

    if erros:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"detail": "Campos adicionais inválidos", "erros": erros},
        )
    return normalizado


async def validar_para_demanda(
    db: AsyncSession,
    organization_id: uuid.UUID,
    tipo_demanda_id: uuid.UUID | None,
    valores: dict | None,
) -> dict:
    """Validação usada pelo núcleo da demanda.

    Quando a organização ainda não configurou nenhum campo para o tipo, os
    valores passam como estão — a validação é uma barreira nova e não pode
    invalidar demandas antigas que já traziam `campos_extras`.
    """
    if not await definicoes(db, organization_id, tipo_demanda_id):
        return dict(valores or {})
    return await validar_e_normalizar(db, organization_id, tipo_demanda_id, valores)
