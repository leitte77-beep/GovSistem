"""Motor de autorização: permissão ∧ escopo ∧ sigilo.

A decisão nunca é tomada apenas pelo frontend. Toda rota usa ``exigir`` ou uma
função explícita deste módulo. Administradores passam por tudo; os demais
precisam de um grupo ativo cujo escopo contenha o recurso.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import Depends

from app.core.auth import get_current_user
from app.core.errors import PermissionDenied
from app.core.permissoes import ALL_PERMISSIONS, Permissao
from app.models.enums import NivelSigilo
from app.models.nucleo import Usuario, UsuarioGrupo

_PERMISSOES_ADMIN = frozenset(p.value for p in ALL_PERMISSIONS)


def grupos_ativos(usuario: Usuario) -> list[UsuarioGrupo]:
    hoje = date.today()
    return [
        ug
        for ug in getattr(usuario, "grupos", []) or []
        if ug.ativo
        and ug.grupo is not None
        and ug.vigencia_inicio <= hoje
        and (ug.vigencia_fim is None or ug.vigencia_fim >= hoje)
    ]


def permissoes_efetivas(usuario: Usuario) -> set[str]:
    if usuario is None:
        return set()
    ativos = grupos_ativos(usuario)
    if any(ug.grupo.codigo == "ADMIN" for ug in ativos):
        return set(_PERMISSOES_ADMIN)
    perms = {
        gp.permissao_codigo
        for ug in ativos
        for gp in (ug.grupo.permissoes or [])
    }
    perms.update(usuario.permissoes_extras or [])
    perms.difference_update(usuario.permissoes_revogadas or [])
    return perms


def tem_permissao(usuario: Usuario, permissao: Permissao | str) -> bool:
    codigo = permissao.value if isinstance(permissao, Permissao) else str(permissao)
    return codigo in permissoes_efetivas(usuario)


def escopo_permite(
    usuario: Usuario,
    permissao: Permissao | str,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    equipe_id: uuid.UUID | None = None,
    especialidade_id: uuid.UUID | None = None,
) -> bool:
    codigo = permissao.value if isinstance(permissao, Permissao) else str(permissao)
    ativos = grupos_ativos(usuario)
    if any(ug.grupo.codigo == "ADMIN" for ug in ativos):
        return True
    revogadas = set(usuario.permissoes_revogadas or [])
    if codigo in revogadas:
        return False
    for ug in ativos:
        permissoes = {gp.permissao_codigo for gp in (ug.grupo.permissoes or [])}
        if codigo not in permissoes and codigo not in (usuario.permissoes_extras or []):
            continue
        if estabelecimento_id and ug.estabelecimento_id not in (None, estabelecimento_id):
            continue
        if equipe_id and ug.equipe_id not in (None, equipe_id):
            continue
        if especialidade_id and ug.especialidade_id not in (None, especialidade_id):
            continue
        return True
    return False


def pode_ver_conteudo(
    usuario: Usuario,
    nivel_sigilo: NivelSigilo | str,
    *,
    especialidade_id: uuid.UUID | None = None,
) -> bool:
    nivel = NivelSigilo(nivel_sigilo) if isinstance(nivel_sigilo, str) else nivel_sigilo
    perms = permissoes_efetivas(usuario)
    admin = any(ug.grupo.codigo == "ADMIN" for ug in grupos_ativos(usuario))
    if nivel == NivelSigilo.SIGILO_DENUNCIA:
        return admin or Permissao.QUEBRA_SIGILO.value in perms
    if nivel == NivelSigilo.SIGILOSO:
        return admin or Permissao.PRONTUARIO_LER_SIGILOSO.value in perms
    if nivel == NivelSigilo.RESTRITO_ESPECIALIDADE:
        if admin or Permissao.PRONTUARIO_LER_SIGILOSO.value in perms:
            return True
        if not escopo_permite(usuario, Permissao.PRONTUARIO_LER):
            return False
        return any(
            ug.especialidade_id == especialidade_id
            for ug in grupos_ativos(usuario)
            if ug.especialidade_id is not None
        )
    return admin or escopo_permite(usuario, Permissao.PRONTUARIO_LER)


def velar(
    registro: dict,
    usuario: Usuario,
    *,
    nivel_sigilo: NivelSigilo | str,
    especialidade_id: uuid.UUID | None = None,
) -> dict:
    """Retorna o registro completo ou apenas metadados mínimos (velado)."""
    if pode_ver_conteudo(usuario, nivel_sigilo, especialidade_id=especialidade_id):
        return registro
    permitidos = {
        "id",
        "data",
        "data_atendimento",
        "unidade",
        "estabelecimento_id",
        "tipo",
        "nivel_sigilo",
        "profissional_id",
    }
    velado = {k: v for k, v in registro.items() if k in permitidos}
    velado.update(
        {
            "velado": True,
            "conteudo": None,
            "mensagem": (
                "Registro sigiloso. O conteúdo só é exibido ao profissional "
                "autorizado ou mediante quebra de sigilo justificada."
            ),
        }
    )
    return velado


def exigir(permissao: Permissao | str):
    """Dependência FastAPI que exige a permissão informada."""

    codigo = permissao.value if isinstance(permissao, Permissao) else str(permissao)

    async def _verificar(usuario: Usuario = Depends(get_current_user)) -> Usuario:
        if not tem_permissao(usuario, codigo):
            raise PermissionDenied(
                "Seu perfil não permite esta operação. "
                f"Permissão necessária: {codigo}."
            )
        return usuario

    return _verificar


async def usuario_autenticado(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    return usuario
