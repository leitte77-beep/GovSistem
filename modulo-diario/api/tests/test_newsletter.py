"""Boletim por e-mail: inscrição com confirmação dupla, cancelamento e envio único por edição."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.tenant import require_tenant
from app.main import app
from app.models.edition import Edition
from app.models.enums import EditionStatus
from app.models.newsletter import NewsletterDispatch, NewsletterSubscriber
from app.models.organization import Organization
from app.services import newsletter
from tests.conftest import TestingSessionLocal


@pytest_asyncio.fixture
async def org(db_session):
    o = Organization(name="PREFEITURA DE FAROL", slug=f"farol-{uuid.uuid4().hex[:6]}")
    db_session.add(o)
    await db_session.commit()
    app.dependency_overrides[require_tenant] = lambda: o
    yield o
    app.dependency_overrides.pop(require_tenant, None)


@pytest.fixture
def smtp(monkeypatch):
    """Liga o boletim e captura as mensagens em vez de falar com a Hostinger."""
    outbox = []

    def fake_send(messages):
        outbox.extend(messages)
        return len(messages), 0

    from app.api.public_v1.router import limiter

    monkeypatch.setattr(limiter, "enabled", False)  # os testes fazem >5 inscrições/min
    monkeypatch.setattr(newsletter, "is_enabled", lambda: True)
    monkeypatch.setattr(newsletter, "_send_batch", fake_send)
    monkeypatch.setattr(newsletter, "async_session", TestingSessionLocal)
    return outbox


async def _subscriber(email):
    async with TestingSessionLocal() as s:
        return (
            await s.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.email == email))
        ).scalar_one_or_none()


async def test_subscribe_sends_confirmation_and_only_confirmed_receive(client, org, smtp):
    r = await client.post("/api/public/v1/newsletter/subscribe", json={"email": "  Ana@Exemplo.com "})
    assert r.status_code == 200

    sub = await _subscriber("ana@exemplo.com")
    assert sub is not None and sub.status == "pending"
    assert len(smtp) == 1
    assert "Confirme" in smtp[0]["Subject"]
    assert f"/boletim/confirmar?token={sub.token}" in smtp[0].get_body(("plain",)).get_content()

    r = await client.post("/api/public/v1/newsletter/confirm", json={"token": sub.token})
    assert r.status_code == 200
    assert (await _subscriber("ana@exemplo.com")).status == "confirmed"


async def test_subscribe_rejects_invalid_email(client, org, smtp):
    r = await client.post("/api/public/v1/newsletter/subscribe", json={"email": "nao-e-email"})
    assert r.status_code == 422
    assert smtp == []


async def test_subscribe_disabled_without_smtp(client, org, monkeypatch):
    monkeypatch.setattr(newsletter, "is_enabled", lambda: False)
    r = await client.post("/api/public/v1/newsletter/subscribe", json={"email": "a@b.com"})
    assert r.status_code == 503


async def test_resubscribe_does_not_spam_confirmation(client, org, smtp):
    for _ in range(3):
        await client.post("/api/public/v1/newsletter/subscribe", json={"email": "bia@exemplo.com"})
    assert len(smtp) == 1


async def test_unknown_token_is_404(client, org, smtp):
    r = await client.post("/api/public/v1/newsletter/confirm", json={"token": "x" * 40})
    assert r.status_code == 404


async def test_unsubscribe(client, org, smtp):
    await client.post("/api/public/v1/newsletter/subscribe", json={"email": "caio@exemplo.com"})
    sub = await _subscriber("caio@exemplo.com")
    await client.post("/api/public/v1/newsletter/confirm", json={"token": sub.token})
    r = await client.post("/api/public/v1/newsletter/unsubscribe", json={"token": sub.token})
    assert r.status_code == 200
    assert (await _subscriber("caio@exemplo.com")).status == "unsubscribed"


async def test_dispatch_sends_once_and_only_to_confirmed(db_session, org, smtp):
    db_session.add_all([
        NewsletterSubscriber(organization_id=org.id, email="ok@x.com", status="confirmed", token="t1"),
        NewsletterSubscriber(organization_id=org.id, email="pend@x.com", status="pending", token="t2"),
        NewsletterSubscriber(organization_id=org.id, email="saiu@x.com", status="unsubscribed", token="t3"),
    ])
    edition = Edition(
        organization_id=org.id, number=67, year=2026, title="Edição nº 67",
        publication_date=date(2026, 10, 20), status=EditionStatus.PUBLISHED,
        created_by=uuid.uuid4(),
    )
    db_session.add(edition)
    await db_session.commit()

    await newsletter.dispatch_edition(edition.id)
    await newsletter.dispatch_edition(edition.id)  # republicação/duplo clique

    assert [m["To"] for m in smtp] == ["ok@x.com"]
    msg = smtp[0]
    assert "Edição nº 67" in msg["Subject"]
    assert "Diário Oficial de Prefeitura de Farol" in msg["Subject"]
    assert msg["List-Unsubscribe"].endswith("/boletim/cancelar?token=t1>")
    body = msg.get_body(("plain",)).get_content()
    assert f"{newsletter.portal_url(org)}/edicoes/2026/67" in body

    async with TestingSessionLocal() as s:
        d = (await s.execute(select(NewsletterDispatch))).scalars().all()
    assert len(d) == 1 and d[0].sent == 1 and d[0].recipients == 1
