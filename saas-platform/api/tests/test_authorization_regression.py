"""Testes de regressão de AUTORIZAÇÃO (auditoria de segurança 2026-08-17).

Travam as proteções contra escalada de privilégio verificadas na auditoria.
São propositalmente self-contained (sem banco/HTTP) para rodar no CI e impedir
regressões: se alguém adicionar um campo privilegiado ao schema de auto-serviço
ou enfraquecer a validação do JWT, um destes testes falha.
"""

import jwt
import pytest

from app.core.security import create_access_token, decode_token
from app.schemas.schemas import ProfileUpdate
import uuid


# ── Mass assignment / over-posting ────────────────────────────────────────────
# PUT /api/v1/auth/me usa ProfileUpdate. Ele NÃO pode expor campos de privilégio,
# senão um usuário comum vira admin editando o próprio perfil.
PRIVILEGE_FIELDS = {
    "is_platform_admin",
    "platform_role",
    "is_organization_admin",
    "organization_id",
    "module_permissions",
    "is_active",
}


def test_profile_update_nao_expoe_campos_de_privilegio():
    allowed = set(ProfileUpdate.model_fields.keys())
    leaked = allowed & PRIVILEGE_FIELDS
    assert not leaked, (
        f"ProfileUpdate (auto-serviço) expõe campo(s) privilegiado(s): {leaked}. "
        "Um usuário comum poderia escalar privilégio via PUT /auth/me."
    )


def test_profile_update_ignora_campos_extras_enviados_pelo_cliente():
    # Ainda que o cliente injete is_platform_admin no corpo, o schema descarta.
    body = ProfileUpdate.model_validate(
        {"name": "Fulano", "is_platform_admin": True, "platform_role": "SUPER_ADMIN"}
    )
    dumped = body.model_dump(exclude_unset=True)
    assert "is_platform_admin" not in dumped
    assert "platform_role" not in dumped
    assert dumped.get("name") == "Fulano"


# ── Integridade do JWT ────────────────────────────────────────────────────────
def test_token_assinado_com_outro_segredo_e_rejeitado():
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "is_platform_admin": True},
        "segredo-do-atacante",
        algorithm="HS256",
    )
    with pytest.raises(Exception):
        decode_token(forged)


def test_token_alg_none_e_rejeitado():
    # Ataque clássico: alg=none. A verificação exige assinatura HS256.
    token = jwt.encode({"sub": "x", "type": "access"}, key="", algorithm="none")
    with pytest.raises(Exception):
        decode_token(token)


def test_claims_de_role_vem_do_servidor_nao_do_cliente():
    # O servidor emite o token com os roles que ELE define; o cliente não
    # consegue "pedir" roles — eles são argumento server-side de create_access_token.
    uid = uuid.uuid4()
    token = create_access_token(user_id=uid, roles=["ORG_MEMBER"], is_platform_admin=False)
    payload = decode_token(token)
    assert payload["roles"] == ["ORG_MEMBER"]
    assert payload["is_platform_admin"] is False
    assert payload["sub"] == str(uid)
