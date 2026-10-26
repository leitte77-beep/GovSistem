"""Documentos, contatos, endereços, planos, alergias e condições do cidadão."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import (
    somente_digitos,
    validar_cep,
    validar_ciap2,
    validar_cid10,
    validar_cns,
    validar_cpf,
)
from app.core.encryption import criptografar
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.fonetica import normalizar_busca
from app.core.security import agora, hmac_hex
from app.models.cidadao import (
    CidadaoAlergia,
    CidadaoCondicao,
    CidadaoContato,
    CidadaoDocumento,
    CidadaoEndereco,
    PlanoSaudeVinculo,
)
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.schemas.cidadao import (
    AlergiaCreate,
    BaixaCidadaoRequest,
    CondicaoCreate,
    ContatoCreate,
    DocumentoCreate,
    EnderecoCreate,
    PlanoSaudeCreate,
)
from app.services.auditoria import instantaneo, registrar
from app.services.cidadao_comum import (
    obter_cidadao,
    serializar_contato,
    serializar_documento,
    serializar_plano,
    validar_ibge_referencia,
)
from app.services.rede_comum import validar_vigencia


def _normalizar_doc(numero: str) -> str:
    return "".join(ch for ch in numero.upper() if ch.isalnum())


async def listar_documentos(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoDocumento]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(CidadaoDocumento)
                .where(
                    CidadaoDocumento.tenant_id == tenant_id,
                    CidadaoDocumento.cidadao_id == cidadao_id,
                    CidadaoDocumento.baixa_em.is_(None),
                )
                .order_by(CidadaoDocumento.created_at)
            )
        )
        .scalars()
        .all()
    )


async def criar_documento(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: DocumentoCreate,
    ator: Usuario,
    cliente: dict,
) -> CidadaoDocumento:
    cidadao = await obter_cidadao(db, tenant_id, cidadao_id)
    if dados.tipo == "CPF" and not validar_cpf(dados.numero):
        raise Unprocessable("CPF inválido.", code="cpf")
    if dados.tipo == "CNS" and not validar_cns(dados.numero):
        raise Unprocessable("CNS inválido.", code="cns")
    numero = _normalizar_doc(dados.numero)
    if not numero:
        raise Unprocessable("Número do documento obrigatório.", code="documento")
    hash_ = hmac_hex(numero)
    existente = await db.scalar(
        select(CidadaoDocumento.id).where(
            CidadaoDocumento.tenant_id == tenant_id,
            CidadaoDocumento.cidadao_id == cidadao.id,
            CidadaoDocumento.tipo == dados.tipo,
            CidadaoDocumento.numero_hash == hash_,
            CidadaoDocumento.baixa_em.is_(None),
        )
    )
    if existente:
        raise Conflict("Documento já cadastrado para este cidadão.", code="documento_duplicado")
    if dados.principal:
        await _desmarcar_principal(db, CidadaoDocumento, tenant_id, cidadao.id)
    registro = CidadaoDocumento(
        tenant_id=tenant_id,
        cidadao_id=cidadao.id,
        tipo=dados.tipo,
        numero_hash=hash_,
        numero_cifrado=criptografar(numero) or "",
        numero_final=numero[-4:] if len(numero) > 4 else numero,
        orgao_emissor=dados.orgao_emissor,
        uf_emissor=(dados.uf_emissor or "").upper() or None,
        data_emissao=dados.data_emissao,
        validade=dados.validade,
        principal=dados.principal,
        observacoes=dados.observacoes,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_documento",
        recurso_id=registro.id,
        dados_depois=serializar_documento(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_contatos(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoContato]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(CidadaoContato)
                .where(
                    CidadaoContato.tenant_id == tenant_id,
                    CidadaoContato.cidadao_id == cidadao_id,
                    CidadaoContato.baixa_em.is_(None),
                )
                .order_by(CidadaoContato.created_at)
            )
        )
        .scalars()
        .all()
    )


def _normalizar_contato(tipo: str, valor: str) -> str:
    if tipo == "EMAIL":
        valor = valor.strip().lower()
        if "@" not in valor or len(valor) > 200:
            raise Unprocessable("E-mail inválido.", code="email")
        return valor
    digitos = somente_digitos(valor)
    if len(digitos) < 8 or len(digitos) > 15:
        raise Unprocessable("Telefone inválido.", code="telefone")
    return digitos


async def criar_contato(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: ContatoCreate,
    ator: Usuario,
    cliente: dict,
) -> CidadaoContato:
    cidadao = await obter_cidadao(db, tenant_id, cidadao_id)
    valor = _normalizar_contato(dados.tipo, dados.valor)
    hash_ = hmac_hex(valor)
    existente = await db.scalar(
        select(CidadaoContato.id).where(
            CidadaoContato.tenant_id == tenant_id,
            CidadaoContato.cidadao_id == cidadao.id,
            CidadaoContato.tipo == dados.tipo,
            CidadaoContato.valor_hash == hash_,
            CidadaoContato.baixa_em.is_(None),
        )
    )
    if existente:
        raise Conflict("Contato já cadastrado para este cidadão.", code="contato_duplicado")
    if dados.principal:
        await _desmarcar_principal(db, CidadaoContato, tenant_id, cidadao.id)
    registro = CidadaoContato(
        tenant_id=tenant_id,
        cidadao_id=cidadao.id,
        tipo=dados.tipo,
        valor_hash=hash_,
        valor_cifrado=criptografar(valor) or "",
        valor_final=valor[-4:],
        principal=dados.principal,
        observacoes=dados.observacoes,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_contato",
        recurso_id=registro.id,
        dados_depois=serializar_contato(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_enderecos(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoEndereco]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(CidadaoEndereco)
                .where(
                    CidadaoEndereco.tenant_id == tenant_id,
                    CidadaoEndereco.cidadao_id == cidadao_id,
                    CidadaoEndereco.baixa_em.is_(None),
                )
                .order_by(CidadaoEndereco.created_at)
            )
        )
        .scalars()
        .all()
    )


async def criar_endereco(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: EnderecoCreate,
    ator: Usuario,
    cliente: dict,
) -> CidadaoEndereco:
    cidadao = await obter_cidadao(db, tenant_id, cidadao_id)
    if dados.cep and not validar_cep(dados.cep):
        raise Unprocessable("CEP inválido.", code="cep")
    if dados.principal:
        await _desmarcar_principal(db, CidadaoEndereco, tenant_id, cidadao.id)
    registro = CidadaoEndereco(
        tenant_id=tenant_id,
        cidadao_id=cidadao.id,
        tipo=dados.tipo,
        cep=somente_digitos(dados.cep) or None,
        logradouro=dados.logradouro,
        numero=dados.numero,
        complemento=dados.complemento,
        bairro=dados.bairro,
        municipio_ibge=await validar_ibge_referencia(db, dados.municipio_ibge),
        uf=(dados.uf or "").upper() or None,
        pais=dados.pais,
        referencia=dados.referencia,
        principal=dados.principal,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_endereco",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_planos(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[PlanoSaudeVinculo]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(PlanoSaudeVinculo)
                .where(
                    PlanoSaudeVinculo.tenant_id == tenant_id,
                    PlanoSaudeVinculo.cidadao_id == cidadao_id,
                    PlanoSaudeVinculo.baixa_em.is_(None),
                )
                .order_by(PlanoSaudeVinculo.created_at)
            )
        )
        .scalars()
        .all()
    )


async def criar_plano(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: PlanoSaudeCreate,
    ator: Usuario,
    cliente: dict,
) -> PlanoSaudeVinculo:
    cidadao = await obter_cidadao(db, tenant_id, cidadao_id)
    inicio = dados.vigencia_inicio or date.today()
    validar_vigencia(inicio, dados.vigencia_fim)
    hash_ = hmac_hex(_normalizar_doc(dados.numero_carteira)) if dados.numero_carteira else None
    if dados.principal:
        await _desmarcar_principal(db, PlanoSaudeVinculo, tenant_id, cidadao.id)
    registro = PlanoSaudeVinculo(
        tenant_id=tenant_id,
        cidadao_id=cidadao.id,
        operadora=dados.operadora.strip(),
        plano=dados.plano,
        tipo=dados.tipo,
        numero_carteira_hash=hash_,
        numero_carteira_cifrado=(
            criptografar(_normalizar_doc(dados.numero_carteira))
            if dados.numero_carteira
            else None
        ),
        numero_carteira_final=(
            _normalizar_doc(dados.numero_carteira)[-4:] if dados.numero_carteira else None
        ),
        principal=dados.principal,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        observacoes=dados.observacoes,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="plano_saude_vinculo",
        recurso_id=registro.id,
        dados_depois=serializar_plano(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_alergias(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoAlergia]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(CidadaoAlergia)
                .where(
                    CidadaoAlergia.tenant_id == tenant_id,
                    CidadaoAlergia.cidadao_id == cidadao_id,
                    CidadaoAlergia.baixa_em.is_(None),
                )
                .order_by(CidadaoAlergia.created_at)
            )
        )
        .scalars()
        .all()
    )


async def criar_alergia(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: AlergiaCreate,
    ator: Usuario,
    cliente: dict,
) -> CidadaoAlergia:
    cidadao = await obter_cidadao(db, tenant_id, cidadao_id)
    busca = normalizar_busca(dados.substancia)
    existente = await db.scalar(
        select(CidadaoAlergia.id).where(
            CidadaoAlergia.tenant_id == tenant_id,
            CidadaoAlergia.cidadao_id == cidadao.id,
            CidadaoAlergia.substancia_busca == busca,
            CidadaoAlergia.baixa_em.is_(None),
        )
    )
    if existente:
        raise Conflict("Alergia já registrada para este cidadão.", code="alergia_duplicada")
    registro = CidadaoAlergia(
        tenant_id=tenant_id,
        cidadao_id=cidadao.id,
        substancia=dados.substancia.strip(),
        substancia_busca=busca,
        tipo=dados.tipo,
        gravidade=dados.gravidade,
        reacao=dados.reacao,
        data_inicio=dados.data_inicio,
        observacoes=dados.observacoes,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_alergia",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_condicoes(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoCondicao]:
    await obter_cidadao(db, tenant_id, cidadao_id)
    return list(
        (
            await db.execute(
                select(CidadaoCondicao)
                .where(
                    CidadaoCondicao.tenant_id == tenant_id,
                    CidadaoCondicao.cidadao_id == cidadao_id,
                    CidadaoCondicao.baixa_em.is_(None),
                )
                .order_by(CidadaoCondicao.created_at)
            )
        )
        .scalars()
        .all()
    )


async def criar_condicao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: CondicaoCreate,
    ator: Usuario,
    cliente: dict,
) -> CidadaoCondicao:
    cidadao = await obter_cidadao(db, tenant_id, cidadao_id)
    codigo = dados.codigo.strip().upper()
    if dados.tipo_codigo == "CID10" and not validar_cid10(codigo):
        raise Unprocessable("CID-10 inválido.", code="cid10")
    if dados.tipo_codigo == "CIAP2" and not validar_ciap2(codigo):
        raise Unprocessable("CIAP-2 inválido.", code="ciap2")
    registro = CidadaoCondicao(
        tenant_id=tenant_id,
        cidadao_id=cidadao.id,
        tipo_codigo=dados.tipo_codigo,
        codigo=codigo,
        descricao=dados.descricao,
        data_inicio=dados.data_inicio,
        data_fim=dados.data_fim,
        situacao=dados.situacao,
        observacoes=dados.observacoes,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_condicao",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def _desmarcar_principal(db: AsyncSession, modelo, tenant_id, cidadao_id):
    registros = (
        await db.execute(
            select(modelo).where(
                modelo.tenant_id == tenant_id,
                modelo.cidadao_id == cidadao_id,
                modelo.principal.is_(True),
                modelo.baixa_em.is_(None),
            )
        )
    ).scalars().all()
    for registro in registros:
        registro.principal = False


async def _baixar_filho(
    db: AsyncSession,
    *,
    modelo,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    filho_id: uuid.UUID,
    dados: BaixaCidadaoRequest,
    ator: Usuario,
    cliente: dict,
    recurso: str,
):
    await obter_cidadao(db, tenant_id, cidadao_id)
    registro = await db.scalar(
        select(modelo).where(
            modelo.id == filho_id,
            modelo.tenant_id == tenant_id,
            modelo.cidadao_id == cidadao_id,
        )
    )
    if registro is None:
        raise NotFound("Registro não encontrado.")
    if registro.baixa_em is not None:
        return registro
    antes = instantaneo(registro)
    registro.baixa_em = dados.data or agora()
    registro.baixa_motivo = dados.motivo
    registro.baixa_por_id = ator.id
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso=recurso,
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar_documento(db, *, tenant_id, cidadao_id, documento_id, dados, ator, cliente):
    return await _baixar_filho(
        db,
        modelo=CidadaoDocumento,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        filho_id=documento_id,
        dados=dados,
        ator=ator,
        cliente=cliente,
        recurso="cidadao_documento",
    )


async def baixar_contato(db, *, tenant_id, cidadao_id, contato_id, dados, ator, cliente):
    return await _baixar_filho(
        db,
        modelo=CidadaoContato,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        filho_id=contato_id,
        dados=dados,
        ator=ator,
        cliente=cliente,
        recurso="cidadao_contato",
    )


async def baixar_endereco(db, *, tenant_id, cidadao_id, endereco_id, dados, ator, cliente):
    return await _baixar_filho(
        db,
        modelo=CidadaoEndereco,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        filho_id=endereco_id,
        dados=dados,
        ator=ator,
        cliente=cliente,
        recurso="cidadao_endereco",
    )


async def baixar_plano(db, *, tenant_id, cidadao_id, plano_id, dados, ator, cliente):
    return await _baixar_filho(
        db,
        modelo=PlanoSaudeVinculo,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        filho_id=plano_id,
        dados=dados,
        ator=ator,
        cliente=cliente,
        recurso="plano_saude_vinculo",
    )


async def baixar_alergia(db, *, tenant_id, cidadao_id, alergia_id, dados, ator, cliente):
    return await _baixar_filho(
        db,
        modelo=CidadaoAlergia,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        filho_id=alergia_id,
        dados=dados,
        ator=ator,
        cliente=cliente,
        recurso="cidadao_alergia",
    )


async def baixar_condicao(db, *, tenant_id, cidadao_id, condicao_id, dados, ator, cliente):
    return await _baixar_filho(
        db,
        modelo=CidadaoCondicao,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        filho_id=condicao_id,
        dados=dados,
        ator=ator,
        cliente=cliente,
        recurso="cidadao_condicao",
    )


__all__ = [
    "baixar_alergia",
    "baixar_condicao",
    "baixar_contato",
    "baixar_documento",
    "baixar_endereco",
    "baixar_plano",
    "criar_alergia",
    "criar_condicao",
    "criar_contato",
    "criar_documento",
    "criar_endereco",
    "criar_plano",
    "listar_alergias",
    "listar_condicoes",
    "listar_contatos",
    "listar_documentos",
    "listar_enderecos",
    "listar_planos",
]
