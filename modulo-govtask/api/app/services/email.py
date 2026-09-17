"""Envio de e-mail transacional (§41).

Canal externo opcional. Fica inerte a menos que `EMAIL_ENABLED` e `SMTP_HOST`
estejam configurados. O envio roda fora do event loop (`to_thread`) e é
best-effort: uma queda de SMTP não pode derrubar a operação que gerou a
notificação — no pior caso, o registro in-app continua lá.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("govtask.email")


def configurado() -> bool:
    return settings.EMAIL_ENABLED and bool(settings.SMTP_HOST)


def _enviar_sync(destino: str, assunto: str, corpo: str) -> None:
    mensagem = EmailMessage()
    mensagem["From"] = settings.SMTP_FROM
    mensagem["To"] = destino
    mensagem["Subject"] = assunto
    mensagem.set_content(corpo)

    with smtplib.SMTP(
        settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SEGUNDOS
    ) as servidor:
        if settings.SMTP_USE_TLS:
            servidor.starttls()
        if settings.SMTP_USER:
            servidor.login(
                settings.SMTP_USER, settings.SMTP_PASSWORD.get_secret_value()
            )
        servidor.send_message(mensagem)


async def enviar(destino: str, assunto: str, corpo: str) -> bool:
    """Tenta enviar. Devolve `True` se saiu, `False` se o canal está desligado
    ou o SMTP recusou — nunca levanta, para não contaminar o fluxo chamador."""
    if not configurado():
        return False
    try:
        await asyncio.to_thread(_enviar_sync, destino, assunto, corpo)
        return True
    except Exception:
        logger.warning("falha ao enviar e-mail para %s", destino, exc_info=True)
        return False
