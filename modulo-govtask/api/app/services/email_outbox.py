"""Outbox de envio de e-mail (§41, §126).

O envio externo não acontece no meio da operação que gerou o aviso: ela grava a
linha e segue. Um processador pega os pendentes, tenta de novo com espera
crescente e desiste depois do limite. Assim uma queda momentânea de SMTP não
perde a mensagem, e uma varredura de prazos com centenas de avisos não trava
esperando a rede a cada um.

A chave única `(notificacao_id, canal)` torna o enfileiramento idempotente:
reprocessar a mesma notificação não cria um segundo e-mail.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.enums import CanalNotificacao, StatusEnvio
from app.models.notificacao import Notificacao
from app.models.notificacao_envio import NotificacaoEnvio
from app.services import email

logger = logging.getLogger("govtask.email_outbox")


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _proxima_tentativa(tentativas: int) -> datetime:
    # Espera crescente até 1h: 60s, 120s, 240s…
    espera = min(60 * (2 ** max(tentativas - 1, 0)), 3600)
    return _agora() + timedelta(seconds=espera)


async def enfileirar(
    db: AsyncSession,
    notificacao: Notificacao,
    organization_id,
    destinatario: str,
    assunto: str,
    corpo: str,
) -> NotificacaoEnvio:
    existente = (
        await db.execute(
            select(NotificacaoEnvio).where(
                NotificacaoEnvio.notificacao_id == notificacao.id,
                NotificacaoEnvio.canal == CanalNotificacao.EMAIL,
            )
        )
    ).scalar_one_or_none()
    if existente is not None:
        return existente

    envio = NotificacaoEnvio(
        organization_id=organization_id,
        notificacao_id=notificacao.id,
        canal=CanalNotificacao.EMAIL,
        destinatario=destinatario,
        assunto=assunto,
        corpo=corpo,
        status=StatusEnvio.PENDENTE,
        tentativas=0,
        agendado_para=_agora(),
    )
    db.add(envio)
    await db.flush()
    return envio


async def processar_pendentes(db: AsyncSession, limite: int = 50) -> dict:
    """Tenta entregar o que está vencido. Devolve o resumo da passagem."""
    agora = _agora()
    pendentes = (
        (
            await db.execute(
                select(NotificacaoEnvio)
                .where(
                    NotificacaoEnvio.status == StatusEnvio.PENDENTE,
                    NotificacaoEnvio.agendado_para <= agora,
                )
                .order_by(NotificacaoEnvio.agendado_para)
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )

    enviados = falhas = descartados = 0
    for envio in pendentes:
        entregue = await email.enviar(envio.destinatario, envio.assunto, envio.corpo)
        envio.tentativas += 1
        if entregue:
            envio.status = StatusEnvio.ENVIADO
            envio.enviado_em = _agora()
            envio.ultimo_erro = None
            enviados += 1
        elif envio.tentativas >= settings.EMAIL_MAX_TENTATIVAS:
            envio.status = StatusEnvio.DESCARTADO
            envio.ultimo_erro = "Limite de tentativas atingido"
            descartados += 1
        else:
            # Continua PENDENTE, apenas reagendado: é o que faz a retentativa
            # acontecer sem uma segunda tabela de estado.
            envio.ultimo_erro = "Falha ao enviar; nova tentativa agendada"
            envio.agendado_para = _proxima_tentativa(envio.tentativas)
            falhas += 1

    if pendentes:
        await db.commit()
        logger.info(
            "outbox processada",
            extra={"enviados": enviados, "falhas": falhas, "descartados": descartados},
        )
    return {"processados": len(pendentes), "enviados": enviados, "falhas": falhas, "descartados": descartados}
