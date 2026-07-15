"""Autenticador de documentos com QR Code e validacao publica."""
import csv
import io
import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.autenticador import DocumentoAutenticavel, ExportacaoExecucao, ExportadorDado
from app.models.enums import RoleName
from app.models.user import User

from pydantic import BaseModel

router = APIRouter(tags=["autenticador"])

_MANAGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_ADMIN_ONLY = require_roles(RoleName.ADMIN.value)


# ─── AUTENTICADOR ─────────────────────────────────────

class EmitirDocumentoPayload(BaseModel):
    tipo: str
    entidade_origem: str
    entidade_id: str
    dados_snapshot: dict


class DocumentoOut(BaseModel):
    id: uuid.UUID
    tipo: str
    qrcode_uuid: str
    data_emissao: str
    url_validacao: str


@router.post("/documentos/emitir", response_model=DocumentoOut)
async def emitir_documento(
    payload: EmitirDocumentoPayload,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    qrcode_uuid = str(uuid.uuid4())
    doc = DocumentoAutenticavel(
        tenant_id=tenant_id,
        tipo=payload.tipo,
        entidade_origem=payload.entidade_origem,
        entidade_id=payload.entidade_id,
        dados_snapshot=payload.dados_snapshot,
        qrcode_uuid=qrcode_uuid,
        data_emissao=date.today(),
        emitido_por_id=user.id,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "tipo": doc.tipo,
        "qrcode_uuid": qrcode_uuid,
        "data_emissao": str(doc.data_emissao),
        "url_validacao": f"/api/govsocial/v1/publico/validar/{qrcode_uuid}",
    }


@router.get("/publico/validar/{qrcode_uuid}")
async def validar_documento(
    qrcode_uuid: str,
    db: AsyncSession = Depends(get_db),
):
    """Endpoint publico para validacao de documento por QR Code."""
    doc = (
        await db.execute(
            select(DocumentoAutenticavel).where(
                DocumentoAutenticavel.qrcode_uuid == qrcode_uuid,
            )
        )
    ).scalar_one_or_none()

    if not doc:
        raise HTTPException(status_code=404, detail="Documento nao encontrado")

    return {
        "autentico": True,
        "tipo": doc.tipo,
        "data_emissao": str(doc.data_emissao),
        "dados": doc.dados_snapshot,
        "emitido_em": str(doc.created_at),
    }


# ─── EXPORTADOR DE DADOS ──────────────────────────────

class ExportadorCreate(BaseModel):
    nome: str
    descricao: str | None = None
    query_sql: str
    parametros: list[dict] | None = None
    ativo: bool = True
    global_: bool = False


class ExportadorOut(BaseModel):
    id: uuid.UUID
    nome: str
    descricao: str | None
    parametros: dict | None
    ativo: bool
    global_: bool


@router.get("/data-exports", response_model=list[ExportadorOut])
async def listar_exportadores(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN_ONLY),
):
    return (
        await db.execute(
            select(ExportadorDado).where(
                (ExportadorDado.tenant_id == tenant_id) | (ExportadorDado.global_ == True),
                ExportadorDado.ativo == True,
            )
        )
    ).scalars().all()


@router.post("/data-exports", response_model=ExportadorOut)
async def criar_exportador(
    payload: ExportadorCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN_ONLY),
):
    if not payload.query_sql.strip().upper().startswith("SELECT"):
        raise HTTPException(status_code=422, detail="Apenas consultas SELECT sao permitidas")

    exp = ExportadorDado(
        tenant_id=tenant_id,
        nome=payload.nome,
        descricao=payload.descricao,
        query_sql=payload.query_sql,
        parametros=payload.parametros,
        ativo=payload.ativo,
        global_=payload.global_,
    )
    db.add(exp)
    await db.commit()
    await db.refresh(exp)
    return exp


@router.delete("/data-exports/{exp_id}", status_code=204)
async def deletar_exportador(
    exp_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN_ONLY),
):
    exp = (
        await db.execute(
            select(ExportadorDado).where(
                ExportadorDado.id == exp_id,
                ExportadorDado.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not exp:
        raise HTTPException(status_code=404)
    exp.ativo = False
    await db.commit()


@router.post("/data-exports/{exp_id}/execute")
async def executar_exportador(
    exp_id: uuid.UUID,
    parametros: dict = {},
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_ADMIN_ONLY),
):
    exp = (
        await db.execute(
            select(ExportadorDado).where(
                ExportadorDado.id == exp_id,
                (ExportadorDado.tenant_id == tenant_id) | (ExportadorDado.global_ == True),
                ExportadorDado.ativo == True,
            )
        )
    ).scalar_one_or_none()

    if not exp:
        raise HTTPException(status_code=404, detail="Exportador nao encontrado")

    execucao = ExportacaoExecucao(
        exportador_id=exp.id,
        tenant_id=tenant_id,
        executado_por_id=user.id,
        parametros_usados=parametros,
    )
    db.add(execucao)
    await db.flush()

    try:
        sql = exp.query_sql
        params = {}
        for chave, valor in parametros.items():
            params[chave] = valor

        result = await db.execute(text(sql), {**params, "tenant_id": str(tenant_id)})
        rows = result.fetchall()
        colunas = list(result.keys())

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(colunas)
        for row in rows:
            writer.writerow(row)

        execucao.status = "CONCLUIDO"
        execucao.total_linhas = len(rows)
        await db.commit()

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={exp.nome}.csv"},
        )
    except Exception as e:
        execucao.status = "ERRO"
        execucao.erro = str(e)
        await db.commit()
        raise HTTPException(status_code=500, detail=str(e))


# ─── UNIFICAÇÃO DE BAIRROS/LOGRADOUROS ───────────────

class UnificarPayload(BaseModel):
    origem: str
    destino: str


@router.post("/admin/unificar-bairros")
async def unificar_bairros(
    payload: UnificarPayload,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    from app.models.family import Family

    result = await db.execute(
        select(Family.id).where(
            Family.tenant_id == tenant_id,
            Family.bairro == payload.origem,
        )
    )
    ids = [r[0] for r in result.fetchall()]

    for fid in ids:
        await db.execute(
            text("UPDATE families SET bairro = :destino WHERE id = :fid AND tenant_id = :tid"),
            {"destino": payload.destino, "fid": fid, "tid": tenant_id},
        )

    await db.commit()
    return {"afetados": len(ids), "origem": payload.origem, "destino": payload.destino}


@router.post("/admin/unificar-logradouros")
async def unificar_logradouros(
    payload: UnificarPayload,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    result = await db.execute(
        text("UPDATE families SET logradouro = :destino WHERE logradouro = :origem AND tenant_id = :tid"),
        {"destino": payload.destino, "origem": payload.origem, "tid": tenant_id},
    )
    await db.commit()
    return {"origem": payload.origem, "destino": payload.destino}
