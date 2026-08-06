"""Serviço de auditoria — toda ação crítica passa por aqui (append-only)."""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import AcaoAuditoria, ResultadoAuditoria
from app.models.governanca import RegistroAuditoria
from app.models.organizacao import User

# Nunca gravar o valor destes campos em `dados_antes`/`dados_depois`.
CAMPOS_SENSIVEIS = {
    "password",
    "senha",
    "password_hash",
    "token",
    "token_hash",
    "token_consulta",
    "secret",
    "authorization",
    "access_token",
    "refresh_token",
    "internal_api_key",
    "s3_secret_key",
    "imagem_base64",  # traço da assinatura: volumoso e desnecessário no log
}

# Documentos que só aparecem mascarados na trilha de auditoria.
CAMPOS_MASCARADOS = {"documento", "cpf", "cnpj", "renavam", "cnh_numero", "documento_recebedor"}


def _mascarar(valor: Any) -> str:
    texto = str(valor or "")
    if len(texto) <= 4:
        return "***"
    return f"***{texto[-4:]}"


def sanitizar(dados: dict | None) -> dict | None:
    """Remove segredos e mascara documentos antes de gravar."""
    if not dados:
        return None
    limpo: dict = {}
    for chave, valor in dados.items():
        nome = str(chave).lower()
        if nome in CAMPOS_SENSIVEIS:
            limpo[chave] = "***"
        elif nome in CAMPOS_MASCARADOS:
            limpo[chave] = _mascarar(valor)
        elif isinstance(valor, uuid.UUID):
            limpo[chave] = str(valor)
        elif isinstance(valor, dict):
            limpo[chave] = sanitizar(valor)
        elif isinstance(valor, (list, tuple)):
            limpo[chave] = [
                sanitizar(item) if isinstance(item, dict) else _serializar(item) for item in valor
            ]
        else:
            limpo[chave] = _serializar(valor)
    return limpo


def _serializar(valor: Any) -> Any:
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, uuid.UUID):
        return str(valor)
    if valor is None or isinstance(valor, (str, int, float, bool)):
        return valor
    return str(valor)


def instantaneo(objeto: Any, campos: list[str] | None = None) -> dict:
    """Fotografia dos campos relevantes de um modelo, pronta para auditoria."""
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
    entidade: str | None = None,
    entidade_id: uuid.UUID | None = None,
    entidade_descricao: str | None = None,
    organizacao_id: uuid.UUID | None = None,
    resultado: ResultadoAuditoria = ResultadoAuditoria.SUCESSO,
    justificativa: str | None = None,
    detalhe: str | None = None,
    dados_antes: dict | None = None,
    dados_depois: dict | None = None,
    cliente: dict | None = None,
) -> RegistroAuditoria:
    """Grava uma entrada de auditoria.

    Não faz commit: a entrada participa da mesma transação da operação
    auditada. Se a operação falhar e for revertida, a auditoria não fica
    registrando algo que não aconteceu — exceto nos registros de acesso negado,
    que o chamador comita explicitamente.
    """
    cliente = cliente or {}
    registro = RegistroAuditoria(
        organizacao_id=organizacao_id or (usuario.organizacao_id if usuario else None),
        user_id=usuario.id if usuario else None,
        user_nome=usuario.nome if usuario else None,
        user_perfil=usuario.perfil if usuario else None,
        acao=acao.value,
        entidade=entidade,
        entidade_id=entidade_id,
        entidade_descricao=(entidade_descricao or "")[:300] or None,
        resultado=resultado.value,
        justificativa=justificativa,
        detalhe=detalhe,
        dados_antes=sanitizar(dados_antes),
        dados_depois=sanitizar(dados_depois),
        ip=cliente.get("ip"),
        dispositivo=cliente.get("dispositivo"),
        origem=cliente.get("origem"),
        correlacao=cliente.get("correlacao"),
    )
    db.add(registro)
    return registro
