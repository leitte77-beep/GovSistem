"""Outbox de e-mail: enfileirar, entregar e retentar (§41, §126)."""

from datetime import datetime, timedelta, timezone

import pytest

from app.models.enums import StatusEnvio, TipoNotificacao
from app.models.notificacao_envio import NotificacaoEnvio
from app.models.notificacao_preferencia import NotificacaoPreferencia
from app.services import email, email_outbox
from app.services.notifications import criar_notificacao
from sqlalchemy import select

BASE = "/api/govtask"


async def _preparar(db, user_id, monkeypatch):
    monkeypatch.setattr(email.settings, "EMAIL_ENABLED", True)
    monkeypatch.setattr(email.settings, "SMTP_HOST", "smtp.teste")
    db.add(NotificacaoPreferencia(user_id=user_id, email_ativo=True, tipos_email=[]))
    await db.flush()
    await criar_notificacao(
        db, user_id, TipoNotificacao.TAREFA_ATRIBUIDA, "Nova tarefa atribuída a você"
    )
    await db.commit()
    return (
        await db.execute(select(NotificacaoEnvio))
    ).scalars().one()


@pytest.mark.asyncio
async def test_despachar_enfileira_sem_enviar_na_hora(make_tenant, _db, monkeypatch):
    t = await make_tenant("ASSESSOR")
    enviados = []

    async def fake_enviar(*args, **kwargs):
        enviados.append(args)
        return True

    monkeypatch.setattr(email, "enviar", fake_enviar)

    envio = await _preparar(_db, t["user"].id, monkeypatch)
    assert envio.status == StatusEnvio.PENDENTE
    assert envio.canal == "EMAIL"
    assert envio.tentativas == 0
    # O envio não acontece no fluxo da notificação: fica na outbox.
    assert enviados == []


@pytest.mark.asyncio
async def test_processar_entrega_e_marca_enviado(make_tenant, _db, monkeypatch):
    t = await make_tenant("ASSESSOR")
    await _preparar(_db, t["user"].id, monkeypatch)

    async def fake_enviar(destino, assunto, corpo):
        return True

    monkeypatch.setattr(email, "enviar", fake_enviar)
    resumo = await email_outbox.processar_pendentes(_db)
    assert resumo["enviados"] == 1

    envio = (await _db.execute(select(NotificacaoEnvio))).scalars().one()
    assert envio.status == StatusEnvio.ENVIADO
    assert envio.enviado_em is not None


@pytest.mark.asyncio
async def test_falha_retenta_e_depois_descarta(make_tenant, _db, monkeypatch):
    t = await make_tenant("ASSESSOR")
    envio = await _preparar(_db, t["user"].id, monkeypatch)

    async def fake_enviar(destino, assunto, corpo):
        return False

    monkeypatch.setattr(email, "enviar", fake_enviar)

    # Primeira falha: continua pendente, reagendada.
    await email_outbox.processar_pendentes(_db)
    envio = (await _db.execute(select(NotificacaoEnvio))).scalars().one()
    assert envio.status == StatusEnvio.PENDENTE
    assert envio.tentativas == 1
    assert envio.agendado_para > datetime.now(timezone.utc)

    # Chega ao limite: descarta sem apagar o histórico.
    envio.tentativas = email.settings.EMAIL_MAX_TENTATIVAS - 1
    envio.agendado_para = datetime.now(timezone.utc) - timedelta(seconds=1)
    await _db.commit()
    await email_outbox.processar_pendentes(_db)
    envio = (await _db.execute(select(NotificacaoEnvio))).scalars().one()
    assert envio.status == StatusEnvio.DESCARTADO
    assert envio.tentativas == email.settings.EMAIL_MAX_TENTATIVAS


@pytest.mark.asyncio
async def test_enfileirar_e_idempotente(make_tenant, _db, monkeypatch):
    t = await make_tenant("ASSESSOR")
    envio = await _preparar(_db, t["user"].id, monkeypatch)

    from app.models.notificacao import Notificacao

    notificacao = (await _db.execute(select(Notificacao))).scalars().one()
    segundo = await email_outbox.enfileirar(
        _db, notificacao, t["user"].organization_id, t["user"].email, "Assunto", "Corpo"
    )
    await _db.commit()
    assert segundo.id == envio.id
    total = len((await _db.execute(select(NotificacaoEnvio))).scalars().all())
    assert total == 1


@pytest.mark.asyncio
async def test_diagnostico_exige_administracao(client, make_tenant, catalogo_padrao):
    assessor = await make_tenant("ASSESSOR")
    admin = await make_tenant("ADMIN")

    negado = await client.get(f"{BASE}/notificacoes/envios", headers=assessor["headers"])
    assert negado.status_code == 403

    permitido = await client.get(f"{BASE}/notificacoes/envios", headers=admin["headers"])
    assert permitido.status_code == 200
    assert permitido.json() == []
