"""Despacho multicanal de notificações (§41).

O canal in-app é gravado por `services.notifications.criar_notificacao` — é o
registro que sustenta o sino e a auditoria da comunicação, e não depende de
preferência. Aqui decidimos os canais **adicionais**:

- **Tempo real (§127):** todo evento publica um sinal para o navegador.
- **E-mail:** só sai se o usuário tiver optado, o tipo estiver no escopo dele e
  o SMTP estiver configurado. Alguns tipos são obrigatórios e ignoram a lista
  de opção — atraso escalado, devolução e prazo vencido não deveriam depender de
  o usuário ter marcado a caixinha.
- **WhatsApp e push** entram como novos ramos quando houver provedor. Não há
  canal simulado: um canal que não existe simplesmente não é chamado.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.enums import TipoNotificacao
from app.models.notificacao import Notificacao
from app.models.notificacao_preferencia import NotificacaoPreferencia
from app.models.user import User
from app.services import email, email_outbox, realtime

logger = logging.getLogger("govtask.notificacoes")

# Tipos que furam a lista de opção quando o e-mail está ligado: são os que
# costumam chegar tarde demais se ninguém olhar o sistema.
TIPOS_OBRIGATORIOS = frozenset({
    TipoNotificacao.PRAZO_VENCIDO,
    TipoNotificacao.TAREFA_DEVOLVIDA,
    TipoNotificacao.ATRASO_ESCALADO,
})

_ASSUNTOS = {
    TipoNotificacao.TAREFA_ATRIBUIDA: "Nova tarefa atribuída a você",
    TipoNotificacao.TAREFA_DEVOLVIDA: "Tarefa devolvida para correção",
    TipoNotificacao.TAREFA_ENTREGUE: "Tarefa entregue aguardando revisão",
    TipoNotificacao.PRAZO_PROXIMO: "Prazo se aproximando",
    TipoNotificacao.PRAZO_VENCIDO: "Prazo vencido",
    TipoNotificacao.ATRASO_ESCALADO: "Atraso escalado",
    TipoNotificacao.COMENTARIO_MENCAO: "Você foi mencionado",
    TipoNotificacao.PROTOCOLO_ATUALIZADO: "Protocolo atualizado",
    TipoNotificacao.CONTESTACAO_ABERTA: "Contestação de prazo aberta",
    TipoNotificacao.CONTESTACAO_DECIDIDA: "Contestação decidida",
    TipoNotificacao.DILIGENCIA_RECEBIDA: "Diligência recebida",
    TipoNotificacao.DILIGENCIA_RESPONDIDA: "Diligência respondida",
    TipoNotificacao.PRESTACAO_ENVIADA: "Prestação de contas enviada",
    TipoNotificacao.REPASSE_RECEBIDO: "Repasse recebido",
}


async def obter_preferencia(
    db: AsyncSession, user_id: uuid.UUID
) -> NotificacaoPreferencia | None:
    return (
        await db.execute(
            select(NotificacaoPreferencia).where(
                NotificacaoPreferencia.user_id == user_id
            )
        )
    ).scalar_one_or_none()


def _normalizar(tipo) -> TipoNotificacao | None:
    if isinstance(tipo, TipoNotificacao):
        return tipo
    try:
        return TipoNotificacao(tipo)
    except (ValueError, TypeError):
        return None


def deve_enviar_email(
    preferencia: NotificacaoPreferencia | None, tipo
) -> bool:
    """Regra pura, testável sem banco: quem recebe e-mail deste tipo?"""
    if preferencia is None or not preferencia.email_ativo:
        return False
    normalizado = _normalizar(tipo)
    if normalizado in TIPOS_OBRIGATORIOS:
        return True
    tipos = preferencia.tipos_email or []
    # Lista vazia significa "todos os tipos" — é o padrão de quem liga o e-mail
    # sem querer escolher um por um.
    return not tipos or (normalizado is not None and normalizado.value in tipos)


def _corpo(notificacao: Notificacao) -> str:
    linhas = [notificacao.mensagem, ""]
    if notificacao.demanda_id:
        linhas.append(
            f"Demanda: {settings.PUBLIC_URL.rstrip('/')}/demandas/{notificacao.demanda_id}"
        )
    if notificacao.tarefa_id:
        linhas.append(
            f"Tarefa: {settings.PUBLIC_URL.rstrip('/')}/tarefas/{notificacao.tarefa_id}"
        )
    linhas.append("")
    linhas.append("Você recebe este e-mail por ter ativado as notificações por e-mail no GovTask.")
    return "\n".join(linhas)


async def despachar(db: AsyncSession, notificacao: Notificacao) -> None:
    """Publica o sinal em tempo real e, se cabível, envia o e-mail."""
    await realtime.publish(
        notificacao.destinatario_id,
        {
            "tipo": "notificacao",
            "notificacao_id": str(notificacao.id),
            "tipo_notificacao": _normalizar(notificacao.tipo).value
            if _normalizar(notificacao.tipo)
            else str(notificacao.tipo),
            "demanda_id": str(notificacao.demanda_id) if notificacao.demanda_id else None,
            "tarefa_id": str(notificacao.tarefa_id) if notificacao.tarefa_id else None,
        },
    )

    if not email.configurado():
        return
    try:
        preferencia = await obter_preferencia(db, notificacao.destinatario_id)
    except Exception:
        logger.warning("falha ao ler preferências de notificação", exc_info=True)
        return
    if not deve_enviar_email(preferencia, notificacao.tipo):
        return

    destinatario = await db.get(User, notificacao.destinatario_id)
    if destinatario is None or not destinatario.email:
        return
    tipo = _normalizar(notificacao.tipo)
    assunto = _ASSUNTOS.get(tipo, "Atualização no GovTask")
    # Enfileira, não envia: o processador da outbox cuida da entrega e da
    # retentativa, fora do fluxo que gerou o aviso. Sem outbox ligada, envia
    # direto (comportamento antigo) para não deixar o e-mail sem saída.
    if settings.EMAIL_OUTBOX_ENABLED:
        await email_outbox.enfileirar(
            db, notificacao, destinatario.organization_id, destinatario.email, assunto, _corpo(notificacao)
        )
    else:
        await email.enviar(destinatario.email, assunto, _corpo(notificacao))
