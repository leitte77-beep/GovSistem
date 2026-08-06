"""Provisionamento just-in-time de organização e usuário a partir do SaaS.

Espelha o padrão do ChatGov: a organização (instituição) e os usuários não são
cadastrados no GovDoc — eles chegam da plataforma GovSistem via token
`module_access` (single sign-on) ou pelos endpoints internos de sync.

Dois caminhos usam estas funções:
  1. `/internal/sync-organization` e `/internal/sync-user` (chamados pelo SaaS).
  2. Provisionamento just-in-time no `get_current_user` — rede de segurança
     para quando o sync da plataforma não tiver rodado (ex.: GovDoc fora do ar
     no primeiro acesso). Sem isso a organização entra com token válido mas sem
     linha em `institutions`, e qualquer gravação ligada a institution_id
     falha por foreign key.

A identidade da organização e do usuário (id, nome) vem sempre do SaaS; aqui
apenas garantimos a existência local. O slug é normalizado porque o token
nem sempre traz os dois (nome/slug podem vir parciais).
"""

import logging
import re
import unicodedata
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import Profile
from app.models.organization import Department, Institution, Secretariat
from app.models.user import User

logger = logging.getLogger("govdoc.provisioning")

# Hash de preenchimento: o GovDoc não valida mais senha local (o login é do
# SaaS), mas a coluna é NOT NULL para não exigir migração de banco existente.
PLACEHOLDER_PASSWORD_HASH = "!govdoc-saas:login-gerenciado-pela-plataforma"

ROLES_ADMIN = {"SUPER_ADMIN", "PLATFORM_ADMIN", "ADMIN", "admin_geral", "GOVDOC_ADMIN"}
ROLES_AUDITOR = {"AUDITOR", "SUPPORT", "auditor", "GOVDOC_AUDITOR"}


def normalize_slug(value, fallback_id) -> str:
    """Normaliza um slug; se vier vazio, deriva um estável do id da org."""
    base = (value or "").strip().lower()
    if not base:
        base = str(fallback_id)
    base = unicodedata.normalize("NFD", base)
    base = "".join(c for c in base if unicodedata.category(c) != "Mn")
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base or f"org-{str(fallback_id)[:8]}"


def map_roles_to_profile(roles, current: str | None = None) -> str:
    """Mapeia os papéis do SaaS para o perfil do GovDoc.

    Papéis de administração da plataforma elevam para `admin_geral`; o restante
    mantém o perfil local já atribuído (admin de secretaria, gestor, leitor…),
    caindo em `colaborador` na primeira sincronização. Nunca rebaixa: revogação
    de papel é tratada pela plataforma (o acesso deixa de ter token válido).
    """
    roles = roles or []
    if any(r in ROLES_ADMIN for r in roles):
        return Profile.ADMIN_GERAL.value
    if current:
        return current
    for role in roles:
        if role == Profile.ADMIN_SECRETARIA.value:
            return Profile.ADMIN_SECRETARIA.value
        if role == Profile.GESTOR_SETOR.value:
            return Profile.GESTOR_SETOR.value
        if role == Profile.LEITOR.value:
            return Profile.LEITOR.value
    if any(r in ROLES_AUDITOR for r in roles):
        return Profile.AUDITOR.value
    return Profile.COLABORADOR.value


async def ensure_institution_provisioned(
    db: AsyncSession,
    organization_id,
    name: str = "",
    slug: str = "",
    is_active: bool = True,
) -> Institution:
    """Cria/atualiza (idempotente) a instituição correspondente ao órgão do SaaS.

    Na primeira criação garante também a secretaria "Geral" e o setor "Geral"
    (o mesmo padrão do ChatGov), para que o primeiro login já tenha onde
    gravar. Um sync posterior com dados completos corrige nome/slug.
    """
    organization_id = uuid.UUID(str(organization_id))
    slug_final = normalize_slug(slug, organization_id)
    nome_final = (
        (name or "").strip() or (slug or "").strip() or f"Organização {str(organization_id)[:8]}"
    )

    institution = await db.scalar(
        select(Institution).where(
            (Institution.id == organization_id) | (Institution.slug == slug_final)
        )
    )

    if institution is None:
        institution = Institution(
            id=organization_id,
            name=nome_final,
            slug=slug_final,
            is_active=is_active,
        )
        db.add(institution)
        await db.flush()
        logger.info("Instituição provisionada just-in-time: %s (%s)", nome_final, organization_id)

        # Secretaria e setor padrão, garantindo onde alocar o primeiro documento.
        secretaria = await db.scalar(
            select(Secretariat).where(
                Secretariat.institution_id == organization_id,
                Secretariat.acronym == "GERAL",
            )
        )
        if secretaria is None:
            secretaria = Secretariat(
                institution_id=organization_id,
                name="Geral",
                acronym="GERAL",
                color="#2563EB",
                icon="building",
            )
            db.add(secretaria)
            await db.flush()

        setor = await db.scalar(
            select(Department).where(
                Department.institution_id == organization_id,
                Department.secretariat_id == secretaria.id,
                Department.name == "Geral",
            )
        )
        if setor is None:
            db.add(
                Department(
                    institution_id=organization_id,
                    secretariat_id=secretaria.id,
                    name="Geral",
                )
            )
        await db.flush()
    else:
        changes = {}
        # Só sincroniza nome/slug quando o chamador trouxe dados reais (ex.:
        # sync interno da plataforma). O token module_access nem sempre carrega
        # org_name/org_slug — nesse caso os fallbacks genéricos NÃO podem
        # sobrescrever o que já veio do sync.
        if (name or "").strip() and nome_final != institution.name:
            changes["name"] = nome_final
        if (slug or "").strip() and slug_final != institution.slug:
            changes["slug"] = slug_final
        if institution.is_active != is_active:
            changes["is_active"] = is_active
        for campo, valor in changes.items():
            setattr(institution, campo, valor)
        if changes:
            await db.flush()

    institution.last_sync_at = datetime.now(timezone.utc)
    return institution


async def ensure_user_provisioned(
    db: AsyncSession,
    user_id,
    organization_id,
    name: str = "",
    email: str = "",
    roles=None,
    is_active: bool = True,
) -> User:
    """Cria/atualiza (idempotente) o usuário correspondente ao usuário do SaaS.

    A identidade (id, nome, e-mail) e a instituição vêm do SaaS. O perfil é
    derivado dos papéis apenas na primeira sincronização (ou quando o SaaS
    concede papel de administração); as demais atribuições locais (secretaria,
    setor, perfil específico) permanecem nas mãos dos administradores do módulo.
    """
    user_id = uuid.UUID(str(user_id))
    organization_id = uuid.UUID(str(organization_id))
    email_clean = (email or "").lower().strip()
    nome_final = (name or "").strip() or "Usuário GovSistem"

    user = await db.get(User, user_id)
    if user is None and email_clean:
        user = await db.scalar(
            select(User).where(
                User.institution_id == organization_id,
                func.lower(User.email) == email_clean,
            )
        )
    if user is not None and user.deleted_at is not None:
        user = None

    if user is None:
        user = User(
            id=user_id,
            institution_id=organization_id,
            name=nome_final[:200],
            email=email_clean or f"sso-{user_id}@govsistem.local",
            password_hash=PLACEHOLDER_PASSWORD_HASH,
            profile=map_roles_to_profile(roles),
            is_active=is_active,
            external_subject=str(user_id),
        )
        db.add(user)
        await db.flush()
        logger.info("Usuário provisionado just-in-time: %s (%s)", user.email, user_id)
    else:
        novo_perfil = map_roles_to_profile(roles, current=user.profile)
        if user.institution_id != organization_id:
            user.institution_id = organization_id
        if user.name != nome_final:
            user.name = nome_final[:200]
        if email_clean and user.email != email_clean:
            user.email = email_clean
        if user.profile != novo_perfil:
            user.profile = novo_perfil
        if user.is_active != is_active:
            user.is_active = is_active
        if not user.external_subject:
            user.external_subject = str(user_id)
        await db.flush()

    return user
