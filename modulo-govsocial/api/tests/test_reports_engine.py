"""Motor de Relatórios Customizáveis: sem SQL do cliente, sempre por tenant.

Cobre a correção de uma vulnerabilidade em que `fonte_dados` aceitava SQL cru
do cliente e era executado sem filtro de tenant (`app/services/report_engine.py`).
Agora `fonte_dados` só pode referenciar uma fonte conhecida em FONTE_REGISTRY,
e o engine sempre aplica `tenant_id` no servidor — nunca no config recebido.
"""
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

PREFIX = "/api/govsocial/v1"
AUTH = "gestor_municipal"


def _config_families():
    return {
        "nome": "Famílias por bairro",
        "fonte_dados": {"tabela": "families"},
        "colunas": [
            {"campo": "id", "titulo": "ID"},
            {"campo": "codigo_familiar", "titulo": "Código"},
            {"campo": "bairro", "titulo": "Bairro"},
        ],
    }


class TestRelatorioSemSqlCru:
    async def test_dictionary_nao_expoe_sql(self, client: AsyncClient, world: dict):
        resp = await client.get(f"{PREFIX}/reports/dictionary", headers=world["auth"](AUTH))
        assert resp.status_code == 200
        tabelas = {item["tabela"] for item in resp.json()}
        assert "families" in tabelas and "persons" in tabelas

    async def test_criar_relatorio_com_sql_customizado_e_rejeitado(
        self, client: AsyncClient, world: dict
    ):
        body = _config_families()
        body["fonte_dados"] = {"sql": "SELECT cpf, nome_civil FROM persons"}
        resp = await client.post(f"{PREFIX}/reports", json=body, headers=world["auth"](AUTH))
        assert resp.status_code == 422
        assert "SQL customizado" in resp.json()["detail"]

    async def test_criar_relatorio_com_tabela_desconhecida_e_rejeitado(
        self, client: AsyncClient, world: dict
    ):
        body = _config_families()
        body["fonte_dados"] = {"tabela": "users"}
        resp = await client.post(f"{PREFIX}/reports", json=body, headers=world["auth"](AUTH))
        assert resp.status_code == 422

    async def test_criar_relatorio_com_coluna_fora_do_dicionario_e_rejeitado(
        self, client: AsyncClient, world: dict
    ):
        body = _config_families()
        body["colunas"] = [{"campo": "senha_hash", "titulo": "Senha"}]
        resp = await client.post(f"{PREFIX}/reports", json=body, headers=world["auth"](AUTH))
        assert resp.status_code == 422

    async def test_atualizar_relatorio_revalida_apos_merge(
        self, client: AsyncClient, world: dict
    ):
        criado = await client.post(f"{PREFIX}/reports", json=_config_families(), headers=world["auth"](AUTH))
        assert criado.status_code == 200
        rid = criado.json()["id"]

        resp = await client.patch(
            f"{PREFIX}/reports/{rid}",
            json={"fonte_dados": {"sql": "DROP TABLE persons"}},
            headers=world["auth"](AUTH),
        )
        assert resp.status_code == 422

    async def test_execucao_nunca_ve_dado_de_outro_tenant(
        self, client: AsyncClient, world: dict, db_session: AsyncSession
    ):
        # family_a e family_b têm bairro/território idênticos no fixture
        # ("Centro") — se o engine esquecer o filtro de tenant, as duas
        # aparecem no relatório do tenant A.
        criado = await client.post(f"{PREFIX}/reports", json=_config_families(), headers=world["auth"](AUTH))
        assert criado.status_code == 200
        rid = criado.json()["id"]

        resp = await client.post(f"{PREFIX}/reports/{rid}/execute", headers=world["auth"](AUTH))
        assert resp.status_code == 200
        d = resp.json()
        ids = {row["id"] for row in d["dados"]}
        assert str(world["family_a"].id) in ids
        assert str(world["family_b"].id) not in ids
        assert d["total"] == len(ids) == 1

    async def test_execucao_com_join_retorna_nome_do_responsavel(
        self, client: AsyncClient, world: dict
    ):
        body = _config_families()
        body["colunas"].append({"campo": "nome_responsavel", "titulo": "Responsável"})
        criado = await client.post(f"{PREFIX}/reports", json=body, headers=world["auth"](AUTH))
        rid = criado.json()["id"]

        resp = await client.post(f"{PREFIX}/reports/{rid}/execute", headers=world["auth"](AUTH))
        assert resp.status_code == 200
        linha = resp.json()["dados"][0]
        assert linha["nome_responsavel"] == "Maria da Silva"

    async def test_relatorio_de_outro_tenant_nao_e_visivel(
        self, client: AsyncClient, world: dict
    ):
        criado = await client.post(f"{PREFIX}/reports", json=_config_families(), headers=world["auth"](AUTH, "A"))
        rid = criado.json()["id"]

        resp = await client.post(
            f"{PREFIX}/reports/{rid}/execute", headers=world["auth"]("gestor_municipal", "B")
        )
        assert resp.status_code == 404
