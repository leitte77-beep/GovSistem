"""Seed data for initial system setup."""

from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.act_type import ActType
from app.models.organization import Organization
from app.models.org_unit import OrgUnit
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole

SEED_ORG = {
    "name": "Prefeitura Municipal",
    "slug": "prefeitura-padrao",
    "description": "Organização padrão do sistema",
    "is_active": True,
}

SEED_ROLES: List[dict] = [
    {
        "name": "ADMIN",
        "label": "Administrador",
        "description": "Acesso total ao sistema",
        "is_system": True,
    },
    {
        "name": "AUTOR",
        "label": "Autor",
        "description": "Pode criar e editar matérias",
        "is_system": True,
    },
    {
        "name": "REVISOR",
        "label": "Revisor",
        "description": "Pode revisar e aprovar matérias",
        "is_system": True,
    },
    {
        "name": "DIAGRAMADOR",
        "label": "Diagramador",
        "description": "Pode montar edições e diagramar",
        "is_system": True,
    },
    {
        "name": "ASSINADOR",
        "label": "Assinador",
        "description": "Pode assinar digitalmente edições",
        "is_system": True,
    },
    {
        "name": "PUBLICADOR",
        "label": "Publicador",
        "description": "Pode publicar edições",
        "is_system": True,
    },
    {
        "name": "AUDITOR",
        "label": "Auditor",
        "description": "Acesso somente leitura a logs e auditoria",
        "is_system": True,
    },
    {
        "name": "SUPER_ADMIN",
        "label": "Super Administrador",
        "description": "Acesso total a todas as organizações e configurações da plataforma",
        "is_system": True,
    },
]

SEED_ACT_TYPES: List[dict] = [
    {"name": "Lei", "description": "Lei municipal", "is_active": True},
    {"name": "Decreto", "description": "Decreto municipal", "is_active": True},
    {"name": "Portaria", "description": "Portaria", "is_active": True},
    {"name": "Edital", "description": "Edital de licitação ou concurso", "is_active": True},
    {"name": "Licitação", "description": "Ato licitatório", "is_active": True},
    {"name": "Contrato", "description": "Contrato administrativo", "is_active": True},
    {"name": "Ata", "description": "Ata de registro de preços", "is_active": True},
    {
        "name": "Relatório Contábil",
        "description": "Relatório de gestão contábil/fiscal",
        "is_active": True,
    },
    {"name": "Outros", "description": "Outros tipos de ato", "is_active": True},
]


async def seed_organization(db: AsyncSession) -> Organization:
    result = await db.execute(
        select(Organization).where(Organization.slug == SEED_ORG["slug"])
    )
    org = result.scalar_one_or_none()
    if org:
        return org

    org = Organization(**SEED_ORG)
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


async def seed_roles(db: AsyncSession) -> List[Role]:
    roles = []
    for data in SEED_ROLES:
        result = await db.execute(
            select(Role).where(Role.name == data["name"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            roles.append(existing)
            continue

        role = Role(**data)
        db.add(role)
        roles.append(role)

    await db.commit()
    for role in roles:
        await db.refresh(role)
    return roles


async def seed_act_types(db: AsyncSession) -> List[ActType]:
    act_types = []
    for data in SEED_ACT_TYPES:
        result = await db.execute(
            select(ActType).where(ActType.name == data["name"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            act_types.append(existing)
            continue

        act_type = ActType(**data)
        db.add(act_type)
        act_types.append(act_type)

    await db.commit()
    for at in act_types:
        await db.refresh(at)
    return act_types


SEED_SETTINGS: List[dict] = [
    {"key": "site.name", "value": "Diário Oficial Eletrônico", "description": "Nome do sistema exibido no portal público", "category": "general", "type": "string"},
    {"key": "site.description", "value": "Diário Oficial Eletrônico do Município", "description": "Frase de descrição exibida no portal", "category": "general", "type": "string"},
    {"key": "site.logo_url", "value": "", "description": "Link da logo (deixe vazio para usar a padrão)", "category": "general", "type": "string"},
    {"key": "edition.default_type", "value": "normal", "description": "Tipo padrão ao criar nova edição", "category": "edition", "type": "string"},
    {"key": "edition.auto_numbering", "value": "true", "description": "Numerar edições automaticamente", "category": "edition", "type": "boolean"},
    {"key": "security.password_min_length", "value": "8", "description": "Mínimo de caracteres para nova senha", "category": "security", "type": "number"},
    {"key": "security.password_expire_days", "value": "90", "description": "Dias até a senha expirar", "category": "security", "type": "number"},
    {"key": "security.max_login_attempts", "value": "5", "description": "Tentativas erradas até bloquear", "category": "security", "type": "number"},
    {"key": "security.lockout_minutes", "value": "30", "description": "Minutos de bloqueio após tentativas excessivas", "category": "security", "type": "number"},
    {"key": "security.mfa_required", "value": "true", "description": "Exigir autenticação em dois fatores", "category": "security", "type": "boolean"},
    {"key": "retention.audit_log_days", "value": "365", "description": "Tempo de retenção dos logs de auditoria", "category": "retention", "type": "number"},
    {"key": "notifications.smtp_host", "value": "", "description": "Endereço do servidor de email", "category": "notifications", "type": "string"},
    {"key": "notifications.smtp_port", "value": "587", "description": "Porta do servidor de email", "category": "notifications", "type": "number"},
    {"key": "notifications.smtp_user", "value": "", "description": "Usuário para autenticação SMTP", "category": "notifications", "type": "string"},
    {"key": "notifications.smtp_pass", "value": "", "description": "Senha do servidor de email", "category": "notifications", "type": "string", "is_encrypted": True},
    {"key": "notifications.from_email", "value": "", "description": "Email de remetente das notificações", "category": "notifications", "type": "string"},
    {"key": "upload.max_size_mb", "value": "50", "description": "Tamanho máximo por arquivo (em MB)", "category": "upload", "type": "number"},
    {"key": "upload.allowed_extensions", "value": ".docx,.xlsx,.csv,.pdf,.jpg,.png", "description": "Extensões de arquivo permitidas", "category": "upload", "type": "string"},
    {"key": "backup.enabled", "value": "false", "description": "Ativar backup automático", "category": "backup", "type": "boolean"},
    {"key": "backup.day", "value": "*", "description": "Dia da semana (0=segunda, *=todos os dias)", "category": "backup", "type": "string"},
    {"key": "backup.time", "value": "03:00", "description": "Horário do backup automático (HH:MM)", "category": "backup", "type": "string"},
    {"key": "backup.retention_days", "value": "30", "description": "Dias para manter backups no servidor", "category": "backup", "type": "number"},
    {"key": "backup.gdrive_enabled", "value": "false", "description": "Enviar backup para Google Drive", "category": "backup", "type": "boolean"},
    {"key": "backup.gdrive_folder_id", "value": "", "description": "ID da pasta no Google Drive", "category": "backup", "type": "string"},
]


async def seed_settings(db: AsyncSession) -> list:
    from app.models.setting import SystemSetting

    created = []
    for data in SEED_SETTINGS:
        result = await db.execute(
            select(SystemSetting).where(SystemSetting.key == data["key"])
        )
        existing = result.scalar_one_or_none()
        if existing:
            created.append(existing.key)
            continue
        setting = SystemSetting(**data)
        db.add(setting)
        created.append(data["key"])
    await db.commit()
    return created


async def seed_super_admin(db: AsyncSession) -> User | None:
    """Create or return the platform super-admin user."""
    result = await db.execute(
        select(User).where(User.email == "admin@doeapp.com.br")
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    result = await db.execute(select(Role).where(Role.name == "SUPER_ADMIN"))
    super_admin_role = result.scalar_one_or_none()
    if not super_admin_role:
        return None

    user = User(
        name="Administrador da Plataforma",
        email="admin@doeapp.com.br",
        password_hash=hash_password("admin123"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role_id=super_admin_role.id))
    await db.commit()
    await db.refresh(user)
    return user


SEED_ORG_UNITS: List[dict] = [
    {"name": "Prefeitura Municipal", "description": "Órgão do poder executivo municipal"},
    {"name": "Câmara Municipal", "description": "Órgão do poder legislativo municipal"},
]


async def seed_org_units(db: AsyncSession, org: Organization) -> list:
    created = []
    for data in SEED_ORG_UNITS:
        result = await db.execute(
            select(OrgUnit).where(
                OrgUnit.organization_id == org.id,
                OrgUnit.name == data["name"],
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            created.append(existing.name)
            continue
        unit = OrgUnit(organization_id=org.id, **data)
        db.add(unit)
        created.append(data["name"])
    await db.commit()
    return created


async def run_all_seeds(db: AsyncSession) -> dict:
    org = await seed_organization(db)
    roles = await seed_roles(db)
    act_types = await seed_act_types(db)
    settings = await seed_settings(db)
    super_admin = await seed_super_admin(db)
    org_units = await seed_org_units(db, org)
    return {
        "organization": org.slug,
        "roles": [r.name for r in roles],
        "act_types": [a.name for a in act_types],
        "settings": settings,
        "super_admin": super_admin.email if super_admin else None,
        "org_units": org_units,
    }
