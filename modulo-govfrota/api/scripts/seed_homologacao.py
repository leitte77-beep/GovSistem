"""Cria uma organização de homologação do GovFrota com dados realistas.

Tudo entra pelos endpoints reais da API (mesmas validações e regras de negócio
da produção) — nada é escrito direto no banco e nada é mockado no frontend.

Uso:
    python scripts/seed_homologacao.py --base-url http://127.0.0.1:8301 \
        --internal-key $INTERNAL_API_KEY [--slug govfrota-homolog] [--limpar]

O argumento --limpar remove (soft delete, pelas rotas da API) os dados da
organização de homologação antes de recriá-los.
"""

from __future__ import annotations

import argparse
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx

SLUG_PADRAO = "govfrota-homolog"
NOME_PADRAO = "Prefeitura Municipal de Farol (Homologação)"
EMAIL_ADMIN = "homologacao@govfrota.local"

VEICULOS = [
    ("ABC1D23", "Toyota", "Hilux SRX 2.8 4x4 Diesel Automática", "CAMINHONETE", "DIESEL_S10", 50_000),
    ("DEF4G56", "Mercedes-Benz", "Atego 1719", "CAMINHAO", "DIESEL_S500", 180_000),
    ("GHI7J89", "Fiat", "Strada Freedom 1.3", "CAMINHONETE", "GASOLINA", 92_000),
    ("JKL2M34", "Volkswagen", "Gol 1.0", "CARRO", "GASOLINA", 64_000),
    ("MNO5P67", "Ford", "Ranger XLS 2.2", "CAMINHONETE", "DIESEL_S10", 120_000),
    ("PQR8S90", "Chevrolet", "Onix LT 1.0", "CARRO", "GASOLINA", 38_000),
    ("STU1V23", "Renault", "Master Furgão 2.3", "VAN", "DIESEL_S10", 76_000),
    ("VWX4Y56", "Iveco", "Daily 35-150", "CAMINHAO", "DIESEL_S500", 143_000),
    ("YZA7B89", "Honda", "Biz 125", "MOTO", "GASOLINA", 21_000),
    ("BCD0E12", "Volkswagen", "Constellation 24.280", "CAMINHAO", "DIESEL_S500", 210_000),
]

MOTORISTAS = [
    ("João da Silva", 365),
    ("Maria Aparecida de Souza", 200),
    ("Carlos Eduardo Lima", -12),   # CNH vencida → alerta
    ("Ana Paula Ferreira", 6),      # CNH vence em 6 dias → alerta
    ("Pedro Henrique Alves", 540),
    ("Luciana Rodrigues", 90),
    ("Marcos Antônio Pereira", 730),
]

COMBUSTIVEIS = ["Diesel S10", "Diesel S500", "Gasolina Comum"]

TANQUES = [
    # nome, combustível, capacidade, mínimo, alvo de estoque final
    ("Tanque Principal", "Diesel S10", 15_000, 3_000, 8_420),
    ("Tanque Pesados", "Diesel S500", 10_000, 2_000, 4_100),
    ("Tanque Gasolina", "Gasolina Comum", 5_000, 1_000, 900),  # abaixo do mínimo → alerta
]


class Api:
    def __init__(self, base_url: str, token: str) -> None:
        self.c = httpx.Client(
            base_url=f"{base_url.rstrip('/')}/api/govfrota",
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )

    def post(self, path: str, json: dict):
        r = self.c.post(path, json=json)
        if r.status_code >= 400:
            raise SystemExit(f"POST {path} → {r.status_code}: {r.text}")
        return r.json() if r.content else None

    def get(self, path: str):
        r = self.c.get(path)
        if r.status_code >= 400:
            raise SystemExit(f"GET {path} → {r.status_code}: {r.text}")
        return r.json()

    def patch(self, path: str, json: dict):
        r = self.c.patch(path, json=json)
        if r.status_code >= 400:
            raise SystemExit(f"PATCH {path} → {r.status_code}: {r.text}")
        return r.json() if r.content else None

    def delete(self, path: str):
        return self.c.delete(path)


def provisionar(base_url: str, internal_key: str, slug: str, nome: str) -> tuple[str, str]:
    """Provisiona organização + usuário admin pelo mesmo fluxo do SaaS."""
    org_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"govfrota-homolog/{slug}"))
    user_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"govfrota-homolog/{slug}/admin"))
    headers = {"X-Internal-Key": internal_key}
    with httpx.Client(base_url=f"{base_url.rstrip('/')}/api/govfrota", timeout=60) as c:
        r = c.post(
            "/internal/sync-organization",
            headers=headers,
            json={"organization_id": org_id, "name": nome, "slug": slug, "is_active": True},
        )
        r.raise_for_status()
        org_id = r.json()["organization_id"]
        r = c.post(
            "/internal/sync-user",
            headers=headers,
            json={
                "user_id": user_id,
                "organization_id": org_id,
                "name": "Homologação GovFrota",
                "email": EMAIL_ADMIN,
                "roles": ["ADMIN"],
            },
        )
        r.raise_for_status()
        return org_id, r.json().get("user_id", user_id)


def semear(api: Api) -> dict:
    hoje = date.today()
    agora = datetime.now(timezone.utc)
    rnd = random.Random(42)  # determinístico: mesma massa a cada execução

    # ── Combustíveis ──
    existentes = {c["nome"]: c["id"] for c in api.get("/combustiveis")}
    combustiveis = {}
    for nome in COMBUSTIVEIS:
        combustiveis[nome] = existentes.get(nome) or api.post(
            "/combustiveis", {"nome": nome, "unidade": "litro", "ativo": True}
        )["id"]

    # ── Fornecedor (necessário para entradas) ──
    fornecedores = api.get("/fornecedores")
    fornecedor_id = (
        fornecedores[0]["id"]
        if fornecedores
        else api.post(
            "/fornecedores",
            {"razao_social": "Distribuidora de Combustíveis Farol Ltda.", "cpf_cnpj": "12345678000199", "categoria": "COMBUSTIVEL"},
        )["id"]
    )

    # ── Tanques ──
    tanques = {}
    for nome, comb, capacidade, minimo, _alvo in TANQUES:
        tanques[comb] = api.post(
            "/tanques",
            {
                "nome": nome,
                "combustivel_id": combustiveis[comb],
                "capacidade_maxima": str(capacidade),
                "estoque_inicial": "0",
                "estoque_minimo": str(minimo),
            },
        )["id"]

    # ── Veículos ──
    mapa_comb = {"DIESEL_S10": "Diesel S10", "DIESEL_S500": "Diesel S500", "GASOLINA": "Gasolina Comum"}
    veiculos = []
    for placa, marca, modelo, tipo, comb, km in VEICULOS:
        v = api.post(
            "/veiculos",
            {
                "placa": placa,
                "marca": marca,
                "modelo": modelo,
                "tipo": tipo,
                "combustivel_principal_id": combustiveis[mapa_comb[comb]],
                "quilometragem_atual": km,
                "ano_fabricacao": 2019 + (km % 5),
                "situacao": "DISPONIVEL",
            },
        )
        veiculos.append({**v, "combustivel": mapa_comb[comb], "km": km})

    # ── Motoristas ──
    motoristas = []
    for i, (nome, dias_cnh) in enumerate(MOTORISTAS):
        motoristas.append(
            api.post(
                "/motoristas",
                {
                    "nome": nome,
                    "cpf": f"{10000000000 + i * 7654321:011d}",
                    "cnh_numero": f"{900000000 + i}",
                    "cnh_categoria": "D" if i % 2 else "B",
                    "cnh_validade": (hoje + timedelta(days=dias_cnh)).isoformat(),
                    "ativo": True,
                },
            )
        )

    # ── Plano de abastecimentos (gerado antes para dimensionar as entradas) ──
    plano_abastecimentos = []
    consumo_por_combustivel = {c: 0.0 for c in COMBUSTIVEIS}
    for v in veiculos:
        km = v["km"]
        # volume por veículo: caminhões consomem mais (gera ranking real)
        base_litros = {"CAMINHAO": 120, "VAN": 70, "CAMINHONETE": 55, "CARRO": 38, "MOTO": 9}[v["tipo"]]
        for semana in range(24, 0, -1):
            if rnd.random() < 0.35:  # nem todo veículo abastece toda semana
                continue
            quando = agora - timedelta(days=semana * 7, hours=rnd.randint(0, 8))
            litros = round(base_litros * rnd.uniform(0.7, 1.15), 2)
            km += int(litros * rnd.uniform(6.5, 11.0))
            plano_abastecimentos.append((v, quando, litros, km, rnd.choice(motoristas)["id"]))
            consumo_por_combustivel[v["combustivel"]] += litros
        v["km_final"] = km
    plano_abastecimentos.sort(key=lambda item: item[1])

    # ── Entradas de combustível (6 meses) ──
    # Cada tanque recebe o consumo do período + o estoque final desejado, para
    # que a homologação termine com os níveis previstos no cenário.
    entradas = 0
    for nome, comb, capacidade, minimo, alvo in TANQUES:
        total = alvo + consumo_por_combustivel[comb]
        por_entrada = round(total / 6, 2)
        preco = {"Diesel S10": 5.98, "Diesel S500": 5.72, "Gasolina Comum": 6.34}[comb]
        for i in range(6, 0, -1):
            data = hoje.replace(day=5) - timedelta(days=30 * (i - 1))
            api.post(
                "/entradas",
                {
                    "tanque_id": tanques[comb],
                    "combustivel_id": combustiveis[comb],
                    "fornecedor_id": fornecedor_id,
                    "quantidade_litros": str(por_entrada),
                    "data_entrada": data.isoformat(),
                    "numero_nota": f"NF-{data.strftime('%Y%m')}-{comb[:3].upper()}",
                    "valor_total": str(round(por_entrada * preco, 2)),
                },
            )
            entradas += 1

    # ── Abastecimentos distribuídos nos últimos 6 meses ──
    abastecimentos = 0
    for v, quando, litros, km, motorista_id in plano_abastecimentos:
        api.post(
            "/abastecimentos",
            {
                "veiculo_id": v["id"],
                "motorista_id": motorista_id,
                "tanque_id": tanques[v["combustivel"]],
                "combustivel_id": combustiveis[v["combustivel"]],
                "quantidade_litros": str(litros),
                "quilometragem": km,
                "data_abastecimento": quando.isoformat(),
            },
        )
        abastecimentos += 1

    # ── Planos preventivos: um vencido, um próximo, um em dia ──
    planos = [
        (veiculos[0], "Troca de óleo e filtros", 10_000, veiculos[0]["km_final"] - 9_600),  # próxima
        (veiculos[1], "Revisão geral", 20_000, veiculos[1]["km_final"] - 21_000),           # vencida
        (veiculos[3], "Alinhamento e balanceamento", 15_000, veiculos[3]["km_final"] - 2_000),  # em dia
    ]
    for veiculo, nome, intervalo, ultima_km in planos:
        api.post(
            "/planos-preventivos",
            {
                "veiculo_id": veiculo["id"],
                "nome": nome,
                "base": "QUILOMETRAGEM",
                "intervalo_km": intervalo,
                "ultima_execucao_km": max(ultima_km, 0),
                "ativo": True,
            },
        )

    # ── Manutenções: aberta, em andamento, concluída ──
    oficina = api.post(
        "/oficinas",
        {"nome": "Oficina Municipal Central", "cpf_cnpj": "98765432000155", "telefone": "44 3555-1234"},
    )
    manutencoes = [
        (veiculos[1], "CORRETIVA", "Vazamento no sistema de arrefecimento", hoje - timedelta(days=3), "ABERTA", 0),
        (veiculos[4], "PREVENTIVA", "Revisão de 120.000 km", hoje - timedelta(days=10), "EM_MANUTENCAO", 0),
        (veiculos[2], "CORRETIVA", "Troca de pastilhas de freio", hoje - timedelta(days=40), "CONCLUIDA", 780.50),
    ]
    for veiculo, tipo, descricao, data, status, valor in manutencoes:
        m = api.post(
            "/manutencoes",
            {
                "veiculo_id": veiculo["id"],
                "tipo": tipo,
                "descricao_problema": descricao,
                "data_solicitacao": data.isoformat(),
                "oficina_id": oficina["id"],
                "itens": (
                    [{"descricao": descricao, "quantidade": 1, "valor_unitario": str(valor), "categoria": "SERVICO"}]
                    if valor
                    else []
                ),
            },
        )
        if status == "CONCLUIDA":
            api.patch(
                f"/manutencoes/{m['id']}",
                {"status": status, "data_conclusao": (data + timedelta(days=4)).isoformat()},
            )
        elif status != "ABERTA":
            api.patch(f"/manutencoes/{m['id']}", {"status": status})

    # ── Ocorrências: uma comum e uma crítica ──
    api.post(
        "/ocorrencias",
        {
            "veiculo_id": veiculos[3]["id"],
            "motorista_id": motoristas[0]["id"],
            "categoria": "AVARIA",
            "descricao": "Retrovisor direito trincado durante manobra.",
            "gravidade": "BAIXA",
            "data_ocorrencia": (hoje - timedelta(days=6)).isoformat(),
        },
    )
    api.post(
        "/ocorrencias",
        {
            "veiculo_id": veiculos[1]["id"],
            "motorista_id": motoristas[1]["id"],
            "categoria": "ACIDENTE",
            "descricao": "Colisão traseira em via urbana, veículo recolhido para perícia.",
            "gravidade": "CRITICA",
            "data_ocorrencia": (hoje - timedelta(days=2)).isoformat(),
        },
    )

    # ── Documento vencendo ──
    api.post(
        f"/veiculos/{veiculos[5]['id']}/documentos",
        {
            "descricao": "Licenciamento anual",
            "tipo": "LICENCIAMENTO",
            "vencimento": (hoje + timedelta(days=5)).isoformat(),
        },
    )

    # ── Um veículo indisponível (alerta de frota) ──
    api.patch(f"/veiculos/{veiculos[7]['id']}", {"situacao": "INDISPONIVEL"})

    return {
        "veiculos": len(veiculos),
        "motoristas": len(motoristas),
        "tanques": len(tanques),
        "entradas": entradas,
        "abastecimentos": abastecimentos,
        "manutencoes": len(manutencoes),
        "planos_preventivos": len(planos),
    }


# Tabelas do módulo limpas na reexecução — sempre restritas ao organization_id
# da organização de HOMOLOGAÇÃO (nenhuma outra organização é tocada).
TABELAS_LIMPEZA = [
    "correcoes_abastecimento",
    "abastecimentos",
    "movimentacoes_estoque",
    "entradas_combustivel",
    "manutencoes_itens",
    "manutencoes",
    "planos_preventivos",
    "ocorrencias",
    "veiculos_documentos",
    "veiculos_alteracoes_km",
    "acessos_motorista",
    "motoristas",
    "veiculos",
    "tanques",
    "combustiveis",
    "oficinas",
    "fornecedores",
    # auditorias NÃO entra aqui: a trilha é append-only por regra do módulo.
    "notificacoes",
    "inventarios_tanque",
]


async def limpar(org_id: str) -> None:
    """Zera os dados da organização de homologação (execução idempotente)."""
    from sqlalchemy import text

    from app.core.database import async_session

    async with async_session() as db:
        for tabela in TABELAS_LIMPEZA:
            await db.execute(
                text(f"DELETE FROM {tabela} WHERE organization_id = :org"),
                {"org": org_id},
            )
            await db.commit()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--internal-key", required=True)
    p.add_argument("--slug", default=SLUG_PADRAO)
    p.add_argument("--nome", default=NOME_PADRAO)
    p.add_argument("--limpar", action="store_true")
    p.add_argument("--apenas-token", action="store_true")
    args = p.parse_args()

    org_id, user_id = provisionar(args.base_url, args.internal_key, args.slug, args.nome)

    from app.core.security import create_access_token

    token = create_access_token(uuid.UUID(user_id), ["ADMIN"], uuid.UUID(org_id))
    if args.apenas_token:
        print(token)
        return 0

    if args.limpar:
        import asyncio

        asyncio.run(limpar(org_id))

    api = Api(args.base_url, token)
    resumo = semear(api)

    print(f"organização: {args.nome} ({org_id})")
    for chave, valor in resumo.items():
        print(f"  {chave}: {valor}")
    print(f"token: {token}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
