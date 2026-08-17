"""Ponte de login de demonstração (seção 128, 138).

Só existe com `ENABLE_DEV_LOGIN=true` (nunca em produção — bloqueado também em
`Settings._validate_secrets`). Permite logar diretamente com uma das 7
personas fictícias semeadas em `scripts/seed.py`, sem depender do shell da
plataforma GovSistem — essencial para demonstrar a POC de forma autônoma e
para o "Modo Demonstração" de trocar de persona (seção 138).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.core.security import create_access_token, verify_password
from app.models.organizacao import User


async def listar_personas(db: AsyncSession) -> list[User]:
    usuarios = (
        await db.scalars(
            select(User).where(User.senha_demo_hash.is_not(None), User.ativo.is_(True)).order_by(User.email)
        )
    ).all()
    return list(usuarios)


async def autenticar_persona(db: AsyncSession, *, email: str, senha: str) -> tuple[User, str]:
    usuario = await db.scalar(
        select(User).where(User.email == email.strip().lower(), User.senha_demo_hash.is_not(None))
    )
    if usuario is None or not usuario.ativo:
        raise AppError("Persona de demonstração não encontrada.", 401, "credenciais_invalidas")
    if not verify_password(senha, usuario.senha_demo_hash):
        raise AppError("Senha de demonstração inválida.", 401, "credenciais_invalidas")

    token = create_access_token(
        str(usuario.id), extra={"perfil": usuario.perfil, "email": usuario.email}, token_type="access"
    )
    return usuario, token
