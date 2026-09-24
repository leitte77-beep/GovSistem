import asyncio, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.config import settings
from app.core.database import engine, async_session
from app.core.security import hash_password
from app.models.base import Base
from app.models.user import User
from app.models.organization import Organization
from app.models.module import Module
from app.models.plan import Plan
from sqlalchemy import select

async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        org = await db.scalar(select(Organization).where(Organization.slug == "admin"))
        if not org:
            org = Organization(name="Admin", slug="admin", is_active=True)
            db.add(org)
            await db.flush()

        user = await db.scalar(select(User).where(User.email == "admin@saas.com"))
        if not user:
            user = User(
                organization_id=org.id,
                name="Super Admin",
                email="admin@saas.com",
                password_hash=hash_password("admin123"),
                is_platform_admin=True,
                platform_role="SUPER_ADMIN",
                is_active=True,
            )
            db.add(user)
            await db.flush()

        module = await db.scalar(select(Module).where(Module.slug == "diario"))
        if not module:
            module = Module(
                name="Diário Oficial",
                slug="diario",
                description="Módulo de publicação de diário oficial eletrônico",
                base_url="http://localhost:9201",
                api_url="http://localhost:9201/api/v1",
                admin_url="http://localhost:9202",
                is_active=True,
            )
            db.add(module)
            await db.flush()
        else:
            module.base_url = "http://localhost:9201"
            module.api_url = "http://localhost:9201/api/v1"
            module.admin_url = "http://localhost:9202"

        from app.models.organization_module import OrganizationModule
        org_mod = await db.scalar(
            select(OrganizationModule).where(
                OrganizationModule.organization_id == org.id,
                OrganizationModule.module_id == module.id,
            )
        )
        if not org_mod:
            org_mod = OrganizationModule(
                organization_id=org.id,
                module_id=module.id,
                is_active=True,
            )
            db.add(org_mod)

        plan = await db.scalar(select(Plan).where(Plan.slug == "basico"))
        if not plan:
            plan = Plan(
                name="Básico",
                slug="basico",
                description="Plano básico gratuito",
                max_users=5,
                max_storage_gb=1,
                price_cents=0,
                trial_days=7,
                allowed_modules=["diario"],
            )
            db.add(plan)

        await db.commit()

    print("Seed concluido!")
    print("  Usuario: admin@saas.com")
    print("  Senha:   admin123")
    print("  Modulo:  diario (ativado)")

asyncio.run(seed())
