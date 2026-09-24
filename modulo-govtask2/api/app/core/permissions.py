"""Permissões do GovTask. São cinco, de propósito.

A pergunta "quem pode o quê" é respondida em uma linha por papel. Só o
Assessor encaminha; o departamento trabalha a fase que recebe e devolve.
"""


class Perm:
    # Ver pedidos da organização.
    PEDIDO_VER = "pedido.ver"
    # Abrir um pedido novo (Assessor e Prefeito).
    PEDIDO_CRIAR = "pedido.criar"
    # Conduzir o fluxo: encaminhar a um setor, aguardar/retomar terceiro,
    # responder complemento, concluir e cancelar. É o Assessor.
    PEDIDO_ENCAMINHAR = "pedido.encaminhar"
    # Trabalhar uma tarefa: assumir, transferir, mencionar, comentar, anexar,
    # registrar medição, pedir complemento, negociar prazo e devolver.
    PEDIDO_TRABALHAR = "pedido.trabalhar"
    # Administração do módulo (sincronização, usuários, setores).
    ADMIN = "admin.config"


ALL_PERMISSIONS = frozenset(
    [
        Perm.PEDIDO_VER,
        Perm.PEDIDO_CRIAR,
        Perm.PEDIDO_ENCAMINHAR,
        Perm.PEDIDO_TRABALHAR,
        Perm.ADMIN,
    ]
)

ROLE_DEFAULT_PERMISSIONS: dict[str, set[str]] = {
    "ADMIN": set(ALL_PERMISSIONS),
    # Dono do fluxo: abre o pedido, encaminha aos setores, recebe de volta.
    "ASSESSOR": {
        Perm.PEDIDO_VER,
        Perm.PEDIDO_CRIAR,
        Perm.PEDIDO_ENCAMINHAR,
        Perm.PEDIDO_TRABALHAR,
    },
    # Lança o pedido e acompanha. Não encaminha nem trabalha.
    "PREFEITO": {Perm.PEDIDO_VER, Perm.PEDIDO_CRIAR},
    # Jurídico, Engenharia, Licitação, Contabilidade, Tesouraria: recebem a
    # tarefa, executam e devolvem ao Assessor.
    "DEPARTAMENTO": {Perm.PEDIDO_VER, Perm.PEDIDO_TRABALHAR},
    "CONSULTA": {Perm.PEDIDO_VER},
}


GESTORES = (Perm.ADMIN, Perm.PEDIDO_ENCAMINHAR)


def default_permissions_for_role(role_name: str) -> set[str]:
    return set(ROLE_DEFAULT_PERMISSIONS.get(role_name, set()))


PERFIS = ("PREFEITO", "ASSESSOR", "DEPARTAMENTO", "CONSULTA")


def perfil_efetivo(perfil_definido: str | None, papeis: set[str], perms: set[str]) -> str:
    """O papel da pessoa no GovTask, que decide a tela inicial.

    O perfil definido no módulo vence; sem ele, deduz-se dos papéis da
    plataforma (quem encaminha é Assessor, e assim por diante).
    """
    if perfil_definido in PERFIS:
        return perfil_definido
    if Perm.PEDIDO_ENCAMINHAR in perms:
        return "ASSESSOR"
    if "PREFEITO" in papeis:
        return "PREFEITO"
    if Perm.PEDIDO_TRABALHAR in perms:
        return "DEPARTAMENTO"
    return "CONSULTA"
