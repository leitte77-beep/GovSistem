"""Seeds nacionais copiados para cada tenant (padrão da plataforma).

O motor de autorização é código; os grupos e permissões são dados. O seed é
idempotente para que o provisionamento possa rodar em todo login.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissoes import ALL_PERMISSIONS, GRUPOS_NACIONAIS, ROTULOS_GRUPO, Permissao
from app.models.nucleo import ConfiguracaoTenant, Grupo, GrupoPermissao, PermissaoGlobal
from app.models.rede import Prioridade


async def garantir_permissoes(db: AsyncSession) -> None:
    existentes = {
        codigo
        for (codigo,) in (
            await db.execute(select(PermissaoGlobal.codigo))
        ).all()
    }
    for permissao in ALL_PERMISSIONS:
        if permissao.value in existentes:
            continue
        db.add(
            PermissaoGlobal(
                codigo=permissao.value,
                descricao=_descricao(permissao),
                modulo="govsaude",
            )
        )
    await db.flush()


def _descricao(permissao: Permissao) -> str:
    recurso, _, acao = permissao.value.partition(":")
    return f"{acao.replace('_', ' ').title()} em {recurso.replace('_', ' ')}"


async def garantir_grupos_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    await garantir_permissoes(db)
    existentes = {
        grupo.codigo: grupo
        for grupo in (
            await db.execute(select(Grupo).where(Grupo.tenant_id == tenant_id))
        ).scalars()
    }
    for codigo, definicao in GRUPOS_NACIONAIS.items():
        grupo = existentes.get(codigo)
        if grupo is None:
            grupo = Grupo(
                tenant_id=tenant_id,
                codigo=codigo,
                nome=ROTULOS_GRUPO[codigo],
                sistema=True,
                requer_consentimento=bool(definicao.get("requer_consentimento")),
            )
            db.add(grupo)
            await db.flush()
        atuais = {
            gp.permissao_codigo
            for gp in (
                await db.execute(
                    select(GrupoPermissao).where(GrupoPermissao.grupo_id == grupo.id)
                )
            ).scalars()
        }
        desejadas = {p.value for p in definicao["permissoes"]}
        for codigo_permissao in desejadas - atuais:
            db.add(
                GrupoPermissao(
                    grupo_id=grupo.id,
                    permissao_codigo=codigo_permissao,
                )
            )
        for codigo_permissao in atuais - desejadas:
            registro = await db.scalar(
                select(GrupoPermissao).where(
                    GrupoPermissao.grupo_id == grupo.id,
                    GrupoPermissao.permissao_codigo == codigo_permissao,
                )
            )
            if registro:
                await db.delete(registro)
    await db.flush()


CONFIGURACOES_PADRAO: dict[str, dict] = {
    "geral.fuso_horario": {
        "valor": {"valor": "America/Sao_Paulo"},
        "tipo": "texto",
        "descricao": "Fuso IANA usado em competência, turnos e relatórios.",
    },
    "seguranca.politica_senha": {
        "valor": {
            "minimo": 12,
            "maiuscula": 1,
            "minuscula": 1,
            "digito": 1,
            "simbolo": 1,
            "expira_dias": 90,
            "historico": 5,
            "tentativas": 5,
        },
        "tipo": "json",
        "descricao": "Política de senha do tenant (B.12-049/051).",
    },
    "seguranca.termo_obrigatorio": {
        "valor": {"valor": False},
        "tipo": "booleano",
        "descricao": "Exige aceite do termo de uso vigente (B.12-023).",
    },
    "seguranca.mfa_obrigatorio": {
        "valor": {"valor": False},
        "tipo": "booleano",
        "descricao": "Exige MFA TOTP para todos os usuários do tenant.",
    },
    "lgpd.retencao_clinica_anos": {
        "valor": {"valor": 20},
        "tipo": "numero",
        "descricao": "Prazo mínimo de guarda do prontuário (configurável e documentado).",
    },
    "lgpd.retencao_gps_dias": {
        "valor": {"valor": 90},
        "tipo": "numero",
        "descricao": "Retenção de trajetos de GPS de visitas (B.1-029).",
    },
    "suporte.consentimento": {
        "valor": {"valor": False},
        "tipo": "booleano",
        "descricao": "Permite acesso de suporte da plataforma ao tenant.",
    },
    "documentos.brasao": {
        "valor": {"chave_objeto": None},
        "tipo": "json",
        "descricao": "Brasão usado em documentos e relatórios do tenant.",
    },
    "cidadao.uso_foto": {
        "valor": {"valor": {"permitir": True, "obrigatoria": False}},
        "tipo": "json",
        "descricao": "Política de uso/obrigatoriedade da foto do cidadão.",
    },
    "cidadao.duplicidade_pesos": {
        "valor": {
            "valor": {
                "nome": 40,
                "nascimento": 30,
                "mae": 20,
                "cpf": 40,
                "cns": 40,
            }
        },
        "tipo": "json",
        "descricao": "Pesos da pontuação de duplicidade do cadastro único.",
    },
    "cidadao.duplicidade_limiar": {
        "valor": {"valor": 60},
        "tipo": "numero",
        "descricao": "Pontuação mínima para sugerir possível duplicidade.",
    },
}


PRIORIDADES_CONFIGURAVEIS = [
    {
        "codigo": "ELETIVA",
        "rotulo": "Eletiva (configurável)",
        "ordem": 100,
        "prioridade_legal": False,
        "observacoes": (
            "Seed configurável de prioridade clínica. Não representa prioridade "
            "legal e deve ser revisado pelo gestor municipal."
        ),
    },
    {
        "codigo": "PRIORITARIA",
        "rotulo": "Prioritária (configurável)",
        "ordem": 50,
        "prioridade_legal": False,
        "observacoes": (
            "Seed configurável de prioridade clínica. A prioridade legal deve ser "
            "cadastrada pelo tenant com a base normativa municipal/estadual."
        ),
    },
]


async def garantir_prioridades_configuraveis(
    db: AsyncSession, tenant_id: uuid.UUID
) -> None:
    """Seed idempotente de prioridades não legais, marcadas como configuráveis."""
    existentes = {
        codigo
        for (codigo,) in (
            await db.execute(
                select(Prioridade.codigo).where(Prioridade.tenant_id == tenant_id)
            )
        ).all()
    }
    for definicao in PRIORIDADES_CONFIGURAVEIS:
        if definicao["codigo"] in existentes:
            continue
        db.add(
            Prioridade(
                tenant_id=tenant_id,
                codigo=definicao["codigo"],
                rotulo=definicao["rotulo"],
                ordem=definicao["ordem"],
                prioridade_legal=definicao["prioridade_legal"],
                observacoes=definicao["observacoes"],
                vigencia_inicio=date.today(),
                ativo=True,
                versao=1,
            )
        )
    await db.flush()


async def garantir_configuracoes_padrao(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    existentes = {
        chave
        for (chave,) in (
            await db.execute(
                select(ConfiguracaoTenant.chave).where(
                    ConfiguracaoTenant.tenant_id == tenant_id,
                    ConfiguracaoTenant.vigencia_fim.is_(None),
                )
            )
        ).all()
    }
    hoje = date.today()
    for chave, definicao in CONFIGURACOES_PADRAO.items():
        if chave in existentes:
            continue
        db.add(
            ConfiguracaoTenant(
                tenant_id=tenant_id,
                chave=chave,
                valor=definicao["valor"],
                tipo=definicao["tipo"],
                descricao=definicao["descricao"],
                editavel=True,
                versao=1,
                vigencia_inicio=hoje,
            )
        )
    await db.flush()
