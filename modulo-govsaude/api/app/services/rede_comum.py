"""Utilidades comuns da rede de atenção: escopo, validações e carregamento."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.autorizacao import grupos_ativos
from app.core.br_validators import (
    normalizar_cnpj,
    somente_digitos,
    validar_cbo,
    validar_cnes,
    validar_cnpj,
    validar_codigo_ibge,
    validar_sigtap,
)
from app.core.errors import AppError, Conflict, NotFound, PermissionDenied, Unprocessable
from app.core.permissoes import Permissao
from app.models.nucleo import (
    EnteConsorciado,
    Equipe,
    Especialidade,
    Estabelecimento,
    Grupo,
    Organizacao,
    Profissional,
    Setor,
    Usuario,
)
from app.models.rede import ServicoClassificacao
from app.models.referencia import Cbo, CnesEstabelecimento, SigtapProcedimento


async def obter_organizacao(db: AsyncSession, tenant_id: uuid.UUID) -> Organizacao:
    organizacao = await db.get(Organizacao, tenant_id)
    if organizacao is None:
        raise NotFound("Organização não encontrada.")
    return organizacao


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


def exigir_versao(if_match: str | None) -> int:
    if if_match is None:
        raise AppError(
            "Envie o cabeçalho If-Match com a versão atual do recurso.",
            428,
            "if_match_obrigatorio",
        )
    versao = parse_if_match(if_match)
    if versao is None:
        raise Unprocessable("If-Match inválido.", code="if_match_invalido")
    return versao


def conferir_versao(versao_atual: int, informada: int) -> None:
    if versao_atual != informada:
        raise Conflict(
            "O registro foi alterado por outro usuário. Recarregue e tente novamente.",
            code="conflito_versao",
            extra={"versao_atual": versao_atual},
        )


def escopos_estabelecimento(
    usuario: Usuario, permissao: Permissao | str
) -> set[uuid.UUID] | None:
    """Estabelecimentos que o usuário pode acessar para a permissão.

    ``None`` significa todos (perfil sem restrição). Conjunto vazio significa
    nenhum. Administradores e grupos sem ``estabelecimento_id`` passam por tudo.
    """
    codigo = permissao.value if isinstance(permissao, Permissao) else str(permissao)
    ativos = grupos_ativos(usuario)
    if any(ug.grupo and ug.grupo.codigo == "ADMIN" for ug in ativos):
        return None
    if codigo in set(usuario.permissoes_revogadas or []):
        return set()
    candidatos: list[uuid.UUID | None] = []
    extras = set(usuario.permissoes_extras or [])
    for ug in ativos:
        permissoes = {gp.permissao_codigo for gp in (ug.grupo.permissoes or [])}
        if codigo in permissoes or codigo in extras:
            candidatos.append(ug.estabelecimento_id)
    if not candidatos:
        return set()
    if None in candidatos:
        return None
    return {item for item in candidatos if item is not None}


def exigir_escopo_estabelecimento(
    usuario: Usuario, permissao: Permissao | str, estabelecimento_id: uuid.UUID
) -> None:
    permitidos = escopos_estabelecimento(usuario, permissao)
    if permitidos is not None and estabelecimento_id not in permitidos:
        raise PermissionDenied(
            "Seu perfil não tem escopo no estabelecimento informado."
        )


async def exigir_acesso_estabelecimento(
    db: AsyncSession,
    usuario: Usuario,
    permissao: Permissao | str,
    estabelecimento_id: uuid.UUID,
) -> None:
    """RBAC de escopo + janela de horário específica da unidade."""
    from app.services.janela_acesso import acesso_bloqueado

    exigir_escopo_estabelecimento(usuario, permissao, estabelecimento_id)
    restricao = await acesso_bloqueado(
        db, usuario, estabelecimento_id=estabelecimento_id
    )
    if restricao is not None:
        raise PermissionDenied(
            "Acesso fora do horário permitido para esta unidade."
        )


async def obter_estabelecimento(
    db: AsyncSession, tenant_id: uuid.UUID, estabelecimento_id: uuid.UUID
) -> Estabelecimento:
    registro = await db.scalar(
        select(Estabelecimento).where(
            Estabelecimento.id == estabelecimento_id,
            Estabelecimento.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Estabelecimento não encontrado.")
    return registro


async def obter_setor(
    db: AsyncSession, tenant_id: uuid.UUID, setor_id: uuid.UUID
) -> Setor:
    registro = await db.scalar(
        select(Setor).where(Setor.id == setor_id, Setor.tenant_id == tenant_id)
    )
    if registro is None:
        raise NotFound("Setor não encontrado.")
    return registro


async def obter_equipe(
    db: AsyncSession, tenant_id: uuid.UUID, equipe_id: uuid.UUID
) -> Equipe:
    registro = await db.scalar(
        select(Equipe).where(Equipe.id == equipe_id, Equipe.tenant_id == tenant_id)
    )
    if registro is None:
        raise NotFound("Equipe não encontrada.")
    return registro


async def obter_profissional(
    db: AsyncSession, tenant_id: uuid.UUID, profissional_id: uuid.UUID
) -> Profissional:
    registro = await db.scalar(
        select(Profissional).where(
            Profissional.id == profissional_id, Profissional.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Profissional não encontrado.")
    return registro


async def obter_especialidade(
    db: AsyncSession, tenant_id: uuid.UUID, especialidade_id: uuid.UUID
) -> Especialidade:
    registro = await db.scalar(
        select(Especialidade).where(
            Especialidade.id == especialidade_id,
            Especialidade.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Especialidade não encontrada.")
    return registro


async def obter_ente(
    db: AsyncSession, tenant_id: uuid.UUID, ente_id: uuid.UUID
) -> EnteConsorciado:
    registro = await db.scalar(
        select(EnteConsorciado).where(
            EnteConsorciado.id == ente_id, EnteConsorciado.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Ente consorciado não encontrado.")
    return registro


def validar_cnpj_opcional(cnpj: str | None) -> str | None:
    if not cnpj:
        return None
    if not validar_cnpj(cnpj):
        raise Unprocessable(
            "CNPJ inválido (numérico ou alfanumérico).",
            errors=[
                {
                    "campo": "cnpj",
                    "mensagem": "Dígito verificador inválido.",
                    "codigo_regra": "cnpj",
                }
            ],
        )
    return normalizar_cnpj(cnpj)


def validar_ibge_opcional(codigo: str | None) -> str | None:
    if not codigo:
        return None
    if not validar_codigo_ibge(codigo):
        raise Unprocessable(
            "Código IBGE de município inválido.",
            errors=[
                {
                    "campo": "municipio_ibge",
                    "mensagem": "Informe 7 dígitos com UF válida.",
                    "codigo_regra": "ibge",
                }
            ],
        )
    return somente_digitos(codigo)


def validar_cnes_cadastro(codigo: str) -> str:
    numero = somente_digitos(codigo)
    if not validar_cnes(numero):
        raise Unprocessable(
            "CNES inválido.",
            errors=[
                {
                    "campo": "cnes",
                    "mensagem": "O CNES deve ter 7 dígitos.",
                    "codigo_regra": "cnes",
                }
            ],
        )
    return numero


async def validar_cnes_contra_referencia(db: AsyncSession, codigo: str) -> None:
    """Valida contra o CNES oficial somente quando a base foi importada."""
    total = await db.scalar(select(func.count()).select_from(CnesEstabelecimento)) or 0
    if total == 0:
        return
    existe = await db.scalar(
        select(func.count())
        .select_from(CnesEstabelecimento)
        .where(CnesEstabelecimento.codigo_cnes == codigo)
    )
    if not existe:
        raise Unprocessable(
            "CNES não encontrado na base oficial importada.",
            errors=[
                {
                    "campo": "cnes",
                    "mensagem": "Importe a competência oficial ou corrija o código.",
                    "codigo_regra": "cnes_referencia",
                }
            ],
        )


async def validar_cbo_contra_referencia(db: AsyncSession, codigo: str) -> None:
    numero = somente_digitos(codigo)
    if not validar_cbo(numero):
        raise Unprocessable(
            "CBO inválido.",
            errors=[
                {
                    "campo": "cbo",
                    "mensagem": "O CBO deve ter 6 dígitos.",
                    "codigo_regra": "cbo",
                }
            ],
        )
    total = await db.scalar(select(func.count()).select_from(Cbo)) or 0
    if total == 0:
        return
    existe = await db.scalar(
        select(func.count()).select_from(Cbo).where(Cbo.codigo == numero)
    )
    if not existe:
        raise Unprocessable(
            "CBO não encontrado na base oficial importada.",
            errors=[
                {
                    "campo": "cbo",
                    "mensagem": "Importe a tabela CBO oficial ou corrija o código.",
                    "codigo_regra": "cbo_referencia",
                }
            ],
        )


async def validar_sigtap_contra_referencia(
    db: AsyncSession, codigo: str, competencia: str | None
) -> tuple[bool, str | None]:
    """Retorna ``(validado, aviso)``; nunca cria descrição/compatibilidade."""
    numero = somente_digitos(codigo)
    if not validar_sigtap(numero):
        raise Unprocessable(
            "Código SIGTAP inválido.",
            errors=[
                {
                    "campo": "codigo_sigtap",
                    "mensagem": "O código SIGTAP deve ter 10 dígitos.",
                    "codigo_regra": "sigtap",
                }
            ],
        )
    filtros = [SigtapProcedimento.codigo == numero]
    if competencia:
        filtros.append(SigtapProcedimento.competencia == competencia)
    encontrado = await db.scalar(
        select(SigtapProcedimento.codigo).where(*filtros).limit(1)
    )
    if encontrado:
        return True, None
    universo = select(func.count()).select_from(SigtapProcedimento)
    if competencia:
        universo = universo.where(SigtapProcedimento.competencia == competencia)
    total = await db.scalar(universo) or 0
    if total:
        raise Unprocessable(
            "Código SIGTAP não existe na competência oficial importada.",
            errors=[
                {
                    "campo": "codigo_sigtap",
                    "mensagem": (
                        "Corrija o código ou importe a competência correspondente. "
                        "O sistema não inventa descrição nem compatibilidade."
                    ),
                    "codigo_regra": "sigtap_referencia",
                }
            ],
        )
    return False, (
        "Base SIGTAP oficial ainda não importada; código validado apenas "
        "estruturalmente. Consulte docs/pendencias-oficiais.md."
    )


def validar_vigencia(inicio: date | None, fim: date | None) -> None:
    if inicio and fim and fim < inicio:
        raise Unprocessable(
            "A vigência final não pode ser anterior à inicial.",
            errors=[
                {
                    "campo": "vigencia_fim",
                    "mensagem": "Ajuste o período.",
                    "codigo_regra": "vigencia",
                }
            ],
        )


def baixa_efetiva(registro) -> bool:
    return getattr(registro, "baixa_em", None) is None


def serializar_estabelecimento(registro: Estabelecimento, fuso_horario: str) -> dict:
    from app.core.br_validators import mascarar_cnpj

    return {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "cnes": registro.cnes,
        "nome": registro.nome,
        "tipo": registro.tipo,
        "cnpj_mascarado": mascarar_cnpj(registro.cnpj_normalizado),
        "logradouro": registro.logradouro,
        "numero": registro.numero,
        "bairro": registro.bairro,
        "municipio_ibge": registro.municipio_ibge,
        "cep": registro.cep,
        "telefone": registro.telefone,
        "email": registro.email,
        "fuso_horario": fuso_horario,
        "ativo": registro.ativo,
        "versao": registro.versao,
        "baixa_em": registro.baixa_em,
        "baixa_motivo": registro.baixa_motivo,
    }


def serializar_profissional(registro: Profissional) -> dict:
    from app.core.encryption import descriptografar
    from app.core.security import mascarar_documento

    cpf = None
    cns = None
    try:
        cpf = descriptografar(registro.cpf_cifrado)
    except ValueError:
        cpf = None
    try:
        cns = descriptografar(registro.cns_cifrado)
    except ValueError:
        cns = None
    return {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "nome": registro.nome,
        "nome_social": registro.nome_social,
        "nome_exibicao": registro.nome_social or registro.nome,
        "cpf_mascarado": mascarar_documento(cpf),
        "cns_mascarado": mascarar_documento(cns),
        "cbo": registro.cbo,
        "conselho_classe": registro.conselho_classe,
        "registro_conselho": registro.registro_conselho,
        "email": registro.email,
        "telefone": registro.telefone,
        "ativo": registro.ativo,
        "versao": registro.versao,
        "baixa_em": registro.baixa_em,
    }


def serializar_ente(registro: EnteConsorciado) -> dict:
    from app.core.br_validators import mascarar_cnpj

    dados = {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "municipio_ibge": registro.municipio_ibge,
        "nome": registro.nome,
        "cnpj_mascarado": mascarar_cnpj(registro.cnpj_normalizado),
        "situacao": registro.situacao,
        "vigencia_inicio": registro.vigencia_inicio,
        "vigencia_fim": registro.vigencia_fim,
        "observacoes": registro.observacoes,
        "versao": registro.versao,
    }
    return dados


def serializar_servico(registro: ServicoClassificacao) -> dict:
    return {
        "id": registro.id,
        "tenant_id": registro.tenant_id,
        "estabelecimento_id": registro.estabelecimento_id,
        "tipo": registro.tipo,
        "codigo": registro.codigo,
        "nome": registro.nome,
        "observacoes": registro.observacoes,
        "ativo": registro.ativo,
        "versao": registro.versao,
        "baixa_em": registro.baixa_em,
    }


def serializar_grupo(grupo: Grupo) -> dict:
    return {"id": grupo.id, "codigo": grupo.codigo, "nome": grupo.nome}


def agora_utc() -> datetime:
    from app.core.security import agora

    return agora()
