"""Endpoints de catálogo para preencher os formulários da área interna: tipos
de processo/documento, unidades, hipóteses legais, plano de classificação e
motivos de sobrestamento.

Os dados são semeados por `seed_dominio` no `sync-organization`; aqui expomos
leitura filtrada por tenant para todos os papéis e CRUD (Administração →
Catálogos) restrito a `ADMIN`, com trilha de auditoria (`PARAMETRIZACAO`).
"""

import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import PAPEIS_LEITURA, get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.core.sanitize import sanitize_html
from app.core.slug import slugify_codigo
from app.models.dominio import (
    HipoteseLegal,
    ModeloDocumento,
    PlanoClassificacao,
    TextoPadrao,
    TipoDocumento,
    TipoProcesso,
)
from app.models.enums import RoleName
from app.models.gestao import SobrestamentoMotivo
from app.models.unidade import Unidade
from app.models.user import User
from app.services.auditoria import registrar as registrar_auditoria
from app.services.render import construir_contexto_processo, render_conteudo

router = APIRouter(prefix="/dominio", tags=["dominio"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]
AdminDep = Annotated[User, Depends(require_roles(RoleName.ADMIN.value))]


async def _get_ou_404(db: AsyncSession, model, id_: uuid.UUID, tenant_id, nome_entidade: str):
    obj = await db.get(model, id_)
    if obj is None or obj.tenant_id != tenant_id or obj.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{nome_entidade} não encontrado(a)"
        )
    return obj


async def _referencia_valida(db: AsyncSession, model, id_: Optional[uuid.UUID], tenant_id) -> None:
    """Fail-closed: uma FK de catálogo só pode apontar para registro do mesmo tenant."""
    if id_ is None:
        return
    obj = await db.get(model, id_)
    if obj is None or obj.tenant_id != tenant_id or obj.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Referência inválida"
        )


async def _registrar(
    db: AsyncSession, request: Request, tenant_id, user: User, *, entity: str, entity_id: str,
    antes: Optional[dict], depois: Optional[dict],
) -> None:
    client = get_client_info(request)
    await registrar_auditoria(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity=entity,
        entity_id=entity_id,
        actor_user_id=user.id,
        ip_address=client["ip_address"],
        user_agent=client["user_agent"],
        dados_antes=antes,
        dados_depois=depois,
    )


async def _add_unico(db: AsyncSession, obj, campo: str) -> None:
    """Insere já detectando violação de unicidade (tenant_id + campo natural).

    A checagem de unicidade dispara no INSERT (flush), não no COMMIT — por
    isso o objeto precisa ser adicionado e "flushado" aqui dentro do try.
    """
    db.add(obj)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe um registro com este {campo} neste órgão",
        )


async def _codigo_unico(db: AsyncSession, model, tenant_id, base: str) -> str:
    """Devolve ``base`` ou ``base_2``, ``base_3``… até achar um código livre no tenant."""
    codigo = base
    sufixo = 2
    while True:
        result = await db.execute(
            select(model.id).where(model.tenant_id == tenant_id, model.codigo == codigo)
        )
        if result.first() is None:
            return codigo
        codigo = f"{base}_{sufixo}"
        sufixo += 1


async def _resolver_codigo(
    db: AsyncSession, model, tenant_id, codigo_fornecido: Optional[str], texto: str
) -> str:
    """Código informado prevalece (colisão vira 409); senão, gera slug único.

    Mantém compatibilidade: seeds e testes que passam código explícito seguem
    funcionando e continuam disparando 409 em duplicidade. Só a ausência de
    código ativa a geração automática.
    """
    if codigo_fornecido and codigo_fornecido.strip():
        return codigo_fornecido.strip()
    return await _codigo_unico(db, model, tenant_id, slugify_codigo(texto))


# ── Tipos de processo ────────────────────────────────────────────────────────
def _tipo_processo_out(t: TipoProcesso) -> dict:
    return {
        "id": str(t.id),
        "codigo": t.codigo,
        "nome": t.nome,
        "descricao": t.descricao,
        "publico_externo": t.publico_externo,
        "niveis_permitidos": t.niveis_permitidos,
        "prazo_legal_dias": t.prazo_legal_dias,
        "base_legal": t.base_legal,
        "unidade_destino_padrao_id": str(t.unidade_destino_padrao_id)
        if t.unidade_destino_padrao_id
        else None,
        "ativo": t.ativo,
    }


class TipoProcessoInput(BaseModel):
    codigo: Optional[str] = None
    nome: str
    descricao: Optional[str] = None
    publico_externo: bool = False
    niveis_permitidos: list[str] = ["PUBLICO"]
    prazo_legal_dias: Optional[int] = None
    base_legal: Optional[str] = None
    unidade_destino_padrao_id: Optional[uuid.UUID] = None


class TipoProcessoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    publico_externo: Optional[bool] = None
    niveis_permitidos: Optional[list[str]] = None
    prazo_legal_dias: Optional[int] = None
    base_legal: Optional[str] = None
    unidade_destino_padrao_id: Optional[uuid.UUID] = None
    ativo: Optional[bool] = None


@router.get("/tipos-processo")
async def tipos_processo(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(TipoProcesso)
        .where(TipoProcesso.tenant_id == tenant_id, TipoProcesso.deleted_at.is_(None))
        .order_by(TipoProcesso.nome)
    )
    return [_tipo_processo_out(t) for t in result.scalars()]


@router.post("/tipos-processo", status_code=201)
async def criar_tipo_processo(
    payload: TipoProcessoInput, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    await _referencia_valida(db, Unidade, payload.unidade_destino_padrao_id, tenant_id)
    dados = payload.model_dump()
    dados["codigo"] = await _resolver_codigo(
        db, TipoProcesso, tenant_id, payload.codigo, payload.nome
    )
    tipo = TipoProcesso(tenant_id=tenant_id, **dados)
    await _add_unico(db, tipo, "código")
    await _registrar(
        db, request, tenant_id, user,
        entity="tipo_processo", entity_id=str(tipo.id), antes=None, depois=_tipo_processo_out(tipo),
    )
    await db.commit()
    await db.refresh(tipo)
    return _tipo_processo_out(tipo)


@router.patch("/tipos-processo/{tipo_id}")
async def atualizar_tipo_processo(
    tipo_id: uuid.UUID, payload: TipoProcessoUpdate, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    tipo = await _get_ou_404(db, TipoProcesso, tipo_id, tenant_id, "Tipo de processo")
    if payload.unidade_destino_padrao_id is not None:
        await _referencia_valida(db, Unidade, payload.unidade_destino_padrao_id, tenant_id)
    antes = _tipo_processo_out(tipo)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(tipo, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="tipo_processo",
        entity_id=str(tipo.id),
        antes=antes,
        depois=_tipo_processo_out(tipo),
    )
    await db.commit()
    await db.refresh(tipo)
    return _tipo_processo_out(tipo)


@router.delete("/tipos-processo/{tipo_id}", status_code=204)
async def remover_tipo_processo(
    tipo_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    tipo = await _get_ou_404(db, TipoProcesso, tipo_id, tenant_id, "Tipo de processo")
    antes = _tipo_processo_out(tipo)
    tipo.deleted_at = datetime.now(timezone.utc)
    tipo.ativo = False
    await _registrar(
        db, request, tenant_id, user,
        entity="tipo_processo", entity_id=str(tipo.id), antes=antes, depois=None,
    )
    await db.commit()


# ── Tipos de documento ───────────────────────────────────────────────────────
def _tipo_documento_out(t: TipoDocumento) -> dict:
    return {
        "id": str(t.id),
        "codigo": t.codigo,
        "nome": t.nome,
        "nivel_assinatura_minimo": t.nivel_assinatura_minimo,
        "numeracao": t.numeracao,
        "perfis_autorizados": t.perfis_autorizados,
        "qtd_assinaturas_minima": t.qtd_assinaturas_minima,
        "assinatura_sequencial": t.assinatura_sequencial,
        "exige_assinatura_externa": t.exige_assinatura_externa,
        "permite_bloco": t.permite_bloco,
        "fundamento_normativo": t.fundamento_normativo,
        "ativo": t.ativo,
    }


class TipoDocumentoInput(BaseModel):
    codigo: Optional[str] = None
    nome: str
    nivel_assinatura_minimo: str = "SIMPLES"
    numeracao: bool = False


class TipoDocumentoUpdate(BaseModel):
    nome: Optional[str] = None
    nivel_assinatura_minimo: Optional[str] = None
    numeracao: Optional[bool] = None
    ativo: Optional[bool] = None


@router.get("/tipos-documento")
async def tipos_documento(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(TipoDocumento)
        .where(TipoDocumento.tenant_id == tenant_id, TipoDocumento.deleted_at.is_(None))
        .order_by(TipoDocumento.nome)
    )
    return [_tipo_documento_out(t) for t in result.scalars()]


@router.post("/tipos-documento", status_code=201)
async def criar_tipo_documento(
    payload: TipoDocumentoInput, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    dados = payload.model_dump()
    dados["codigo"] = await _resolver_codigo(
        db, TipoDocumento, tenant_id, payload.codigo, payload.nome
    )
    tipo = TipoDocumento(tenant_id=tenant_id, **dados)
    await _add_unico(db, tipo, "código")
    await _registrar(
        db, request, tenant_id, user,
        entity="tipo_documento",
        entity_id=str(tipo.id),
        antes=None,
        depois=_tipo_documento_out(tipo),
    )
    await db.commit()
    await db.refresh(tipo)
    return _tipo_documento_out(tipo)


@router.patch("/tipos-documento/{tipo_id}")
async def atualizar_tipo_documento(
    tipo_id: uuid.UUID, payload: TipoDocumentoUpdate, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    tipo = await _get_ou_404(db, TipoDocumento, tipo_id, tenant_id, "Tipo de documento")
    antes = _tipo_documento_out(tipo)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(tipo, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="tipo_documento",
        entity_id=str(tipo.id),
        antes=antes,
        depois=_tipo_documento_out(tipo),
    )
    await db.commit()
    await db.refresh(tipo)
    return _tipo_documento_out(tipo)


@router.delete("/tipos-documento/{tipo_id}", status_code=204)
async def remover_tipo_documento(
    tipo_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    tipo = await _get_ou_404(db, TipoDocumento, tipo_id, tenant_id, "Tipo de documento")
    antes = _tipo_documento_out(tipo)
    tipo.deleted_at = datetime.now(timezone.utc)
    tipo.ativo = False
    await _registrar(
        db, request, tenant_id, user,
        entity="tipo_documento", entity_id=str(tipo.id), antes=antes, depois=None,
    )
    await db.commit()


# ── Unidades ──────────────────────────────────────────────────────────────────
def _unidade_out(u: Unidade) -> dict:
    return {
        "id": str(u.id),
        "sigla": u.sigla,
        "nome": u.nome,
        "unidade_pai_id": str(u.unidade_pai_id) if u.unidade_pai_id else None,
        "email": u.email,
        "protocolizadora": u.protocolizadora,
        "codigo_protocolizadora": u.codigo_protocolizadora,
        "ativa": u.ativa,
    }


class UnidadeInput(BaseModel):
    sigla: str
    nome: str
    unidade_pai_id: Optional[uuid.UUID] = None
    email: Optional[str] = None
    protocolizadora: bool = False
    codigo_protocolizadora: Optional[str] = None


class UnidadeUpdate(BaseModel):
    nome: Optional[str] = None
    unidade_pai_id: Optional[uuid.UUID] = None
    email: Optional[str] = None
    protocolizadora: Optional[bool] = None
    codigo_protocolizadora: Optional[str] = None
    ativa: Optional[bool] = None


@router.get("/unidades")
async def unidades(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(Unidade)
        .where(Unidade.tenant_id == tenant_id, Unidade.deleted_at.is_(None))
        .order_by(Unidade.nome)
    )
    return [_unidade_out(u) for u in result.scalars()]


@router.post("/unidades", status_code=201)
async def criar_unidade(
    payload: UnidadeInput, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    if payload.unidade_pai_id is not None:
        await _referencia_valida(db, Unidade, payload.unidade_pai_id, tenant_id)
    unidade = Unidade(tenant_id=tenant_id, **payload.model_dump())
    await _add_unico(db, unidade, "sigla")
    await _registrar(
        db, request, tenant_id, user,
        entity="unidade", entity_id=str(unidade.id), antes=None, depois=_unidade_out(unidade),
    )
    await db.commit()
    await db.refresh(unidade)
    return _unidade_out(unidade)


@router.patch("/unidades/{unidade_id}")
async def atualizar_unidade(
    unidade_id: uuid.UUID, payload: UnidadeUpdate, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    unidade = await _get_ou_404(db, Unidade, unidade_id, tenant_id, "Unidade")
    if payload.unidade_pai_id is not None:
        if payload.unidade_pai_id == unidade_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Uma unidade não pode ser subordinada a si mesma",
            )
        await _referencia_valida(db, Unidade, payload.unidade_pai_id, tenant_id)
    antes = _unidade_out(unidade)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(unidade, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="unidade", entity_id=str(unidade.id), antes=antes, depois=_unidade_out(unidade),
    )
    await db.commit()
    await db.refresh(unidade)
    return _unidade_out(unidade)


@router.delete("/unidades/{unidade_id}", status_code=204)
async def remover_unidade(
    unidade_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    unidade = await _get_ou_404(db, Unidade, unidade_id, tenant_id, "Unidade")
    antes = _unidade_out(unidade)
    unidade.deleted_at = datetime.now(timezone.utc)
    unidade.ativa = False
    await _registrar(
        db, request, tenant_id, user,
        entity="unidade", entity_id=str(unidade.id), antes=antes, depois=None,
    )
    await db.commit()


# ── Hipóteses legais ─────────────────────────────────────────────────────────
def _hipotese_out(h: HipoteseLegal) -> dict:
    return {
        "id": str(h.id),
        "codigo": h.codigo,
        "descricao": h.descricao,
        "base_legal": h.base_legal,
        "grau_sigilo": h.grau_sigilo,
        "prazo_sigilo_anos": h.prazo_sigilo_anos,
        "ativo": h.ativo,
    }


class HipoteseLegalInput(BaseModel):
    codigo: Optional[str] = None
    descricao: str
    base_legal: Optional[str] = None
    grau_sigilo: Optional[str] = None
    prazo_sigilo_anos: Optional[int] = None


class HipoteseLegalUpdate(BaseModel):
    descricao: Optional[str] = None
    base_legal: Optional[str] = None
    grau_sigilo: Optional[str] = None
    prazo_sigilo_anos: Optional[int] = None
    ativo: Optional[bool] = None


@router.get("/hipoteses-legais")
async def hipoteses_legais(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(HipoteseLegal)
        .where(HipoteseLegal.tenant_id == tenant_id, HipoteseLegal.deleted_at.is_(None))
        .order_by(HipoteseLegal.descricao)
    )
    return [_hipotese_out(h) for h in result.scalars()]


@router.post("/hipoteses-legais", status_code=201)
async def criar_hipotese_legal(
    payload: HipoteseLegalInput, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    dados = payload.model_dump()
    dados["codigo"] = await _resolver_codigo(
        db, HipoteseLegal, tenant_id, payload.codigo, payload.descricao
    )
    hipotese = HipoteseLegal(tenant_id=tenant_id, **dados)
    await _add_unico(db, hipotese, "código")
    await _registrar(
        db, request, tenant_id, user,
        entity="hipotese_legal",
        entity_id=str(hipotese.id),
        antes=None,
        depois=_hipotese_out(hipotese),
    )
    await db.commit()
    await db.refresh(hipotese)
    return _hipotese_out(hipotese)


@router.patch("/hipoteses-legais/{hipotese_id}")
async def atualizar_hipotese_legal(
    hipotese_id: uuid.UUID, payload: HipoteseLegalUpdate, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    hipotese = await _get_ou_404(db, HipoteseLegal, hipotese_id, tenant_id, "Hipótese legal")
    antes = _hipotese_out(hipotese)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(hipotese, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="hipotese_legal",
        entity_id=str(hipotese.id),
        antes=antes,
        depois=_hipotese_out(hipotese),
    )
    await db.commit()
    await db.refresh(hipotese)
    return _hipotese_out(hipotese)


@router.delete("/hipoteses-legais/{hipotese_id}", status_code=204)
async def remover_hipotese_legal(
    hipotese_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    hipotese = await _get_ou_404(db, HipoteseLegal, hipotese_id, tenant_id, "Hipótese legal")
    antes = _hipotese_out(hipotese)
    hipotese.deleted_at = datetime.now(timezone.utc)
    hipotese.ativo = False
    await _registrar(
        db, request, tenant_id, user,
        entity="hipotese_legal", entity_id=str(hipotese.id), antes=antes, depois=None,
    )
    await db.commit()


# ── Plano de classificação ───────────────────────────────────────────────────
def _classe_out(c: PlanoClassificacao) -> dict:
    return {
        "id": str(c.id),
        "codigo": c.codigo,
        "descricao": c.descricao,
        "classe_pai_id": str(c.classe_pai_id) if c.classe_pai_id else None,
        "ativo": c.ativo,
    }


class PlanoClassificacaoInput(BaseModel):
    codigo: str
    descricao: str
    classe_pai_id: Optional[uuid.UUID] = None


class PlanoClassificacaoUpdate(BaseModel):
    descricao: Optional[str] = None
    classe_pai_id: Optional[uuid.UUID] = None
    ativo: Optional[bool] = None


@router.get("/plano-classificacao")
async def plano_classificacao(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(PlanoClassificacao)
        .where(PlanoClassificacao.tenant_id == tenant_id, PlanoClassificacao.deleted_at.is_(None))
        .order_by(PlanoClassificacao.codigo)
    )
    return [_classe_out(c) for c in result.scalars()]


@router.post("/plano-classificacao", status_code=201)
async def criar_classe(
    payload: PlanoClassificacaoInput, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    if payload.classe_pai_id is not None:
        await _referencia_valida(db, PlanoClassificacao, payload.classe_pai_id, tenant_id)
    classe = PlanoClassificacao(tenant_id=tenant_id, **payload.model_dump())
    await _add_unico(db, classe, "código")
    await _registrar(
        db, request, tenant_id, user,
        entity="plano_classificacao",
        entity_id=str(classe.id),
        antes=None,
        depois=_classe_out(classe),
    )
    await db.commit()
    await db.refresh(classe)
    return _classe_out(classe)


@router.patch("/plano-classificacao/{classe_id}")
async def atualizar_classe(
    classe_id: uuid.UUID, payload: PlanoClassificacaoUpdate, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    classe = await _get_ou_404(db, PlanoClassificacao, classe_id, tenant_id, "Classe")
    if payload.classe_pai_id is not None:
        if payload.classe_pai_id == classe_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Uma classe não pode ser subordinada a si mesma",
            )
        await _referencia_valida(db, PlanoClassificacao, payload.classe_pai_id, tenant_id)
    antes = _classe_out(classe)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(classe, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="plano_classificacao",
        entity_id=str(classe.id),
        antes=antes,
        depois=_classe_out(classe),
    )
    await db.commit()
    await db.refresh(classe)
    return _classe_out(classe)


@router.delete("/plano-classificacao/{classe_id}", status_code=204)
async def remover_classe(
    classe_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    classe = await _get_ou_404(db, PlanoClassificacao, classe_id, tenant_id, "Classe")
    antes = _classe_out(classe)
    classe.deleted_at = datetime.now(timezone.utc)
    classe.ativo = False
    await _registrar(
        db, request, tenant_id, user,
        entity="plano_classificacao", entity_id=str(classe.id), antes=antes, depois=None,
    )
    await db.commit()


# ── Motivos de sobrestamento ─────────────────────────────────────────────────
def _motivo_out(m: SobrestamentoMotivo) -> dict:
    return {"id": str(m.id), "nome": m.nome, "descricao": m.descricao, "ativo": m.ativo}


class MotivoSobrestamentoInput(BaseModel):
    nome: str
    descricao: Optional[str] = None


class MotivoSobrestamentoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None


@router.get("/motivos-sobrestamento")
async def motivos_sobrestamento(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(SobrestamentoMotivo)
        .where(SobrestamentoMotivo.tenant_id == tenant_id, SobrestamentoMotivo.deleted_at.is_(None))
        .order_by(SobrestamentoMotivo.nome)
    )
    return [_motivo_out(m) for m in result.scalars()]


@router.post("/motivos-sobrestamento", status_code=201)
async def criar_motivo_sobrestamento(
    payload: MotivoSobrestamentoInput, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    motivo = SobrestamentoMotivo(tenant_id=tenant_id, **payload.model_dump())
    db.add(motivo)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="motivo_sobrestamento",
        entity_id=str(motivo.id),
        antes=None,
        depois=_motivo_out(motivo),
    )
    await db.commit()
    await db.refresh(motivo)
    return _motivo_out(motivo)


@router.patch("/motivos-sobrestamento/{motivo_id}")
async def atualizar_motivo_sobrestamento(
    motivo_id: uuid.UUID, payload: MotivoSobrestamentoUpdate, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    motivo = await _get_ou_404(
        db, SobrestamentoMotivo, motivo_id, tenant_id, "Motivo de sobrestamento"
    )
    antes = _motivo_out(motivo)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(motivo, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="motivo_sobrestamento",
        entity_id=str(motivo.id),
        antes=antes,
        depois=_motivo_out(motivo),
    )
    await db.commit()
    await db.refresh(motivo)
    return _motivo_out(motivo)


@router.delete("/motivos-sobrestamento/{motivo_id}", status_code=204)
async def remover_motivo_sobrestamento(
    motivo_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    motivo = await _get_ou_404(
        db, SobrestamentoMotivo, motivo_id, tenant_id, "Motivo de sobrestamento"
    )
    antes = _motivo_out(motivo)
    motivo.deleted_at = datetime.now(timezone.utc)
    motivo.ativo = False
    await _registrar(
        db, request, tenant_id, user,
        entity="motivo_sobrestamento", entity_id=str(motivo.id), antes=antes, depois=None,
    )
    await db.commit()


# ── Modelos de documento ─────────────────────────────────────────────────────
def _modelo_out(m: ModeloDocumento) -> dict:
    return {
        "id": str(m.id),
        "nome": m.nome,
        "tipo_documento_id": str(m.tipo_documento_id) if m.tipo_documento_id else None,
        "conteudo_html": m.conteudo_html,
        "ativo": m.ativo,
    }


class ModeloDocumentoInput(BaseModel):
    nome: str
    tipo_documento_id: Optional[uuid.UUID] = None
    conteudo_html: Optional[str] = None


class ModeloDocumentoUpdateInput(BaseModel):
    nome: Optional[str] = None
    tipo_documento_id: Optional[uuid.UUID] = None
    conteudo_html: Optional[str] = None
    ativo: Optional[bool] = None


@router.get("/modelos-documento")
async def modelos_documento(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(ModeloDocumento)
        .where(ModeloDocumento.tenant_id == tenant_id, ModeloDocumento.deleted_at.is_(None))
        .order_by(ModeloDocumento.nome)
    )
    return [_modelo_out(m) for m in result.scalars()]


@router.post("/modelos-documento", status_code=201)
async def criar_modelo_documento(
    payload: ModeloDocumentoInput, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    if payload.tipo_documento_id is not None:
        await _referencia_valida(db, TipoDocumento, payload.tipo_documento_id, tenant_id)
    modelo = ModeloDocumento(
        tenant_id=tenant_id,
        nome=payload.nome.strip(),
        tipo_documento_id=payload.tipo_documento_id,
        conteudo_html=payload.conteudo_html,
    )
    db.add(modelo)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="modelo_documento", entity_id=str(modelo.id), antes=None, depois=_modelo_out(modelo),
    )
    await db.commit()
    await db.refresh(modelo)
    return _modelo_out(modelo)


@router.patch("/modelos-documento/{modelo_id}")
async def atualizar_modelo_documento(
    modelo_id: uuid.UUID, payload: ModeloDocumentoUpdateInput, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    modelo = await _get_ou_404(db, ModeloDocumento, modelo_id, tenant_id, "Modelo de documento")
    if payload.tipo_documento_id is not None:
        await _referencia_valida(db, TipoDocumento, payload.tipo_documento_id, tenant_id)
    antes = _modelo_out(modelo)
    dados = payload.model_dump(exclude_unset=True)
    if "nome" in dados and dados["nome"]:
        dados["nome"] = dados["nome"].strip()
    for campo, valor in dados.items():
        setattr(modelo, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="modelo_documento", entity_id=str(modelo.id), antes=antes,
        depois=_modelo_out(modelo),
    )
    await db.commit()
    await db.refresh(modelo)
    return _modelo_out(modelo)


@router.delete("/modelos-documento/{modelo_id}", status_code=204)
async def remover_modelo_documento(
    modelo_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    modelo = await _get_ou_404(db, ModeloDocumento, modelo_id, tenant_id, "Modelo de documento")
    antes = _modelo_out(modelo)
    modelo.deleted_at = datetime.now(timezone.utc)
    modelo.ativo = False
    await _registrar(
        db, request, tenant_id, user,
        entity="modelo_documento", entity_id=str(modelo.id), antes=antes, depois=None,
    )
    await db.commit()


@router.get("/modelos-documento/{modelo_id}/render")
async def renderizar_modelo(
    modelo_id: uuid.UUID,
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    """Devolve o modelo preenchido com o contexto do processo (para prefill no editor)."""
    modelo = await _get_ou_404(db, ModeloDocumento, modelo_id, tenant_id, "Modelo de documento")
    contexto = await construir_contexto_processo(db, tenant_id, processo_id)
    return {"conteudo_html": sanitize_html(render_conteudo(modelo.conteudo_html, contexto))}


# ── Textos padrão ────────────────────────────────────────────────────────────
def _texto_padrao_out(t: TextoPadrao) -> dict:
    return {"id": str(t.id), "nome": t.nome, "conteudo": t.conteudo, "ativo": t.ativo}


class TextoPadraoInput(BaseModel):
    nome: str
    conteudo: Optional[str] = None


class TextoPadraoUpdateInput(BaseModel):
    nome: Optional[str] = None
    conteudo: Optional[str] = None
    ativo: Optional[bool] = None


@router.get("/textos-padrao")
async def textos_padrao(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    result = await db.execute(
        select(TextoPadrao)
        .where(TextoPadrao.tenant_id == tenant_id, TextoPadrao.deleted_at.is_(None))
        .order_by(TextoPadrao.nome)
    )
    return [_texto_padrao_out(t) for t in result.scalars()]


@router.post("/textos-padrao", status_code=201)
async def criar_texto_padrao(
    payload: TextoPadraoInput, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    texto = TextoPadrao(tenant_id=tenant_id, nome=payload.nome.strip(), conteudo=payload.conteudo)
    db.add(texto)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="texto_padrao", entity_id=str(texto.id), antes=None, depois=_texto_padrao_out(texto),
    )
    await db.commit()
    await db.refresh(texto)
    return _texto_padrao_out(texto)


@router.patch("/textos-padrao/{texto_id}")
async def atualizar_texto_padrao(
    texto_id: uuid.UUID, payload: TextoPadraoUpdateInput, request: Request,
    db: DbDep, tenant_id: TenantDep, user: AdminDep,
):
    texto = await _get_ou_404(db, TextoPadrao, texto_id, tenant_id, "Texto padrão")
    antes = _texto_padrao_out(texto)
    dados = payload.model_dump(exclude_unset=True)
    if "nome" in dados and dados["nome"]:
        dados["nome"] = dados["nome"].strip()
    for campo, valor in dados.items():
        setattr(texto, campo, valor)
    await db.flush()
    await _registrar(
        db, request, tenant_id, user,
        entity="texto_padrao", entity_id=str(texto.id), antes=antes,
        depois=_texto_padrao_out(texto),
    )
    await db.commit()
    await db.refresh(texto)
    return _texto_padrao_out(texto)


@router.delete("/textos-padrao/{texto_id}", status_code=204)
async def remover_texto_padrao(
    texto_id: uuid.UUID, request: Request, db: DbDep, tenant_id: TenantDep, user: AdminDep
):
    texto = await _get_ou_404(db, TextoPadrao, texto_id, tenant_id, "Texto padrão")
    antes = _texto_padrao_out(texto)
    texto.deleted_at = datetime.now(timezone.utc)
    texto.ativo = False
    await _registrar(
        db, request, tenant_id, user,
        entity="texto_padrao", entity_id=str(texto.id), antes=antes, depois=None,
    )
    await db.commit()


@router.get("/textos-padrao/{texto_id}/render")
async def renderizar_texto_padrao(
    texto_id: uuid.UUID,
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    texto = await _get_ou_404(db, TextoPadrao, texto_id, tenant_id, "Texto padrão")
    contexto = await construir_contexto_processo(db, tenant_id, processo_id)
    return {"conteudo": sanitize_html(render_conteudo(texto.conteudo, contexto))}


@router.get("/tipos-documento/{tipo_id}/modelo-padrao")
async def modelo_padrao_tipo(
    tipo_id: uuid.UUID,
    processo_id: uuid.UUID,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    """Prefill do modelo padrão associado ao tipo de documento (se houver)."""
    tipo = await _get_ou_404(db, TipoDocumento, tipo_id, tenant_id, "Tipo de documento")
    if tipo.modelo_padrao_id is None:
        return {"conteudo_html": "", "encontrado": False}
    modelo = await db.get(ModeloDocumento, tipo.modelo_padrao_id)
    if modelo is None or modelo.tenant_id != tenant_id or modelo.deleted_at is not None:
        return {"conteudo_html": "", "encontrado": False}
    contexto = await construir_contexto_processo(db, tenant_id, processo_id)
    return {
        "conteudo_html": sanitize_html(render_conteudo(modelo.conteudo_html, contexto)),
        "encontrado": True,
    }
