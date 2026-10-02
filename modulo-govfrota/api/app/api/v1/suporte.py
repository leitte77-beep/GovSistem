"""Suporte: chamados que o posto abre no portal do fornecedor.

O posto abre e acompanha os próprios chamados (presos ao posto do token).
A equipe responde pelo painel administrativo (`config.manage`).
"""

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_fornecedor_com_senha_definitiva, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento, filtro_numero, formatar_numero
from app.models.acesso_fornecedor import AcessoFornecedor
from app.models.auditoria import Notificacao
from app.models.auth_models import User
from app.models.chamado_suporte import ChamadoSuporte
from app.models.combustivel import Fornecedor

router = APIRouter(tags=["suporte"])

TIPOS = {"PROBLEMA": "Problema", "CORRECAO": "Pedido de correção", "DUVIDA": "Dúvida", "SUGESTAO": "Sugestão"}


class ChamadoNovo(BaseModel):
    tipo: Literal["PROBLEMA", "CORRECAO", "DUVIDA", "SUGESTAO"]
    assunto: str = Field(min_length=3, max_length=150)
    descricao: str = Field(min_length=10, max_length=5000)
    abastecimento: Optional[str] = Field(default=None, max_length=30)
    contato: Optional[str] = Field(default=None, max_length=150)


class ChamadoResposta(BaseModel):
    status: Literal["ABERTO", "EM_ANDAMENTO", "RESOLVIDO"]
    resposta: Optional[str] = Field(default=None, max_length=5000)


def _protocolo(c: ChamadoSuporte) -> str:
    return f"SUP-{c.created_at.year if c.created_at else datetime.now().year}/{c.numero:05d}"


async def _serializar(db: AsyncSession, itens: list[ChamadoSuporte], com_posto: bool = False) -> list[dict]:
    abast_ids = {c.abastecimento_id for c in itens if c.abastecimento_id}
    numeros: dict = {}
    if abast_ids:
        for a in (await db.execute(select(Abastecimento).where(Abastecimento.id.in_(abast_ids)))).scalars():
            numeros[a.id] = formatar_numero(a.numero_ano, a.numero_seq)
    postos: dict = {}
    if com_posto:
        ids = {c.fornecedor_id for c in itens if c.fornecedor_id}
        if ids:
            for f in (await db.execute(select(Fornecedor).where(Fornecedor.id.in_(ids)))).scalars():
                postos[f.id] = f.nome_fantasia or f.razao_social
    return [
        {
            "id": str(c.id),
            "protocolo": _protocolo(c),
            "tipo": c.tipo,
            "assunto": c.assunto,
            "descricao": c.descricao,
            "abastecimento_id": str(c.abastecimento_id) if c.abastecimento_id else None,
            "abastecimento_numero": numeros.get(c.abastecimento_id),
            "aberto_por": c.aberto_por,
            "contato": c.contato,
            "status": c.status,
            "resposta": c.resposta,
            "respondido_por": c.respondido_por,
            "respondido_em": c.respondido_em.isoformat() if c.respondido_em else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            **({"posto": postos.get(c.fornecedor_id)} if com_posto else {}),
        }
        for c in itens
    ]


# ── Portal do posto ──────────────────────────────────────────────────────────


@router.get("/portal-posto/suporte")
async def listar_do_posto(
    acesso: AcessoFornecedor = Depends(get_fornecedor_com_senha_definitiva), db: AsyncSession = Depends(get_db)
):
    itens = (
        await db.execute(
            select(ChamadoSuporte)
            .where(
                ChamadoSuporte.organization_id == acesso.organization_id,
                ChamadoSuporte.fornecedor_id == acesso.fornecedor_id,
            )
            .order_by(ChamadoSuporte.created_at.desc())
        )
    ).scalars().all()
    return await _serializar(db, list(itens))


@router.post("/portal-posto/suporte", status_code=201)
async def abrir_pelo_posto(
    body: ChamadoNovo,
    acesso: AcessoFornecedor = Depends(get_fornecedor_com_senha_definitiva),
    db: AsyncSession = Depends(get_db),
):
    abast_id = None
    if body.abastecimento and body.abastecimento.strip():
        cond = filtro_numero(body.abastecimento.strip())
        if cond is None:
            raise HTTPException(status_code=422, detail="Nº do abastecimento inválido. Use o formato AB-2026/000123.")
        abast = await db.scalar(
            select(Abastecimento).where(
                cond,
                Abastecimento.organization_id == acesso.organization_id,
                Abastecimento.fornecedor_id == acesso.fornecedor_id,
            ).limit(1)
        )
        if abast is None:
            raise HTTPException(status_code=422, detail="Abastecimento não encontrado no seu posto.")
        abast_id = abast.id

    ultimo = await db.scalar(
        select(sa_func.max(ChamadoSuporte.numero)).where(ChamadoSuporte.organization_id == acesso.organization_id)
    )
    chamado = ChamadoSuporte(
        organization_id=acesso.organization_id,
        fornecedor_id=acesso.fornecedor_id,
        acesso_fornecedor_id=acesso.id,
        numero=(ultimo or 0) + 1,
        tipo=body.tipo,
        assunto=body.assunto.strip(),
        descricao=body.descricao.strip(),
        abastecimento_id=abast_id,
        aberto_por=acesso.nome,
        contato=(body.contato or "").strip() or None,
    )
    db.add(chamado)
    await db.flush()
    posto = await db.get(Fornecedor, acesso.fornecedor_id)
    db.add(
        Notificacao(
            organization_id=acesso.organization_id,
            tipo="SUPORTE_CHAMADO",
            titulo=f"Suporte — {TIPOS[body.tipo]} de {posto.nome_fantasia or posto.razao_social if posto else 'posto'}",
            descricao=chamado.assunto,
            severidade="ALERTA" if body.tipo in ("PROBLEMA", "CORRECAO") else "INFO",
            link=f"/suporte?id={chamado.id}",
        )
    )
    await db.commit()
    await db.refresh(chamado)
    return (await _serializar(db, [chamado]))[0]


# ── Painel administrativo ────────────────────────────────────────────────────


@router.get("/suporte")
async def listar_admin(
    status: Optional[str] = None,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ChamadoSuporte).where(ChamadoSuporte.organization_id == user.organization_id)
    if status:
        stmt = stmt.where(ChamadoSuporte.status == status)
    itens = (await db.execute(stmt.order_by(ChamadoSuporte.created_at.desc()))).scalars().all()
    return await _serializar(db, list(itens), com_posto=True)


@router.post("/suporte/{chamado_id}/responder")
async def responder(
    chamado_id: uuid.UUID,
    body: ChamadoResposta,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    chamado = await db.get(ChamadoSuporte, chamado_id)
    if chamado is None or chamado.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="Chamado não encontrado.")
    chamado.status = body.status
    if body.resposta is not None and body.resposta.strip():
        chamado.resposta = body.resposta.strip()
        chamado.respondido_por = user.name or user.email
        chamado.respondido_em = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(chamado)
    return (await _serializar(db, [chamado], com_posto=True))[0]
