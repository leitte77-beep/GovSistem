"""Fluxo ponta a ponta dos critérios de aceitação, mais saúde e auditoria."""

import uuid

from tests.conftest import arquivo_pdf

API = "/api/govdoc/v1"


async def test_fluxo_completo(client, token, mundo):
    """1) secretaria → 2) setor → 3) pasta → 4) documento → 5) compartilhar →
    6) visualizar → 7) nova versão → 8) link externo → 9) download externo →
    10) auditoria → 11) excluir → 12) restaurar."""

    admin = token("admin")

    # 1. Criar secretaria
    secretaria = await client.post(
        f"{API}/secretarias",
        json={"nome": "Meio Ambiente", "sigla": "SMMA", "cor": "#15803d"},
        headers=admin,
    )
    assert secretaria.status_code == 201
    secretaria_id = secretaria.json()["id"]

    # 2. Criar setor
    setor = await client.post(
        f"{API}/setores",
        json={"secretaria_id": secretaria_id, "nome": "Licenciamento"},
        headers=admin,
    )
    assert setor.status_code == 201
    setor_id = setor.json()["id"]

    # 3. Criar pasta e subpasta
    pasta = await client.post(
        f"{API}/pastas",
        json={
            "nome": "Licenças 2026",
            "secretaria_id": secretaria_id,
            "setor_id": setor_id,
        },
        headers=admin,
    )
    assert pasta.status_code == 201
    pasta_id = pasta.json()["id"]

    subpasta = await client.post(
        f"{API}/pastas",
        json={"nome": "Deferidas", "pasta_superior_id": pasta_id},
        headers=admin,
    )
    assert subpasta.status_code == 201

    # 4. Enviar documento
    upload = await client.post(
        f"{API}/documentos/upload",
        data={"pasta_id": pasta_id},
        files={"arquivo": ("licenca.pdf", arquivo_pdf("Licença ambiental"), "application/pdf")},
        headers=admin,
    )
    assert upload.status_code == 201
    documento = upload.json()["documento"]

    # 5. Compartilhar com um usuário de outra área
    colaborador = mundo["usuarios"]["colaborador"]
    compartilhar = await client.post(
        f"{API}/compartilhamentos",
        json={
            "recurso_tipo": "document",
            "recurso_id": documento["id"],
            "destino_tipo": "user",
            "destino_id": str(colaborador.id),
            "permissoes": ["view", "view_metadata", "download", "new_version", "view_versions"],
        },
        headers=admin,
    )
    assert compartilhar.status_code == 201

    # 6. O usuário visualiza
    visualizar = await client.get(
        f"{API}/documentos/{documento['id']}", headers=token("colaborador")
    )
    assert visualizar.status_code == 200

    comigo = await client.get(f"{API}/compartilhamentos/comigo", headers=token("colaborador"))
    assert len(comigo.json()) == 1

    # 7. O usuário envia nova versão
    nova_versao = await client.post(
        f"{API}/documentos/{documento['id']}/versoes",
        data={"descricao": "Retificação"},
        files={"arquivo": ("licenca-v2.pdf", arquivo_pdf("Retificada"), "application/pdf")},
        headers=token("colaborador"),
    )
    assert nova_versao.status_code == 201
    assert nova_versao.json()["documento"]["versao_atual"] == 2

    versoes = await client.get(
        f"{API}/documentos/{documento['id']}/versoes", headers=token("colaborador")
    )
    assert len(versoes.json()) == 2  # a versão anterior continua disponível

    # 8. Administrador cria link externo com expiração
    from datetime import datetime, timedelta, timezone

    expira = datetime.now(timezone.utc) + timedelta(days=2)
    link = await client.post(
        f"{API}/links-externos",
        json={
            "nome": "Licença para o requerente",
            "itens": [{"tipo": "document", "id": documento["id"]}],
            "expira_em": expira.isoformat(),
            "exigir_nome": True,
        },
        headers=admin,
    )
    assert link.status_code == 201
    token_publico = link.json()["url"].rstrip("/").split("/")[-1]

    # 9. Visitante externo baixa o documento
    abrir = await client.post(
        f"{API}/publico/acesso/{token_publico}", json={"nome": "Maria Requerente"}
    )
    assert abrir.status_code == 200
    sessao = abrir.json()["sessao"]

    baixar = await client.get(
        f"{API}/publico/acesso/documentos/{documento['id']}/download?sessao={sessao}"
    )
    assert baixar.status_code == 200

    # 10. Auditoria registra tudo
    auditoria = await client.get(
        f"{API}/auditoria?recurso_id={documento['id']}", headers=token("auditor")
    )
    acoes = {item["acao"] for item in auditoria.json()["itens"]}
    assert {"document_upload", "version_create", "external_download"} <= acoes

    acessos = await client.get(f"{API}/links-externos/{link.json()['id']}/acessos", headers=admin)
    assert any(item["acao"] == "download" for item in acessos.json()["itens"])

    # 11. Excluir documento
    excluir = await client.request(
        "DELETE",
        f"{API}/documentos/{documento['id']}",
        json={"motivo": "Substituído por nova licença"},
        headers=admin,
    )
    assert excluir.status_code == 200
    assert (
        await client.get(f"{API}/documentos/{documento['id']}", headers=admin)
    ).status_code == 404

    # 12. Restaurar da lixeira
    restaurar = await client.post(
        f"{API}/lixeira/documentos/{documento['id']}/restaurar", json={}, headers=admin
    )
    assert restaurar.status_code == 200
    final = await client.get(f"{API}/documentos/{documento['id']}", headers=admin)
    assert final.status_code == 200
    assert final.json()["versao_atual"] == 2


async def test_acesso_sem_permissao_e_negado_e_registrado(client, token, pasta_saude):
    upload = await client.post(
        f"{API}/documentos/upload",
        data={"pasta_id": pasta_saude["id"]},
        files={"arquivo": ("interno.pdf", arquivo_pdf(), "application/pdf")},
        headers=token("gestor"),
    )
    documento = upload.json()["documento"]

    negado = await client.get(f"{API}/documentos/{documento['id']}", headers=token("externo"))
    assert negado.status_code == 403

    sem_token = await client.get(f"{API}/documentos/{documento['id']}")
    assert sem_token.status_code == 401


async def _token_saas(
    sub, organization_id, roles=None, nome="Usuário SaaS", email="", module="govdoc", org_slug=None
):
    """Token no formato emitido pela plataforma (assinado com a chave do GovDoc
    nos testes — o decoder tenta a chave local antes da do SaaS)."""
    from app.core.security import create_access_token

    extra = {
        "name": nome,
        "email": email,
        "roles": roles or [],
        "organization_id": str(organization_id),
        "org_name": "Prefeitura Provisionada",
        "org_slug": org_slug or f"org-{str(organization_id)[:8]}",
        "module": module,
    }
    return create_access_token(str(sub), extra=extra, token_type="module_access")


async def test_token_saas_provisiona_organizacao_e_usuario(client, db, mundo):
    """O primeiro acesso com token do SaaS cria a organização e o usuário
    just-in-time — o login e o órgão vêm da plataforma, não do cadastro local."""
    from sqlalchemy import func, select

    from app.models.organization import Institution
    from app.models.user import User

    novo_usuario = uuid.uuid4()
    nova_org = uuid.uuid4()
    token = await _token_saas(
        novo_usuario, nova_org, roles=["ADMIN"], email="admin.sso@teste.local"
    )

    eu = await client.get(f"{API}/auth/eu", headers={"Authorization": f"Bearer {token}"})
    assert eu.status_code == 200, eu.text
    corpo = eu.json()
    assert corpo["usuario"]["email"] == "admin.sso@teste.local"
    assert corpo["instituicao"]["id"] == str(nova_org)
    assert corpo["instituicao"]["nome"] == "Prefeitura Provisionada"

    user = await db.get(User, novo_usuario)
    assert user is not None
    assert user.profile == "admin_geral"  # papel ADMIN da plataforma vira admin
    assert user.institution_id == nova_org
    assert user.password_hash != ""

    institution = await db.get(Institution, nova_org)
    assert institution is not None
    assert institution.slug == f"org-{str(nova_org)[:8]}"

    # Segundo acesso não duplica nada.
    de_novo = await client.get(f"{API}/auth/eu", headers={"Authorization": f"Bearer {token}"})
    assert de_novo.status_code == 200
    total = await db.scalar(select(func.count(User.id)).where(User.institution_id == nova_org))
    assert total == 1

    # Token sem papel de administração mantém o perfil local já atribuído.
    colaborador_existente = mundo["usuarios"]["colaborador"]
    token_colab = await _token_saas(
        colaborador_existente.id,
        mundo["instituicao"].id,
        roles=["COLABORADOR"],
        nome="Colaborador Saúde",
        email=colaborador_existente.email,
    )
    eu_colab = await client.get(
        f"{API}/auth/eu", headers={"Authorization": f"Bearer {token_colab}"}
    )
    assert eu_colab.status_code == 200
    assert eu_colab.json()["usuario"]["perfil"] == "colaborador"


async def test_token_saas_sem_organizacao_negado(client):
    from app.core.security import create_access_token

    token = create_access_token(
        str(uuid.uuid4()),
        extra={"name": "Sem Órgão", "roles": ["ADMIN"]},
        token_type="module_access",
    )
    resposta = await client.get(f"{API}/auth/eu", headers={"Authorization": f"Bearer {token}"})
    assert resposta.status_code == 401


async def test_token_de_outro_modulo_negado(client):
    """Token module_access de outro módulo (ex.: chatgov) não abre sessão aqui."""
    token = await _token_saas(uuid.uuid4(), uuid.uuid4(), module="chatgov")
    resposta = await client.get(f"{API}/auth/eu", headers={"Authorization": f"Bearer {token}"})
    assert resposta.status_code == 401


async def test_sync_internal_provisiona_org_e_usuario(client, db):
    """Endpoints internos chamados pela plataforma no SSO (mesmo padrão ChatGov)."""

    from app.core.config import settings
    from app.models.organization import Institution
    from app.models.user import User

    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    headers = {"X-Internal-Key": settings.INTERNAL_API_KEY.get_secret_value()}

    org = await client.post(
        "/api/govdoc/internal/sync-organization",
        json={
            "organization_id": str(org_id),
            "name": "Secretaria de Testes",
            "slug": "secretaria-testes",
            "is_active": True,
        },
        headers=headers,
    )
    assert org.status_code == 200, org.text
    assert await db.get(Institution, org_id) is not None

    user = await client.post(
        "/api/govdoc/internal/sync-user",
        json={
            "user_id": str(user_id),
            "organization_id": str(org_id),
            "name": "Servidor Sincronizado",
            "email": "servidor@testes.local",
            "roles": ["ADMIN"],
            "is_active": True,
        },
        headers=headers,
    )
    assert user.status_code == 200, user.text
    criado = await db.get(User, user_id)
    assert criado is not None
    assert criado.profile == "admin_geral"

    # Chave interna inválida é rejeitada.
    negado = await client.post(
        "/api/govdoc/internal/sync-user",
        json={
            "user_id": str(user_id),
            "organization_id": str(org_id),
            "name": "X",
            "email": "x@testes.local",
        },
        headers={"X-Internal-Key": "chave-errada"},
    )
    assert negado.status_code == 401


async def test_ponte_dev_sessao_exige_flag(client):
    """A ponte dev retorna 404 sem a flag explícita (nunca ativa em produção)."""
    resposta = await client.post(f"{API}/auth/dev/session", json={"access_token": "token-qualquer"})
    assert resposta.status_code == 404


async def test_painel_e_relatorios(client, token, pasta_saude):
    await client.post(
        f"{API}/documentos/upload",
        data={"pasta_id": pasta_saude["id"]},
        files={"arquivo": ("doc.pdf", arquivo_pdf(), "application/pdf")},
        headers=token("gestor"),
    )
    painel = await client.get(f"{API}/painel", headers=token("admin"))
    assert painel.status_code == 200
    assert painel.json()["totais"]["documentos"] == 1
    assert painel.json()["armazenamento"]["total_bytes"] > 0

    relatorios = await client.get(f"{API}/relatorios", headers=token("admin"))
    assert len(relatorios.json()) > 5

    por_secretaria = await client.get(f"{API}/relatorios/por_secretaria", headers=token("admin"))
    assert por_secretaria.status_code == 200
    assert por_secretaria.json()["total"] >= 1

    csv = await client.get(f"{API}/relatorios/por_secretaria?formato=csv", headers=token("admin"))
    assert csv.status_code == 200
    assert "text/csv" in csv.headers["content-type"]


async def test_armazenamento_e_cota(client, token, pasta_saude, mundo):
    await client.post(
        f"{API}/documentos/upload",
        data={"pasta_id": pasta_saude["id"]},
        files={"arquivo": ("doc.pdf", arquivo_pdf(), "application/pdf")},
        headers=token("gestor"),
    )
    resumo = await client.get(f"{API}/armazenamento", headers=token("admin"))
    assert resumo.status_code == 200
    assert resumo.json()["total_bytes"] > 0
    assert any(item["nome"] == "Saúde" for item in resumo.json()["por_secretaria"])

    # Cota mínima faz o próximo envio ser recusado com mensagem clara.
    await client.post(
        f"{API}/armazenamento/cotas",
        json={
            "escopo_tipo": "secretariat",
            "escopo_id": str(mundo["saude"].id),
            "limite_mb": 1,
        },
        headers=token("admin"),
    )
    grande = b"%PDF-1.4\n" + b"0" * (2 * 1024 * 1024)
    recusado = await client.post(
        f"{API}/documentos/upload",
        data={"pasta_id": pasta_saude["id"]},
        files={"arquivo": ("grande.pdf", grande, "application/pdf")},
        headers=token("gestor"),
    )
    assert recusado.status_code == 413
    assert "limite de armazenamento" in recusado.json()["mensagem"]


async def test_saude_dos_servicos(client, token):
    saude = await client.get("/api/govdoc/health")
    assert saude.status_code == 200
    assert saude.json()["status"] == "ok"

    assert (await client.get("/api/govdoc/health/live")).json()["status"] == "ok"
    assert (await client.get("/api/govdoc/health/ready")).json()["status"] == "pronto"

    detalhado = await client.get("/api/govdoc/admin/saude", headers=token("admin"))
    assert detalhado.status_code == 200
    assert detalhado.json()["banco"]["status"] == "ok"
    assert detalhado.json()["armazenamento"]["status"] == "ok"


async def test_auditoria_exportavel_e_restrita(client, token, pasta_saude):
    negado = await client.get(f"{API}/auditoria", headers=token("colaborador"))
    assert negado.status_code == 403

    permitido = await client.get(f"{API}/auditoria", headers=token("auditor"))
    assert permitido.status_code == 200

    csv = await client.get(f"{API}/auditoria/exportar", headers=token("admin"))
    assert csv.status_code == 200
    assert "text/csv" in csv.headers["content-type"]
