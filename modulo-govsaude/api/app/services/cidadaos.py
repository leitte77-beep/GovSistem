"""Cadastro único do cidadão: CRUD, busca, baixa e recém-nascido."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import somente_digitos, validar_cns, validar_cpf
from app.core.encryption import descriptografar
from app.core.errors import Unprocessable
from app.core.fonetica import nome_fonetico, normalizar_busca
from app.core.security import agora
from app.models.cidadao import Cidadao, CidadaoBaixa
from app.models.enums import AcaoAuditoria, TipoBaixaCidadao
from app.models.nucleo import Usuario
from app.schemas.cidadao import (
    BaixaCidadaoRequest,
    CidadaoCreate,
    CidadaoUpdate,
    ReativacaoRequest,
    RecemNascidoCreate,
)
from app.services.auditoria import registrar
from app.services.cidadao_comum import (
    aplicar_documentos,
    atualizar_busca,
    obter_cidadao,
    serializar_cidadao,
    validar_cbo_cidadao,
    validar_documentos_unicos,
    validar_ibge_referencia,
    validar_mae,
)
from app.services.deduplicacao import detectar_duplicidades
from app.services.paginacao import aplicar_cursor, codificar


def _validar_nascimento(data_nascimento: date | None) -> None:
    if data_nascimento and data_nascimento > date.today():
        raise Unprocessable(
            "Data de nascimento não pode estar no futuro.",
            errors=[
                {
                    "campo": "data_nascimento",
                    "mensagem": "Informe uma data válida.",
                    "codigo_regra": "data_nascimento",
                }
            ],
        )


def _decrypt(valor: str | None) -> str | None:
    if not valor:
        return None
    try:
        return descriptografar(valor)
    except ValueError:
        return None


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: CidadaoCreate,
    ator: Usuario,
    cliente: dict,
    commit: bool = True,
) -> Cidadao:
    _validar_nascimento(dados.data_nascimento)
    mae = await validar_mae(db, tenant_id, dados.mae_id)
    registro = Cidadao(
        tenant_id=tenant_id,
        nome=dados.nome.strip(),
        nome_social=(dados.nome_social or "").strip() or None,
        data_nascimento=dados.data_nascimento,
        sexo=dados.sexo,
        identidade_genero=dados.identidade_genero,
        orientacao_sexual=dados.orientacao_sexual,
        raca_cor=dados.raca_cor,
        etnia=dados.etnia,
        nacionalidade=dados.nacionalidade,
        municipio_nascimento_ibge=await validar_ibge_referencia(
            db, dados.municipio_nascimento_ibge
        ),
        ocupacao_cbo=await validar_cbo_cidadao(db, dados.ocupacao_cbo),
        escolaridade=dados.escolaridade,
        situacao_rua=dados.situacao_rua,
        mae_id=mae.id if mae else None,
        nome_mae=(dados.nome_mae or "").strip() or (
            (mae.nome_social or mae.nome) if mae else None
        ),
        observacoes=dados.observacoes,
        versao=1,
    )
    aplicar_documentos(registro, dados.cpf, dados.cns)
    atualizar_busca(registro)
    await validar_documentos_unicos(db, tenant_id, registro)
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao",
        recurso_id=registro.id,
        dados_depois=serializar_cidadao(registro),
        cliente=cliente,
    )
    await detectar_duplicidades(
        db, tenant_id=tenant_id, cidadao=registro, ator=ator, cliente=cliente
    )
    if commit:
        await db.commit()
    return registro


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
    ativo: bool | None = None,
    incluir_unificados: bool = False,
) -> tuple[list[Cidadao], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Cidadao.tenant_id == tenant_id]
    if ativo is True:
        condicoes.append(Cidadao.baixa_em.is_(None))
    elif ativo is False:
        condicoes.append(Cidadao.baixa_em.is_not(None))
    if not incluir_unificados:
        condicoes.append(Cidadao.unificado_para_id.is_(None))
    total = await db.scalar(select(func.count()).select_from(Cidadao).where(*condicoes)) or 0
    consulta = (
        select(Cidadao)
        .where(*condicoes)
        .order_by(Cidadao.created_at, Cidadao.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Cidadao, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def buscar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    termo: str,
    limite: int = 50,
    cursor: str | None = None,
    incluir_unificados: bool = False,
) -> tuple[list[tuple[Cidadao, int, str]], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Cidadao.tenant_id == tenant_id, Cidadao.baixa_em.is_(None)]
    if not incluir_unificados:
        condicoes.append(Cidadao.unificado_para_id.is_(None))
    termo = termo.strip()
    if validar_cpf(termo):
        from app.core.security import hmac_hex

        condicoes.append(Cidadao.cpf_hash == hmac_hex(somente_digitos(termo)))
        motivo = "CPF"
        score_fixo = 100
    elif validar_cns(termo):
        from app.core.security import hmac_hex

        condicoes.append(Cidadao.cns_hash == hmac_hex(somente_digitos(termo)))
        motivo = "CNS"
        score_fixo = 100
    else:
        termo_busca = normalizar_busca(termo)
        termo_fonetico = nome_fonetico(termo)
        condicoes.append(
            or_(
                Cidadao.nome_busca.like(f"%{termo_busca}%"),
                Cidadao.nome_fonetico.like(f"%{termo_fonetico}%"),
            )
        )
        motivo = "NOME"
        score_fixo = None
    total = await db.scalar(select(func.count()).select_from(Cidadao).where(*condicoes)) or 0
    consulta = (
        select(Cidadao)
        .where(*condicoes)
        .order_by(Cidadao.created_at, Cidadao.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Cidadao, cursor)
    registros = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(registros) > limite:
        ultimo = registros[limite - 1]
        registros = registros[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    saida: list[tuple[Cidadao, int, str]] = []
    for registro in registros:
        if score_fixo is not None:
            saida.append((registro, score_fixo, motivo))
            continue
        if (registro.nome_fonetico or "") == nome_fonetico(termo):
            score, razao = 90, "NOME_FONETICO"
        elif (registro.nome_busca or "") == normalizar_busca(termo):
            score, razao = 80, "NOME_EXATO"
        else:
            score, razao = 60, "NOME_PARCIAL"
        saida.append((registro, score, razao))
    return saida, proximo, int(total)


async def atualizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: CidadaoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Cidadao:
    registro = await obter_cidadao(db, tenant_id, cidadao_id)
    from app.services.rede_comum import conferir_versao

    conferir_versao(registro.versao, versao)
    _validar_nascimento(dados.data_nascimento)
    antes = serializar_cidadao(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.nome_social is not None:
        registro.nome_social = dados.nome_social.strip() or None
    if dados.data_nascimento is not None:
        registro.data_nascimento = dados.data_nascimento
    if dados.sexo is not None:
        registro.sexo = dados.sexo
    for campo in (
        "identidade_genero",
        "orientacao_sexual",
        "raca_cor",
        "etnia",
        "nacionalidade",
        "escolaridade",
        "observacoes",
    ):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.situacao_rua is not None:
        registro.situacao_rua = dados.situacao_rua
    if dados.municipio_nascimento_ibge is not None:
        registro.municipio_nascimento_ibge = await validar_ibge_referencia(
            db, dados.municipio_nascimento_ibge
        )
    if dados.ocupacao_cbo is not None:
        registro.ocupacao_cbo = await validar_cbo_cidadao(db, dados.ocupacao_cbo)
    if dados.mae_id is not None:
        mae = await validar_mae(db, tenant_id, dados.mae_id)
        registro.mae_id = mae.id if mae else None
        if mae and dados.nome_mae is None:
            registro.nome_mae = mae.nome_social or mae.nome
    if dados.nome_mae is not None:
        registro.nome_mae = dados.nome_mae.strip() or None
    if dados.cpf is not None or dados.cns is not None:
        aplicar_documentos(registro, dados.cpf, dados.cns)
        await validar_documentos_unicos(db, tenant_id, registro)
    atualizar_busca(registro)
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=serializar_cidadao(registro),
        cliente=cliente,
    )
    await detectar_duplicidades(
        db, tenant_id=tenant_id, cidadao=registro, ator=ator, cliente=cliente
    )
    await db.commit()
    return registro


async def baixar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: BaixaCidadaoRequest,
    ator: Usuario,
    cliente: dict,
) -> Cidadao:
    registro = await obter_cidadao(db, tenant_id, cidadao_id, incluir_baixado=True)
    if registro.baixa_em is not None:
        return registro
    antes = serializar_cidadao(registro)
    momento = dados.data or agora()
    registro.baixa_em = momento
    registro.baixa_motivo = dados.motivo
    registro.baixa_por_id = ator.id
    registro.versao += 1
    db.add(
        CidadaoBaixa(
            tenant_id=tenant_id,
            cidadao_id=registro.id,
            tipo=TipoBaixaCidadao.BAIXA.value,
            motivo=dados.motivo,
            data=momento,
            usuario_id=ator.id,
            observacoes=dados.observacoes,
        )
    )
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=serializar_cidadao(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def reativar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: ReativacaoRequest,
    ator: Usuario,
    cliente: dict,
) -> Cidadao:
    registro = await obter_cidadao(db, tenant_id, cidadao_id, incluir_baixado=True)
    if registro.baixa_em is None:
        return registro
    antes = serializar_cidadao(registro)
    momento = dados.data or agora()
    registro.baixa_em = None
    registro.baixa_motivo = None
    registro.baixa_por_id = None
    registro.versao += 1
    db.add(
        CidadaoBaixa(
            tenant_id=tenant_id,
            cidadao_id=registro.id,
            tipo=TipoBaixaCidadao.REATIVACAO.value,
            motivo=dados.motivo,
            data=momento,
            usuario_id=ator.id,
            observacoes=dados.observacoes,
        )
    )
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=serializar_cidadao(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_baixas(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoBaixa]:
    await obter_cidadao(db, tenant_id, cidadao_id, incluir_baixado=True)
    return list(
        (
            await db.execute(
                select(CidadaoBaixa)
                .where(
                    CidadaoBaixa.tenant_id == tenant_id,
                    CidadaoBaixa.cidadao_id == cidadao_id,
                )
                .order_by(CidadaoBaixa.data.desc())
            )
        )
        .scalars()
        .all()
    )


async def criar_recem_nascido(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    mae_id: uuid.UUID,
    dados: RecemNascidoCreate,
    ator: Usuario,
    cliente: dict,
) -> Cidadao:
    mae = await obter_cidadao(db, tenant_id, mae_id)
    dados_criacao = CidadaoCreate(
        nome=dados.nome,
        nome_social=dados.nome_social,
        cpf=dados.cpf,
        cns=dados.cns,
        data_nascimento=dados.data_nascimento,
        sexo=dados.sexo,
        mae_id=mae.id,
        nome_mae=mae.nome_social or mae.nome,
        observacoes=dados.observacoes,
    )
    registro = await criar(
        db,
        tenant_id=tenant_id,
        dados=dados_criacao,
        ator=ator,
        cliente=cliente,
        commit=False,
    )
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="cidadao_recem_nascido",
        recurso_id=registro.id,
        detalhe=f"Vinculado à mãe {mae.id}.",
        cliente=cliente,
    )
    await db.commit()
    return registro


__all__ = [
    "atualizar",
    "baixar",
    "buscar",
    "criar",
    "criar_recem_nascido",
    "listar",
    "listar_baixas",
    "reativar",
]
