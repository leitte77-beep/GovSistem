import pytest

from app.core.roles import (
    MODULE_ROLE_CATALOG,
    is_valid_grant,
    normalize_grant_role,
    valid_role_names,
)


class TestGovSocialRoles:

    def test_govsocial_roles_in_catalog(self):
        assert "govsocial" in MODULE_ROLE_CATALOG
        roles = MODULE_ROLE_CATALOG["govsocial"]
        role_names = {r["name"] for r in roles}
        assert "GOVSOCIAL_ADMIN" in role_names
        assert "gestor_municipal" in role_names
        assert "coordenador_unidade" in role_names
        assert "tecnico_superior" in role_names
        assert "tecnico_medio" in role_names
        assert "recepcao" in role_names
        assert "vigilancia" in role_names
        assert "conselho" in role_names
        assert len(roles) == 8

    def test_govsocial_admin_not_plain_admin(self):
        govsocial_roles = {r["name"] for r in MODULE_ROLE_CATALOG["govsocial"]}
        assert "ADMIN" not in govsocial_roles

    def test_valid_role_names_govsocial(self):
        names = valid_role_names("govsocial")
        assert "GOVSOCIAL_ADMIN" in names
        assert "ADMIN" not in names

    def test_is_valid_grant_govsocial(self):
        assert is_valid_grant("govsocial", "GOVSOCIAL_ADMIN") is True
        assert is_valid_grant("govsocial", "gestor_municipal") is True
        assert is_valid_grant("govsocial", "INVALID_ROLE") is False

    def test_legacy_admin_accepted_as_valid(self):
        assert is_valid_grant("govsocial", "ADMIN") is True
        assert is_valid_grant("diario", "ADMIN") is True
        assert is_valid_grant("govtask", "ADMIN") is True

    def test_legacy_admin_normalized(self):
        assert normalize_grant_role("govsocial", "ADMIN") == "GOVSOCIAL_ADMIN"
        assert normalize_grant_role("diario", "ADMIN") == "DIARIO_ADMIN"
        assert normalize_grant_role("govtask", "ADMIN") == "GOVTASK_ADMIN"

    def test_canonical_names_not_changed(self):
        assert normalize_grant_role("govsocial", "GOVSOCIAL_ADMIN") == "GOVSOCIAL_ADMIN"
        assert normalize_grant_role("govsocial", "gestor_municipal") == "gestor_municipal"
        assert normalize_grant_role("govsocial", "UNKNOWN") == "UNKNOWN"

    def test_diario_admin_renamed(self):
        diario_roles = {r["name"] for r in MODULE_ROLE_CATALOG["diario"]}
        assert "ADMIN" not in diario_roles
        assert "DIARIO_ADMIN" in diario_roles
        assert "AUTOR" in diario_roles

    def test_govtask_admin_renamed(self):
        govtask_roles = {r["name"] for r in MODULE_ROLE_CATALOG["govtask"]}
        assert "ADMIN" not in govtask_roles
        assert "GOVTASK_ADMIN" in govtask_roles

    def test_no_module_has_plain_admin_role(self):
        for slug, roles in MODULE_ROLE_CATALOG.items():
            role_names = {r["name"] for r in roles}
            assert "ADMIN" not in role_names, (
                f"Module '{slug}' has plain ADMIN role — must be prefixed"
            )

    def test_unknown_module_valid_role_names(self):
        assert valid_role_names("nonexistent") == set()

    def test_unknown_module_is_valid_grant(self):
        assert is_valid_grant("nonexistent", "ADMIN") is False


class TestModuleAccessRequestSchema:

    def test_valid_module_slugs(self):
        from app.schemas.schemas import ModuleAccessRequest

        valid_slugs = ["diario", "financeiro", "chatgov", "govtask", "govsocial", "govavalia", "govouve"]
        for slug in valid_slugs:
            req = ModuleAccessRequest(module_slug=slug)
            assert req.module_slug == slug

    def test_invalid_module_slug_raises(self):
        from app.schemas.schemas import ModuleAccessRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            ModuleAccessRequest(module_slug="hacker_module")

    def test_empty_module_slug_raises(self):
        from app.schemas.schemas import ModuleAccessRequest
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            ModuleAccessRequest(module_slug="")
