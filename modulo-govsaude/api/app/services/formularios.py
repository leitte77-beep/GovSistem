"""Formulários dinâmicos versionados e respostas (B.2-004, B.12-013)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.models.enums import AcaoAuditoria
from app.models.nucleo import FormularioDinamico, RespostaFormulario, Usuario
from app.models.programa import ProgramaInscricao
from app.motores.formularios import validar_resposta, validar_schema
from app.schemas.formulario import FormularioCreate, RespostaCreate
from app.services.auditoria import instantaneo, registrar, registrar_leitura_sensivel
from app.services.rede_comum import exigir_acesso_estabelecimento


def _vigente(consulta):
    hoje = date.today()
    return consulta.where(
        FormularioDinamico.vigencia_inicio <= hoje,
        (FormularioDinamico.vigencia_fim.is_(None))
        | (FormularioDinamico.vigencia_fim >= hoje),
    )


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    codigo: str | None = None,
    ativo: bool | None = None,
    somente_vigentes: bool = True,
) -> list[FormularioDinamico]:
    consulta = select(FormularioDinamico).where(
        FormularioDinamico.tenant_id == tenant_id
    )
    if codigo:
        consulta = consulta.where(FormularioDinamico.codigo == codigo.strip().upper())
    if ativo is not None:
        consulta = consulta.where(FormularioDinamico.ativo.is_(ativo))
    if somente_vigentes:
        consulta = _vigente(consulta)
    consulta = consulta.order_by(
        FormularioDinamico.codigo, FormularioDinamico.versao.desc()
    )
    return list((await db.execute(consulta)).scalars().all())


async def obter_vigente(
    db: AsyncSession, tenant_id: uuid.UUID, codigo: str
) -> FormularioDinamico:
    consulta = _vigente(
        select(FormularioDinamico).where(
            FormularioDinamico.tenant_id == tenant_id,
            FormularioDinamico.codigo == codigo.strip().upper(),
            FormularioDinamico.ativo.is_(True),
        )
    ).order_by(FormularioDinamico.versao.desc())
    registro = await db.scalar(consulta.limit(1))
    if registro is None:
        raise NotFound("Formulário vigente não encontrado.")
    return registro


async def obter(db: AsyncSession, tenant_id: uuid.UUID, formulario_id: uuid.UUID):
    registro = await db.scalar(
        select(FormularioDinamico).where(
            FormularioDinamico.id == formulario_id,
            FormularioDinamico.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Formulário não encontrado.")
    return registro


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: FormularioCreate,
    usuario: Usuario,
    cliente: dict,
) -> FormularioDinamico:
    erros = validar_schema(dados.schema_definicao)
    if erros:
        raise Unprocessable(
            "O schema do formulário é inválido.", code="schema_invalido", errors=erros
        )
    existente = await db.scalar(
        select(FormularioDinamico).where(
            FormularioDinamico.tenant_id == tenant_id,
            FormularioDinamico.codigo == dados.codigo,
            FormularioDinamico.versao == dados.versao,
        )
    )
    if existente is not None:
        raise Conflict(
            "Já existe uma versão deste formulário para o tenant.",
            code="formulario_versao_duplicada",
        )
    registro = FormularioDinamico(
        tenant_id=tenant_id,
        codigo=dados.codigo,
        nome=dados.nome.strip(),
        versao=dados.versao,
        schema_json=dados.schema_definicao,
        vigencia_inicio=dados.vigencia_inicio,
        vigencia_fim=dados.vigencia_fim,
        ativo=dados.ativo,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=usuario,
        tenant_id=tenant_id,
        recurso="formulario_dinamico",
        recurso_id=registro.id,
        recurso_descricao=registro.codigo,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    return registro


async def _validar_entidade(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    entidade: str,
    entidade_id: uuid.UUID,
    usuario: Usuario,
    permissao: Permissao,
) -> None:
    if entidade == "programa_inscricao":
        inscricao = await db.scalar(
            select(ProgramaInscricao).where(
                ProgramaInscricao.id == entidade_id,
                ProgramaInscricao.tenant_id == tenant_id,
            )
        )
        if inscricao is None:
            raise NotFound("Inscrição de programa não encontrada.")
        await exigir_acesso_estabelecimento(
            db, usuario, permissao, inscricao.estabelecimento_id
        )


async def submeter_resposta(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    codigo: str,
    dados: RespostaCreate,
    usuario: Usuario,
    cliente: dict,
) -> RespostaFormulario:
    formulario = await obter_vigente(db, tenant_id, codigo)
    await _validar_entidade(
        db,
        tenant_id,
        dados.entidade,
        dados.entidade_id,
        usuario,
        Permissao.PROGRAMA_GERENCIAR,
    )
    erros = validar_resposta(formulario.schema_json, dados.resposta)
    if erros:
        raise Unprocessable(
            "A resposta não corresponde ao formulário vigente.",
            code="resposta_invalida",
            errors=erros,
        )
    registro = RespostaFormulario(
        tenant_id=tenant_id,
        formulario_id=formulario.id,
        entidade=dados.entidade,
        entidade_id=dados.entidade_id,
        resposta=dados.resposta,
        versao_formulario=formulario.versao,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=usuario,
        tenant_id=tenant_id,
        recurso="resposta_formulario",
        recurso_id=registro.id,
        recurso_descricao=formulario.codigo,
        dados_depois={"entidade": dados.entidade, "entidade_id": str(dados.entidade_id)},
        cliente=cliente,
    )
    return registro


async def listar_respostas(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    codigo: str,
    entidade: str,
    entidade_id: uuid.UUID,
    usuario: Usuario,
    cliente: dict,
) -> list[RespostaFormulario]:
    formulario = await obter_vigente(db, tenant_id, codigo)
    await _validar_entidade(
        db,
        tenant_id,
        entidade,
        entidade_id,
        usuario,
        Permissao.PROGRAMA_LER,
    )
    registros = list(
        (
            await db.execute(
                select(RespostaFormulario)
                .where(
                    RespostaFormulario.tenant_id == tenant_id,
                    RespostaFormulario.formulario_id == formulario.id,
                    RespostaFormulario.entidade == entidade,
                    RespostaFormulario.entidade_id == entidade_id,
                )
                .order_by(RespostaFormulario.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    await registrar_leitura_sensivel(
        db,
        usuario=usuario,
        recurso="resposta_formulario",
        recurso_id=entidade_id,
        finalidade="consulta de resposta de formulário",
        cliente=cliente,
    )
    return registros
