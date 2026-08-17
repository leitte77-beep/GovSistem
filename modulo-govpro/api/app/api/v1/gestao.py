"""Endpoints de gestão (Fase 4): feriados, prazos, sobrestamento, acompanhamento,
indisponibilidade e base de conhecimento.
"""

import uuid
from datetime import date, datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    PAPEIS_ATUANTES,
    PAPEIS_LEITURA,
    get_client_info,
    get_tenant_id,
    require_roles,
)
from app.core.database import get_db
from app.models.dominio import TipoDocumento
from app.models.enums import RoleName
from app.models.user import User
from app.services import (
    acompanhamento,
    base_conhecimento,
    calendario,
    indisponibilidade,
    prazo,
    sobrestamento,
)

router = APIRouter(tags=["gestao"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
TenantDep = Annotated[object, Depends(get_tenant_id)]


# ── Feriados ──────────────────────────────────────────────────────────────────
class FeriadoInput(BaseModel):
    data: date
    nome: str
    escopo: str = "NACIONAL"
    ponto_facultativo: bool = False


@router.get("/feriados")
async def listar_feriados(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
    ano: Optional[int] = Query(default=None),
):
    from sqlalchemy import select

    from app.models.gestao import Feriado

    stmt = select(Feriado).where(Feriado.tenant_id == tenant_id, Feriado.ativo.is_(True))
    if ano is not None:
        stmt = stmt.where(Feriado.data >= date(ano, 1, 1), Feriado.data <= date(ano, 12, 31))
    stmt = stmt.order_by(Feriado.data)
    result = await db.execute(stmt)
    feriados = result.scalars().all()
    return [{"data": f.data.isoformat(), "nome": f.nome, "escopo": f.escopo} for f in feriados]


@router.post("/feriados", status_code=201)
async def criar_feriado(
    payload: FeriadoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    f = await calendario.adicionar_feriado(
        db,
        tenant_id,
        user,
        data=payload.data,
        nome=payload.nome,
        escopo=payload.escopo,
        ponto_facultativo=payload.ponto_facultativo,
        client=get_client_info(request),
    )
    return {"id": str(f.id), "data": f.data.isoformat(), "nome": f.nome}


@router.delete("/feriados/{data}")
async def remover_feriado(
    data: date,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    await calendario.remover_feriado(
        db, tenant_id, user, data=data, client=get_client_info(request)
    )
    return {"removido": data.isoformat()}


# ── Prazos ────────────────────────────────────────────────────────────────────
class PrazoInput(BaseModel):
    tipo: str = "INTERNO"
    titulo: str
    dias: int
    modo: str = "CORRIDOS"
    data_inicio: Optional[date] = None
    unidade_id: Optional[uuid.UUID] = None


class ProrrogarInput(BaseModel):
    novos_dias: int
    motivo: str


@router.post("/processos/{processo_id}/prazos", status_code=201)
async def criar_prazo(
    processo_id,
    payload: PrazoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    p = await prazo.criar_prazo(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        tipo=payload.tipo,
        titulo=payload.titulo,
        dias=payload.dias,
        modo=payload.modo,
        data_inicio=payload.data_inicio,
        unidade_id=payload.unidade_id,
        client=get_client_info(request),
    )
    return {
        "id": str(p.id),
        "data_inicio": p.data_inicio.isoformat(),
        "data_vencimento": p.data_vencimento.isoformat(),
        "dias": p.dias,
    }


@router.post("/prazos/{prazo_id}/prorrogar")
async def prorrogar_prazo(
    prazo_id,
    payload: ProrrogarInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    p = await prazo.prorrogar(
        db,
        tenant_id,
        user,
        prazo_id=prazo_id,
        novos_dias=payload.novos_dias,
        motivo=payload.motivo,
        client=get_client_info(request),
    )
    return {
        "id": str(p.id),
        "data_vencimento": p.data_vencimento.isoformat(),
        "prorrogacoes": p.prorrogacoes,
    }


@router.get("/meus-prazos")
async def meus_prazos(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
    vencidos: bool = Query(default=False),
    dias_a_vencer: Optional[int] = Query(default=None),
):
    prazos = await prazo.listar(
        db, tenant_id, criado_por_user_id=user.id, vencidos=vencidos, dias_a_vencer=dias_a_vencer
    )
    return [
        {
            "id": str(p.id),
            "processo_id": str(p.processo_id),
            "tipo": p.tipo,
            "titulo": p.titulo,
            "data_vencimento": p.data_vencimento.isoformat(),
            "concluido": p.concluido,
        }
        for p in prazos
    ]


@router.get("/prazos-unidade")
async def prazos_unidade(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
    unidade_id: uuid.UUID = Query(...),
    vencidos: bool = Query(default=False),
):
    prazos = await prazo.listar(db, tenant_id, unidade_id=unidade_id, vencidos=vencidos)
    return [
        {
            "id": str(p.id),
            "processo_id": str(p.processo_id),
            "tipo": p.tipo,
            "titulo": p.titulo,
            "data_vencimento": p.data_vencimento.isoformat(),
        }
        for p in prazos
    ]


# ── Sobrestamento ─────────────────────────────────────────────────────────────
class SobrestarInput(BaseModel):
    motivo_texto: str
    motivo_id: Optional[uuid.UUID] = None
    fim_previsto: Optional[datetime] = None
    evento: Optional[str] = None


@router.post("/processos/{processo_id}/sobrestar", status_code=201)
async def sobrestar_processo(
    processo_id,
    payload: SobrestarInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    s = await sobrestamento.sobrestar(
        db,
        tenant_id,
        user,
        processo_id=processo_id,
        motivo_texto=payload.motivo_texto,
        motivo_id=payload.motivo_id,
        fim_previsto=payload.fim_previsto,
        evento=payload.evento,
        client=get_client_info(request),
    )
    return {"id": str(s.id), "processo_id": str(s.processo_id), "ativo": s.ativo}


@router.post("/processos/{processo_id}/reativar")
async def reativar_processo(
    processo_id,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    p = await sobrestamento.reativar(
        db, tenant_id, user, processo_id=processo_id, client=get_client_info(request)
    )
    return {"processo_id": str(p.id), "situacao": p.situacao}


# ── Acompanhamento especial ───────────────────────────────────────────────────
class AcompanharInput(BaseModel):
    processo_id: uuid.UUID
    etiqueta: Optional[str] = None


@router.post("/acompanhamentos", status_code=201)
async def marcar_acompanhamento(
    payload: AcompanharInput,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    a = await acompanhamento.marcar(
        db, tenant_id, user, processo_id=payload.processo_id, etiqueta=payload.etiqueta
    )
    return {"id": str(a.id), "processo_id": str(a.processo_id), "etiqueta": a.etiqueta}


@router.get("/acompanhamentos")
async def listar_acompanhamentos(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    itens = await acompanhamento.listar(db, tenant_id, user.id)
    return [
        {"id": str(a.id), "processo_id": str(a.processo_id), "etiqueta": a.etiqueta} for a in itens
    ]


@router.delete("/acompanhamentos/{processo_id}")
async def desmarcar_acompanhamento(
    processo_id,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    await acompanhamento.desmarcar(db, tenant_id, user, processo_id=processo_id)
    return {"removido": str(processo_id)}


# ── Indisponibilidade ─────────────────────────────────────────────────────────
class IndisponibilidadeInput(BaseModel):
    inicio: datetime
    causa: str
    tipo: str = "INCIDENTE"
    fim: Optional[datetime] = None
    escopo: Optional[str] = None


class EncerrarIndisponibilidadeInput(BaseModel):
    fim: datetime


@router.get("/indisponibilidades")
async def listar_indisponibilidades(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    from app.models.gestao import Indisponibilidade

    result = await db.execute(
        select(Indisponibilidade)
        .where(Indisponibilidade.tenant_id == tenant_id)
        .order_by(Indisponibilidade.inicio.desc())
    )
    return [
        {
            "id": str(i.id),
            "tipo": i.tipo,
            "inicio": i.inicio.isoformat(),
            "fim": i.fim.isoformat() if i.fim else None,
            "escopo": i.escopo,
            "causa": i.causa,
            "encerrada": i.encerrada,
            "certidao_emitida": i.certidao_emitida,
        }
        for i in result.scalars()
    ]


@router.post("/indisponibilidades", status_code=201)
async def registrar_indisponibilidade(
    payload: IndisponibilidadeInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    i = await indisponibilidade.registrar(
        db,
        tenant_id,
        user,
        inicio=payload.inicio,
        causa=payload.causa,
        tipo=payload.tipo,
        fim=payload.fim,
        escopo=payload.escopo,
        client=get_client_info(request),
    )
    return {"id": str(i.id), "encerrada": i.encerrada}


@router.post("/indisponibilidades/{indisponibilidade_id}/encerrar")
async def encerrar_indisponibilidade(
    indisponibilidade_id,
    payload: EncerrarIndisponibilidadeInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    i = await indisponibilidade.encerrar(
        db,
        tenant_id,
        user,
        indisponibilidade_id=indisponibilidade_id,
        fim=payload.fim,
        client=get_client_info(request),
    )
    return {"id": str(i.id), "encerrada": i.encerrada}


@router.get("/indisponibilidades/{indisponibilidade_id}/certidao")
async def certidao_indisponibilidade(
    indisponibilidade_id,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
):
    from app.models.gestao import Indisponibilidade

    item = await db.get(Indisponibilidade, indisponibilidade_id)
    if item is None or item.tenant_id != tenant_id:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Indisponibilidade não encontrada"
        )
    return indisponibilidade.gerar_certidao(item)


# ── Base de conhecimento ──────────────────────────────────────────────────────
class BaseConhecimentoInput(BaseModel):
    tipo_processo_id: Optional[uuid.UUID] = None
    titulo: str
    conteudo: str
    base_legal: Optional[str] = None


@router.post("/bases-conhecimento", status_code=201)
async def criar_base_conhecimento(
    payload: BaseConhecimentoInput,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_ATUANTES)),
):
    b = await base_conhecimento.criar(
        db,
        tenant_id,
        user,
        tipo_processo_id=payload.tipo_processo_id,
        titulo=payload.titulo,
        conteudo=payload.conteudo,
        base_legal=payload.base_legal,
        client=get_client_info(request),
    )
    return {"id": str(b.id), "titulo": b.titulo}


@router.get("/bases-conhecimento")
async def listar_base_conhecimento(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(*PAPEIS_LEITURA)),
    tipo_processo_id: Optional[uuid.UUID] = Query(default=None),
):
    itens = await base_conhecimento.listar(db, tenant_id, tipo_processo_id=tipo_processo_id)
    return [
        {"id": str(b.id), "titulo": b.titulo, "conteudo": b.conteudo, "base_legal": b.base_legal}
        for b in itens
    ]


# ── Matriz de assinatura (Administração → Matriz de Assinaturas) ─────────────
def _matriz_out(t: TipoDocumento) -> dict:
    return {
        "id": str(t.id),
        "codigo": t.codigo,
        "nome": t.nome,
        "nivel_assinatura_minimo": t.nivel_assinatura_minimo,
        "perfis_autorizados": t.perfis_autorizados,
        "qtd_assinaturas_minima": t.qtd_assinaturas_minima,
        "assinatura_sequencial": t.assinatura_sequencial,
        "exige_assinatura_externa": t.exige_assinatura_externa,
        "permite_bloco": t.permite_bloco,
        "fundamento_normativo": t.fundamento_normativo,
    }


class MatrizAssinaturaUpdate(BaseModel):
    nivel_assinatura_minimo: Optional[str] = None
    perfis_autorizados: Optional[list[str]] = None
    qtd_assinaturas_minima: Optional[int] = None
    assinatura_sequencial: Optional[bool] = None
    exige_assinatura_externa: Optional[bool] = None
    permite_bloco: Optional[bool] = None
    fundamento_normativo: Optional[str] = None


@router.get("/matriz-assinaturas")
async def listar_matriz_assinaturas(
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(RoleName.ADMIN.value)),
):
    result = await db.execute(
        select(TipoDocumento)
        .where(TipoDocumento.tenant_id == tenant_id, TipoDocumento.deleted_at.is_(None))
        .order_by(TipoDocumento.nome)
    )
    return [_matriz_out(t) for t in result.scalars()]


@router.patch("/matriz-assinaturas/{tipo_documento_id}")
async def atualizar_matriz_assinatura(
    tipo_documento_id: uuid.UUID,
    payload: MatrizAssinaturaUpdate,
    request: Request,
    db: DbDep,
    tenant_id: TenantDep,
    user: User = Depends(require_roles(RoleName.ADMIN.value)),
):
    tipo = await db.get(TipoDocumento, tipo_documento_id)
    if tipo is None or tipo.tenant_id != tenant_id:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tipo de documento não encontrado",
        )

    antes = _matriz_out(tipo)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(tipo, campo, valor)
    await db.flush()

    from app.services.auditoria import registrar as registrar_auditoria

    await registrar_auditoria(
        db,
        tenant_id=tenant_id,
        action="PARAMETRIZACAO",
        entity="tipo_documento",
        entity_id=str(tipo.id),
        actor_user_id=user.id,
        ip_address=get_client_info(request)["ip_address"],
        user_agent=get_client_info(request)["user_agent"],
        dados_antes=antes,
        dados_depois=_matriz_out(tipo),
    )
    await db.commit()
    await db.refresh(tipo)
    return _matriz_out(tipo)
