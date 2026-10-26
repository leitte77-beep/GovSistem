"""Configurações versionadas por tenant (vigência + concorrência otimista)."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.models.enums import AcaoAuditoria
from app.models.nucleo import ConfiguracaoTenant, Usuario
from app.services.auditoria import instantaneo, registrar


def parse_if_match(valor: str | None) -> int | None:
    if valor is None:
        return None
    texto = valor.strip().strip('"')
    if not texto:
        return None
    try:
        return int(texto)
    except ValueError as exc:
        raise Unprocessable(
            "O cabeçalho If-Match deve conter a versão numérica do recurso.",
            code="if_match_invalido",
        ) from exc


async def configuracao_vigente(
    db: AsyncSession, tenant_id: uuid.UUID, chave: str
) -> ConfiguracaoTenant | None:
    hoje = date.today()
    return await db.scalar(
        select(ConfiguracaoTenant)
        .where(
            ConfiguracaoTenant.tenant_id == tenant_id,
            ConfiguracaoTenant.chave == chave,
            ConfiguracaoTenant.vigencia_inicio <= hoje,
            (ConfiguracaoTenant.vigencia_fim.is_(None))
            | (ConfiguracaoTenant.vigencia_fim >= hoje),
        )
        .order_by(ConfiguracaoTenant.versao.desc())
        .limit(1)
    )


async def valor(db: AsyncSession, tenant_id: uuid.UUID, chave: str, padrao: Any = None) -> Any:
    registro = await configuracao_vigente(db, tenant_id, chave)
    if registro is None:
        return padrao
    return (registro.valor or {}).get("valor", padrao)


async def listar(db: AsyncSession, tenant_id: uuid.UUID) -> list[ConfiguracaoTenant]:
    hoje = date.today()
    registros = (
        await db.execute(
            select(ConfiguracaoTenant)
            .where(
                ConfiguracaoTenant.tenant_id == tenant_id,
                ConfiguracaoTenant.vigencia_inicio <= hoje,
                (ConfiguracaoTenant.vigencia_fim.is_(None))
                | (ConfiguracaoTenant.vigencia_fim >= hoje),
            )
            .order_by(ConfiguracaoTenant.chave, ConfiguracaoTenant.versao.desc())
        )
    ).scalars().all()
    vistos: set[str] = set()
    saida: list[ConfiguracaoTenant] = []
    for registro in registros:
        if registro.chave in vistos:
            continue
        vistos.add(registro.chave)
        saida.append(registro)
    return saida


def validar_valor(chave: str, valor: dict) -> None:
    if not isinstance(valor, dict) or "valor" not in valor:
        raise Unprocessable(
            "O valor da configuração deve ser um objeto com a chave 'valor'.",
            errors=[
                {
                    "campo": "valor",
                    "mensagem": "Informe {'valor': ...}.",
                    "codigo_regra": "configuracao_formato",
                }
            ],
        )
    if chave == "geral.fuso_horario":
        try:
            from zoneinfo import ZoneInfo

            ZoneInfo(str(valor["valor"]))
        except Exception as exc:  # noqa: BLE001
            raise Unprocessable(
                "Fuso horário IANA inválido.",
                errors=[
                    {
                        "campo": "valor.valor",
                        "mensagem": "Exemplo válido: America/Sao_Paulo.",
                        "codigo_regra": "fuso_invalido",
                    }
                ],
            ) from exc
    if chave == "lgpd.retencao_clinica_anos":
        try:
            anos = int(valor["valor"])
        except (TypeError, ValueError) as exc:
            raise Unprocessable("A retenção deve ser um número inteiro de anos.") from exc
        if anos < 20:
            raise Unprocessable(
                "A guarda do prontuário não pode ser inferior a 20 anos.",
                errors=[
                    {
                        "campo": "valor.valor",
                        "mensagem": "Mínimo legal: 20 anos.",
                        "codigo_regra": "retencao_minima",
                    }
                ],
            )


async def definir(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    chave: str,
    valor: dict,
    usuario: Usuario,
    if_match: int | None,
    cliente: dict,
) -> ConfiguracaoTenant:
    validar_valor(chave, valor)
    atual = await configuracao_vigente(db, tenant_id, chave)
    if atual is None:
        if if_match not in (None, 0):
            raise Conflict(
                "Configuração inexistente para a versão informada.",
                code="conflito_versao",
            )
        registro = ConfiguracaoTenant(
            tenant_id=tenant_id,
            chave=chave,
            valor=valor,
            tipo="json",
            descricao=None,
            editavel=True,
            versao=1,
            vigencia_inicio=date.today(),
        )
        db.add(registro)
        await db.flush()
        await registrar(
            db,
            acao=AcaoAuditoria.CRIAR,
            usuario=usuario,
            tenant_id=tenant_id,
            recurso="configuracao_tenant",
            recurso_id=registro.id,
            recurso_descricao=chave,
            dados_depois=instantaneo(registro),
            cliente=cliente,
        )
        await db.commit()
        return registro
    if if_match is not None and if_match != atual.versao:
        raise Conflict(
            "A configuração foi alterada por outro usuário. Recarregue e tente novamente.",
            code="conflito_versao",
            extra={"versao_atual": atual.versao},
        )
    antes = instantaneo(atual)
    atual.vigencia_fim = date.today()
    atual.atualizado_por_id = usuario.id
    registro = ConfiguracaoTenant(
        tenant_id=tenant_id,
        chave=chave,
        valor=valor,
        tipo=atual.tipo,
        descricao=atual.descricao,
        editavel=atual.editavel,
        versao=atual.versao + 1,
        vigencia_inicio=date.today(),
        criado_por_id=usuario.id,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        tenant_id=tenant_id,
        recurso="configuracao_tenant",
        recurso_id=registro.id,
        recurso_descricao=chave,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def obter(db: AsyncSession, tenant_id: uuid.UUID, chave: str) -> ConfiguracaoTenant:
    registro = await configuracao_vigente(db, tenant_id, chave)
    if registro is None:
        raise NotFound("Configuração não encontrada.")
    return registro
