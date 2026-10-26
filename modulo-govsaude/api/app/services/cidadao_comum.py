"""Utilidades comuns do cadastro único do cidadão."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import (
    mascarar_cns,
    mascarar_cpf,
    somente_digitos,
    validar_cns,
    validar_cpf,
)
from app.core.encryption import descriptografar, proteger_documento
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.fonetica import nome_fonetico, normalizar_busca
from app.models.cidadao import Cidadao, CidadaoEndereco
from app.models.referencia import Cep, MunicipioIBGE
from app.services.rede_comum import validar_cbo_contra_referencia, validar_ibge_opcional


def _decrypt(valor: str | None) -> str | None:
    if not valor:
        return None
    try:
        return descriptografar(valor)
    except ValueError:
        return None


def serializar_cidadao(registro: Cidadao) -> dict:
    cpf = _decrypt(registro.cpf_cifrado)
    cns = _decrypt(registro.cns_cifrado)
    return {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "nome": registro.nome,
        "nome_social": registro.nome_social,
        "nome_exibicao": registro.nome_social or registro.nome,
        "cpf_mascarado": mascarar_cpf(cpf),
        "cns_mascarado": mascarar_cns(cns),
        "data_nascimento": registro.data_nascimento,
        "sexo": registro.sexo,
        "identidade_genero": registro.identidade_genero,
        "orientacao_sexual": registro.orientacao_sexual,
        "raca_cor": registro.raca_cor,
        "etnia": registro.etnia,
        "nacionalidade": registro.nacionalidade,
        "municipio_nascimento_ibge": registro.municipio_nascimento_ibge,
        "ocupacao_cbo": registro.ocupacao_cbo,
        "escolaridade": registro.escolaridade,
        "situacao_rua": registro.situacao_rua,
        "mae_id": registro.mae_id,
        "nome_mae": registro.nome_mae,
        "unificado_para_id": registro.unificado_para_id,
        "unificado_em": registro.unificado_em,
        "observacoes": registro.observacoes,
        "ativo": registro.baixa_em is None,
        "versao": registro.versao,
        "created_at": registro.created_at,
        "baixa_em": registro.baixa_em,
        "baixa_motivo": registro.baixa_motivo,
    }


def serializar_resumo(registro: Cidadao) -> dict:
    dados = serializar_cidadao(registro)
    return {
        "id": dados["id"],
        "tenant_id": dados["tenant_id"],
        "nome": dados["nome"],
        "nome_social": dados["nome_social"],
        "nome_exibicao": dados["nome_exibicao"],
        "cpf_mascarado": dados["cpf_mascarado"],
        "cns_mascarado": dados["cns_mascarado"],
        "data_nascimento": dados["data_nascimento"],
        "nome_mae": dados["nome_mae"],
        "ativo": dados["ativo"],
        "versao": dados["versao"],
        "unificado_para_id": dados["unificado_para_id"],
    }


def mascarar_contato(tipo: str, valor: str | None) -> str | None:
    if not valor:
        return None
    if tipo == "EMAIL" and "@" in valor:
        local, dominio = valor.split("@", 1)
        return f"{local[:1]}***@{dominio}"
    return f"***{valor[-4:]}" if len(valor) > 4 else "***"


def serializar_documento(registro) -> dict:
    numero = _decrypt(registro.numero_cifrado)
    return {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "cidadao_id": registro.cidadao_id,
        "tipo": registro.tipo,
        "numero_mascarado": (
            mascarar_cpf(numero)
            if registro.tipo == "CPF"
            else mascarar_cns(numero)
            if registro.tipo == "CNS"
            else mascarar_contato(registro.tipo, numero)
        ),
        "orgao_emissor": registro.orgao_emissor,
        "uf_emissor": registro.uf_emissor,
        "data_emissao": registro.data_emissao,
        "validade": registro.validade,
        "principal": registro.principal,
        "observacoes": registro.observacoes,
        "ativo": registro.baixa_em is None,
        "versao": registro.versao,
        "baixa_em": registro.baixa_em,
    }


def serializar_contato(registro) -> dict:
    valor = _decrypt(registro.valor_cifrado)
    return {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "cidadao_id": registro.cidadao_id,
        "tipo": registro.tipo,
        "valor_mascarado": mascarar_contato(registro.tipo, valor),
        "principal": registro.principal,
        "observacoes": registro.observacoes,
        "ativo": registro.baixa_em is None,
        "versao": registro.versao,
        "baixa_em": registro.baixa_em,
    }


def serializar_plano(registro) -> dict:
    numero = _decrypt(registro.numero_carteira_cifrado)
    return {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "cidadao_id": registro.cidadao_id,
        "operadora": registro.operadora,
        "plano": registro.plano,
        "tipo": registro.tipo,
        "numero_carteira_mascarado": f"***{numero[-4:]}" if numero and len(numero) > 4 else None,
        "principal": registro.principal,
        "vigencia_inicio": registro.vigencia_inicio,
        "vigencia_fim": registro.vigencia_fim,
        "observacoes": registro.observacoes,
        "ativo": registro.baixa_em is None,
        "versao": registro.versao,
        "baixa_em": registro.baixa_em,
    }


async def obter_cidadao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    *,
    incluir_baixado: bool = False,
) -> Cidadao:
    registro = await db.scalar(
        select(Cidadao).where(
            Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Cidadão não encontrado.")
    if not incluir_baixado and registro.baixa_em is not None:
        raise NotFound("Cidadão não encontrado.")
    return registro


def aplicar_documentos(registro: Cidadao, cpf: str | None, cns: str | None) -> None:
    if cpf is not None:
        if not validar_cpf(cpf):
            raise Unprocessable(
                "CPF inválido.",
                errors=[
                    {
                        "campo": "cpf",
                        "mensagem": "Dígito verificador inválido.",
                        "codigo_regra": "cpf",
                    }
                ],
            )
        protegido = proteger_documento(somente_digitos(cpf))
        registro.cpf_hash = protegido.hash_busca
        registro.cpf_cifrado = protegido.cifrado
        registro.cpf_final = protegido.final
    if cns is not None:
        if not validar_cns(cns):
            raise Unprocessable(
                "CNS inválido.",
                errors=[
                    {
                        "campo": "cns",
                        "mensagem": "Dígito verificador inválido.",
                        "codigo_regra": "cns",
                    }
                ],
            )
        protegido = proteger_documento(somente_digitos(cns))
        registro.cns_hash = protegido.hash_busca
        registro.cns_cifrado = protegido.cifrado
        registro.cns_final = protegido.final


def atualizar_busca(registro: Cidadao) -> None:
    base = f"{registro.nome} {registro.nome_social or ''}".strip()
    registro.nome_busca = normalizar_busca(base)[:200]
    registro.nome_fonetico = nome_fonetico(base)[:200]
    if registro.nome_mae:
        registro.mae_nome_busca = normalizar_busca(registro.nome_mae)[:200]
        registro.mae_nome_fonetico = nome_fonetico(registro.nome_mae)[:200]


async def validar_documentos_unicos(
    db: AsyncSession, tenant_id: uuid.UUID, registro: Cidadao
) -> None:
    for campo, hash_, codigo in (
        ("CPF", registro.cpf_hash, "cpf_duplicado"),
        ("CNS", registro.cns_hash, "cns_duplicado"),
    ):
        if not hash_:
            continue
        outro = await db.scalar(
            select(Cidadao.id).where(
                Cidadao.tenant_id == tenant_id,
                getattr(Cidadao, f"{campo.lower()}_hash") == hash_,
                Cidadao.baixa_em.is_(None),
                Cidadao.id != registro.id,
            )
        )
        if outro:
            raise Conflict(
                f"{campo} já vinculado a outro cidadão. Avalie a unificação.",
                code=codigo,
                extra={"cidadao_existente_id": str(outro)},
            )


async def validar_mae(
    db: AsyncSession, tenant_id: uuid.UUID, mae_id: uuid.UUID | None
) -> Cidadao | None:
    if not mae_id:
        return None
    return await obter_cidadao(db, tenant_id, mae_id)


async def validar_ibge_referencia(
    db: AsyncSession, codigo: str | None
) -> str | None:
    numero = validar_ibge_opcional(codigo)
    if not numero:
        return None
    total = await db.scalar(select(func.count()).select_from(MunicipioIBGE)) or 0
    if total:
        existe = await db.scalar(
            select(func.count())
            .select_from(MunicipioIBGE)
            .where(MunicipioIBGE.codigo_ibge == numero)
        )
        if not existe:
            raise Unprocessable(
                "Município IBGE não encontrado na base oficial importada.",
                errors=[
                    {
                        "campo": "municipio_ibge",
                        "mensagem": "Importe a tabela do IBGE ou corrija o código.",
                        "codigo_regra": "ibge_referencia",
                    }
                ],
            )
    return numero


async def validar_cbo_cidadao(db: AsyncSession, codigo: str | None) -> str | None:
    if not codigo:
        return None
    await validar_cbo_contra_referencia(db, codigo)
    return somente_digitos(codigo)


async def consultar_cep_referencia(
    db: AsyncSession, cep: str
) -> Cep | None:
    from app.core.br_validators import somente_digitos

    numero = somente_digitos(cep)
    return await db.scalar(select(Cep).where(Cep.cep == numero, Cep.ativo.is_(True)))


async def endereco_principal(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> CidadaoEndereco | None:
    return await db.scalar(
        select(CidadaoEndereco)
        .where(
            CidadaoEndereco.tenant_id == tenant_id,
            CidadaoEndereco.cidadao_id == cidadao_id,
            CidadaoEndereco.baixa_em.is_(None),
            CidadaoEndereco.principal.is_(True),
        )
        .order_by(CidadaoEndereco.created_at.desc())
        .limit(1)
    )


def nome_ou_social(registro: Cidadao) -> str:
    return registro.nome_social or registro.nome


def hoje() -> date:
    return date.today()


__all__ = [
    "aplicar_documentos",
    "atualizar_busca",
    "consultar_cep_referencia",
    "endereco_principal",
    "mascarar_contato",
    "obter_cidadao",
    "serializar_cidadao",
    "serializar_contato",
    "serializar_documento",
    "serializar_plano",
    "serializar_resumo",
    "validar_cbo_cidadao",
    "validar_documentos_unicos",
    "validar_ibge_referencia",
    "validar_mae",
]
