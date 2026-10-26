"""Autenticação, isolamento de tenant, escopo e sigilo (Fase 0)."""

from __future__ import annotations

import uuid

import jwt
import pytest

from app.core.autorizacao import escopo_permite, permissoes_efetivas, velar
from app.core.config import settings
from app.core.errors import PermissionDenied
from app.core.permissoes import Permissao
from app.models.enums import NivelSigilo
from app.services.auditoria import registrar_quebra_sigilo
from app.services.autenticacao import obter_usuario


async def test_me_retorna_grupos_e_permissoes(client, mundo, token):
    resposta = await client.get("/api/govsaude/v1/auth/me", headers=token("gestor"))
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    assert corpo["nome"] == "Gestor A"
    assert "gestor_municipal" in [g["codigo"] for g in corpo["grupos"]]
    assert "prontuario:ler" in corpo["permissoes"]
    assert any(m["codigo"] == "dashboard" for m in corpo["menus"])


async def test_cross_tenant_retorna_404(client, mundo, token):
    alvo = mundo["usuarios"]["admin_b"]
    resposta = await client.get(
        f"/api/govsaude/v1/usuarios/{alvo.id}", headers=token("admin")
    )
    assert resposta.status_code == 404
    assert resposta.headers["content-type"].startswith("application/problem+json")


async def test_recepcao_nao_le_auditoria(client, mundo, token):
    resposta = await client.get("/api/govsaude/v1/auditoria", headers=token("recepcao"))
    assert resposta.status_code == 403


async def test_faturista_nao_le_usuarios(client, mundo, token):
    resposta = await client.get("/api/govsaude/v1/usuarios", headers=token("faturista"))
    assert resposta.status_code == 403


async def test_escopo_estabelecimento(db, mundo):
    medico = await obter_usuario(db, mundo["usuarios"]["medico_escopo"].id)
    assert medico is not None
    assert escopo_permite(
        medico, Permissao.FILA_LER, estabelecimento_id=mundo["estab_a"].id
    )
    assert not escopo_permite(
        medico, Permissao.FILA_LER, estabelecimento_id=mundo["estab_b"].id
    )


async def test_acs_nao_le_prontuario(db, mundo):
    acs = await obter_usuario(db, mundo["usuarios"]["acs"].id)
    assert acs is not None
    assert Permissao.PRONTUARIO_LER.value not in permissoes_efetivas(acs)
    assert Permissao.VISITA_CRIAR.value in permissoes_efetivas(acs)


async def test_sigilo_vela_para_perfil_sem_acesso(db, mundo):
    faturista = await obter_usuario(db, mundo["usuarios"]["faturista"].id)
    assert faturista is not None
    registro = {"id": str(uuid.uuid4()), "tipo": "EVOLUCAO", "conteudo": "HIV", "unidade": "UBS A"}
    velado = velar(registro, faturista, nivel_sigilo=NivelSigilo.SIGILOSO)
    assert velado["velado"] is True
    assert velado["conteudo"] is None
    assert "HIV" not in str(velado)


async def test_medico_le_sigiloso(db, mundo):
    medico = await obter_usuario(db, mundo["usuarios"]["medico"].id)
    assert medico is not None
    registro = {"id": str(uuid.uuid4()), "conteudo": "HIV"}
    assert velar(registro, medico, nivel_sigilo=NivelSigilo.SIGILOSO)["conteudo"] == "HIV"


async def test_sigilo_denuncia_exige_quebra(db, mundo):
    medico = await obter_usuario(db, mundo["usuarios"]["medico"].id)
    assert medico is not None
    registro = {"id": str(uuid.uuid4()), "conteudo": "denúncia"}
    assert velar(registro, medico, nivel_sigilo=NivelSigilo.SIGILO_DENUNCIA)["velado"] is True


async def test_quebra_sigilo_exige_permissao_e_justificativa(db, mundo):
    faturista = await obter_usuario(db, mundo["usuarios"]["faturista"].id)
    medico = await obter_usuario(db, mundo["usuarios"]["medico"].id)
    admin = await obter_usuario(db, mundo["usuarios"]["admin"].id)
    assert faturista and medico and admin
    with pytest.raises(PermissionDenied):
        await registrar_quebra_sigilo(
            db,
            usuario=faturista,
            recurso="evolucao",
            recurso_id=uuid.uuid4(),
            justificativa="Necessário para continuidade do cuidado.",
            finalidade="assistencial",
            cliente={},
        )
    with pytest.raises(PermissionDenied):
        await registrar_quebra_sigilo(
            db,
            usuario=admin,
            recurso="evolucao",
            recurso_id=uuid.uuid4(),
            justificativa="curta",
            finalidade="assistencial",
            cliente={},
        )
    evento = await registrar_quebra_sigilo(
        db,
        usuario=admin,
        recurso="evolucao",
        recurso_id=uuid.uuid4(),
        justificativa="Paciente em risco iminente, acesso para continuidade do cuidado.",
        finalidade="assistencial",
        cliente={},
    )
    await db.commit()
    assert evento.acao == "QUEBRA_SIGILO"

    from sqlalchemy import select

    from app.models.nucleo import Notificacao

    avisos = (
        await db.execute(select(Notificacao).where(Notificacao.entidade_id == evento.id))
    ).scalars().all()
    assert {a.grupo_destino for a in avisos} == {"gestor_municipal", "encarregado_dados"}
    assert all(a.tenant_id == admin.tenant_id for a in avisos)


async def test_login_local_e_bloqueio(client, mundo, senha_padrao):
    resposta = await client.post(
        "/api/govsaude/v1/auth/login",
        json={
            "identificador": "medico-a@teste.local",
            "senha": senha_padrao,
            "organizacao": "prefeitura-a",
        },
    )
    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["access_token"]

    for _ in range(5):
        falha = await client.post(
            "/api/govsaude/v1/auth/login",
            json={
                "identificador": "consulta-a@teste.local",
                "senha": "SenhaErrada9!",
                "organizacao": "prefeitura-a",
            },
        )
    assert falha.status_code in (401, 423)
    assert falha.status_code == 423


async def test_module_access_sso_e_rejeicao_de_modulo(client, mundo, internal_headers):
    org_id = str(mundo["org_a"].id)
    user_id = str(mundo["usuarios"]["admin"].id)
    payload = {
        "sub": user_id,
        "organization_id": org_id,
        "roles": ["gestor_municipal"],
        "module": "govsaude",
        "type": "module_access",
        "iss": "govsistem",
    }
    token = jwt.encode(
        payload,
        settings.SAAS_JWT_SECRET.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )
    resposta = await client.get(
        "/api/govsaude/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert resposta.status_code == 200, resposta.text
    assert "gestor_municipal" in [g["codigo"] for g in resposta.json()["grupos"]]

    payload_errado = dict(payload, module="govsocial")
    token_errado = jwt.encode(
        payload_errado,
        settings.SAAS_JWT_SECRET.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )
    negado = await client.get(
        "/api/govsaude/v1/auth/me", headers={"Authorization": f"Bearer {token_errado}"}
    )
    assert negado.status_code == 401


async def test_health_e_versao_publicos(client):
    assert (await client.get("/api/govsaude/health/live")).status_code == 200
    versao = await client.get("/api/govsaude/v1/sistema/versao")
    assert versao.status_code == 200
    assert versao.json()["modulo"] == "govsaude"


async def test_termo_obrigatorio_aceite_e_recusa(client, mundo, token):
    # Ativa a exigência via configuração e publica o termo.
    await client.put(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio",
        json={"valor": {"valor": True}},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    termo = await client.post(
        "/api/govsaude/v1/auth/termos",
        json={
            "versao": "2026.1",
            "titulo": "Termo de uso",
            "conteudo_md": "Ao acessar, você concorda com o uso responsável.",
            "obrigatorio": True,
        },
        headers=token("admin"),
    )
    assert termo.status_code == 201, termo.text
    termo_id = termo.json()["id"]

    pendente = await client.get("/api/govsaude/v1/auth/termos", headers=token("medico"))
    assert pendente.status_code == 200
    assert pendente.json()["pendente"] is True

    aceite = await client.post(
        "/api/govsaude/v1/auth/termos/aceitar",
        json={"termo_id": termo_id, "aceito": True},
        headers=token("medico"),
    )
    assert aceite.status_code == 200, aceite.text
    depois = await client.get("/api/govsaude/v1/auth/termos", headers=token("medico"))
    assert depois.json()["pendente"] is False


async def test_recusa_de_termo_bloqueia_usuario(client, mundo, token):
    await client.put(
        "/api/govsaude/v1/configuracoes/seguranca.termo_obrigatorio",
        json={"valor": {"valor": True}},
        headers={**token("admin"), "If-Match": '"1"'},
    )
    termo = await client.post(
        "/api/govsaude/v1/auth/termos",
        json={
            "versao": "2026.2",
            "titulo": "Termo de uso",
            "conteudo_md": "Conteúdo.",
            "obrigatorio": True,
        },
        headers=token("admin"),
    )
    recusa = await client.post(
        "/api/govsaude/v1/auth/termos/aceitar",
        json={"termo_id": termo.json()["id"], "aceito": False},
        headers=token("faturista"),
    )
    assert recusa.status_code == 200
    bloqueado = await client.get("/api/govsaude/v1/auth/me", headers=token("faturista"))
    assert bloqueado.status_code == 403


async def test_historico_de_senha_rejeita_reuso(client, mundo, senha_padrao):
    login = await client.post(
        "/api/govsaude/v1/auth/login",
        json={
            "identificador": "medico-a@teste.local",
            "senha": senha_padrao,
            "organizacao": "prefeitura-a",
        },
    )
    token_inicial = {"Authorization": f"Bearer {login.json()['access_token']}"}
    troca = await client.post(
        "/api/govsaude/v1/auth/alterar-senha",
        json={"senha_atual": senha_padrao, "nova_senha": "OutraSenha2@"},
        headers=token_inicial,
    )
    assert troca.status_code == 200, troca.text
    token_novo = {"Authorization": f"Bearer {troca.json()['access_token']}"}
    reuso = await client.post(
        "/api/govsaude/v1/auth/alterar-senha",
        json={"senha_atual": "OutraSenha2@", "nova_senha": senha_padrao},
        headers=token_novo,
    )
    assert reuso.status_code == 422
    assert reuso.json()["codigo"] == "senha_reutilizada"


async def test_inatividade_encerra_sessao(client, db, mundo, token):
    from datetime import timedelta

    from app.core.security import agora

    usuario = mundo["usuarios"]["consulta"]
    usuario.ultima_atividade_em = agora() - timedelta(minutes=120)
    await db.commit()
    resposta = await client.get("/api/govsaude/v1/auth/me", headers=token("consulta"))
    assert resposta.status_code == 401
