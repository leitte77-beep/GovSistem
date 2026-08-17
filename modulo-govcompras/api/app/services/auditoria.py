"""Serviço de auditoria — toda ação crítica passa por aqui (append-only,
seção 67: "não permitir exclusão física de registros administrativos")."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AcaoAuditoria, ResultadoAuditoria
from app.models.governanca import AuditoriaLog
from app.models.organizacao import User

CAMPOS_SENSIVEIS = {
    "senha", "password", "password_hash", "senha_demo_hash", "token",
    "secret", "authorization", "access_token", "internal_api_key",
}


def _serializar(valor: Any) -> Any:
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, uuid.UUID):
        return str(valor)
    if valor is None or isinstance(valor, (str, int, float, bool)):
        return valor
    return str(valor)


def sanitizar(dados: dict | None) -> dict | None:
    if not dados:
        return None
    limpo: dict = {}
    for chave, valor in dados.items():
        if str(chave).lower() in CAMPOS_SENSIVEIS:
            limpo[chave] = "***"
        elif isinstance(valor, dict):
            limpo[chave] = sanitizar(valor)
        else:
            limpo[chave] = _serializar(valor)
    return limpo


def instantaneo(objeto: Any, campos: list[str] | None = None) -> dict:
    if objeto is None:
        return {}
    if campos is None:
        campos = [
            coluna.name
            for coluna in objeto.__table__.columns
            if coluna.name not in {"created_at", "updated_at", "row_version"}
        ]
    return {campo: _serializar(getattr(objeto, campo, None)) for campo in campos}


async def registrar(
    db: AsyncSession,
    *,
    acao: AcaoAuditoria,
    usuario: User | None = None,
    entidade_tipo: str | None = None,
    entidade_id: uuid.UUID | None = None,
    entidade_descricao: str | None = None,
    organizacao_id: uuid.UUID | None = None,
    resultado: ResultadoAuditoria = ResultadoAuditoria.SUCESSO,
    justificativa: str | None = None,
    dados_antes: dict | None = None,
    dados_depois: dict | None = None,
    cliente: dict | None = None,
) -> AuditoriaLog:
    """Grava uma entrada de auditoria dentro da mesma transação da operação."""
    cliente = cliente or {}
    registro = AuditoriaLog(
        organizacao_id=organizacao_id or (usuario.organizacao_id if usuario else None),
        usuario_id=usuario.id if usuario else None,
        usuario_nome=usuario.nome if usuario else None,
        usuario_perfil=usuario.perfil if usuario else None,
        acao=acao.value,
        entidade_tipo=entidade_tipo,
        entidade_id=entidade_id,
        entidade_descricao=(entidade_descricao or "")[:300] or None,
        resultado=resultado.value,
        justificativa=justificativa,
        dados_antes=sanitizar(dados_antes),
        dados_depois=sanitizar(dados_depois),
        ip=cliente.get("ip"),
        correlacao=cliente.get("correlacao"),
    )
    db.add(registro)
    return registro
