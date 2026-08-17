"""Sessão do usuário autenticado (via SSO da plataforma ou login de demonstração)."""

from fastapi import APIRouter, Depends

from app.core.auth import get_current_user, permissoes_do_usuario
from app.models.organizacao import User
from app.schemas.auth import UsuarioAtualOut

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.get("/me", response_model=UsuarioAtualOut)
async def me(user: User = Depends(get_current_user)):
    return UsuarioAtualOut(
        id=str(user.id),
        nome=user.nome,
        email=user.email,
        perfil=user.perfil,
        setor_id=str(user.setor_id) if user.setor_id else None,
        organizacao_id=str(user.organizacao_id),
        permissoes=sorted(permissoes_do_usuario(user)),
    )
