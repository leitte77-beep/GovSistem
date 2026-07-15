"""API de Teleatendimento WebRTC (Fase 3.14)."""

import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.teleatendimento import Teleatendimento
from app.models.user import User

router = APIRouter(prefix="/teleatendimento", tags=["teleatendimento"])
_MANAGE = require_roles(RoleName.TECNICO_SUPERIOR.value, RoleName.COORDENADOR_UNIDADE.value, RoleName.GESTOR_MUNICIPAL.value, RoleName.ADMIN.value)
_READ = require_roles(RoleName.TECNICO_SUPERIOR.value, RoleName.COORDENADOR_UNIDADE.value, RoleName.GESTOR_MUNICIPAL.value, RoleName.RECEPCAO.value, RoleName.ADMIN.value)

PUBLIC_BASE = "/atendimento"


@router.post("/rooms")
async def criar_sala(unit_id: uuid.UUID, person_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    sala_id = secrets.token_urlsafe(16)
    codigo = str(secrets.randbelow(900000) + 100000)
    link = f"{PUBLIC_BASE}/{sala_id}"
    t = Teleatendimento(tenant_id=str(tenant_id), unit_id=str(unit_id), profissional_id=str(user.id), person_id=str(person_id) if person_id else None, sala_id=sala_id, codigo_acesso=codigo, link=link, registrado_por_id=str(user.id))
    db.add(t); await db.commit(); await db.refresh(t)
    return {"id": str(t.id), "sala_id": t.sala_id, "codigo_acesso": t.codigo_acesso, "link": t.link, "status": t.status}


@router.get("/rooms")
async def listar_salas(status: str | None = Query(None), db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    q = select(Teleatendimento).where(Teleatendimento.tenant_id == str(tenant_id))
    if status: q = q.where(Teleatendimento.status == status)
    r = await db.execute(q.order_by(Teleatendimento.created_at.desc()).limit(50))
    return [{"id": str(t.id), "sala_id": t.sala_id, "codigo_acesso": t.codigo_acesso, "link": t.link, "status": t.status, "profissional_id": str(t.profissional_id) if t.profissional_id else None, "person_id": str(t.person_id) if t.person_id else None, "created_at": t.created_at.isoformat() if t.created_at else None} for t in r.scalars().all()]


@router.patch("/rooms/{sala_id}/encerrar")
async def encerrar_sala(sala_id: str, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    t = (await db.execute(select(Teleatendimento).where(Teleatendimento.sala_id == sala_id, Teleatendimento.tenant_id == str(tenant_id)))).scalar_one_or_none()
    if not t: raise HTTPException(404, "Sala nao encontrada")
    t.status = "CONCLUIDO"; await db.commit()
    return {"ok": True, "sala_id": sala_id}


@router.post("/rooms/{sala_id}/entrar")
async def entrar_sala(sala_id: str, codigo: str = Query(...), aceite_termo: bool = Query(False), db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id)):
    t = (await db.execute(select(Teleatendimento).where(Teleatendimento.sala_id == sala_id))).scalar_one_or_none()
    if not t or t.codigo_acesso != codigo: raise HTTPException(403, "Codigo de acesso invalido")
    if t.status != "AGUARDANDO": raise HTTPException(400, "Sala nao esta mais disponivel")
    if aceite_termo:
        t.aceite_termo = True
    t.status = "EM_ANDAMENTO"; await db.commit()
    return {"ok": True, "sala_id": sala_id, "status": t.status}
