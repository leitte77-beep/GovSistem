"""Backfill idempotente do modelo multi-tenant (memberships e grants).

- Memberships: cria a partir de users.organization_id.
  - is_organization_admin=true  -> membership_role=ORG_ADMIN
  - caso contrário              -> membership_role=ORG_MEMBER
- Grants por membership (membership_module_grants):
  - source=MIGRATED_GRANT  : copiado de user_module_grants (1:1, role preservada)
  - source=MIGRATED_LEGACY : derivado de users.module_permissions quando o módulo
    tem mapeamento determinístico seguro (diario->AUTOR, chatgov->CHATGOV_USER,
    financeiro->FINANCEIRO_VIEWER). Caso contrário, NÃO inventa role e registra
    requires_review (o acesso continua garantido pelo fallback legado).

Idempotente: usa INSERT ... ON CONFLICT DO NOTHING / existências.
Transacional: toda a operação em uma transação; em --apply, commits no fim.
NÃO apaga, NÃO altera senha/email/status de usuário, NÃO remove legado.

USO (na raiz do saas-platform/api, com .env e postgres acessível):
  python -m scripts.backfill_memberships --dry-run
  python -m scripts.backfill_memberships --apply
"""
from __future__ import annotations

import argparse
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, engine
from app.models.organization_membership import OrganizationMembership
from app.models.membership_module_grant import MembershipModuleGrant
from app.models.user import User
from app.models.user_module_grant import UserModuleGrant

# Mapeamento determinístico seguro para acessos legados (espelha a migration
# e7f8a9b0c1d2_add_user_module_grants.py).
LEGACY_SAFE_ROLE = {
    "diario": "AUTOR",
    "chatgov": "CHATGOV_USER",
    "financeiro": "FINANCEIRO_VIEWER",
}

ORG_ADMIN = "ORG_ADMIN"
ORG_MEMBER = "ORG_MEMBER"


class Counters:
    def __init__(self) -> None:
        self.memberships_created = 0
        self.memberships_existing = 0
        self.grants_from_grants = 0
        self.grants_from_legacy = 0
        self.grants_legacy_review = 0
        self.duplicates_skipped = 0


async def backfill(db: AsyncSession, apply: bool, dry_run_only: bool) -> Counters:
    cnt = Counters()

    # 1) Memberships
    users = (await db.execute(select(User).where(User.deleted_at.is_(None)))).scalars().all()
    for u in users:
        if not u.organization_id:
            continue
        existing = (
            await db.execute(
                select(OrganizationMembership.id).where(
                    OrganizationMembership.organization_id == u.organization_id,
                    OrganizationMembership.user_id == u.id,
                    OrganizationMembership.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if existing:
            cnt.memberships_existing += 1
            continue
        role = ORG_ADMIN if u.is_organization_admin else ORG_MEMBER
        m = OrganizationMembership(
            id=uuid.uuid4(),
            organization_id=u.organization_id,
            user_id=u.id,
            membership_role=role,
            status="active" if u.is_active else "inactive",
            is_active=u.is_active,
            created_by=None,
        )
        db.add(m)
        cnt.memberships_created += 1

    await db.flush()

    # Re-map membership_id por (org_id, user_id)
    mems = (await db.execute(select(OrganizationMembership))).scalars().all()
    membership_by_org_user = {(m.organization_id, m.user_id): m.id for m in mems}

    def membership_id_for(org_id: uuid.UUID, user_id: uuid.UUID) -> Optional[uuid.UUID]:
        return membership_by_org_user.get((org_id, user_id))

    # 2) Grants a partir de user_module_grants (MIGRATED_GRANT)
    grants = (await db.execute(select(UserModuleGrant))).scalars().all()
    for g in grants:
        # localizar membership correto (org do usuário)
        u = (await db.execute(select(User).where(User.id == g.user_id))).scalar_one_or_none()
        if not u or not u.organization_id:
            cnt.duplicates_skipped += 1
            continue
        mid = membership_id_for(u.organization_id, g.user_id)
        if not mid:
            cnt.duplicates_skipped += 1
            continue
        exists = (
            await db.execute(
                select(MembershipModuleGrant.id).where(
                    MembershipModuleGrant.membership_id == mid,
                    MembershipModuleGrant.module_slug == g.module_slug,
                    MembershipModuleGrant.role_name == g.role_name,
                    MembershipModuleGrant.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if exists:
            cnt.duplicates_skipped += 1
            continue
        db.add(
            MembershipModuleGrant(
                id=uuid.uuid4(),
                membership_id=mid,
                module_slug=g.module_slug,
                role_name=g.role_name,
                is_active=True,
                source="MIGRATED_GRANT",
                requires_review=False,
                created_by=None,
            )
        )
        cnt.grants_from_grants += 1

    # 3) Acessos legados de users.module_permissions (MIGRATED_LEGACY)
    for u in users:
        if not u.organization_id or not u.module_permissions:
            continue
        mid = membership_id_for(u.organization_id, u.id)
        if not mid:
            continue
        legacy_modules = (u.module_permissions or {}).get("modules", []) or []
        for slug in legacy_modules:
            role = LEGACY_SAFE_ROLE.get(slug)
            if role:
                # grant determinístico
                exists = (
                    await db.execute(
                        select(MembershipModuleGrant.id).where(
                            MembershipModuleGrant.membership_id == mid,
                            MembershipModuleGrant.module_slug == slug,
                            MembershipModuleGrant.role_name == role,
                            MembershipModuleGrant.deleted_at.is_(None),
                        )
                    )
                ).scalar_one_or_none()
                if not exists:
                    db.add(
                        MembershipModuleGrant(
                            id=uuid.uuid4(),
                            membership_id=mid,
                            module_slug=slug,
                            role_name=role,
                            is_active=True,
                            source="MIGRATED_LEGACY",
                            requires_review=False,
                            created_by=None,
                        )
                    )
                    cnt.grants_from_legacy += 1
            else:
                # sem mapeamento seguro -> NÃO inventar role. Registra pendência.
                # O acesso continua garantido pelo fallback legado
                # (LEGACY_MODULE_PERMISSIONS_FALLBACK). Fica requires_review para o gestor.
                pending_exists = (
                    await db.execute(
                        select(MembershipModuleGrant.id).where(
                            MembershipModuleGrant.membership_id == mid,
                            MembershipModuleGrant.module_slug == slug,
                            MembershipModuleGrant.role_name == "__PENDING_LEGACY__",
                            MembershipModuleGrant.deleted_at.is_(None),
                        )
                    )
                ).scalar_one_or_none()
                if not pending_exists:
                    db.add(
                        MembershipModuleGrant(
                            id=uuid.uuid4(),
                            membership_id=mid,
                            module_slug=slug,
                            role_name="__PENDING_LEGACY__",
                            is_active=False,
                            source="MIGRATED_LEGACY",
                            requires_review=True,
                            created_by=None,
                        )
                    )
                    cnt.grants_legacy_review += 1

    if apply and not dry_run_only:
        await db.commit()
    else:
        await db.rollback()
    return cnt


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill multi-tenant idempotente")
    parser.add_argument("--apply", action="store_true", help="aplica (commit). Sem isso, faz rollback (dry-run).")
    parser.add_argument("--dry-run", action="store_true", help="modo seco (rollback).")
    args = parser.parse_args()

    apply = bool(args.apply)
    async with async_session() as db:
        cnt = await backfill(db, apply=apply, dry_run_only=not apply)
        print(
            f"[{'APPLY' if apply else 'DRY-RUN'}] "
            f"memberships_created={cnt.memberships_created} "
            f"memberships_existing={cnt.memberships_existing} "
            f"grants_from_grants={cnt.grants_from_grants} "
            f"grants_from_legacy={cnt.grants_from_legacy} "
            f"grants_legacy_review={cnt.grants_legacy_review} "
            f"duplicates_skipped={cnt.duplicates_skipped}"
        )


if __name__ == "__main__":
    asyncio.run(main())
