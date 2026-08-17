"""Central de notificações internas (seção 73).

Canais externos (e-mail, WhatsApp — seções 74-75) são deliberadamente
adaptadores vazios: a notificação sempre é gravada aqui dentro do sistema; o
envio externo, quando existir, é responsabilidade de
`app/services/integracoes/`, nunca bloqueando o fluxo principal.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.governanca import Notificacao


async def notificar_usuario(
    db: AsyncSession,
    *,
    organizacao_id: uuid.UUID,
    usuario_id: uuid.UUID | None,
    setor_id: uuid.UUID | None,
    tipo: str,
    titulo: str,
    mensagem: str,
    entidade_tipo: str | None = None,
    entidade_id: uuid.UUID | None = None,
    link: str | None = None,
) -> Notificacao:
    notificacao = Notificacao(
        organizacao_id=organizacao_id,
        destinatario_usuario_id=usuario_id,
        destinatario_setor_id=setor_id if usuario_id is None else None,
        tipo=tipo,
        titulo=titulo,
        mensagem=mensagem,
        entidade_tipo=entidade_tipo,
        entidade_id=entidade_id,
        link=link,
    )
    db.add(notificacao)
    return notificacao
