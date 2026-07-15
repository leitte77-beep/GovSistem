"""APIs de Notificacoes Intersetoriais, Revelacao Espontanea e Acompanhamento Rede de Protecao (Fases 3.19-3.21)."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.rede_protecao import AcompanhamentoRedeProtecao, NotificacaoIntersetorial, RevelacaoEspontanea
from app.models.user import User

router = APIRouter(tags=["rede-protecao"])
_READ = require_roles(RoleName.TECNICO_SUPERIOR.value, RoleName.COORDENADOR_UNIDADE.value, RoleName.GESTOR_MUNICIPAL.value, RoleName.ADMIN.value)
_MANAGE = require_roles(RoleName.TECNICO_SUPERIOR.value, RoleName.COORDENADOR_UNIDADE.value, RoleName.GESTOR_MUNICIPAL.value, RoleName.ADMIN.value)


# ── Notificações Intersetoriais ──

@router.get("/notificacoes-intersetoriais")
async def listar_notificacoes(person_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    q = select(NotificacaoIntersetorial).where(NotificacaoIntersetorial.tenant_id == str(tenant_id), NotificacaoIntersetorial.deleted_at.is_(None))
    if person_id: q = q.where(NotificacaoIntersetorial.person_id == person_id)
    r = await db.execute(q.order_by(NotificacaoIntersetorial.created_at.desc()))
    return [_ni_out(n) for n in r.scalars().all()]


@router.post("/notificacoes-intersetoriais")
async def criar_notificacao(body: dict, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    n = NotificacaoIntersetorial(tenant_id=str(tenant_id), registrado_por_id=str(user.id), **{k: v for k, v in body.items() if k in ("attendance_id","person_id","family_id","descricao_caso","acoes_realizadas","area_origem","area_destino","sensivel","especialidades_permitidas","unidades_permitidas")})
    db.add(n); await db.commit(); await db.refresh(n)
    return _ni_out(n)


# ── Revelação Espontânea ──

@router.get("/revelacoes-espontaneas")
async def listar_revelacoes(person_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    q = select(RevelacaoEspontanea).where(RevelacaoEspontanea.tenant_id == str(tenant_id))
    if person_id: q = q.where(RevelacaoEspontanea.vitima_id == person_id)
    r = await db.execute(q.order_by(RevelacaoEspontanea.data_hora.desc()))
    return [_re_out(x) for x in r.scalars().all()]


@router.post("/revelacoes-espontaneas")
async def criar_revelacao(body: dict, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    r = RevelacaoEspontanea(tenant_id=str(tenant_id), registrado_por_id=str(user.id), data_hora=datetime.now(timezone.utc),
                            unit_id=body["unit_id"], vitima_id=body.get("vitima_id"), vitima_nome=body.get("vitima_nome"),
                            matriculada_ensino=body.get("matriculada_ensino", False),
                            suposto_indicador_violencia=body.get("suposto_indicador_violencia"),
                            vinculo_suposto_autor=body.get("vinculo_suposto_autor"),
                            encaminhamentos=body.get("encaminhamentos"), observacoes=body.get("observacoes"))
    db.add(r); await db.commit(); await db.refresh(r)
    return _re_out(r)


# ── Acompanhamento Rede de Proteção ──

@router.get("/acompanhamentos-rede")
async def listar_acompanhamentos(person_id: uuid.UUID | None = None, family_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    q = select(AcompanhamentoRedeProtecao).where(AcompanhamentoRedeProtecao.tenant_id == str(tenant_id), AcompanhamentoRedeProtecao.deleted_at.is_(None))
    if person_id: q = q.where(AcompanhamentoRedeProtecao.person_id == person_id)
    if family_id: q = q.where(AcompanhamentoRedeProtecao.family_id == family_id)
    r = await db.execute(q.order_by(AcompanhamentoRedeProtecao.data_inicio.desc()))
    return [_ac_out(a) for a in r.scalars().all()]


@router.post("/acompanhamentos-rede")
async def criar_acompanhamento(body: dict, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    a = AcompanhamentoRedeProtecao(tenant_id=str(tenant_id), registrado_por_id=str(user.id),
                                   person_id=body.get("person_id"), family_id=body.get("family_id"),
                                   data_inicio=datetime.now(timezone.utc), motivo=body.get("motivo"),
                                   observacoes=body.get("observacoes"))
    db.add(a); await db.commit(); await db.refresh(a)
    return _ac_out(a)


@router.patch("/acompanhamentos-rede/{id}/encerrar")
async def encerrar_acompanhamento(id: uuid.UUID, motivo: str = Query(...), db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    a = await db.get(AcompanhamentoRedeProtecao, id)
    if not a or a.tenant_id != str(tenant_id): raise HTTPException(404, "Acompanhamento não encontrado")
    a.data_fim = datetime.now(timezone.utc); a.ativo = False; a.motivo = a.motivo or motivo
    await db.commit()
    return _ac_out(a)


def _ni_out(n: NotificacaoIntersetorial) -> dict:
    return {"id": str(n.id), "attendance_id": str(n.attendance_id) if n.attendance_id else None,
            "person_id": str(n.person_id) if n.person_id else None, "descricao_caso": n.descricao_caso,
            "area_origem": n.area_origem, "area_destino": n.area_destino, "sensivel": n.sensivel,
            "created_at": n.created_at.isoformat() if n.created_at else None}

def _re_out(r: RevelacaoEspontanea) -> dict:
    return {"id": str(r.id), "vitima_id": str(r.vitima_id) if r.vitima_id else None,
            "vitima_nome": r.vitima_nome, "vinculo_suposto_autor": r.vinculo_suposto_autor,
            "encaminhamentos": r.encaminhamentos, "data_hora": r.data_hora.isoformat() if r.data_hora else None}

def _ac_out(a: AcompanhamentoRedeProtecao) -> dict:
    return {"id": str(a.id), "person_id": str(a.person_id) if a.person_id else None,
            "family_id": str(a.family_id) if a.family_id else None,
            "data_inicio": a.data_inicio.isoformat() if a.data_inicio else None,
            "data_fim": a.data_fim.isoformat() if a.data_fim else None, "motivo": a.motivo, "ativo": a.ativo}
