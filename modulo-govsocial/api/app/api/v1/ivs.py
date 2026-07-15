"""API de Indice de Vulnerabilidade Social (Fase 3.6)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.ivs import IvsCalculo, IvsCriterio
from app.models.user import User
from app.services.ivs_engine import calcular_ivs_familia, recalcular_ivs_tenant

router = APIRouter(prefix="/ivs", tags=["ivs"])

_READ = require_roles(RoleName.TECNICO_SUPERIOR.value, RoleName.COORDENADOR_UNIDADE.value, RoleName.GESTOR_MUNICIPAL.value, RoleName.VIGILANCIA.value, RoleName.ADMIN.value)
_MANAGE = require_roles(RoleName.COORDENADOR_UNIDADE.value, RoleName.GESTOR_MUNICIPAL.value, RoleName.ADMIN.value)


@router.get("/family/{family_id}")
async def obter_ivs(family_id: uuid.UUID, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    calc = (await db.execute(
        select(IvsCalculo).where(IvsCalculo.family_id == family_id, IvsCalculo.tenant_id == str(tenant_id)).order_by(IvsCalculo.data_calculo.desc()).limit(1)
    )).scalar_one_or_none()
    if not calc: return {"pontuacao": None, "nivel": None, "calculado": False}
    return {"id": str(calc.id), "pontuacao": calc.pontuacao, "nivel": calc.nivel, "automatico": calc.automatico, "data_calculo": calc.data_calculo.isoformat() if calc.data_calculo else None, "calculado": True}


@router.post("/family/{family_id}/recalcular")
async def recalcular_ivs(family_id: uuid.UUID, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    calc = await calcular_ivs_familia(db, str(family_id), str(tenant_id))
    return {"id": str(calc.id), "pontuacao": calc.pontuacao, "nivel": calc.nivel, "automatico": calc.automatico}


@router.patch("/family/{family_id}")
async def ajustar_ivs_manual(family_id: uuid.UUID, pontuacao: float = Query(...), justificativa: str = Query(...), db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    calc = IvsCalculo(tenant_id=str(tenant_id), family_id=str(family_id), pontuacao=pontuacao,
                      nivel=_classificar(pontuacao), automatico=False, alterado_por_id=str(user.id), justificativa=justificativa)
    db.add(calc); await db.commit(); await db.refresh(calc)
    return {"id": str(calc.id), "pontuacao": calc.pontuacao, "nivel": calc.nivel, "automatico": False}


@router.get("/criterios")
async def listar_criterios(db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    r = await db.execute(select(IvsCriterio).where(IvsCriterio.tenant_id == str(tenant_id)).order_by(IvsCriterio.nome))
    return [{"id": str(c.id), "nome": c.nome, "descricao": c.descricao, "peso": c.peso, "formula": c.formula, "ativo": c.ativo} for c in r.scalars().all()]


@router.post("/criterios")
async def criar_criterio(body: dict, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    c = IvsCriterio(tenant_id=str(tenant_id), nome=body["nome"], descricao=body.get("descricao"), peso=body.get("peso", 1.0), formula=body["formula"])
    db.add(c); await db.commit(); await db.refresh(c)
    return {"id": str(c.id), "nome": c.nome, "peso": c.peso, "formula": c.formula, "ativo": c.ativo}


@router.delete("/criterios/{criterio_id}")
async def excluir_criterio(criterio_id: uuid.UUID, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    c = await db.get(IvsCriterio, criterio_id)
    if not c or c.tenant_id != str(tenant_id): raise HTTPException(404, "Critério não encontrado")
    c.ativo = False; await db.commit()
    return {"ok": True}


def _classificar(pontuacao: float) -> str:
    niveis = [(0.0, "NAO_VULNERAVEL"), (15.0, "MUITO_BAIXA"), (30.0, "BAIXA"), (50.0, "MEDIA"), (70.0, "ALTA"), (85.0, "MUITO_ALTA")]
    for limite, nivel in reversed(niveis):
        if pontuacao >= limite: return nivel
    return "NAO_VULNERAVEL"
