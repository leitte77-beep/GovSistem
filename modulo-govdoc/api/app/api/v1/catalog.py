"""Categorias, campos personalizados, etiquetas, políticas de retenção e filtros."""

import re
import unicodedata
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_institution
from app.core.auth import get_current_user, require_profiles
from app.core.database import get_db
from app.core.errors import Conflict, NotFound
from app.models.document import Document
from app.models.enums import Classification, DocumentStatus, FieldType, Profile
from app.models.governance import RetentionPolicy
from app.models.organization import Institution
from app.models.taxonomy import Category, CategoryField, DocumentTag, SavedFilter, Tag
from app.models.user import User
from app.schemas.admin import RetentionPolicyIn
from app.schemas.common import Message
from app.schemas.content import CategoryCreate, CategoryOut, TagOut

router = APIRouter(tags=["Catálogo"])

admin_or_secretariat = require_profiles(Profile.ADMIN_GERAL, Profile.ADMIN_SECRETARIA)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")[:80]


def _category_out(category: Category, total: int = 0) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        nome=category.name,
        slug=category.slug,
        descricao=category.description,
        cor=category.color,
        icone=category.icon,
        retencao_dias=category.default_retention_days,
        exige_vencimento=category.requires_expiry,
        ativo=category.is_active,
        campos=[
            {
                "id": str(campo.id),
                "chave": campo.key,
                "rotulo": campo.label,
                "tipo": campo.field_type,
                "obrigatorio": campo.required,
                "opcoes": campo.options,
                "ajuda": campo.help_text,
                "posicao": campo.position,
            }
            for campo in sorted(category.fields, key=lambda c: c.position)
        ],
        total_documentos=total,
    )


@router.get("/categorias", response_model=List[CategoryOut], summary="Listar categorias")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    from sqlalchemy.orm import selectinload

    categories = (
        await db.scalars(
            select(Category)
            .where(
                Category.institution_id == institution.id, Category.deleted_at.is_(None)
            )
            .options(selectinload(Category.fields))
            .order_by(Category.name)
        )
    ).all()
    resultado = []
    for category in categories:
        total = int(
            await db.scalar(
                select(func.count(Document.id)).where(
                    Document.category_id == category.id, Document.deleted_at.is_(None)
                )
            )
            or 0
        )
        resultado.append(_category_out(category, total))
    return resultado


@router.post(
    "/categorias", response_model=CategoryOut, status_code=201, summary="Criar categoria"
)
async def create_category(
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    slug = slugify(payload.nome)
    if await db.scalar(
        select(Category.id).where(
            Category.institution_id == institution.id,
            Category.slug == slug,
            Category.deleted_at.is_(None),
        )
    ):
        raise Conflict("Já existe uma categoria com este nome.")

    category = Category(
        institution_id=institution.id,
        name=payload.nome,
        slug=slug,
        description=payload.descricao,
        color=payload.cor,
        icon=payload.icone,
        default_retention_days=payload.retencao_dias,
        requires_expiry=payload.exige_vencimento,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(category)
    await db.flush()
    for campo in payload.campos:
        db.add(
            CategoryField(
                category_id=category.id,
                key=slugify(campo.chave).replace("-", "_") or campo.chave,
                label=campo.rotulo,
                field_type=campo.tipo.value,
                required=campo.obrigatorio,
                options=campo.opcoes,
                help_text=campo.ajuda,
                position=campo.posicao,
            )
        )
    await db.commit()

    from sqlalchemy.orm import selectinload

    category = await db.scalar(
        select(Category)
        .where(Category.id == category.id)
        .options(selectinload(Category.fields))
    )
    return _category_out(category)


@router.put("/categorias/{category_id}", response_model=CategoryOut, summary="Editar categoria")
async def update_category(
    category_id: uuid.UUID,
    payload: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(admin_or_secretariat),
    institution: Institution = Depends(get_institution),
):
    from sqlalchemy.orm import selectinload

    category = await db.scalar(
        select(Category)
        .where(Category.id == category_id, Category.institution_id == institution.id)
        .options(selectinload(Category.fields))
    )
    if category is None:
        raise NotFound("Categoria não encontrada.")

    category.name = payload.nome
    category.description = payload.descricao
    category.color = payload.cor
    category.icon = payload.icone
    category.default_retention_days = payload.retencao_dias
    category.requires_expiry = payload.exige_vencimento
    category.updated_by_id = user.id

    existentes = {campo.key: campo for campo in category.fields}
    enviados = set()
    for campo in payload.campos:
        chave = slugify(campo.chave).replace("-", "_") or campo.chave
        enviados.add(chave)
        atual = existentes.get(chave)
        if atual:
            atual.label = campo.rotulo
            atual.field_type = campo.tipo.value
            atual.required = campo.obrigatorio
            atual.options = campo.opcoes
            atual.help_text = campo.ajuda
            atual.position = campo.posicao
        else:
            db.add(
                CategoryField(
                    category_id=category.id,
                    key=chave,
                    label=campo.rotulo,
                    field_type=campo.tipo.value,
                    required=campo.obrigatorio,
                    options=campo.opcoes,
                    help_text=campo.ajuda,
                    position=campo.posicao,
                )
            )
    for chave, campo in existentes.items():
        if chave not in enviados:
            await db.delete(campo)

    await db.commit()
    category = await db.scalar(
        select(Category)
        .where(Category.id == category_id)
        .options(selectinload(Category.fields))
    )
    return _category_out(category)


@router.get("/etiquetas", response_model=List[TagOut], summary="Listar etiquetas")
async def list_tags(
    termo: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    stmt = select(Tag).where(Tag.institution_id == institution.id)
    if termo:
        stmt = stmt.where(func.lower(Tag.name).like(f"%{termo.lower()}%"))
    tags = (await db.scalars(stmt.order_by(Tag.name).limit(200))).all()
    resultado = []
    for tag in tags:
        total = int(
            await db.scalar(
                select(func.count(DocumentTag.id)).where(DocumentTag.tag_id == tag.id)
            )
            or 0
        )
        resultado.append(
            TagOut(id=tag.id, nome=tag.name, slug=tag.slug, cor=tag.color, total=total)
        )
    return resultado


@router.get("/politicas-retencao", summary="Listar políticas de retenção")
async def list_policies(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    institution: Institution = Depends(get_institution),
):
    rows = (
        await db.scalars(
            select(RetentionPolicy).where(
                RetentionPolicy.institution_id == institution.id,
                RetentionPolicy.deleted_at.is_(None),
            )
        )
    ).all()
    return [
        {
            "id": str(row.id),
            "nome": row.name,
            "descricao": row.description,
            "dias_retencao": row.retain_days,
            "bloquear_exclusao": row.block_delete_until_expiry,
            "acao_apos": row.action_after,
            "ativo": row.is_active,
        }
        for row in rows
    ]


@router.post("/politicas-retencao", status_code=201, summary="Criar política de retenção")
async def create_policy(
    payload: RetentionPolicyIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_profiles(Profile.ADMIN_GERAL)),
    institution: Institution = Depends(get_institution),
):
    policy = RetentionPolicy(
        institution_id=institution.id,
        name=payload.nome,
        description=payload.descricao,
        retain_days=payload.dias_retencao,
        block_delete_until_expiry=payload.bloquear_exclusao,
        action_after=payload.acao_apos,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(policy)
    await db.commit()
    return {"id": str(policy.id), "mensagem": "Política de retenção criada."}


@router.get("/filtros-salvos", summary="Meus filtros salvos")
async def list_filters(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    rows = (
        await db.scalars(
            select(SavedFilter)
            .where(SavedFilter.user_id == user.id)
            .order_by(SavedFilter.created_at.desc())
        )
    ).all()
    return [
        {"id": str(row.id), "nome": row.name, "filtro": row.payload} for row in rows
    ]


@router.post("/filtros-salvos", status_code=201, summary="Salvar filtro")
async def save_filter(
    nome: str,
    filtro: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = SavedFilter(user_id=user.id, name=nome, payload=filtro)
    db.add(item)
    await db.commit()
    return {"id": str(item.id), "mensagem": "Filtro salvo."}


@router.delete("/filtros-salvos/{filter_id}", response_model=Message, summary="Remover filtro")
async def delete_filter(
    filter_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = await db.get(SavedFilter, filter_id)
    if item is None or item.user_id != user.id:
        raise NotFound("Filtro não encontrado.")
    await db.delete(item)
    await db.commit()
    return Message(mensagem="Filtro removido.")


@router.get("/opcoes", summary="Listas de apoio da interface")
async def options(user: User = Depends(get_current_user)):
    """Enumerações usadas pelos formulários — evita duplicar textos no frontend."""
    return {
        "classificacoes": [
            {"chave": Classification.PUBLICO.value, "rotulo": "Público"},
            {"chave": Classification.INTERNO.value, "rotulo": "Interno"},
            {"chave": Classification.RESTRITO.value, "rotulo": "Restrito"},
            {"chave": Classification.CONFIDENCIAL.value, "rotulo": "Confidencial"},
            {"chave": Classification.SIGILOSO.value, "rotulo": "Sigiloso"},
        ],
        "situacoes": [
            {"chave": s.value, "rotulo": s.value.replace("_", " ").capitalize()}
            for s in DocumentStatus
        ],
        "perfis": [
            {"chave": Profile.ADMIN_GERAL.value, "rotulo": "Administrador geral"},
            {"chave": Profile.ADMIN_SECRETARIA.value, "rotulo": "Administrador da secretaria"},
            {"chave": Profile.GESTOR_SETOR.value, "rotulo": "Gestor de setor"},
            {"chave": Profile.COLABORADOR.value, "rotulo": "Colaborador"},
            {"chave": Profile.LEITOR.value, "rotulo": "Leitor"},
            {"chave": Profile.AUDITOR.value, "rotulo": "Auditor"},
        ],
        "tipos_campo": [
            {"chave": t.value, "rotulo": t.value.replace("_", " ").capitalize()}
            for t in FieldType
        ],
    }
