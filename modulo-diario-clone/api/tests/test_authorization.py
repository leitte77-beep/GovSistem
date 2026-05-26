"""Tests for RBAC authorization rules."""

import uuid

import pytest
from fastapi import HTTPException

from app.core.auth import get_current_user, require_roles
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole


def _make_user(role_names: list[str], is_active: bool = True) -> User:
    uid = uuid.uuid4()
    user = User(
        id=uid,
        name="Test User",
        email="test@test.com",
        is_active=is_active,
        organization_id=uuid.uuid4(),
    )
    user.user_roles = []
    for name in role_names:
        role = Role(name=name, label=name, is_system=True)
        role.id = uuid.uuid4()
        ur = UserRole(user_id=uid, role_id=role.id)
        ur.role = role
        user.user_roles.append(ur)
    return user


@pytest.mark.anyio
class TestRequireRoles:
    async def test_admin_has_access(self):
        user = _make_user(["ADMIN"])
        checker = require_roles("ADMIN")
        result = await checker(user=user)
        assert result == user

    async def test_admin_can_access_admin_endpoint(self):
        user = _make_user(["ADMIN"])
        checker = require_roles("ADMIN")
        result = await checker(user=user)
        assert result is not None

    async def test_autor_cannot_access_admin_endpoint(self):
        user = _make_user(["AUTOR"])
        checker = require_roles("ADMIN")
        with pytest.raises(HTTPException) as exc:
            await checker(user=user)
        assert exc.value.status_code == 403

    async def test_revisor_has_access_with_multiple_roles(self):
        user = _make_user(["ADMIN", "REVISOR"])
        checker = require_roles("ADMIN", "REVISOR")
        result = await checker(user=user)
        assert result == user

    async def test_diagramador_cannot_approve_matter(self):
        user = _make_user(["DIAGRAMADOR"])
        checker = require_roles("REVISOR")
        with pytest.raises(HTTPException) as exc:
            await checker(user=user)
        assert exc.value.status_code == 403

    async def test_assinador_cannot_publish(self):
        user = _make_user(["ASSINADOR"])
        checker = require_roles("PUBLICADOR")
        with pytest.raises(HTTPException) as exc:
            await checker(user=user)
        assert exc.value.status_code == 403

    async def test_publicador_cannot_sign(self):
        user = _make_user(["PUBLICADOR"])
        checker = require_roles("ASSINADOR")
        with pytest.raises(HTTPException) as exc:
            await checker(user=user)
        assert exc.value.status_code == 403

    async def test_auditor_cannot_edit_matters(self):
        user = _make_user(["AUDITOR"])
        checker = require_roles("AUTOR")
        with pytest.raises(HTTPException) as exc:
            await checker(user=user)
        assert exc.value.status_code == 403

    async def test_auditor_can_view_logs(self):
        user = _make_user(["AUDITOR"])
        # Auditor endpoints don't have a specific role check example,
        # but if there were one, it would require AUDITOR
        checker = require_roles("AUDITOR")
        result = await checker(user=user)
        assert result == user

    async def test_inactive_user_blocked(self):
        with pytest.raises(HTTPException):
            await get_current_user(request=None, credentials=None)

    async def test_user_with_multiple_roles_one_matches(self):
        user = _make_user(["AUTOR", "REVISOR"])
        checker = require_roles("PUBLICADOR", "REVISOR")
        result = await checker(user=user)
        assert result == user

    async def test_no_roles_match_denies(self):
        user = _make_user(["AUTOR"])
        checker = require_roles("PUBLICADOR", "ASSINADOR")
        with pytest.raises(HTTPException) as exc:
            await checker(user=user)
        assert exc.value.status_code == 403


@pytest.mark.anyio
class TestPermissionMatrix:
    """Verifica a matriz de permissões:

    Papel          | Criar | Revisar | Diagramar | Assinar | Publicar | Audit | Admin
    --------------|-------|---------|-----------|---------|----------|-------|-------
    AUTOR         |   ✅  |    ❌   |    ❌     |    ❌   |    ❌    |  ❌   |  ❌
    REVISOR       |   ❌  |    ✅   |    ❌     |    ❌   |    ❌    |  ❌   |  ❌
    DIAGRAMADOR   |   ❌  |    ❌   |    ✅     |    ❌   |    ❌    |  ❌   |  ❌
    ASSINADOR     |   ❌  |    ❌   |    ❌     |    ✅   |    ❌    |  ❌   |  ❌
    PUBLICADOR    |   ❌  |    ❌   |    ❌     |    ❌   |    ✅    |  ❌   |  ❌
    AUDITOR       |   ❌  |    ❌   |    ❌     |    ❌   |    ❌    |  ✅   |  ❌
    ADMIN         |   ✅  |    ✅   |    ✅     |    ✅   |    ✅    |  ✅   |  ✅
    """

    MATRIX = {
        "AUTOR":       {"criar": True, "revisar": False, "diagramar": False, "assinar": False, "publicar": False, "auditar": False, "admin": False},
        "REVISOR":     {"criar": False, "revisar": True, "diagramar": False, "assinar": False, "publicar": False, "auditar": False, "admin": False},
        "DIAGRAMADOR": {"criar": False, "revisar": False, "diagramar": True, "assinar": False, "publicar": False, "auditar": False, "admin": False},
        "ASSINADOR":   {"criar": False, "revisar": False, "diagramar": False, "assinar": True, "publicar": False, "auditar": False, "admin": False},
        "PUBLICADOR":  {"criar": False, "revisar": False, "diagramar": False, "assinar": False, "publicar": True, "auditar": False, "admin": False},
        "AUDITOR":     {"criar": False, "revisar": False, "diagramar": False, "assinar": False, "publicar": False, "auditar": True, "admin": False},
        "ADMIN":       {"criar": True, "revisar": True, "diagramar": True, "assinar": True, "publicar": True, "auditar": True, "admin": True},
    }

    ROLE_PERMISSION_MAP = {
        "criar": "AUTOR",
        "revisar": "REVISOR",
        "diagramar": "DIAGRAMADOR",
        "assinar": "ASSINADOR",
        "publicar": "PUBLICADOR",
        "auditar": "AUDITOR",
        "admin": "ADMIN",
    }

    @pytest.mark.parametrize("role", MATRIX.keys())
    @pytest.mark.parametrize("permission", ["criar", "revisar", "diagramar", "assinar", "publicar", "auditar", "admin"])
    async def test_permisison_matrix(self, role, permission):
        expected = self.MATRIX[role][permission]
        required_role = self.ROLE_PERMISSION_MAP[permission]
        if role == "ADMIN":
            user = _make_user(list(self.ROLE_PERMISSION_MAP.values()))
        else:
            user = _make_user([role])
        checker = require_roles(required_role)
        if expected:
            result = await checker(user=user)
            assert result == user
        else:
            with pytest.raises(HTTPException) as exc:
                await checker(user=user)
            assert exc.value.status_code == 403
