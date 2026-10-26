"""Consulta às tabelas nacionais no schema ``referencia``."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.models.referencia import (
    Cbo,
    Ciap2,
    Cid10,
    Cnae,
    Imunobiologico,
    Medicamento,
    MunicipioIBGE,
    SigtapProcedimento,
)

router = APIRouter(prefix="/referencia", tags=["Referência"])


@router.get("/municipios", summary="Municípios IBGE")
async def municipios(
    q: str | None = None,
    uf: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(MunicipioIBGE).order_by(MunicipioIBGE.nome).limit(limite)
    if q:
        consulta = consulta.where(func.lower(MunicipioIBGE.nome).like(f"%{q.lower()}%"))
    if uf:
        consulta = consulta.where(MunicipioIBGE.uf == uf.upper())
    return [
        {"codigo": m.codigo_ibge, "descricao": m.nome, "uf": m.uf}
        for m in (await db.execute(consulta)).scalars()
    ]


@router.get("/cbo", summary="Ocupações CBO")
async def cbo(
    q: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(Cbo).order_by(Cbo.codigo).limit(limite)
    if q:
        termo = f"%{q.lower()}%"
        consulta = consulta.where(
            or_(Cbo.codigo.like(f"%{q}%"), func.lower(Cbo.descricao).like(termo))
        )
    return [
        {"codigo": c.codigo, "descricao": c.descricao}
        for c in (await db.execute(consulta)).scalars()
    ]


@router.get("/cid10", summary="CID-10")
async def cid10(
    q: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(Cid10).order_by(Cid10.codigo).limit(limite)
    if q:
        termo = f"%{q.lower()}%"
        consulta = consulta.where(
            or_(Cid10.codigo.like(f"%{q.upper()}%"), func.lower(Cid10.descricao).like(termo))
        )
    return [
        {"codigo": c.codigo, "descricao": c.descricao}
        for c in (await db.execute(consulta)).scalars()
    ]


@router.get("/ciap2", summary="CIAP-2")
async def ciap2(
    q: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(Ciap2).order_by(Ciap2.codigo).limit(limite)
    if q:
        termo = f"%{q.lower()}%"
        consulta = consulta.where(
            or_(Ciap2.codigo.like(f"%{q.upper()}%"), func.lower(Ciap2.descricao).like(termo))
        )
    return [
        {"codigo": c.codigo, "descricao": c.descricao}
        for c in (await db.execute(consulta)).scalars()
    ]


@router.get("/cnae", summary="CNAE")
async def cnae(
    q: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(Cnae).order_by(Cnae.codigo).limit(limite)
    if q:
        termo = f"%{q.lower()}%"
        consulta = consulta.where(
            or_(Cnae.codigo.like(f"%{q}%"), func.lower(Cnae.descricao).like(termo))
        )
    return [
        {"codigo": c.codigo, "descricao": c.descricao}
        for c in (await db.execute(consulta)).scalars()
    ]


@router.get("/sigtap", summary="Procedimentos SIGTAP por competência")
async def sigtap(
    q: str | None = None,
    competencia: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(SigtapProcedimento).order_by(SigtapProcedimento.codigo).limit(limite)
    if competencia:
        consulta = consulta.where(SigtapProcedimento.competencia == competencia)
    if q:
        termo = f"%{q.lower()}%"
        consulta = consulta.where(
            or_(
                SigtapProcedimento.codigo.like(f"%{q}%"),
                func.lower(SigtapProcedimento.nome).like(termo),
            )
        )
    return [
        {
            "codigo": p.codigo,
            "descricao": p.nome,
            "competencia": p.competencia,
            "complexidade": p.complexidade,
        }
        for p in (await db.execute(consulta)).scalars()
    ]


@router.get("/imunobiologicos", summary="Imunobiológicos do PNI")
async def imunobiologicos(
    q: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(Imunobiologico).order_by(Imunobiologico.nome).limit(limite)
    if q:
        consulta = consulta.where(func.lower(Imunobiologico.nome).like(f"%{q.lower()}%"))
    return [
        {"codigo": i.codigo, "descricao": i.nome, "apresentacao": i.apresentacao}
        for i in (await db.execute(consulta)).scalars()
    ]


@router.get("/medicamentos", summary="Medicamentos OBM/Rename")
async def medicamentos(
    q: str | None = None,
    limite: int = Query(20, ge=1, le=100),
    _usuario: Usuario = Depends(exigir(Permissao.REFERENCIA_LER)),
    db: AsyncSession = Depends(get_db),
):
    consulta = select(Medicamento).order_by(Medicamento.nome).limit(limite)
    if q:
        termo = f"%{q.lower()}%"
        consulta = consulta.where(
            or_(
                func.lower(Medicamento.nome).like(termo),
                func.lower(Medicamento.principio_ativo).like(termo),
            )
        )
    return [
        {
            "codigo": m.codigo_obm,
            "descricao": m.nome,
            "principio_ativo": m.principio_ativo,
            "renome": m.renome,
        }
        for m in (await db.execute(consulta)).scalars()
    ]
