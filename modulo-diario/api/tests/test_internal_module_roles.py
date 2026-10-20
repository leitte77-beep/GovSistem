from app.api.v1.internal import _module_roles


def test_administrador_do_modulo_com_prefixo_vira_admin():
    roles = _module_roles(["ORG_MEMBER", "AUTOR", "REVISOR", "DIARIO_ADMIN"])
    assert roles == {"AUTOR", "REVISOR", "ADMIN"}


def test_sem_admin_nao_ganha_admin():
    assert _module_roles(["ORG_MEMBER", "AUTOR"]) == {"AUTOR"}
