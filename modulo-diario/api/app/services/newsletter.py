"""Boletim por e-mail do portal público.

Fluxo: inscrição -> e-mail de confirmação (só entra na lista depois de clicar,
exigência da LGPD e proteção contra inscrever o e-mail de terceiros) -> a cada
edição publicada, um e-mail por inscrito confirmado, sempre com link de
cancelamento. O envio usa a mesma caixa SMTP do SaaS (recuperação de senha).
"""

from __future__ import annotations

import asyncio
import html
import logging
import secrets
import smtplib
import time
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import async_session
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus
from app.models.newsletter import NewsletterDispatch, NewsletterSubscriber
from app.models.organization import Organization

logger = logging.getLogger(__name__)

# Pausa entre mensagens: a Hostinger limita a taxa por caixa e derruba a
# conexão (ou marca como spam) quando recebe rajadas.
SEND_INTERVAL_SECONDS = 1.0

MONTHS = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def is_enabled() -> bool:
    return bool(settings.SMTP_PASSWORD.get_secret_value())


def new_token() -> str:
    return secrets.token_urlsafe(32)


def portal_url(org: Organization) -> str:
    return settings.PORTAL_URL_TEMPLATE.format(slug=org.slug).rstrip("/")


def _org_display_name(org: Organization) -> str:
    # Nomes vêm em caixa alta do cadastro ("PREFEITURA DE FAROL").
    small = {"de", "da", "do", "das", "dos", "e"}
    words = (org.name or "").lower().split()
    return " ".join(w if i and w in small else w.capitalize() for i, w in enumerate(words))


# ── SMTP ─────────────────────────────────────────────────────────────────────


def _connect() -> smtplib.SMTP:
    if settings.SMTP_USE_SSL:
        server: smtplib.SMTP = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20)
    else:
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20)
        server.starttls()
    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD.get_secret_value())
    return server


def _build_message(*, to: str, subject: str, html_body: str, text_body: str,
                   sender_name: str, unsubscribe_url: str | None) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((sender_name, settings.SMTP_FROM))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=settings.SMTP_FROM.split("@")[-1])
    if unsubscribe_url:
        # Botão "cancelar inscrição" nativo do Gmail/Outlook.
        msg["List-Unsubscribe"] = f"<{unsubscribe_url}>"
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    return msg


def _send_batch(messages: list[EmailMessage]) -> tuple[int, int]:
    """Envia numa única conexão; reconecta uma vez se a Hostinger derrubar."""
    sent = failed = 0
    server = None
    try:
        for i, msg in enumerate(messages):
            for attempt in (1, 2):
                try:
                    if server is None:
                        server = _connect()
                    server.send_message(msg)
                    sent += 1
                    break
                except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, OSError) as exc:
                    server = None
                    if attempt == 2:
                        failed += 1
                        logger.warning("Boletim: falha ao enviar para %s: %s", msg["To"], exc)
                except smtplib.SMTPException as exc:
                    failed += 1
                    logger.warning("Boletim: SMTP recusou %s: %s", msg["To"], exc)
                    break
            if i < len(messages) - 1:
                time.sleep(SEND_INTERVAL_SECONDS)
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:  # noqa: BLE001
                pass
    return sent, failed


# ── Modelos de e-mail ────────────────────────────────────────────────────────


def _layout(org_name: str, inner_html: str, footer_html: str) -> str:
    return f"""<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#071a33;color:#ffffff;padding:20px 24px">
<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#93c5fd">Diário Oficial Eletrônico</div>
<div style="font-size:18px;font-weight:bold;margin-top:4px">{html.escape(org_name)}</div></td></tr>
<tr><td style="padding:24px">{inner_html}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#475569">{footer_html}</td></tr>
</table></td></tr></table></body></html>"""


def _button(url: str, label: str) -> str:
    return (f'<a href="{html.escape(url)}" style="display:inline-block;background:#0b192c;color:#ffffff;'
            f'text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">{html.escape(label)}</a>')


def build_confirmation(org: Organization, sub: NewsletterSubscriber) -> EmailMessage:
    base = portal_url(org)
    name = _org_display_name(org)
    confirm = f"{base}/boletim/confirmar?token={sub.token}"
    inner = (
        f'<h1 style="font-size:20px;margin:0 0 12px">Confirme sua inscrição</h1>'
        f'<p style="line-height:1.6;margin:0 0 20px">Recebemos um pedido para enviar as novas edições do '
        f'Diário Oficial de {html.escape(name)} para este e-mail. Para começar a receber, confirme:</p>'
        f'{_button(confirm, "Confirmar inscrição")}'
        f'<p style="line-height:1.6;margin:20px 0 0;font-size:13px;color:#475569">Se não foi você, ignore '
        f'esta mensagem: sem a confirmação, nenhum outro e-mail será enviado.</p>'
    )
    text = (f"Confirme sua inscrição no boletim do Diário Oficial de {name}:\n{confirm}\n\n"
            "Se não foi você, ignore esta mensagem.")
    return _build_message(
        to=sub.email, subject=f"Confirme sua inscrição — Diário Oficial de {name}",
        html_body=_layout(name, inner, f"Portal: {html.escape(base)}"),
        text_body=text, sender_name=f"Diário Oficial de {name}", unsubscribe_url=None,
    )


def build_edition_email(org: Organization, edition: Edition, sub: NewsletterSubscriber) -> EmailMessage:
    base = portal_url(org)
    name = _org_display_name(org)
    url = f"{base}/edicoes/{edition.year}/{edition.number}"
    unsubscribe = f"{base}/boletim/cancelar?token={sub.token}"
    d = edition.publication_date
    date_text = f"{d.day:02d} de {MONTHS[d.month - 1]} de {d.year}" if d else str(edition.year)

    titles = []
    for item in sorted(edition.items or [], key=lambda i: i.position):
        m = item.matter
        if m is None:
            continue
        title = (m.title or "").strip()
        summary = (m.summary or "").strip()
        titles.append((title, summary))
    items_html = "".join(
        f'<li style="margin:0 0 10px"><strong>{html.escape(t)}</strong>'
        + (f'<br><span style="color:#475569;font-size:13px">{html.escape(s[:240])}</span>' if s and s != t else "")
        + "</li>"
        for t, s in titles[:15]
    )
    more = len(titles) - 15
    if more > 0:
        items_html += f'<li style="color:#475569">e mais {more} publicação(ões).</li>'

    count = len(titles)
    inner = (
        f'<h1 style="font-size:20px;margin:0 0 4px">Edição nº {edition.number}</h1>'
        f'<p style="margin:0 0 16px;color:#475569">{date_text} · {count} '
        f'{"publicação" if count == 1 else "publicações"}</p>'
        f'<ul style="padding-left:18px;margin:0 0 20px;line-height:1.5">{items_html}</ul>'
        f'{_button(url, "Ler a edição completa")}'
    )
    footer = (
        f'Você recebe este e-mail porque se inscreveu no boletim do Diário Oficial de {html.escape(name)}. '
        f'<a href="{html.escape(unsubscribe)}" style="color:#1d4ed8">Cancelar inscrição</a>.'
    )
    text_items = "\n".join(f"- {t}" for t, _ in titles[:15])
    text = (f"Diário Oficial de {name} — Edição nº {edition.number} ({date_text})\n\n{text_items}\n\n"
            f"Leia a edição completa: {url}\n\nCancelar inscrição: {unsubscribe}")
    return _build_message(
        to=sub.email, subject=f"Edição nº {edition.number} — Diário Oficial de {name}",
        html_body=_layout(name, inner, footer), text_body=text,
        sender_name=f"Diário Oficial de {name}", unsubscribe_url=unsubscribe,
    )


# ── Operações ────────────────────────────────────────────────────────────────


async def send_confirmation(subscriber_id: uuid.UUID) -> None:
    """Roda em background após a inscrição (não segura a resposta HTTP)."""
    async with async_session() as db:
        sub = await db.get(NewsletterSubscriber, subscriber_id)
        if sub is None or sub.status != "pending":
            return
        org = await db.get(Organization, sub.organization_id)
        if org is None:
            return
        msg = build_confirmation(org, sub)
        sent, _ = await asyncio.to_thread(_send_batch, [msg])
        if sent:
            sub.confirmation_sent_at = datetime.now(timezone.utc)
            await db.commit()


async def dispatch_edition(edition_id: uuid.UUID) -> None:
    """Envia a edição publicada a todos os inscritos confirmados, uma única vez."""
    if not is_enabled():
        return
    async with async_session() as db:
        edition = (
            await db.execute(
                select(Edition)
                .where(Edition.id == edition_id)
                .options(selectinload(Edition.items).selectinload(EditionItem.matter))
            )
        ).scalar_one_or_none()
        if edition is None or edition.status != EditionStatus.PUBLISHED:
            return
        org = await db.get(Organization, edition.organization_id)
        if org is None:
            return

        # Reserva o envio antes de mandar: a unicidade de edition_id garante
        # que uma republicação/duplo clique não dispare o boletim duas vezes.
        dispatch = NewsletterDispatch(edition_id=edition.id, organization_id=org.id)
        db.add(dispatch)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            logger.info("Boletim da edição %s já foi enviado; ignorando.", edition_id)
            return

        subs = (
            await db.execute(
                select(NewsletterSubscriber).where(
                    NewsletterSubscriber.organization_id == org.id,
                    NewsletterSubscriber.status == "confirmed",
                )
            )
        ).scalars().all()
        messages = [build_edition_email(org, edition, s) for s in subs]
        sent, failed = await asyncio.to_thread(_send_batch, messages) if messages else (0, 0)

        dispatch.recipients = len(messages)
        dispatch.sent = sent
        dispatch.failed = failed
        dispatch.finished_at = datetime.now(timezone.utc)
        await db.commit()
        logger.info("Boletim da edição %s/%s: %s enviados, %s falhas.",
                    edition.year, edition.number, sent, failed)
