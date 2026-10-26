"""Anexos clínicos (B.12-054, B.6-029, B.3-012).

Validação por lista branca, magic number, tamanho e antivírus (porta ClamAV);
autoria, data e classificação; unidade e sigilo herdados do atendimento.
Cross-tenant, fora do escopo ou sigilo não permitido → 404. Leitura do
conteúdo é auditada (``DOWNLOAD``); a listagem vela o que não pode ser visto.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.antivirus import validar_anexo
from app.core.autorizacao import escopo_permite, pode_ver_conteudo, tem_permissao
from app.core.errors import Conflict, NotFound, PermissionDenied
from app.core.permissoes import Permissao
from app.core.security import hash_bytes
from app.core.storage import Storage, get_storage
from app.models.anexo import AnexoClinico
from app.models.cidadao import Cidadao
from app.models.nucleo import Usuario
from app.models.odontologia import OdontoAtendimento
from app.models.prontuario import Atendimento
from app.services.auditoria import registrar

PERMISSOES = {
    "CIDADAO": (Permissao.PRONTUARIO_LER, Permissao.PRONTUARIO_EDITAR),
    "PRONTUARIO": (Permissao.PRONTUARIO_LER, Permissao.PRONTUARIO_EDITAR),
    "ODONTOLOGIA": (Permissao.ODONTOLOGIA_LER, Permissao.ODONTOLOGIA_GERENCIAR),
}
EXTENSOES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/zip": "xlsx",
}


def _pode(ator: Usuario, anexo: AnexoClinico, permissao: Permissao) -> bool:
    return (
        tem_permissao(ator, permissao)
        and escopo_permite(ator, permissao, estabelecimento_id=anexo.estabelecimento_id)
        and pode_ver_conteudo(ator, anexo.nivel_sigilo, especialidade_id=anexo.especialidade_id)
    )


async def _contexto(db, tenant_id, cidadao_id, contexto, contexto_id) -> dict:
    """Unidade e sigilo vêm do atendimento; o anexo nunca fica menos restrito que ele."""
    if contexto == "CIDADAO":
        return {"estabelecimento_id": None, "nivel_sigilo": "NORMAL", "especialidade_id": None}
    modelo = Atendimento if contexto == "PRONTUARIO" else OdontoAtendimento
    item = await db.scalar(
        select(modelo).where(modelo.id == contexto_id, modelo.tenant_id == tenant_id)
    )
    if item is None or item.cidadao_id != cidadao_id:
        raise NotFound("Atendimento não encontrado para o cidadão.")
    nivel = getattr(item, "nivel_sigilo", None) or "NORMAL"
    if nivel == "NORMAL" and getattr(item, "sigiloso", False):
        nivel = "SIGILOSO"
    return {
        "estabelecimento_id": item.estabelecimento_id,
        "nivel_sigilo": nivel,
        "especialidade_id": getattr(item, "especialidade_id", None),
    }


async def anexar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    cidadao_id: uuid.UUID,
    contexto: str,
    contexto_id: uuid.UUID | None,
    classificacao: str,
    descricao: str | None,
    sigiloso: bool,
    nome_arquivo: str,
    conteudo: bytes,
    mime_declarado: str | None,
    ator: Usuario,
    cliente: dict,
) -> AnexoClinico:
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id)
    ):
        raise NotFound("Cidadão não encontrado.")
    if contexto != "CIDADAO" and contexto_id is None:
        raise NotFound("Informe o atendimento do anexo.")
    escrita = PERMISSOES[contexto][1]
    if not tem_permissao(ator, escrita):
        raise PermissionDenied(f"Anexar neste contexto exige {escrita.value}.")
    origem = await _contexto(db, tenant_id, cidadao_id, contexto, contexto_id)
    if origem["estabelecimento_id"] and not escopo_permite(
        ator, escrita, estabelecimento_id=origem["estabelecimento_id"]
    ):
        raise NotFound("Atendimento não encontrado para o cidadão.")
    if sigiloso and origem["nivel_sigilo"] == "NORMAL":
        origem["nivel_sigilo"] = "SIGILOSO"
    validado = validar_anexo(nome_arquivo, conteudo, mime_declarado)
    chave = Storage.chave_opaca(tenant_id, EXTENSOES.get(validado.mime))
    await get_storage().put(chave, conteudo, validado.mime)
    item = AnexoClinico(
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        contexto=contexto,
        contexto_id=contexto_id,
        classificacao=classificacao,
        descricao=descricao,
        nome_arquivo=nome_arquivo[-200:],
        mime=validado.mime,
        tamanho_bytes=validado.tamanho,
        hash_sha256=hash_bytes(conteudo),
        chave_objeto=chave,
        status_antivirus=validado.status_antivirus,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
        **origem,
    )
    db.add(item)
    await db.flush()
    await registrar(
        db,
        acao="CRIAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="anexo_clinico",
        recurso_id=item.id,
        dados_depois={"classificacao": classificacao, "contexto": contexto, "mime": item.mime},
        cliente=cliente,
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> list[dict]:
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id)
    ):
        raise NotFound("Cidadão não encontrado.")
    linhas = (
        await db.scalars(
            select(AnexoClinico)
            .where(
                AnexoClinico.tenant_id == tenant_id,
                AnexoClinico.cidadao_id == cidadao_id,
                AnexoClinico.baixa_em.is_(None),
            )
            .order_by(AnexoClinico.created_at.desc())
        )
    ).all()
    saida = []
    for a in linhas:
        leitura = PERMISSOES[a.contexto][0]
        if not tem_permissao(ator, leitura) or not escopo_permite(
            ator, leitura, estabelecimento_id=a.estabelecimento_id
        ):
            continue
        base = {
            "id": a.id,
            "contexto": a.contexto,
            "data": a.created_at,
            "estabelecimento_id": a.estabelecimento_id,
            "nivel_sigilo": a.nivel_sigilo,
        }
        if pode_ver_conteudo(ator, a.nivel_sigilo, especialidade_id=a.especialidade_id):
            base.update(
                contexto_id=a.contexto_id,
                classificacao=a.classificacao,
                descricao=a.descricao,
                nome_arquivo=a.nome_arquivo,
                mime=a.mime,
                tamanho_bytes=a.tamanho_bytes,
                autor_id=a.criado_por_id,
                velado=False,
            )
        else:
            base["velado"] = True
        saida.append(base)
    await registrar(
        db,
        acao="READ_SENSIVEL",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="anexo_clinico",
        recurso_id=cidadao_id,
        finalidade="lista_anexos",
        cliente=cliente,
    )
    await db.commit()
    return saida


async def _um(db, tenant_id, anexo_id, ator, escrita: bool) -> AnexoClinico:
    item = await db.scalar(
        select(AnexoClinico).where(AnexoClinico.id == anexo_id, AnexoClinico.tenant_id == tenant_id)
    )
    if item is None or item.baixa_em is not None:
        raise NotFound("Anexo não encontrado.")
    if not _pode(ator, item, PERMISSOES[item.contexto][1 if escrita else 0]):
        raise NotFound("Anexo não encontrado.")
    return item


async def conteudo(db, tenant_id, anexo_id, ator, cliente) -> tuple[bytes, AnexoClinico]:
    item = await _um(db, tenant_id, anexo_id, ator, escrita=False)
    dados = await get_storage().get(item.chave_objeto)
    await registrar(
        db,
        acao="DOWNLOAD",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="anexo_clinico",
        recurso_id=item.id,
        finalidade="visualizacao_anexo",
        cliente=cliente,
    )
    await db.commit()
    return dados, item


async def baixar(db, tenant_id, anexo_id, motivo: str, ator, cliente) -> AnexoClinico:
    item = await _um(db, tenant_id, anexo_id, ator, escrita=True)
    if item.baixa_em is not None:
        raise Conflict("Anexo já baixado.", code="ja_baixado")
    item.baixa_em = datetime.now(timezone.utc)
    item.baixa_motivo = motivo
    item.baixa_por_id = ator.id
    await registrar(
        db,
        acao="BAIXAR",
        usuario=ator,
        tenant_id=tenant_id,
        recurso="anexo_clinico",
        recurso_id=item.id,
        justificativa=motivo,
        cliente=cliente,
    )
    await db.commit()
    await db.refresh(item)
    return item
