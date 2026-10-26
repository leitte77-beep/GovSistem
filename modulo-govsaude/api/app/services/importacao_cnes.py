"""Importação CNES idempotente com relatório de inconsistências (B.1-010, B.12-031).

O layout oficial não é embutido no código. O adaptador lê um manifesto de
layout; sem manifesto/arquivo, a execução fica
``PENDENTE_ESPECIFICACAO_OFICIAL``. A importação nunca faz scraping.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import (
    somente_digitos,
    validar_cbo,
    validar_cnes,
    validar_cnpj,
    validar_cns,
    validar_cpf,
    validar_ine,
)
from app.core.encryption import proteger_documento
from app.core.errors import NotFound
from app.core.fonetica import nome_fonetico, normalizar_busca
from app.core.security import agora
from app.integracoes.cnes import AdaptadorCNESManifesto, LeituraCNES, RegistroCNES
from app.models.enums import AcaoAuditoria, SituacaoImportacao, StatusJob, TipoEquipe
from app.models.nucleo import (
    Equipe,
    Estabelecimento,
    Job,
    Profissional,
    Usuario,
    VinculoProfissional,
)
from app.models.rede import ImportacaoCNES
from app.schemas.rede import ImportacaoCNESRequest
from app.services.auditoria import registrar
from app.services.paginacao import decodificar

STATUS_PENDENTE = SituacaoImportacao.PENDENTE_ESPECIFICACAO_OFICIAL.value
ENTIDADES = {"estabelecimentos", "equipes", "profissionais", "vinculos"}


@dataclass
class ErroRegistroError(Exception):
    campo: str
    motivo: str
    acao_sugerida: str
    valor: str | None = None


def _mascarar(campo: str, valor: str | None) -> str | None:
    if valor is None:
        return None
    if campo in {"cpf", "cns"}:
        digitos = somente_digitos(valor)
        if len(digitos) <= 4:
            return "***"
        return f"***{digitos[-4:]}"
    if campo in {"nome", "nome_social"}:
        partes = [p for p in (valor or "").split() if p]
        if not partes:
            return "***"
        return f"{partes[0][0]}***" + (f" {partes[-1][0]}***" if len(partes) > 1 else "")
    return valor[:120]


def _inconsistencia(linha: int, erro: ErroRegistroError) -> dict:
    return {
        "linha": linha,
        "campo": erro.campo,
        "valor": _mascarar(erro.campo, erro.valor),
        "motivo": erro.motivo,
        "acao_sugerida": erro.acao_sugerida,
    }


def _obrigatorio(dados: dict[str, str], campo: str) -> str:
    valor = (dados.get(campo) or "").strip()
    if not valor:
        raise ErroRegistroError(
            campo,
            "Campo obrigatório ausente.",
            "Preencher o campo no arquivo oficial.",
        )
    return valor


async def _processar_estabelecimento(
    db: AsyncSession, tenant_id: uuid.UUID, dados: dict[str, str]
) -> str:
    cnes = somente_digitos(_obrigatorio(dados, "cnes"))
    if not validar_cnes(cnes):
        raise ErroRegistroError(
            "cnes", "CNES deve ter 7 dígitos.", "Corrigir o CNES.", dados.get("cnes")
        )
    nome = _obrigatorio(dados, "nome")
    tipo = _obrigatorio(dados, "tipo")
    cnpj = (dados.get("cnpj") or "").strip()
    if cnpj and not validar_cnpj(cnpj):
        raise ErroRegistroError("cnpj", "CNPJ inválido.", "Corrigir o CNPJ.", cnpj)
    existente = await db.scalar(
        select(Estabelecimento).where(
            Estabelecimento.tenant_id == tenant_id, Estabelecimento.cnes == cnes
        )
    )
    if existente:
        existente.nome = nome
        existente.tipo = tipo
        if cnpj:
            existente.cnpj_normalizado = "".join(ch for ch in cnpj.upper() if ch.isalnum())
        existente.versao += 1
        return "atualizado"
    registro = Estabelecimento(
        tenant_id=tenant_id,
        cnes=cnes,
        nome=nome,
        tipo=tipo,
        cnpj_normalizado=("".join(ch for ch in cnpj.upper() if ch.isalnum()) if cnpj else None),
        municipio_ibge=(dados.get("municipio_ibge") or None),
        ativo=True,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    return "criado"


async def _processar_equipe(
    db: AsyncSession, tenant_id: uuid.UUID, dados: dict[str, str]
) -> str:
    cnes = somente_digitos(_obrigatorio(dados, "cnes"))
    ine = somente_digitos(_obrigatorio(dados, "ine"))
    if not validar_ine(ine):
        raise ErroRegistroError(
            "ine", "INE deve ter 10 dígitos.", "Corrigir o INE.", dados.get("ine")
        )
    nome = _obrigatorio(dados, "nome")
    tipo = _obrigatorio(dados, "tipo").upper()
    if tipo not in {item.value for item in TipoEquipe}:
        raise ErroRegistroError(
            "tipo",
            "Tipo de equipe inválido.",
            "Usar tipo CNES mapeado no manifesto.",
            tipo,
        )
    estabelecimento = await db.scalar(
        select(Estabelecimento).where(
            Estabelecimento.tenant_id == tenant_id, Estabelecimento.cnes == cnes
        )
    )
    if estabelecimento is None:
        raise ErroRegistroError(
            "cnes",
            "Estabelecimento do CNES ainda não importado.",
            "Importar primeiro o arquivo de estabelecimentos.",
            cnes,
        )
    existente = await db.scalar(
        select(Equipe).where(Equipe.tenant_id == tenant_id, Equipe.ine == ine)
    )
    if existente:
        existente.nome = nome
        existente.tipo = tipo
        existente.estabelecimento_id = estabelecimento.id
        existente.versao += 1
        return "atualizado"
    db.add(
        Equipe(
            tenant_id=tenant_id,
            estabelecimento_id=estabelecimento.id,
            ine=ine,
            nome=nome,
            tipo=tipo,
            vigencia_inicio=date.today(),
            ativo=True,
            versao=1,
        )
    )
    await db.flush()
    return "criado"


async def _processar_profissional(
    db: AsyncSession, tenant_id: uuid.UUID, dados: dict[str, str]
) -> str:
    nome = _obrigatorio(dados, "nome")
    cpf = (dados.get("cpf") or "").strip()
    cns = (dados.get("cns") or "").strip()
    if not cpf and not cns:
        raise ErroRegistroError("cpf", "CPF/CNS ausente.", "Informar CPF ou CNS.", None)
    if cpf and not validar_cpf(cpf):
        raise ErroRegistroError("cpf", "CPF inválido.", "Corrigir o CPF.", cpf)
    if cns and not validar_cns(cns):
        raise ErroRegistroError("cns", "CNS inválido.", "Corrigir o CNS.", cns)
    cbo = (dados.get("cbo") or "").strip()
    if cbo and not validar_cbo(cbo):
        raise ErroRegistroError("cbo", "CBO inválido.", "Corrigir o CBO.", cbo)
    cpf_protegido = proteger_documento(somente_digitos(cpf)) if cpf else None
    cns_protegido = proteger_documento(somente_digitos(cns)) if cns else None
    existente = None
    if cpf_protegido:
        existente = await db.scalar(
            select(Profissional).where(
                Profissional.tenant_id == tenant_id,
                Profissional.cpf_hash == cpf_protegido.hash_busca,
                Profissional.baixa_em.is_(None),
            )
        )
    if existente is None and cns_protegido:
        existente = await db.scalar(
            select(Profissional).where(
                Profissional.tenant_id == tenant_id,
                Profissional.cns_hash == cns_protegido.hash_busca,
                Profissional.baixa_em.is_(None),
            )
        )
    if existente:
        existente.nome = nome
        existente.nome_busca = normalizar_busca(nome)
        existente.nome_fonetico = nome_fonetico(nome)
        if cbo:
            existente.cbo = somente_digitos(cbo)
        if dados.get("conselho_classe"):
            existente.conselho_classe = dados["conselho_classe"]
        if dados.get("registro_conselho"):
            existente.registro_conselho = dados["registro_conselho"]
        if cpf_protegido:
            existente.cpf_hash = cpf_protegido.hash_busca
            existente.cpf_cifrado = cpf_protegido.cifrado
            existente.cpf_final = cpf_protegido.final
        if cns_protegido:
            existente.cns_hash = cns_protegido.hash_busca
            existente.cns_cifrado = cns_protegido.cifrado
        existente.versao += 1
        return "atualizado"
    db.add(
        Profissional(
            tenant_id=tenant_id,
            nome=nome,
            nome_busca=normalizar_busca(nome),
            nome_fonetico=nome_fonetico(nome),
            cpf_hash=cpf_protegido.hash_busca if cpf_protegido else None,
            cpf_cifrado=cpf_protegido.cifrado if cpf_protegido else None,
            cpf_final=cpf_protegido.final if cpf_protegido else None,
            cns_hash=cns_protegido.hash_busca if cns_protegido else None,
            cns_cifrado=cns_protegido.cifrado if cns_protegido else None,
            cbo=somente_digitos(cbo) if cbo else None,
            conselho_classe=dados.get("conselho_classe") or None,
            registro_conselho=dados.get("registro_conselho") or None,
            ativo=True,
            versao=1,
        )
    )
    await db.flush()
    return "criado"


async def _processar_vinculo(
    db: AsyncSession, tenant_id: uuid.UUID, dados: dict[str, str]
) -> str:
    cnes = somente_digitos(_obrigatorio(dados, "cnes"))
    cpf = (dados.get("cpf") or "").strip()
    cns = (dados.get("cns") or "").strip()
    cbo = somente_digitos((dados.get("cbo") or "").strip())
    if not cbo or not validar_cbo(cbo):
        raise ErroRegistroError("cbo", "CBO inválido.", "Corrigir o CBO.", dados.get("cbo"))
    try:
        carga = int(dados.get("carga_horaria") or 0)
    except ValueError as exc:
        raise ErroRegistroError(
            "carga_horaria",
            "Carga horária inválida.",
            "Informar horas por semana.",
        ) from exc
    if not 1 <= carga <= 168:
        raise ErroRegistroError(
            "carga_horaria",
            "Carga horária fora de 1..168.",
            "Corrigir a carga horária.",
        )
    estabelecimento = await db.scalar(
        select(Estabelecimento).where(
            Estabelecimento.tenant_id == tenant_id, Estabelecimento.cnes == cnes
        )
    )
    if estabelecimento is None:
        raise ErroRegistroError(
            "cnes",
            "Estabelecimento não importado.",
            "Importar estabelecimentos antes.",
            cnes,
        )
    profissional = None
    if cpf:
        protegido = proteger_documento(somente_digitos(cpf))
        profissional = await db.scalar(
            select(Profissional).where(
                Profissional.tenant_id == tenant_id,
                Profissional.cpf_hash == protegido.hash_busca,
                Profissional.baixa_em.is_(None),
            )
        )
    if profissional is None and cns:
        protegido = proteger_documento(somente_digitos(cns))
        profissional = await db.scalar(
            select(Profissional).where(
                Profissional.tenant_id == tenant_id,
                Profissional.cns_hash == protegido.hash_busca,
                Profissional.baixa_em.is_(None),
            )
        )
    if profissional is None:
        raise ErroRegistroError(
            "cpf",
            "Profissional não importado.",
            "Importar profissionais antes.",
            cpf or cns,
        )
    equipe = None
    ine = (dados.get("ine") or "").strip()
    if ine:
        equipe = await db.scalar(
            select(Equipe).where(Equipe.tenant_id == tenant_id, Equipe.ine == ine)
        )
        if equipe is None:
            raise ErroRegistroError("ine", "Equipe não importada.", "Importar equipes antes.", ine)
    filtros = [
        VinculoProfissional.tenant_id == tenant_id,
        VinculoProfissional.profissional_id == profissional.id,
        VinculoProfissional.estabelecimento_id == estabelecimento.id,
        VinculoProfissional.vigencia_fim.is_(None),
    ]
    if equipe:
        filtros.append(VinculoProfissional.equipe_id == equipe.id)
    else:
        filtros.append(VinculoProfissional.equipe_id.is_(None))
    existente = await db.scalar(select(VinculoProfissional).where(*filtros))
    if existente:
        if existente.cbo == cbo and existente.carga_horaria_semanal == carga:
            return "ignorado"
        existente.vigencia_fim = max(date.today(), existente.vigencia_inicio)
        existente.versao += 1
    db.add(
        VinculoProfissional(
            tenant_id=tenant_id,
            profissional_id=profissional.id,
            estabelecimento_id=estabelecimento.id,
            equipe_id=equipe.id if equipe else None,
            cbo=cbo,
            carga_horaria_semanal=carga,
            vigencia_inicio=date.today(),
            versao=1,
        )
    )
    await db.flush()
    return "criado"


async def _processar_registro(
    db: AsyncSession, tenant_id: uuid.UUID, registro: RegistroCNES
) -> str:
    if registro.entidade == "estabelecimentos":
        return await _processar_estabelecimento(db, tenant_id, registro.dados)
    if registro.entidade == "equipes":
        return await _processar_equipe(db, tenant_id, registro.dados)
    if registro.entidade == "profissionais":
        return await _processar_profissional(db, tenant_id, registro.dados)
    if registro.entidade == "vinculos":
        return await _processar_vinculo(db, tenant_id, registro.dados)
    raise ErroRegistroError(
        "entidade",
        "Entidade CNES não suportada pelo manifesto.",
        "Usar estabelecimentos, equipes, profissionais ou vinculos.",
        registro.entidade,
    )


def _relatorio(leitura: LeituraCNES, resumo: dict, itens: list[dict]) -> dict:
    return {
        "resumo": {
            **resumo,
            "versao_layout": leitura.manifesto.versao_layout if leitura.manifesto else None,
            "entidade": leitura.manifesto.entidade if leitura.manifesto else None,
            "arquivo": leitura.arquivo_nome,
            "hash_arquivo": leitura.hash_arquivo,
        },
        "inconsistencias": itens,
    }


async def executar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: ImportacaoCNESRequest,
    cliente: dict,
    adaptador: AdaptadorCNESManifesto | None = None,
) -> ImportacaoCNES:
    leitura = (adaptador or AdaptadorCNESManifesto()).carregar(dados.versao_layout)
    if leitura.hash_arquivo:
        existente = await db.scalar(
            select(ImportacaoCNES).where(
                ImportacaoCNES.tenant_id == tenant_id,
                ImportacaoCNES.hash_arquivo == leitura.hash_arquivo,
                ImportacaoCNES.status == SituacaoImportacao.CONCLUIDA.value,
            )
        )
        if existente is not None:
            return existente
    job = Job(
        tenant_id=tenant_id,
        tipo="IMPORTACAO_CNES",
        status=StatusJob.EXECUTANDO.value,
        progresso=1,
        parametros={
            "versao_layout": dados.versao_layout,
            "competencia": dados.competencia,
        },
        criado_por_id=usuario.id,
    )
    db.add(job)
    await db.flush()
    if leitura.manifesto and leitura.manifesto.entidade not in ENTIDADES:
        leitura.status = STATUS_PENDENTE
        leitura.mensagem = "Entidade do manifesto CNES inválida."
    if leitura.status == STATUS_PENDENTE:
        importacao = ImportacaoCNES(
            tenant_id=tenant_id,
            job_id=job.id,
            status=STATUS_PENDENTE,
            arquivo_nome=leitura.arquivo_nome,
            hash_arquivo=leitura.hash_arquivo,
            versao_layout=(
                leitura.manifesto.versao_layout if leitura.manifesto else dados.versao_layout
            ),
            competencia=(
                dados.competencia
                or (leitura.manifesto.competencia if leitura.manifesto else None)
            ),
            total_linhas=0,
            total_validos=0,
            total_rejeitados=0,
            total_criados=0,
            total_atualizados=0,
            conferencia_ok=True,
            relatorio={
                "resumo": {
                    "status": STATUS_PENDENTE,
                    "mensagem": leitura.mensagem,
                },
                "inconsistencias": [
                    {
                        "linha": item.linha,
                        "campo": item.campo,
                        "valor": _mascarar(item.campo, item.valor),
                        "motivo": item.motivo,
                        "acao_sugerida": item.acao_sugerida,
                    }
                    for item in leitura.inconsistencias
                ],
            },
            criado_por_id=usuario.id,
        )
        job.status = StatusJob.CONCLUIDO.value
        job.progresso = 100
        job.concluido_em = agora()
        db.add(importacao)
        await db.flush()
        await registrar(
            db,
            acao=AcaoAuditoria.INTEGRACAO,
            usuario=usuario,
            tenant_id=tenant_id,
            recurso="importacao_cnes",
            recurso_id=importacao.id,
            detalhe=leitura.mensagem or STATUS_PENDENTE,
            cliente=cliente,
        )
        await db.commit()
        return importacao
    criados = atualizados = ignorados = rejeitados = 0
    inconsistencias: list[dict] = []
    for registro in leitura.registros:
        try:
            resultado = await _processar_registro(db, tenant_id, registro)
        except ErroRegistroError as erro:
            rejeitados += 1
            inconsistencias.append(_inconsistencia(registro.linha, erro))
            continue
        except Exception as exc:  # noqa: BLE001 - linha isolada não derruba o lote
            rejeitados += 1
            inconsistencias.append(
                {
                    "linha": registro.linha,
                    "campo": "registro",
                    "valor": None,
                    "motivo": f"Falha ao processar: {exc.__class__.__name__}.",
                    "acao_sugerida": "Conferir os dados da linha e reenviar.",
                }
            )
            continue
        if resultado == "criado":
            criados += 1
        elif resultado == "atualizado":
            atualizados += 1
        else:
            ignorados += 1
    validos = criados + atualizados + ignorados
    total = leitura.total_linhas
    conferencia_ok = total == validos + rejeitados and len(leitura.registros) == total
    resumo = {
        "total_linhas": total,
        "total_validos": validos,
        "total_rejeitados": rejeitados,
        "total_criados": criados,
        "total_atualizados": atualizados,
        "total_ignorados": ignorados,
    }
    importacao = ImportacaoCNES(
        tenant_id=tenant_id,
        job_id=job.id,
        status=(
            SituacaoImportacao.CONCLUIDA.value
            if conferencia_ok
            else SituacaoImportacao.FALHOU.value
        ),
        arquivo_nome=leitura.arquivo_nome,
        hash_arquivo=leitura.hash_arquivo,
        versao_layout=(
            leitura.manifesto.versao_layout if leitura.manifesto else dados.versao_layout
        ),
        competencia=(
            dados.competencia
            or (leitura.manifesto.competencia if leitura.manifesto else None)
        ),
        total_linhas=total,
        total_validos=validos,
        total_rejeitados=rejeitados,
        total_criados=criados,
        total_atualizados=atualizados,
        conferencia_ok=conferencia_ok,
        relatorio=_relatorio(leitura, resumo, inconsistencias),
        criado_por_id=usuario.id,
    )
    job.status = StatusJob.CONCLUIDO.value if conferencia_ok else StatusJob.FALHOU.value
    job.progresso = 100
    job.concluido_em = agora()
    job.erro = None if conferencia_ok else "Conferência de totais da importação CNES falhou."
    db.add(importacao)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.INTEGRACAO,
        usuario=usuario,
        tenant_id=tenant_id,
        recurso="importacao_cnes",
        recurso_id=importacao.id,
        detalhe=(
            f"CNES {leitura.manifesto.versao_layout if leitura.manifesto else ''} "
            f"lidos={total} validos={validos} rejeitados={rejeitados}"
        ),
        cliente=cliente,
    )
    await db.commit()
    return importacao


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[ImportacaoCNES], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [ImportacaoCNES.tenant_id == tenant_id]
    total = (
        await db.scalar(select(func.count()).select_from(ImportacaoCNES).where(*condicoes))
        or 0
    )
    consulta = (
        select(ImportacaoCNES)
        .where(*condicoes)
        .order_by(ImportacaoCNES.created_at.desc(), ImportacaoCNES.id.desc())
        .limit(limite + 1)
    )
    posicao = decodificar(cursor)
    if posicao:
        from sqlalchemy import tuple_

        consulta = consulta.where(
            tuple_(ImportacaoCNES.created_at, ImportacaoCNES.id)
            < tuple_(posicao[0], posicao[1])
        )
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        from app.services.paginacao import codificar

        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter_por_job(
    db: AsyncSession, tenant_id: uuid.UUID, job_id: uuid.UUID
) -> ImportacaoCNES:
    registro = await db.scalar(
        select(ImportacaoCNES).where(
            ImportacaoCNES.tenant_id == tenant_id, ImportacaoCNES.job_id == job_id
        )
    )
    if registro is None:
        raise NotFound("Importação CNES não encontrada.")
    return registro


async def obter(
    db: AsyncSession, tenant_id: uuid.UUID, importacao_id: uuid.UUID
) -> ImportacaoCNES:
    registro = await db.scalar(
        select(ImportacaoCNES).where(
            ImportacaoCNES.id == importacao_id,
            ImportacaoCNES.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Importação CNES não encontrada.")
    return registro
