import asyncio, sys, os, uuid
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.config import settings
from app.core.database import engine, async_session
from app.models.base import Base
from app.models.organization import Organization
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.act_type import ActType
from sqlalchemy import select

async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        org = await db.scalar(select(Organization).where(Organization.slug == "admin"))
        if not org:
            org = Organization(
                id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                name="Admin", slug="admin", is_active=True,
            )
            db.add(org)
            await db.flush()

        user = await db.scalar(select(User).where(User.email == "admin@saas.com"))
        if not user:
            user = User(
                id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
                organization_id=org.id,
                name="Super Admin",
                email="admin@saas.com",
                is_active=True,
            )
            db.add(user)
            await db.flush()

        roles_data = [
            ("SUPER_ADMIN", "Super Admin", True),
            ("ADMIN", "Administrador", True),
            ("AUTOR", "Autor", True),
            ("REVISOR", "Revisor", True),
            ("DIAGRAMADOR", "Diagramador", True),
            ("ASSINADOR", "Assinador", True),
            ("PUBLICADOR", "Publicador", True),
            ("AUDITOR", "Auditor", True),
        ]
        for role_name, role_label, is_sys in roles_data:
            role = await db.scalar(select(Role).where(Role.name == role_name))
            if not role:
                role = Role(name=role_name, label=role_label, is_system=is_sys)
                db.add(role)
                await db.flush()
            if not await db.scalar(select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id)):
                db.add(UserRole(user_id=user.id, role_id=role.id))

        act_types = [
            ("Lei", "lei"),
            ("Decreto", "decreto"),
            ("Portaria", "portaria"),
            ("Edital", "edital"),
            ("Licitação", "licitacao"),
            ("Contrato", "contrato"),
            ("Ata", "ata"),
            ("Outros", "outros"),
        ]
        for at_name, at_slug in act_types:
            at = await db.scalar(select(ActType).where(ActType.slug == at_slug, ActType.organization_id == org.id))
            if not at:
                db.add(ActType(organization_id=org.id, name=at_name, slug=at_slug))

        await db.commit()

    print("Seed Diario concluido!")
    print("  Org e usuario criados")
    print("  Roles e tipos de ato criados")

asyncio.run(seed())
