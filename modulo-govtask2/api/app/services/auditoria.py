"""Registro de alterações de configuração: quem mudou o quê, de quê para quê."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auth_models import User
from app.models.config import AuditoriaConfig


def registrar(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    autor: User,
    alvo_tipo: str,
    alvo_nome: str,
    campo: str,
    antes,
    depois,
) -> None:
    if antes == depois:
        return
    db.add(
        AuditoriaConfig(
            organization_id=organization_id,
            autor_id=autor.id,
            autor_nome=autor.name,
            alvo_tipo=alvo_tipo,
            alvo_nome=(alvo_nome or "")[:255],
            campo=campo,
            antes=None if antes is None else str(antes)[:255],
            depois=None if depois is None else str(depois)[:255],
        )
    )
