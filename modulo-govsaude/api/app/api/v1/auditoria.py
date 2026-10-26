"""Consulta da trilha de auditoria (somente leitura)."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.auditoria import AuditTrail
from app.models.nucleo import Usuario
from app.schemas.auditoria import AuditoriaOut
from app.schemas.comuns import Pagina

router = APIRouter(prefix="/auditoria", tags=["Auditoria"])


def _cursor(valor: str | None) -> tuple[datetime, uuid.UUID] | None:
    if not valor:
        return None
    try:
        dados = json.loads(base64.urlsafe_b64decode(valor.encode()).decode())
        return datetime.fromisoformat(dados["created_at"]), uuid.UUID(dados["id"])
    except Exception:  # noqa: BLE001
        return None


def _codificar(created_at: datetime, id_: uuid.UUID) -> str:
    corpo = json.dumps({"created_at": created_at.isoformat(), "id": str(id_)})
    return base64.urlsafe_b64encode(corpo.encode()).decode()


@router.get("", response_model=Pagina[AuditoriaOut], summary="Listar eventos")
async def listar(
    acao: str | None = None,
    recurso: str | None = None,
    usuario_id: uuid.UUID | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    cursor: str | None = None,
    limite: int = Query(50, ge=1, le=100),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.AUDITORIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    condicoes = [AuditTrail.tenant_id == tenant_id]
    if acao:
        condicoes.append(AuditTrail.acao == acao.upper())
    if recurso:
        condicoes.append(AuditTrail.recurso == recurso)
    if usuario_id:
        condicoes.append(AuditTrail.usuario_id == usuario_id)
    if data_inicio:
        condicoes.append(
            AuditTrail.created_at >= datetime.combine(data_inicio, time.min, tzinfo=timezone.utc)
        )
    if data_fim:
        condicoes.append(
            AuditTrail.created_at <= datetime.combine(data_fim, time.max, tzinfo=timezone.utc)
        )
    total = await db.scalar(select(func.count()).select_from(AuditTrail).where(*condicoes)) or 0
    consulta = (
        select(AuditTrail)
        .where(*condicoes)
        .order_by(AuditTrail.created_at.desc(), AuditTrail.id.desc())
        .limit(limite + 1)
    )
    posicao = _cursor(cursor)
    if posicao:
        consulta = consulta.where(
            tuple_(AuditTrail.created_at, AuditTrail.id) < tuple_(posicao[0], posicao[1])
        )
    registros = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(registros) > limite:
        registros = registros[:limite]
        ultimo = registros[-1]
        proximo = _codificar(ultimo.created_at, ultimo.id)
    return Pagina[AuditoriaOut](
        itens=[AuditoriaOut.model_validate(r) for r in registros],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.get("/{evento_id}", response_model=AuditoriaOut, summary="Detalhar evento")
async def detalhar(
    evento_id: uuid.UUID,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.AUDITORIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    from app.services.auditoria import ler_evento

    evento = await ler_evento(db, tenant_id, evento_id)
    return AuditoriaOut.model_validate(evento)
