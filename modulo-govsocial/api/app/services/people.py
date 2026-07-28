"""Regras de negócio de pessoas e famílias: busca unificada, código sequencial,
detecção de duplicata e mesclagem assistida."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import only_digits
from app.core.text_utils import normalize_search
from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership


def build_person_busca(nome_civil: str, nome_social: str | None) -> str:
    """Coluna desnormalizada de busca (sem acento, minúscula)."""
    partes = [nome_civil or "", nome_social or ""]
    return normalize_search(" ".join(p for p in partes if p))


async def next_family_codigo(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    """Próximo código sequencial de família por tenant (inclui soft-deleted)."""
    result = await db.execute(
        select(func.coalesce(func.max(Family.codigo), 0)).where(
            Family.tenant_id == tenant_id
        )
    )
    return int(result.scalar_one()) + 1


async def find_person_duplicates(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    nome_civil: str,
    data_nascimento=None,
    cpf: str | None = None,
    nis: str | None = None,
    exclude_id: uuid.UUID | None = None,
) -> list[Person]:
    """Detecta possíveis duplicatas: CPF/NIS iguais, ou nome+nascimento iguais."""
    conditions = []
    cpf = only_digits(cpf) or None
    nis = only_digits(nis) or None
    if cpf:
        conditions.append(Person.cpf == cpf)
    if nis:
        conditions.append(Person.nis == nis)
    if nome_civil and data_nascimento:
        conditions.append(
            (Person.busca == build_person_busca(nome_civil, None))
            & (Person.data_nascimento == data_nascimento)
        )
    if not conditions:
        return []

    query = select(Person).where(
        Person.tenant_id == tenant_id,
        Person.deleted_at.is_(None),
        or_(*conditions),
    )
    if exclude_id:
        query = query.where(Person.id != exclude_id)
    result = await db.execute(query.limit(10))
    return list(result.scalars().all())


async def search_persons(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    term: str,
    skip: int = 0,
    limit: int = 20,
) -> list[Person]:
    """Busca unificada tolerante a acento por nome/nome social/CPF/NIS."""
    term_digits = only_digits(term)
    norm = normalize_search(term)
    conditions = []
    if norm:
        conditions.append(Person.busca.like(f"%{norm}%"))
    if term_digits:
        conditions.append(Person.cpf.like(f"%{term_digits}%"))
        conditions.append(Person.nis.like(f"%{term_digits}%"))
    if not conditions:
        return []

    query = (
        select(Person)
        .where(
            Person.tenant_id == tenant_id,
            Person.deleted_at.is_(None),
            or_(*conditions),
        )
        .order_by(Person.nome_civil)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def merge_persons(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    keep_id: uuid.UUID,
    drop_id: uuid.UUID,
) -> Person:
    """Mescla duas pessoas: move vínculos do drop para o keep e soft-deleta o drop.

    Não faz commit — segue a transação do request (com auditoria no router).
    """
    from datetime import datetime, timezone

    if keep_id == drop_id:
        raise ValueError("keep_id e drop_id devem ser diferentes")

    keep = (
        await db.execute(
            select(Person).where(
                Person.id == keep_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    drop = (
        await db.execute(
            select(Person).where(
                Person.id == drop_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not keep or not drop:
        raise LookupError("Pessoa não encontrada para mesclagem")

    # Move vínculos família da pessoa que sai.
    memberships = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.person_id == drop_id,
            )
        )
    ).scalars().all()
    for m in memberships:
        m.person_id = keep_id

    # Reaponta responsabilidade familiar, se o drop era RF de alguma família.
    fams = (
        await db.execute(
            select(Family).where(
                Family.tenant_id == tenant_id, Family.responsavel_id == drop_id
            )
        )
    ).scalars().all()
    for f in fams:
        f.responsavel_id = keep_id

    # Completa dados faltantes no keep a partir do drop.
    for field in ("cpf", "nis", "data_nascimento", "sexo", "escolaridade"):
        if getattr(keep, field) is None and getattr(drop, field) is not None:
            setattr(keep, field, getattr(drop, field))

    drop.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return keep


async def merge_families(db: AsyncSession, keep_id: str, merge_id: str, tenant_id: str, user_id: str) -> dict:
    """Unifica duas familias duplicadas, transferindo todas as relacoes para a mantida (CCCL)."""
    from sqlalchemy import update as sa_update
    from app.models.family import Family
    from app.models.person_family_membership import PersonFamilyMembership
    from app.models.case_file import CaseFile

    keep = await db.get(Family, keep_id)
    merge = await db.get(Family, merge_id)
    if not keep or not merge or str(keep.tenant_id) != tenant_id or str(merge.tenant_id) != tenant_id:
        raise ValueError("Familias invalidas para unificacao")

    # Migrar membros
    await db.execute(sa_update(PersonFamilyMembership).where(PersonFamilyMembership.family_id == merge_id).values(family_id=keep_id))
    # Migrar prontuarios
    await db.execute(sa_update(CaseFile).where(CaseFile.family_id == merge_id).values(family_id=keep_id))
    # Migrar beneficios
    await db.execute(sa_update(text("benefit_concessions SET family_id = :keep WHERE family_id = :merge"), {"keep": keep_id, "merge": merge_id}))
    # Soft-delete a familia mesclada
    merge.deleted_at = datetime.now(timezone.utc)
    # Registrar log
    from app.models.unificacao import UnificacaoLog
    log = UnificacaoLog(tenant_id=tenant_id, tabela="families", registro_mantido_id=keep_id,
                        registros_excluidos=[merge_id], realizado_por_id=user_id)
    db.add(log)
    await db.commit()
    return {"mantido": str(keep.id), "mesclado": str(merge.id), "status": "ok"}
