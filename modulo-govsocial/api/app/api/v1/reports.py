"""API de Relatorios Customizaveis (Fases 3.17-3.18)."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.relatorio_config import RelatorioConfig
from app.models.user import User
from app.services.report_engine import (
    DICIONARIO_DADOS,
    executar_relatorio,
    exportar_csv,
    exportar_excel,
    exportar_pdf,
    gerar_html,
)

router = APIRouter(prefix="/reports", tags=["reports"])
_MANAGE = require_roles(RoleName.GESTOR_MUNICIPAL.value, RoleName.COORDENADOR_UNIDADE.value, RoleName.ADMIN.value)
_READ = require_roles(RoleName.TECNICO_SUPERIOR.value, RoleName.GESTOR_MUNICIPAL.value, RoleName.COORDENADOR_UNIDADE.value, RoleName.VIGILANCIA.value, RoleName.ADMIN.value)


@router.get("/dictionary")
async def dicionario_dados():
    """Retorna o dicionario de dados disponivel para construcao de relatorios."""
    return [{"tabela": k, "label": v["label"], "campos": [{"campo": ck, "titulo": cv} for ck, cv in v["campos"].items()]} for k, v in DICIONARIO_DADOS.items()]


@router.get("")
async def listar_relatorios(grupo: str | None = Query(None), db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    q = select(RelatorioConfig).where(RelatorioConfig.tenant_id == str(tenant_id), RelatorioConfig.deleted_at.is_(None), RelatorioConfig.ativo == True)
    if grupo: q = q.where(RelatorioConfig.grupo == grupo)
    r = await db.execute(q.order_by(RelatorioConfig.grupo, RelatorioConfig.nome))
    return [_rel_out(c) for c in r.scalars().all()]


@router.post("")
async def criar_relatorio(body: dict, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    c = RelatorioConfig(tenant_id=str(tenant_id), criado_por_id=str(user.id), nome=body["nome"], descricao=body.get("descricao"),
                        tags=body.get("tags"), grupo=body.get("grupo"), icone=body.get("icone"),
                        fonte_dados=body["fonte_dados"], colunas=body["colunas"],
                        filtros=body.get("filtros"), agrupamentos=body.get("agrupamentos"),
                        ordenacao=body.get("ordenacao"), layout=body.get("layout", {"orientacao": "retrato", "tamanho": "A4", "zebrado": True}),
                        permissoes=body.get("permissoes"), compartilhado=body.get("compartilhado", False))
    db.add(c); await db.commit(); await db.refresh(c)
    return _rel_out(c)


@router.get("/{relatorio_id}")
async def obter_relatorio(relatorio_id: uuid.UUID, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    c = await db.get(RelatorioConfig, relatorio_id)
    if not c or c.tenant_id != str(tenant_id): raise HTTPException(404, "Relatorio nao encontrado")
    return _rel_out(c)


@router.patch("/{relatorio_id}")
async def atualizar_relatorio(relatorio_id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    c = await db.get(RelatorioConfig, relatorio_id)
    if not c or c.tenant_id != str(tenant_id): raise HTTPException(404, "Relatorio nao encontrado")
    for k, v in body.items():
        if k in ("nome", "descricao", "tags", "grupo", "icone", "fonte_dados", "colunas", "filtros", "agrupamentos", "ordenacao", "layout", "permissoes", "compartilhado", "ativo"):
            setattr(c, k, v)
    c.updated_at = datetime.now(timezone.utc); await db.commit(); await db.refresh(c)
    return _rel_out(c)


@router.delete("/{relatorio_id}")
async def excluir_relatorio(relatorio_id: uuid.UUID, db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_MANAGE)):
    c = await db.get(RelatorioConfig, relatorio_id)
    if not c or c.tenant_id != str(tenant_id): raise HTTPException(404, "Relatorio nao encontrado")
    c.deleted_at = datetime.now(timezone.utc); await db.commit()
    return {"ok": True}


@router.post("/{relatorio_id}/execute")
async def executar_relatorio_endpoint(relatorio_id: uuid.UUID, body: dict | None = None, formato: str = Query("json", regex="^(json|csv|pdf|html|excel)$"), db: AsyncSession = Depends(get_db), tenant_id: uuid.UUID = Depends(get_tenant_id), user: User = Depends(_READ)):
    c = await db.get(RelatorioConfig, relatorio_id)
    if not c or c.tenant_id != str(tenant_id): raise HTTPException(404, "Relatorio nao encontrado")
    config = _rel_out(c)
    config["fonte_dados"] = c.fonte_dados
    config["colunas"] = c.colunas
    config["filtros"] = c.filtros
    config["agrupamentos"] = c.agrupamentos
    config["ordenacao"] = c.ordenacao
    config["layout"] = c.layout

    try:
        dados = await executar_relatorio(db, config, body or {})
        if c.agrupamentos:
            from app.services.report_engine import agrupar_dados
            dados = agrupar_dados(dados, c.agrupamentos)

        if formato == "csv":
            return Response(content=exportar_csv(dados, c.colunas), media_type="text/csv",
                            headers={"Content-Disposition": f"attachment; filename={c.nome}.csv"})
        elif formato == "pdf":
            pdf_bytes = exportar_pdf(dados, c.colunas, config, c.nome)
            return Response(content=pdf_bytes, media_type="application/pdf",
                            headers={"Content-Disposition": f"attachment; filename={c.nome}.pdf"})
        elif formato == "excel":
            xls_bytes = exportar_excel(dados, c.colunas, c.nome)
            return Response(content=xls_bytes,
                            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            headers={"Content-Disposition": f"attachment; filename={c.nome}.xlsx"})
        elif formato == "html":
            html = gerar_html(dados, c.colunas, config, c.nome)
            return Response(content=html, media_type="text/html")
        else:
            return {"dados": dados, "colunas": c.colunas, "total": len(dados), "nome": c.nome}
    except Exception as e:
        raise HTTPException(500, f"Erro ao executar relatorio: {str(e)}")


def _rel_out(c: RelatorioConfig) -> dict:
    return {"id": str(c.id), "nome": c.nome, "descricao": c.descricao, "tags": c.tags,
            "grupo": c.grupo, "icone": c.icone, "fonte_dados": c.fonte_dados,
            "colunas": c.colunas, "filtros": c.filtros, "agrupamentos": c.agrupamentos,
            "ordenacao": c.ordenacao, "layout": c.layout, "compartilhado": c.compartilhado,
            "ativo": c.ativo, "criado_por_id": str(c.criado_por_id) if c.criado_por_id else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None}
