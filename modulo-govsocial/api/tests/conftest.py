import os

os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-govsocial-tests")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("STORAGE_BACKEND", "local")

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_db
from app.core.security import create_access_token, hash_password
from app.core.seeds import seed_national_domains
from app.main import create_app
from app.models.base import Base
from app.models.enums import RoleName
from app.models.organization import Organization
from app.models.professional import Professional
from app.models.role import Role
from app.models.unit import Unit
from app.models.user import User
from app.models.user_role import UserRole

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session():
    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession):
    app = create_app()

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def _ensure_roles(db: AsyncSession) -> dict:
    roles = {}
    for rn in RoleName:
        role = Role(name=rn.value, label=rn.value, is_system=True)
        db.add(role)
        await db.flush()
        roles[rn.value] = role
    return roles


@pytest_asyncio.fixture
async def world(db_session: AsyncSession):
    """Cria 2 tenants (A e B), roles, um usuário por perfil no tenant A, e
    um técnico no tenant B, mais 1 unidade e 1 profissional por tenant.

    Retorna um dicionário com ids e uma função token(role, tenant='A').
    """
    db = db_session
    roles = await _ensure_roles(db)

    org_a = Organization(name="Município A", slug="mun-a", is_active=True, suporte_consentido=True)
    org_b = Organization(name="Município B", slug="mun-b", is_active=True, suporte_consentido=False)
    db.add_all([org_a, org_b])
    await db.flush()

    users = {}

    def _mk_user(org, role_name, cpf, tag):
        u = User(
            organization_id=org.id if role_name != RoleName.ADMIN.value else None,
            name=f"User {tag}",
            cpf=cpf,
            email=f"{tag}@test.local",
            password_hash=hash_password("senha123"),
            is_active=True,
        )
        db.add(u)
        return u

    cpf_seq = 10000000000
    for rn in RoleName:
        u = _mk_user(org_a, rn.value, str(cpf_seq), f"a_{rn.value}")
        cpf_seq += 1
        await db.flush()
        db.add(UserRole(user_id=u.id, role_id=roles[rn.value].id))
        users[("A", rn.value)] = u

    # Tenant B: técnico superior e gestor
    for rn in [RoleName.TECNICO_SUPERIOR, RoleName.GESTOR_MUNICIPAL]:
        u = _mk_user(org_b, rn.value, str(cpf_seq), f"b_{rn.value}")
        cpf_seq += 1
        await db.flush()
        db.add(UserRole(user_id=u.id, role_id=roles[rn.value].id))
        users[("B", rn.value)] = u

    unit_a = Unit(tenant_id=org_a.id, tipo="CRAS", nome="CRAS A", municipio="A", uf="PR")
    unit_b = Unit(tenant_id=org_b.id, tipo="CRAS", nome="CRAS B", municipio="B", uf="PR")
    db.add_all([unit_a, unit_b])
    await db.flush()

    prof_a = Professional(tenant_id=org_a.id, nome="Prof A", cpf="52998224725", funcao_nob_rh="Assistente Social")
    prof_b = Professional(tenant_id=org_b.id, nome="Prof B", cpf="16899535009", funcao_nob_rh="Psicólogo")
    db.add_all([prof_a, prof_b])
    await db.flush()

    # Vincula profissionais a usuários e cria lotações ativas em unit_a (FASE 3
    # scoping): técnico superior e coordenador do tenant A lotados no CRAS A.
    from datetime import date as _date0

    from app.models.professional_assignment import ProfessionalAssignment

    prof_a.user_id = users[("A", "tecnico_superior")].id
    coord_prof_a = Professional(
        tenant_id=org_a.id, nome="Coord A", cpf="11144477735",
        funcao_nob_rh="Coordenador", user_id=users[("A", "coordenador_unidade")].id,
    )
    db.add(coord_prof_a)
    await db.flush()
    db.add_all([
        ProfessionalAssignment(tenant_id=org_a.id, professional_id=prof_a.id,
                               unit_id=unit_a.id, data_inicio=_date0(2024, 1, 1)),
        ProfessionalAssignment(tenant_id=org_a.id, professional_id=coord_prof_a.id,
                               unit_id=unit_a.id, data_inicio=_date0(2024, 1, 1)),
    ])
    await db.flush()

    await seed_national_domains(db, org_a.id)
    await seed_national_domains(db, org_b.id)

    # Famílias/pessoas mínimas em cada tenant (FASE 2).
    from datetime import date as _date

    from app.models.family import Family
    from app.models.person import Person
    from app.models.person_family_membership import PersonFamilyMembership
    from app.services.people import build_person_busca

    fam_a = Family(tenant_id=org_a.id, codigo=1, bairro="Centro", territorio="Centro",
                   municipio="A", uf="PR")
    fam_b = Family(tenant_id=org_b.id, codigo=1, bairro="Centro", territorio="Centro",
                   municipio="B", uf="PR")
    db.add_all([fam_a, fam_b])
    await db.flush()

    person_a = Person(
        tenant_id=org_a.id, nome_civil="Maria da Silva",
        busca=build_person_busca("Maria da Silva", None),
        cpf="52998224725", data_nascimento=_date(1990, 5, 10),
    )
    person_b = Person(
        tenant_id=org_b.id, nome_civil="José Santos",
        busca=build_person_busca("José Santos", None),
        cpf="16899535009", data_nascimento=_date(1980, 2, 2),
    )
    db.add_all([person_a, person_b])
    await db.flush()
    fam_a.responsavel_id = person_a.id
    db.add(PersonFamilyMembership(tenant_id=org_a.id, person_id=person_a.id,
                                  family_id=fam_a.id, parentesco="RESPONSAVEL",
                                  status="ATIVO", data_entrada=_date(2024, 1, 1)))
    db.add(PersonFamilyMembership(tenant_id=org_b.id, person_id=person_b.id,
                                  family_id=fam_b.id, parentesco="RESPONSAVEL",
                                  status="ATIVO", data_entrada=_date(2024, 1, 1)))

    await db.commit()

    def token(role_name: str, tenant: str = "A") -> str:
        u = users[(tenant, role_name)]
        return create_access_token(u.id, [role_name], organization_id=u.organization_id)

    def auth(role_name: str, tenant: str = "A") -> dict:
        return {"Authorization": f"Bearer {token(role_name, tenant)}"}

    return {
        "org_a": org_a,
        "org_b": org_b,
        "users": users,
        "unit_a": unit_a,
        "unit_b": unit_b,
        "prof_a": prof_a,
        "prof_b": prof_b,
        "coord_prof_a": coord_prof_a,
        "family_a": fam_a,
        "family_b": fam_b,
        "person_a": person_a,
        "person_b": person_b,
        "token": token,
        "auth": auth,
    }
