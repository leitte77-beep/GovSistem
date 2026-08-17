"""Ponte de login de demonstração — só existe com ENABLE_DEV_LOGIN=true.

Sem a flag, ambas as rotas respondem 404 (nunca ativadas no compose de
produção — reforçado também em `Settings._validate_secrets`).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import permissoes_do_usuario
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError
from app.schemas.auth import DevLoginRequest, PersonaOut, TokenOut, UsuarioAtualOut
from app.services.dev_auth import autenticar_persona, listar_personas

router = APIRouter(prefix="/auth/dev", tags=["Autenticação (demonstração)"])


def _rota_disponivel() -> None:
    raise AppError("Rota não encontrada.", 404, "nao_encontrado")


@router.get("/personas", response_model=list[PersonaOut])
async def personas(db: AsyncSession = Depends(get_db)):
    if not settings.ENABLE_DEV_LOGIN:
        _rota_disponivel()
    usuarios = await listar_personas(db)
    return [
        PersonaOut(email=u.email, nome=u.nome, perfil=u.perfil, cargo=u.cargo) for u in usuarios
    ]


@router.post("/login", response_model=TokenOut)
async def login(payload: DevLoginRequest, db: AsyncSession = Depends(get_db)):
    if not settings.ENABLE_DEV_LOGIN:
        _rota_disponivel()
    usuario, token = await autenticar_persona(db, email=payload.email, senha=payload.senha)
    return TokenOut(
        token=token,
        usuario=UsuarioAtualOut(
            id=str(usuario.id),
            nome=usuario.nome,
            email=usuario.email,
            perfil=usuario.perfil,
            setor_id=str(usuario.setor_id) if usuario.setor_id else None,
            organizacao_id=str(usuario.organizacao_id),
            permissoes=sorted(permissoes_do_usuario(usuario)),
        ),
    )
