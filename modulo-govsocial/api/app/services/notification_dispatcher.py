"""NotificationDispatcher — roteamento multicanal e providers (Email/WhatsApp/Push/SMS)."""
from __future__ import annotations

import json
import logging
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from enum import Enum
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import decrypt_text
from app.models.notification_config import NotificationChannelConfig

logger = logging.getLogger("govsocial.notifications")


class NotificationEvent(str, Enum):
    NOVO_ENCAMINHAMENTO = "NOVO_ENCAMINHAMENTO"
    BENEFICIO_APROVADO = "BENEFICIO_APROVADO"
    AGENDAMENTO_LEMBRETE = "AGENDAMENTO_LEMBRETE"
    PRAZO_VENCENDO = "PRAZO_VENCENDO"
    DOCUMENTO_DISPONIVEL = "DOCUMENTO_DISPONIVEL"


TEMPLATES: dict[str, dict[str, str]] = {
    NotificationEvent.NOVO_ENCAMINHAMENTO: {
        "short": "GovSocial: Novo encaminhamento registrado para {nome}. Acesse o sistema para mais detalhes.",  # noqa: E501
        "long": (
            "<h2>Novo Encaminhamento</h2>"
            "<p>Prezado(a) {nome},</p>"
            "<p>Um novo encaminhamento foi registrado no GovSocial:</p>"
            "<ul>"
            "<li><strong>Tipo:</strong> {tipo_encaminhamento}</li>"
            "<li><strong>Origem:</strong> {origem}</li>"
            "<li><strong>Data:</strong> {data}</li>"
            "</ul>"
            "<p>Acesse o sistema para visualizar os detalhes completos.</p>"
            "<p>Atenciosamente,<br>Equipe GovSocial</p>"
        ),
    },
    NotificationEvent.BENEFICIO_APROVADO: {
        "short": "GovSocial: Beneficio {beneficio} aprovado para {nome}. Dirija-se a unidade para retirada.",  # noqa: E501
        "long": (
            "<h2>Beneficio Aprovado</h2>"
            "<p>Prezado(a) {nome},</p>"
            "<p>O beneficio <strong>{beneficio}</strong> foi aprovado:</p>"
            "<ul>"
            "<li><strong>Valor:</strong> {valor}</li>"
            "<li><strong>Unidade de retirada:</strong> {unidade}</li>"
            "<li><strong>Prazo:</strong> {prazo}</li>"
            "</ul>"
            "<p>Compareca a unidade com documento de identificacao para retirada.</p>"
            "<p>Atenciosamente,<br>Equipe GovSocial</p>"
        ),
    },
    NotificationEvent.AGENDAMENTO_LEMBRETE: {
        "short": "GovSocial: Lembrete de {tipo_atendimento} amanha ({horario}) em {local}. Nao falte!",  # noqa: E501
        "long": (
            "<h2>Lembrete de Agendamento</h2>"
            "<p>Prezado(a) {nome},</p>"
            "<p>Lembramos que voce tem um atendimento agendado:</p>"
            "<ul>"
            "<li><strong>Tipo:</strong> {tipo_atendimento}</li>"
            "<li><strong>Data:</strong> {data}</li>"
            "<li><strong>Horario:</strong> {horario}</li>"
            "<li><strong>Local:</strong> {local}</li>"
            "</ul>"
            "<p>Em caso de impossibilidade, cancele ou reagende pelo portal.</p>"
            "<p>Atenciosamente,<br>Equipe GovSocial</p>"
        ),
    },
    NotificationEvent.PRAZO_VENCENDO: {
        "short": "GovSocial: {documento} vence em {dias} dias. Regularize para evitar suspensao de beneficios.",  # noqa: E501
        "long": (
            "<h2>Prazo de Documento Vencendo</h2>"
            "<p>Prezado(a) {nome},</p>"
            "<p>O documento <strong>{documento}</strong> vencera em <strong>{dias} dias</strong> "
            "({data_vencimento}).</p>"
            "<p>A regularizacao e necessaria para manter seus beneficios e cadastros ativos.</p>"
            "<p>Compareca a unidade mais proxima ou acesse o portal para mais informacoes.</p>"
            "<p>Atenciosamente,<br>Equipe GovSocial</p>"
        ),
    },
    NotificationEvent.DOCUMENTO_DISPONIVEL: {
        "short": "GovSocial: Documento {tipo_documento} disponivel no portal. Acesse para visualizar/baixar.",  # noqa: E501
        "long": (
            "<h2>Documento Disponivel</h2>"
            "<p>Prezado(a) {nome},</p>"
            "<p>Um novo documento esta disponivel para voce no portal GovSocial:</p>"
            "<ul>"
            "<li><strong>Documento:</strong> {tipo_documento}</li>"
            "<li><strong>Referencia:</strong> {referencia}</li>"
            "<li><strong>Data de emissao:</strong> {data_emissao}</li>"
            "</ul>"
            "<p>Acesse o portal para visualizar ou baixar o documento.</p>"
            "<p>Atenciosamente,<br>Equipe GovSocial</p>"
        ),
    },
}


def _render_template(event: NotificationEvent, channel: str, context: dict[str, Any]) -> str:
    """Renderiza template do evento para o canal (short=push/sms/whatsapp, long=email)."""
    tmpl = TEMPLATES.get(event, {})
    key = "long" if channel in ("EMAIL",) else "short"
    template = tmpl.get(key, "")
    try:
        return template.format(**context)
    except KeyError as e:
        logger.warning("Template key missing: %s for event %s", e, event)
        return template


# ── Base Provider ────────────────────────────────────────────────────────


class BaseProvider:
    async def send(self, config: dict, destination: str, body: str) -> bool:
        raise NotImplementedError


# ── Email Provider ───────────────────────────────────────────────────────


class EmailProvider(BaseProvider):
    async def send(self, config: dict, destination: str, body: str) -> bool:
        host = decrypt_text(config.get("smtp_host", "")) or config.get("smtp_host", "")
        port = config.get("smtp_port", 587)
        user = decrypt_text(config.get("smtp_user", "")) or config.get("smtp_user", "")
        password = decrypt_text(config.get("smtp_password", "")) or config.get("smtp_password", "")
        sender = config.get("sender_email", user) or "noreply@govsocial.local"

        if not host:
            logger.warning("EmailProvider: smtp_host nao configurado")
            return False

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "GovSocial - Notificacao"
        msg["From"] = sender
        msg["To"] = destination
        msg.attach(MIMEText(body, "html", "utf-8"))

        try:
            with smtplib.SMTP(host, int(port), timeout=15) as server:
                server.starttls()
                if user and password:
                    server.login(user, password)
                server.sendmail(sender, [destination], msg.as_string())
            logger.info("Email enviado para %s via %s:%s", destination, host, port)
            return True
        except Exception as e:
            logger.error("EmailProvider: falha ao enviar para %s: %s", destination, e)
            return False


# ── WhatsApp Provider ────────────────────────────────────────────────────


class WhatsAppProvider(BaseProvider):
    """Stub — envia via Twilio WhatsApp Business API.

    Credenciais esperadas no config_json:
      - twilio_account_sid
      - twilio_auth_token
      - twilio_phone_number (remetente verificado no Twilio)

    Para ativar, configure as credenciais e substitua este stub pela chamada real.
    """

    async def send(self, config: dict, destination: str, body: str) -> bool:
        account_sid = decrypt_text(
            config.get("twilio_account_sid", "")
        ) or config.get("twilio_account_sid", "")
        auth_token = decrypt_text(
            config.get("twilio_auth_token", "")
        ) or config.get("twilio_auth_token", "")
        from_number = config.get("twilio_phone_number", "")

        if not account_sid or not auth_token:
            logger.warning(
                "WhatsAppProvider: credenciais Twilio nao configuradas. "
                "Stub — mensagem NAO enviada. Destino=%s Corpo=%s",
                destination,
                body[:120],
            )
            return False

        try:
            from twilio.rest import Client
            client = Client(account_sid, auth_token)
            client.messages.create(
                body=body,
                from_=f"whatsapp:{from_number}",
                to=f"whatsapp:{destination}",
            )
            logger.info("WhatsApp enviado para %s", destination)
            return True
        except ImportError:
            logger.warning(
                "WhatsAppProvider: biblioteca twilio nao instalada. "
                "Stub — mensagem NAO enviada. Destino=%s Corpo=%s",
                destination,
                body[:120],
            )
            return False
        except Exception as e:
            logger.error("WhatsAppProvider: falha ao enviar para %s: %s", destination, e)
            return False


# ── Push Provider ────────────────────────────────────────────────────────


class PushProvider(BaseProvider):
    """Envia push notification via Firebase Cloud Messaging (FCM).

    Credenciais esperadas no config_json:
      - fcm_server_key  (legacy server key)
      - fcm_service_account_json  (conteudo do JSON da service account, opcional)
    """

    async def send(self, config: dict, destination: str, body: str) -> bool:
        server_key = decrypt_text(
            config.get("fcm_server_key", "")
        ) or config.get("fcm_server_key", "")
        sa_json = config.get("fcm_service_account_json")

        if not server_key and not sa_json:
            logger.warning(
                "PushProvider: fcm_server_key ou fcm_service_account_json nao configurados. "
                "Push NAO enviado. Token=%s Corpo=%s",
                destination,
                body[:120],
            )
            return False

        payload = {
            "message": {
                "token": destination,
                "notification": {
                    "title": "GovSocial",
                    "body": body,
                },
            }
        }

        try:
            if sa_json:
                return await self._send_via_oauth2(sa_json, payload)
            return await self._send_via_legacy(server_key, payload)
        except Exception as e:
            logger.error("PushProvider: falha ao enviar para %s: %s", destination, e)
            return False

    async def _send_via_legacy(self, server_key: str, payload: dict) -> bool:
        import urllib.request

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            "https://fcm.googleapis.com/fcm/send",
            data=data,
            headers={
                "Authorization": f"key={server_key}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("PushProvider (legacy): status=%s", resp.status)
        return True

    async def _send_via_oauth2(self, sa_json_str: str, payload: dict) -> bool:
        import urllib.request

        sa_info = json.loads(sa_json_str) if isinstance(sa_json_str, str) else sa_json_str

        try:
            import google.auth.transport.requests
            from google.oauth2 import service_account

            credentials = service_account.Credentials.from_service_account_info(
                sa_info,
                scopes=["https://www.googleapis.com/auth/firebase.messaging"],
            )
            request = google.auth.transport.requests.Request()
            credentials.refresh(request)
            token = credentials.token
        except ImportError:
            logger.warning(
                "PushProvider: google-auth nao instalado. Use fcm_server_key (legacy)."
            )
            return False

        project_id = sa_info.get("project_id", "")
        url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("PushProvider (oauth2): status=%s", resp.status)
        return True


# ── SMS Provider ─────────────────────────────────────────────────────────


class SMSProvider(BaseProvider):
    """Envia SMS via Twilio ou Zenvia (mesmo padrao do finalizacao.py)."""

    async def send(self, config: dict, destination: str, body: str) -> bool:
        provider = config.get("provider", "log")
        api_key = decrypt_text(config.get("api_key", "")) or config.get("api_key", "")
        sender = config.get("sender_id", "GovSocial")

        if provider == "twilio":
            try:
                from twilio.rest import Client

                sid, token = api_key.split(":", 1) if ":" in api_key else (api_key, "")
                client = Client(sid, token)
                client.messages.create(body=body[:160], from_=sender, to=destination)
                logger.info("SMS (twilio) enviado para %s", destination)
                return True
            except Exception as e:
                logger.error("SMSProvider (twilio): %s", e)
                return False

        elif provider == "zenvia":
            import urllib.request

            data = json.dumps({
                "from": sender,
                "to": destination,
                "contents": [{"type": "text", "text": body[:160]}],
            }).encode("utf-8")
            try:
                req = urllib.request.Request(
                    "https://api.zenvia.com/v2/channels/sms/messages",
                    data=data,
                    headers={
                        "X-API-TOKEN": api_key,
                        "Content-Type": "application/json",
                    },
                )
                with urllib.request.urlopen(req, timeout=10):
                    pass
                logger.info("SMS (zenvia) enviado para %s", destination)
                return True
            except Exception as e:
                logger.error("SMSProvider (zenvia): %s", e)
                return False

        elif provider == "log":
            logger.info("SMS (log) → %s: %s", destination, body[:160])
            return True

        logger.warning("SMSProvider: provider '%s' desconhecido", provider)
        return False


# ── Dispatcher ───────────────────────────────────────────────────────────


class NotificationDispatcher:
    PROVIDERS: dict[str, BaseProvider] = {
        "EMAIL": EmailProvider(),
        "WHATSAPP": WhatsAppProvider(),
        "PUSH": PushProvider(),
        "SMS": SMSProvider(),
    }

    def __init__(self, db: AsyncSession):
        self._db = db

    async def _get_channel_config(
        self, tenant_id: uuid.UUID, channel: str
    ) -> NotificationChannelConfig | None:
        result = await self._db.execute(
            select(NotificationChannelConfig).where(
                NotificationChannelConfig.tenant_id == tenant_id,
                NotificationChannelConfig.channel == channel.upper(),
                NotificationChannelConfig.enabled.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def dispatch(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID | None,
        channel: str,
        event: NotificationEvent | str,
        context: dict[str, Any],
        destination: str | None = None,
    ) -> dict[str, Any]:
        """Roteia a notificacao para o canal e provedor corretos.

        Args:
            tenant_id: ID do tenant/municipio
            user_id: ID do usuario destinatario (opcional)
            channel: EMAIL | WHATSAPP | PUSH | SMS | INTERNAL
            event: Tipo do evento (NotificationEvent ou string)
            context: Dicionario com variaveis do template (nome, data, etc.)
            destination: Override do destinatario (email, telefone, token)

        Returns:
            dict com status, channel, e mensagem de erro se houver
        """
        event_str = event.value if isinstance(event, NotificationEvent) else event
        channel_upper = channel.upper()

        # INTERNAL vai direto para o banco de notificacoes (ja existente)
        if channel_upper == "INTERNAL":
            return await self._dispatch_internal(tenant_id, user_id, event_str, context)

        # Busca config do canal
        cfg = await self._get_channel_config(tenant_id, channel_upper)
        if not cfg:
            logger.info(
                "NotificationDispatcher: canal %s nao configurado para tenant %s",
                channel_upper,
                tenant_id,
            )
            return {"status": "not_configured", "channel": channel_upper}

        provider = self.PROVIDERS.get(channel_upper)
        if not provider:
            logger.warning("NotificationDispatcher: provider desconhecido '%s'", channel_upper)
            return {"status": "unknown_channel", "channel": channel_upper}

        rendered = _render_template(event_str, channel_upper, context)
        dest = destination or context.get("destination", "")
        sent = await provider.send(cfg.config_json, dest, rendered)

        return {
            "status": "sent" if sent else "failed",
            "channel": channel_upper,
            "destination": dest,
        }

    async def _dispatch_internal(
        self,
        tenant_id: uuid.UUID,
        user_id: uuid.UUID | None,
        event: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Cria notificacao interna (banco de dados)."""
        if not user_id:
            return {"status": "skipped", "channel": "INTERNAL", "reason": "no_user_id"}

        from app.models.notificacao import Notificacao

        title = context.get("titulo", f"GovSocial - {event}")
        message = context.get("mensagem", _render_template(event, "INTERNAL", context))

        notif = Notificacao(
            tenant_id=tenant_id,
            user_id=user_id,
            titulo=title[:255],
            mensagem=message,
            tipo=event,
            link=context.get("link"),
            entity_type=context.get("entity_type"),
            entity_id=str(context.get("entity_id")) if context.get("entity_id") else None,
        )
        self._db.add(notif)
        await self._db.flush()
        return {"status": "sent", "channel": "INTERNAL", "id": str(notif.id)}

    async def send_test(
        self,
        tenant_id: uuid.UUID,
        channel: str,
        destination: str,
        message: str,
    ) -> dict[str, Any]:
        """Envia uma mensagem de teste por um canal configurado."""
        channel_upper = channel.upper()
        cfg = await self._get_channel_config(tenant_id, channel_upper)
        if not cfg:
            return {"status": "not_configured", "channel": channel_upper}

        provider = self.PROVIDERS.get(channel_upper)
        if not provider:
            return {"status": "unknown_channel", "channel": channel_upper}

        sent = await provider.send(cfg.config_json, destination, message)
        return {
            "status": "sent" if sent else "failed",
            "channel": channel_upper,
            "destination": destination,
        }
