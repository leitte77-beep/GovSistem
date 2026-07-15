"""Generic admin CRUD for domain lookup tables (Fase 3.4).

Provides a generic, permission-controlled CRUD for all domain/lookup tables
using dictionary dispatch. Supported entities are registered in DOMAIN_REGISTRY.
"""

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/admin/cadastros", tags=["admin-cadastros"])

DOMAIN_META: dict[str, dict[str, Any]] = {
    "tipos-atividade-coletiva": {"table": "tipos_atividade_coletiva", "label": "Tipos de Atividade Coletiva"},
    "vulnerabilidade-tipos": {"table": "vulnerabilidade_tipos", "label": "Tipos de Vulnerabilidade", "extra": ["nivel"]},
    "graus-instrucao": {"table": "graus_instrucao", "label": "Graus de Instrução"},
    "pontos-embarque": {"table": "pontos_embarque", "label": "Pontos de Embarque", "extra": ["endereco"]},
    "cartorios": {"table": "cartorios", "label": "Cartórios", "extra": ["nome", "telefone", "titular", "substituto", "endereco"]},
    "orientacoes-sexuais": {"table": "orientacoes_sexuais", "label": "Orientações Sexuais"},
    "motivos-reinsercao": {"table": "motivos_reinsercao", "label": "Motivos de Reinserção"},
    "motivos-cancelamento": {"table": "motivos_cancelamento", "label": "Motivos de Cancelamento"},
    "programas-sociais": {"table": "programas_sociais", "label": "Programas Sociais", "extra": ["tipo"]},
    "equipes-atendimento": {"table": "equipes_atendimento", "label": "Equipes de Atendimento", "extra": ["unidade_id"]},
    "objetivos-encaminhamento": {"table": "objetivos_encaminhamento", "label": "Objetivos de Encaminhamento", "extra": ["tipo"]},
    "procedimentos-realizados": {"table": "procedimentos_realizados", "label": "Procedimentos Realizados"},
    "atos-infracionais": {"table": "atos_infracionais", "label": "Atos Infracionais", "extra": ["artigo"]},
    "potencialidades": {"table": "potencialidades", "label": "Potencialidades"},
    "necessidades-especiais": {"table": "necessidades_especiais", "label": "Necessidades Especiais", "extra": ["tipo"]},
    "cargos": {"table": "cargos", "label": "Cargos"},
    "parcerias": {"table": "parcerias", "label": "Parcerias"},
    "instituicoes": {"table": "instituicoes", "label": "Instituições"},
    "motivos-inativacao-programa": {"table": "motivos_inativacao_programa", "label": "Motivos de Inativação de Programas"},
    "motivos-encerramento-acolhimento": {"table": "motivos_encerramento_acolhimento", "label": "Motivos de Encerramento do Acolhimento"},
    "origens-encaminhamento": {"table": "origens_encaminhamento", "label": "Origens dos Encaminhamentos"},
    "estrategias-atendimento": {"table": "estrategias_atendimento", "label": "Estratégias de Atendimento", "extra": ["tipo"]},
    "grupos-insumos": {"table": "grupos_insumos", "label": "Grupos de Insumos", "extra": ["grupo_pai_id"]},
    "especialidades": {"table": "especialidades", "label": "Especialidades", "extra": ["cbo", "area_social"]},
    "pessoas-juridicas": {"table": "pessoas_juridicas", "label": "Pessoas Jurídicas", "extra": ["razao_social", "nome_fantasia", "cnpj", "email", "telefone", "endereco"]},
    "regimes-contratacao": {"table": "regimes_contratacao", "label": "Regimes de Contratação", "extra": ["tipo"]},
    "motivos-acolhimento": {"table": "motivos_acolhimento", "label": "Motivos de Acolhimento"},
    "religioes": {"table": "religioes", "label": "Religiões"},
    "bairros": {"table": "bairros_dominio", "label": "Bairros", "extra": ["localizacao", "municipio"]},
    "logradouros": {"table": "logradouros_dominio", "label": "Logradouros", "extra": ["tipo", "nome", "municipio"]},
    "estados-civis": {"table": "estados_civis", "label": "Estados Civis"},
    "orgaos-emissores": {"table": "orgaos_emissores", "label": "Órgãos Emissores"},
    "motivos-inativacao": {"table": "motivos_inativacao", "label": "Motivos de Inativação"},
    "parentescos": {"table": "parentescos_dominio", "label": "Relações de Parentesco", "extra": ["consanguineo"]},
    "unidades-medida": {"table": "unidades_medida", "label": "Unidades de Medida", "extra": ["sigla", "permite_fracionado"]},
    "escolaridades": {"table": "escolaridades_dominio", "label": "Escolaridades"},
    "feriados": {"table": "feriados", "label": "Feriados", "extra": ["data"]},
}


def _resolve(entidade: str) -> dict[str, Any]:
    meta = DOMAIN_META.get(entidade)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Entidade desconhecida: {entidade}")
    return meta


def _row_to_dict(row, meta: dict) -> dict:
    result = {}
    for key in row._mapping.keys():
        val = row._mapping[key]
        if isinstance(val, datetime):
            val = val.isoformat()
        elif isinstance(val, UUID):
            val = str(val)
        result[key] = val
    return result


@router.get("/{entidade}")
async def list_domain(entidade: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    meta = _resolve(entidade)
    result = await db.execute(sa_text(
        f"SELECT * FROM {meta['table']} WHERE tenant_id = :tid AND deleted_at IS NULL AND ativo = TRUE ORDER BY descricao"
    ), {"tid": str(user.organization_id)})
    return [_row_to_dict(row, meta) for row in result.mappings().all()]


@router.get("/catalogo")
async def catalogo_domains(user: User = Depends(get_current_user)):
    return [{"slug": k, "label": v["label"], "table": v["table"]} for k, v in DOMAIN_META.items()]


@router.post("/{entidade}")
async def create_domain(entidade: str, body: dict, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    meta = _resolve(entidade)
    cols = ["tenant_id", "descricao"]
    vals = {"tid": str(user.organization_id), "desc": body.get("descricao", "")}
    extras = meta.get("extra", [])
    for ext in extras:
        if ext in body:
            cols.append(ext)
            vals[ext] = body[ext]
    col_str = ", ".join(cols)
    val_str = ", ".join(f":{k}" for k in vals.keys())
    query = sa_text(f"INSERT INTO {meta['table']} ({col_str}) VALUES ({val_str}) RETURNING *")
    result = await db.execute(query, vals)
    await db.commit()
    row = result.mappings().first()
    return _row_to_dict(row, meta)


@router.patch("/{entidade}/{item_id}")
async def update_domain(entidade: str, item_id: UUID, body: dict, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    meta = _resolve(entidade)
    allowed = {"descricao", "ativo", *(meta.get("extra") or [])}
    sets = []
    vals = {"id": str(item_id), "tid": str(user.organization_id)}
    for key, value in body.items():
        if key in allowed:
            sets.append(f"{key} = :val_{key}")
            vals[f"val_{key}"] = value
    if not sets:
        raise HTTPException(status_code=400, detail="Nenhum campo válido para atualização")
    sets.append("updated_at = now()")
    query = sa_text(
        f"UPDATE {meta['table']} SET {', '.join(sets)} WHERE id = :id AND tenant_id = :tid AND deleted_at IS NULL RETURNING *"
    )
    result = await db.execute(query, vals)
    await db.commit()
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    return _row_to_dict(row, meta)


@router.delete("/{entidade}/{item_id}")
async def delete_domain(entidade: str, item_id: UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    meta = _resolve(entidade)
    result = await db.execute(sa_text(
        f"UPDATE {meta['table']} SET deleted_at = now(), updated_at = now() WHERE id = :id AND tenant_id = :tid AND deleted_at IS NULL RETURNING id"
    ), {"id": str(item_id), "tid": str(user.organization_id)})
    await db.commit()
    if not result.first():
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    return {"ok": True}
