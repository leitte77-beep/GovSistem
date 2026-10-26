"""Consulta CADSUS via porta oficial + compatibilização com o cadastro local."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import somente_digitos, validar_cns, validar_cpf
from app.core.errors import Unprocessable
from app.core.security import hmac_hex
from app.integracoes.cadsus import obter_adaptador_cadsus
from app.models.cidadao import Cidadao
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.services.auditoria import registrar
from app.services.cidadao_comum import serializar_cidadao


async def consultar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cpf: str | None,
    cns: str | None,
    ator: Usuario,
    cliente: dict,
) -> dict:
    if not cpf and not cns:
        raise Unprocessable(
            "Informe CPF ou CNS para consultar o CADSUS.",
            errors=[
                {
                    "campo": "cpf",
                    "mensagem": "Informe CPF ou CNS.",
                    "codigo_regra": "identificador",
                }
            ],
        )
    local_cpf = None
    local_cns = None
    if cpf:
        if not validar_cpf(cpf):
            raise Unprocessable("CPF inválido.", code="cpf")
        local_cpf = await db.scalar(
            select(Cidadao).where(
                Cidadao.tenant_id == tenant_id,
                Cidadao.baixa_em.is_(None),
                Cidadao.cpf_hash == hmac_hex(somente_digitos(cpf)),
            )
        )
    if cns:
        if not validar_cns(cns):
            raise Unprocessable("CNS inválido.", code="cns")
        local_cns = await db.scalar(
            select(Cidadao).where(
                Cidadao.tenant_id == tenant_id,
                Cidadao.baixa_em.is_(None),
                Cidadao.cns_hash == hmac_hex(somente_digitos(cns)),
            )
        )
    conflito = bool(local_cpf and local_cns and local_cpf.id != local_cns.id)
    local = local_cpf or local_cns
    resultado = await obter_adaptador_cadsus().consultar(cpf=cpf, cns=cns)
    if conflito:
        resultado = {
            "status": "CONFLITO_CPF_CNS",
            "mensagem": (
                "CPF e CNS estão vinculados a cidadãos diferentes no cadastro "
                "local. Avalie a unificação antes de prosseguir."
            ),
        }
        local = None
    saida = {
        "status": resultado.get("status", "PENDENTE_ESPECIFICACAO_OFICIAL"),
        "mensagem": resultado.get("mensagem"),
        "encontrado_local": local is not None,
        "cidadao_id": local.id if local else None,
        "nome_exibicao": None,
        "cpf_mascarado": None,
        "cns_mascarado": None,
    }
    if local:
        dados = serializar_cidadao(local)
        saida.update(
            {
                "nome_exibicao": dados["nome_exibicao"],
                "cpf_mascarado": dados["cpf_mascarado"],
                "cns_mascarado": dados["cns_mascarado"],
            }
        )
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_cadsus",
        recurso_id=local.id if local else None,
        finalidade="compatibilização CPF/CNS com o CADSUS",
        cliente=cliente,
    )
    await db.commit()
    return saida
