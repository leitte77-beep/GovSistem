"""Notificações multicanal e tempo real (§41, §127)."""

import asyncio

import pytest

from app.models.enums import TipoNotificacao
from app.models.notificacao_preferencia import NotificacaoPreferencia
from app.services import notificacoes_canais as canais

BASE = "/api/govtask"


# ── Regra de envio por e-mail ───────────────────────────────────────────────

def _pref(email_ativo: bool, tipos: list[str] | None = None) -> NotificacaoPreferencia:
    return NotificacaoPreferencia(email_ativo=email_ativo, tipos_email=tipos or [])


def test_email_desligado_nao_envia():
    assert canais.deve_enviar_email(_pref(False), TipoNotificacao.TAREFA_ATRIBUIDA) is False
    assert canais.deve_enviar_email(None, TipoNotificacao.TAREFA_ATRIBUIDA) is False


def test_lista_vazia_significa_todos_os_tipos():
    pref = _pref(True, [])
    assert canais.deve_enviar_email(pref, TipoNotificacao.TAREFA_ATRIBUIDA) is True
    assert canais.deve_enviar_email(pref, TipoNotificacao.PRAZO_PROXIMO) is True


def test_lista_restringe_os_tipos():
    pref = _pref(True, [TipoNotificacao.TAREFA_ATRIBUIDA.value])
    assert canais.deve_enviar_email(pref, TipoNotificacao.TAREFA_ATRIBUIDA) is True
    assert canais.deve_enviar_email(pref, TipoNotificacao.PRAZO_PROXIMO) is False


def test_tipos_obrigatorios_furam_a_lista():
    """Deveria receber aviso de atraso/devolução mesmo sem ter marcado o tipo."""
    pref = _pref(True, [TipoNotificacao.TAREFA_ATRIBUIDA.value])
    for tipo in canais.TIPOS_OBRIGATORIOS:
        assert canais.deve_enviar_email(pref, tipo) is True


# ── API de preferências ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_preferencias_roundtrip_e_validacao(client, make_tenant):
    t = await make_tenant("ASSESSOR")

    inicial = (await client.get(f"{BASE}/notificacoes/preferencias", headers=t["headers"])).json()
    assert inicial["email_ativo"] is False
    assert TipoNotificacao.TAREFA_ATRIBUIDA.value in inicial["tipos_disponiveis"]

    salva = await client.put(
        f"{BASE}/notificacoes/preferencias",
        json={"email_ativo": True, "tipos_email": [TipoNotificacao.TAREFA_ATRIBUIDA.value]},
        headers=t["headers"],
    )
    assert salva.status_code == 200, salva.text
    assert salva.json()["email_ativo"] is True
    assert salva.json()["tipos_email"] == [TipoNotificacao.TAREFA_ATRIBUIDA.value]

    relida = (await client.get(f"{BASE}/notificacoes/preferencias", headers=t["headers"])).json()
    assert relida["email_ativo"] is True

    invalida = await client.put(
        f"{BASE}/notificacoes/preferencias",
        json={"email_ativo": True, "tipos_email": ["TIPO_QUE_NAO_EXISTE"]},
        headers=t["headers"],
    )
    assert invalida.status_code == 422


@pytest.mark.asyncio
async def test_resumo_conta_apenas_nao_lidas(client, make_tenant, catalogo_padrao, _db):
    from app.services.notifications import criar_notificacao

    t = await make_tenant("ASSESSOR")
    await criar_notificacao(
        _db, t["user"].id, TipoNotificacao.TAREFA_ATRIBUIDA, "Nova tarefa"
    )
    await _db.commit()

    resumo = await client.get(f"{BASE}/notificacoes/resumo", headers=t["headers"])
    assert resumo.json()["nao_lidas"] == 1

    lista = (await client.get(f"{BASE}/notificacoes?nao_lidas=true", headers=t["headers"])).json()
    await client.post(
        f"{BASE}/notificacoes/{lista[0]['id']}/marcar-lida", headers=t["headers"]
    )
    resumo = await client.get(f"{BASE}/notificacoes/resumo", headers=t["headers"])
    assert resumo.json()["nao_lidas"] == 0


# ── Tempo real ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_publish_entrega_ao_assinante():
    from app.services import realtime

    recebido = []

    async def consumir():
        async for evento in realtime.subscribe("user-teste"):
            recebido.append(evento)
            break

    tarefa = asyncio.create_task(consumir())
    await asyncio.sleep(0.05)  # deixa o assinante se registrar
    await realtime.publish("user-teste", {"tipo": "notificacao", "x": 1})
    await asyncio.wait_for(tarefa, timeout=1)

    assert recebido and recebido[0]["tipo"] == "notificacao"
    assert recebido[0]["x"] == 1
    assert "ts" in recebido[0]


@pytest.mark.asyncio
async def test_criar_notificacao_publica_no_tempo_real(monkeypatch, make_tenant, _db):
    from app.services import realtime
    from app.services.notifications import criar_notificacao

    t = await make_tenant("ASSESSOR")
    publicados = []

    async def fake_publish(user_id, evento):
        publicados.append((str(user_id), evento))

    monkeypatch.setattr(realtime, "publish", fake_publish)

    await criar_notificacao(
        _db, t["user"].id, TipoNotificacao.TAREFA_ATRIBUIDA, "Nova tarefa"
    )

    assert publicados
    assert publicados[0][0] == str(t["user"].id)
    assert publicados[0][1]["tipo"] == "notificacao"


# ── E-mail (SMTP com dublê) ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_email_envia_quando_configurado(monkeypatch):
    from app.core.config import settings
    from app.services import email

    enviados = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            enviados.append(("conectou", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            enviados.append(("tls",))

        def login(self, user, password):  # pragma: no cover - sem SMTP_USER
            enviados.append(("login", user))

        def send_message(self, mensagem):
            enviados.append(("mensagem", mensagem["To"], mensagem["Subject"]))

    monkeypatch.setattr(settings, "EMAIL_ENABLED", True)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.teste")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr("app.services.email.smtplib.SMTP", FakeSMTP)

    assert await email.enviar("fulano@municipio.gov.br", "Assunto", "Corpo") is True
    assert ("conectou", "smtp.teste", settings.SMTP_PORT) in enviados
    assert any(e[0] == "mensagem" and e[1] == "fulano@municipio.gov.br" for e in enviados)


@pytest.mark.asyncio
async def test_email_nao_envia_com_canal_desligado(monkeypatch):
    from app.core.config import settings
    from app.services import email

    monkeypatch.setattr(settings, "EMAIL_ENABLED", False)
    assert email.configurado() is False
    assert await email.enviar("x@y.z", "a", "b") is False
