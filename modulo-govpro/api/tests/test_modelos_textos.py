"""Testes de modelos de documento e textos padrão: CRUD, renderização de
variáveis e sanitização de HTML.
"""

from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.core.sanitize import sanitize_html
from app.models.dominio import ModeloDocumento, TextoPadrao, TipoProcesso
from app.models.enums import RoleName
from app.models.interessado import Interessado
from app.models.processo import Processo
from app.models.role import Role
from app.models.user_role import UserRole
from app.services.render import data_extenso, render_conteudo


def _token(user, org_id) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "roles": ["SERVIDOR"],
        "type": "module_access",
        "organization_id": str(org_id),
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


async def _tornar_admin(db, user) -> None:
    role = (await db.execute(select(Role).where(Role.name == RoleName.ADMIN.value))).scalar_one()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()


async def _criar_processo(db, tenant_id, unidade_id) -> Processo:
    tipo = (
        await db.execute(
            select(TipoProcesso).where(
                TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == "REQ_GERAL"
            )
        )
    ).scalar_one()
    processo = Processo(
        tenant_id=tenant_id,
        tipo_processo_id=tipo.id,
        nup="35041.000387/2026-00",
        especificacao="Pedido de certidão de uso do solo",
        unidade_protocolizadora_id=unidade_id,
    )
    db.add(processo)
    await db.flush()
    db.add(
        Interessado(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_pessoa="PF",
            nome="João da Silva",
        )
    )
    await db.commit()
    return processo


# ── Unit (render puro) ───────────────────────────────────────────────────────
def test_render_conteudo_substitui_variaveis():
    template = "<p>Processo {{processo.nup}} — {{interessado.nome}}</p>"
    contexto = {"processo": {"nup": "00001.000001/2026-00"}, "interessado": {"nome": "Maria"}}
    assert render_conteudo(template, contexto) == "<p>Processo 00001.000001/2026-00 — Maria</p>"


def test_render_conteudo_variavel_desconhecida_vira_vazio():
    template = "<p>{{nao.existe}} fim</p>"
    assert render_conteudo(template, {"processo": {"nup": "X"}}) == "<p> fim</p>"


def test_render_conteudo_nulo():
    assert render_conteudo(None, {}) == ""
    assert render_conteudo("", {}) == ""


def test_data_extenso():
    assert data_extenso(datetime(2026, 8, 17)) == "17 de agosto de 2026"


def test_sanitize_html_remove_script():
    sujo = '<p>ok</p><script>alert(1)</script><strong onclick="x()">negrito</strong>'
    limpo = sanitize_html(sujo)
    assert "<script" not in limpo
    assert "onclick" not in limpo
    assert "ok" in limpo
    assert "<strong" in limpo


# ── HTTP (catálogo) ──────────────────────────────────────────────────────────
async def test_lista_modelos_semeado(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get(
        "/api/govpro/v1/dominio/modelos-documento", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    nomes = {m["nome"] for m in res.json()}
    assert "Despacho padrão" in nomes


async def test_admin_cria_atualiza_e_remove_modelo(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/govpro/v1/dominio/modelos-documento",
        json={"nome": "Ofício padrão", "conteudo_html": "<p>Ofício {{processo.nup}}</p>"},
        headers=headers,
    )
    assert res.status_code == 201
    criado = res.json()
    assert criado["nome"] == "Ofício padrão"
    assert criado["ativo"] is True

    res = await client.patch(
        f"/api/govpro/v1/dominio/modelos-documento/{criado['id']}",
        json={"nome": "Ofício padrão v2"},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["nome"] == "Ofício padrão v2"

    res = await client.delete(
        f"/api/govpro/v1/dominio/modelos-documento/{criado['id']}", headers=headers
    )
    assert res.status_code == 204

    res = await client.get("/api/govpro/v1/dominio/modelos-documento", headers=headers)
    assert criado["id"] not in {m["id"] for m in res.json()}


async def test_admin_cria_texto_padrao(cenario, client):
    await _tornar_admin(cenario["db"], cenario["user"])
    token = _token(cenario["user"], cenario["tenant_id"])
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/govpro/v1/dominio/textos-padrao",
        json={"nome": "Fecho padrão", "conteudo": "Atenciosamente, {{unidade.sigla}}"},
        headers=headers,
    )
    assert res.status_code == 201
    criado = res.json()

    res = await client.get("/api/govpro/v1/dominio/textos-padrao", headers=headers)
    assert criado["id"] in {t["id"] for t in res.json()}


async def test_servidor_nao_cria_modelo(cenario, client):
    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.post(
        "/api/govpro/v1/dominio/modelos-documento",
        json={"nome": "Sem permissão"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


# ── HTTP (renderização) ──────────────────────────────────────────────────────
async def test_render_modelo_com_contexto_do_processo(cenario, client):
    db = cenario["db"]
    processo = await _criar_processo(db, cenario["tenant_id"], cenario["unidade"].id)

    modelo = (
        await db.execute(
            select(ModeloDocumento).where(
                ModeloDocumento.tenant_id == cenario["tenant_id"],
                ModeloDocumento.nome == "Despacho padrão",
            )
        )
    ).scalar_one()

    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get(
        f"/api/govpro/v1/dominio/modelos-documento/{modelo.id}/render?processo_id={processo.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    html = res.json()["conteudo_html"]
    assert processo.nup in html
    assert "João da Silva" in html
    assert cenario["unidade"].sigla in html


async def test_render_texto_padrao_com_contexto(cenario, client):
    db = cenario["db"]
    processo = await _criar_processo(db, cenario["tenant_id"], cenario["unidade"].id)

    texto = TextoPadrao(
        tenant_id=cenario["tenant_id"], nome="Teste", conteudo="NUP {{processo.nup}}"
    )
    db.add(texto)
    await db.commit()

    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get(
        f"/api/govpro/v1/dominio/textos-padrao/{texto.id}/render?processo_id={processo.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert processo.nup in res.json()["conteudo"]


async def test_modelo_padrao_do_tipo(cenario, client):
    db = cenario["db"]
    processo = await _criar_processo(db, cenario["tenant_id"], cenario["unidade"].id)

    modelo = ModeloDocumento(
        tenant_id=cenario["tenant_id"],
        nome="Modelo vinculado",
        conteudo_html="<p>Processo {{processo.nup}}</p>",
    )
    db.add(modelo)
    await db.flush()

    from app.models.dominio import TipoDocumento

    tipo = (
        await db.execute(
            select(TipoDocumento).where(
                TipoDocumento.tenant_id == cenario["tenant_id"],
                TipoDocumento.codigo == "OFICIO",
            )
        )
    ).scalar_one()
    tipo.modelo_padrao_id = modelo.id
    await db.commit()

    token = _token(cenario["user"], cenario["tenant_id"])
    res = await client.get(
        f"/api/govpro/v1/dominio/tipos-documento/{tipo.id}/modelo-padrao?processo_id={processo.id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["encontrado"] is True
    assert processo.nup in body["conteudo_html"]
