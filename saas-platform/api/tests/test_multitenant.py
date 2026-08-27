"""Testes unitários do modelo multi-tenant (sem depender de banco).

Cobrem claims de token, resolução de roles por módulo (isolamento por
module_slug) e regras de negócio puras do novo modelo.
"""
import os
import uuid

os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-32bytes!")
os.environ.setdefault("POSTGRES_PASSWORD", "test-password")
os.environ.setdefault("DEBUG", "true")

import pytest
from app.core.security import (
    create_access_token,
    create_module_token,
    decode_token,
)
from app.core.roles import (
    LEGACY_ROLE_MAP,
    MODULE_ROLE_CATALOG,
    is_valid_grant,
    normalize_grant_role,
)
from app.services.membership import LEGACY_SAFE_ROLE, would_remove_last_active_manager


class TestModuleRoleIsolation:
    """Roles com o mesmo nome em módulos diferentes são independentes."""

    def test_admin_exists_in_govfrota_and_govpro(self):
        assert "ADMIN" in {r["name"] for r in MODULE_ROLE_CATALOG["govfrota"]}
        assert "ADMIN" in {r["name"] for r in MODULE_ROLE_CATALOG["govpro"]}

    def test_role_valid_only_in_its_module(self):
        # ADMIN é válido em govfrota/govpro, mas inválido em chatgov
        assert is_valid_grant("govfrota", "ADMIN")
        assert is_valid_grant("govpro", "ADMIN")
        assert not is_valid_grant("chatgov", "ADMIN")

    def test_legacy_map_normalizes_per_module(self):
        assert normalize_grant_role("diario", "ADMIN") == "DIARIO_ADMIN"
        assert normalize_grant_role("govsocial", "ADMIN") == "GOVSOCIAL_ADMIN"
        # govpro não tem ADMIN legado -> preserva
        assert normalize_grant_role("govpro", "ADMIN") == "ADMIN"


class TestLegacySafeRole:
    def test_known_modules_have_safe_role(self):
        assert LEGACY_SAFE_ROLE["diario"] == "AUTOR"
        assert LEGACY_SAFE_ROLE["chatgov"] == "CHATGOV_USER"
        assert LEGACY_SAFE_ROLE["financeiro"] == "FINANCEIRO_VIEWER"

    def test_unknown_module_has_no_invented_role(self):
        assert "govtask" not in LEGACY_SAFE_ROLE
        assert "govdoc" not in LEGACY_SAFE_ROLE


class TestAccessTokenClaims:
    def test_membership_claims_present_when_provided(self):
        uid = uuid.uuid4()
        org_id = uuid.uuid4()
        mid = uuid.uuid4()
        tok = create_access_token(
            uid,
            roles=["ORG_MEMBER"],
            organization_id=org_id,
            membership_id=mid,
            membership_role="ORG_ADMIN",
            permissions_version=2,
        )
        payload = decode_token(tok)
        assert payload["sub"] == str(uid)
        assert payload["membership_id"] == str(mid)
        assert payload["active_organization_id"] == str(org_id)
        assert payload["organization_role"] == "ORG_ADMIN"
        assert payload["permissions_version"] == 2

    def test_legacy_token_without_membership_claims(self):
        uid = uuid.uuid4()
        tok = create_access_token(uid, roles=["SUPPORT"])
        payload = decode_token(tok)
        assert "membership_id" not in payload


class TestModuleTokenClaims:
    def test_module_token_namespaced_roles(self):
        uid = uuid.uuid4()
        org_id = uuid.uuid4()
        mid = uuid.uuid4()
        tok = create_module_token(
            uid,
            org_id,
            roles=["SERVIDOR"],
            module_slug="govpro",
            membership_id=mid,
            module_roles=["SERVIDOR"],
            permissions_version=1,
        )
        payload = decode_token(tok)
        assert payload["module"] == "govpro"
        assert payload["target_module"] == "govpro"
        assert payload["membership_id"] == str(mid)
        # roles namespaced: só o módulo de destino
        assert payload["module_roles"] == {"govpro": ["SERVIDOR"]}

    def test_token_of_one_module_not_reused_in_another(self):
        # O módulo deve validar 'module'/'target_module' e 'aud' contra si mesmo.
        uid = uuid.uuid4()
        tok = create_module_token(uid, uuid.uuid4(), roles=["ADMIN"], module_slug="govfrota")
        payload = decode_token(tok)
        assert payload["module"] == "govfrota"
        # um GovPro não aceitaria este token (module != govpro)
        assert payload["module"] != "govpro"


class TestGrantValidation:
    """Validações de grants por membership (seções 10 e 26)."""

    def test_valid_role_accepted(self):
        assert is_valid_grant("diario", "AUTOR")
        assert is_valid_grant("govsocial", "gestor_municipal")
        assert is_valid_grant("govdoc", "admin_geral")

    def test_invalid_role_rejected(self):
        assert not is_valid_grant("diario", "NAO_EXISTE")
        assert not is_valid_grant("chatgov", "SERVIDOR")

    def test_role_of_another_module_not_accepted(self):
        # SERVIDOR pertence a govpro, não a govfrota
        assert not is_valid_grant("govfrota", "SERVIDOR")
        # role de um módulo não pode ser usada em outro
        assert not is_valid_grant("govsocial", "AUTOR")

    def test_legacy_map_roles_also_valid(self):
        # ADMIN é aceito em govdoc como alias legado de admin_geral
        assert is_valid_grant("govdoc", "ADMIN")
        assert normalize_grant_role("govdoc", "ADMIN") == "admin_geral"

    def test_grant_normalization_is_idempotent(self):
        assert normalize_grant_role("diario", "AUTOR") == "AUTOR"
        assert normalize_grant_role("govsocial", "gestor_municipal") == "gestor_municipal"


class TestRoleCatalogIntegrity:
    """Integridade do catálogo de roles (seções 11 e 26, cenário 34)."""

    REQUIRED = [
        "diario", "financeiro", "chatgov", "govtask", "govfrota",
        "govsocial", "govdoc", "govpro", "govavalia", "govouve",
    ]

    def test_required_modules_present(self):
        for slug in self.REQUIRED:
            assert slug in MODULE_ROLE_CATALOG, f"catálogo sem módulo {slug}"
            assert MODULE_ROLE_CATALOG[slug], f"catálogo vazio para {slug}"

    def test_no_duplicate_role_names_within_a_module(self):
        for slug, roles in MODULE_ROLE_CATALOG.items():
            names = [r["name"] for r in roles]
            assert len(names) == len(set(names)), f"roles duplicadas em {slug}"

    def test_every_role_has_label(self):
        for slug, roles in MODULE_ROLE_CATALOG.items():
            for r in roles:
                assert r.get("label"), f"role {r['name']} de {slug} sem label"

    def test_legacy_map_targets_are_valid_catalog_roles(self):
        for slug, mapping in LEGACY_ROLE_MAP.items():
            valid = {r["name"] for r in MODULE_ROLE_CATALOG.get(slug, [])}
            for legacy, target in mapping.items():
                assert target in valid, (
                    f"LEGACY_ROLE_MAP[{slug}][{legacy}] -> {target} fora do catálogo"
                )

    def test_same_name_different_modules_are_distinct(self):
        # govfrota.ADMIN e govpro.ADMIN são permissões independentes
        frota = {r["name"] for r in MODULE_ROLE_CATALOG["govfrota"]}
        pro = {r["name"] for r in MODULE_ROLE_CATALOG["govpro"]}
        assert "ADMIN" in frota and "ADMIN" in pro


class TestTokenSecurity:
    """Segurança básica dos tokens (cenários 18, 19, 36)."""

    def test_module_token_has_iat_and_future_exp(self):
        import time
        uid = uuid.uuid4()
        tok = create_module_token(uid, uuid.uuid4(), roles=["ADMIN"], module_slug="govfrota")
        p = decode_token(tok)
        assert p["type"] == "module_access"
        assert p["iat"] <= int(time.time())
        assert p["exp"] > int(time.time())

    def test_access_token_is_access_type(self):
        uid = uuid.uuid4()
        p = decode_token(create_access_token(uid, roles=["ORG_MEMBER"]))
        assert p["type"] == "access"

    def test_module_token_does_not_carry_all_modules_roles(self):
        uid = uuid.uuid4()
        tok = create_module_token(
            uid, uuid.uuid4(), roles=["SERVIDOR"],
            module_slug="govpro", membership_id=uuid.uuid4(),
            module_roles=["SERVIDOR"],
        )
        p = decode_token(tok)
        # module_roles é namespaced apenas pelo módulo de destino, nunca global
        assert isinstance(p["module_roles"], dict)
        assert set(p["module_roles"].keys()) == {"govpro"}

    def test_legacy_role_claim_preserved_in_module_token(self):
        # retrocompatibilidade: a claim `roles` continua presente (não reduzida)
        uid = uuid.uuid4()
        tok = create_module_token(
            uid, uuid.uuid4(), roles=["ADMIN", "ORG_MEMBER"],
            module_slug="govtask", membership_id=uuid.uuid4(),
            module_roles=["GOVTASK_ADMIN"],
        )
        p = decode_token(tok)
        assert set(p["roles"]) >= {"ADMIN", "ORG_MEMBER"}



class TestLastActiveManagerProtection:
    """Proteção do último gestor ativo (seções 26 e 35)."""

    

    def test_remove_last_active_manager_blocked(self):
        assert would_remove_last_active_manager(1, target_is_active_manager=True, actor_is_target=False)

    def test_demote_last_active_manager_blocked(self):
        assert would_remove_last_active_manager(1, target_is_active_manager=True, actor_is_target=False)

    def test_remove_one_of_two_managers_allowed(self):
        assert not would_remove_last_active_manager(2, target_is_active_manager=True, actor_is_target=False)

    def test_self_demote_when_alone_blocked(self):
        assert would_remove_last_active_manager(1, target_is_active_manager=True, actor_is_target=True)

    def test_promoting_to_manager_never_removes(self):
        # nova_role é gestor -> ação mantém gestor, nunca remove
        assert not would_remove_last_active_manager(1, target_is_active_manager=True, actor_is_target=True, new_role_is_manager=True)

    def test_removing_non_manager_is_allowed(self):
        assert not would_remove_last_active_manager(2, target_is_active_manager=False, actor_is_target=False)

    def test_suspending_non_manager_allowed(self):
        assert not would_remove_last_active_manager(1, target_is_active_manager=False, actor_is_target=False)
