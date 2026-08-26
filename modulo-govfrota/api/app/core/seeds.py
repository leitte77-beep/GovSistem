"""Dados de demonstração do GovFrota (§71).

Uso: python -m app.core.seeds

NUNCA executado automaticamente em produção.
"""

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import get_sync_db  # noqa: F401
from app.core.database import async_session
from app.core.security import hash_secret
from app.models.auth_models import Organization
from app.models.combustivel import Combustivel, Fornecedor, Oficina, Tanque
from app.models.motorista import AcessoMotorista, Motorista
from app.models.veiculo import Veiculo

SEED_ORG_SLUG = "demo-govfrota"
SEED_ORG_NAME = "Empresa Demo GovFrota"


async def seed() -> dict:
    from app.services.abastecimento import get_configuracoes
    from app.services.estoque import aplicar_movimentacao
    from app.models.enums import OrigemMovimentacao, TipoMovimentacao

    async with async_session() as db:
        result = await db.execute(
            select(Organization).where(Organization.slug == SEED_ORG_SLUG)
        )
        org = result.scalar_one_or_none()
        if org is None:
            org = Organization(name=SEED_ORG_NAME, slug=SEED_ORG_SLUG)
            db.add(org)
            await db.flush()

        await get_configuracoes(db, org.id)

        # Combustíveis
        nomes_combustiveis = ["Diesel S10", "Gasolina Comum", "Etanol", "Arla 32"]
        combustiveis = {}
        for nome in nomes_combustiveis:
            c = (
                await db.execute(
                    select(Combustivel).where(
                        Combustivel.organization_id == org.id,
                        Combustivel.nome == nome,
                    )
                )
            ).scalar_one_or_none()
            if c is None:
                c = Combustivel(organization_id=org.id, nome=nome, unidade="litro")
                db.add(c)
                await db.flush()
            combustiveis[nome] = c

        # Tanques
        tanques_data = [
            ("Tanque Diesel S10", "Diesel S10", "15000", "0", "2000"),
            ("Tanque Gasolina", "Gasolina Comum", "5000", "0", "800"),
        ]
        tanques = {}
        for nome_tanque, nome_comb, capacidade, inicial, minimo in tanques_data:
            t = (
                await db.execute(
                    select(Tanque).where(
                        Tanque.organization_id == org.id,
                        Tanque.nome == nome_tanque,
                    )
                )
            ).scalar_one_or_none()
            if t is None:
                t = Tanque(
                    organization_id=org.id,
                    nome=nome_tanque,
                    combustivel_id=combustiveis[nome_comb].id,
                    capacidade_maxima=capacidade,
                    estoque_inicial=inicial,
                    estoque_atual=inicial,
                    estoque_minimo=minimo,
                )
                db.add(t)
                await db.flush()
                if float(inicial) > 0:
                    await aplicar_movimentacao(
                        db,
                        organization_id=org.id,
                        tipo=TipoMovimentacao.ENTRADA.value,
                        origem="ESTOQUE_INICIAL",
                        sinal=1,
                        quantidade=__import__("decimal").Decimal(inicial),
                        combustivel_id=t.combustivel_id,
                        tanque_id=t.id,
                        descricao="Estoque inicial de demonstração",
                    )
            tanques[nome_tanque] = t

        # Veículos
        veiculos_data = [
            ("ABC1D23", "Toyota", "Hilux", "CAMINHONETE", "Diesel S10", 50000),
            ("DEF4G56", "Mercedes-Benz", "Accelo", "CAMINHAO", "Diesel S10", 120000),
            ("GHI7J89", "Volkswagen", "Gol", "CARRO", "Gasolina Comum", 85000),
        ]
        for placa, marca, modelo, tipo, comb_nome, km in veiculos_data:
            existe = (
                await db.execute(
                    select(Veiculo.id).where(
                        Veiculo.organization_id == org.id, Veiculo.placa == placa
                    )
                )
            ).scalar_one_or_none()
            if existe:
                continue
            db.add(
                Veiculo(
                    organization_id=org.id,
                    placa=placa,
                    marca=marca,
                    modelo=modelo,
                    tipo=tipo,
                    combustivel_principal_id=combustiveis[comb_nome].id,
                    quilometragem_atual=km,
                    situacao="DISPONIVEL",
                )
            )
        await db.flush()

        # Motoristas com acesso
        motoristas_data = [("João da Silva", "joao", "1234"), ("Carlos Pereira", "carlos", "1234")]
        for nome, login, senha in motoristas_data:
            m = (
                await db.execute(
                    select(Motorista).where(
                        Motorista.organization_id == org.id, Motorista.nome == nome
                    )
                )
            ).scalar_one_or_none()
            if m is None:
                m = Motorista(
                    organization_id=org.id,
                    nome=nome,
                    cpf=f"{uuid.uuid4().int % 10**11:011d}",
                    cnh_categoria="D",
                    cnh_validade=date.today() + timedelta(days=365),
                    ativo=True,
                )
                db.add(m)
                await db.flush()
                db.add(
                    AcessoMotorista(
                        organization_id=org.id,
                        motorista_id=m.id,
                        login=f"{login}.{SEED_ORG_SLUG[:6]}",
                        senha_hash=hash_secret(senha),
                    )
                )

        # Fornecedor e oficina
        fornecedor = (
            await db.execute(
                select(Fornecedor).where(
                    Fornecedor.organization_id == org.id,
                    Fornecedor.razao_social == "Distribuidora XYZ de Combustíveis LTDA",
                )
            )
        ).scalar_one_or_none()
        if fornecedor is None:
            db.add(
                Fornecedor(
                    organization_id=org.id,
                    razao_social="Distribuidora XYZ de Combustíveis LTDA",
                    nome_fantasia="Distribuidora XYZ",
                    categoria="COMBUSTIVEL",
                )
            )

        oficina = (
            await db.execute(
                select(Oficina).where(
                    Oficina.organization_id == org.id, Oficina.nome == "Auto Center Central"
                )
            )
        ).scalar_one_or_none()
        if oficina is None:
            db.add(
                Oficina(
                    organization_id=org.id,
                    nome="Auto Center Central",
                    especialidade="Mecânica em geral",
                )
            )

        # ── Dados demonstrativos de combustível ────────────────────────────
        await _seed_dados_combustivel(db, org.id, combustiveis, tanques, veiculos_data)
        await db.commit()

    return {"status": "ok", "mensagem": "Dados de demonstração criados."}


async def _seed_dados_combustivel(db, org_id, combustiveis, tanques, veiculos_data):
    """Entradas e abastecimentos fictícios para dashboard e relatórios."""
    from decimal import Decimal

    from app.models.abastecimento import Abastecimento
    from app.models.estoque import EntradaCombustivel
    from app.models.motorista import AcessoMotorista, Motorista
    from app.models.veiculo import Veiculo
    from app.services.estoque import aplicar_movimentacao
    from app.models.enums import OrigemMovimentacao, TipoMovimentacao

    entradas_data = [
        ("Tanque Diesel S10", "Diesel S10", "15000", "84000", "NF-DEMO-0001", date.today() - timedelta(days=20)),
        ("Tanque Gasolina", "Gasolina Comum", "4000", "23000", "NF-DEMO-0002", date.today() - timedelta(days=15)),
        ("Tanque Diesel S10", "Diesel S10", "12000", "69600", "NF-DEMO-0003", date.today() - timedelta(days=5)),
    ]
    for nome_tanque, nome_comb, litros, valor, nota, data in entradas_data:
        tanque = tanques[nome_tanque]
        if await db.scalar(
            select(EntradaCombustivel.id).where(
                EntradaCombustivel.organization_id == org_id,
                EntradaCombustivel.numero_nota == nota,
            )
        ):
            continue
        e = EntradaCombustivel(
            organization_id=org_id,
            tanque_id=tanque.id,
            combustivel_id=combustiveis[nome_comb].id,
            quantidade_litros=Decimal(litros),
            data_entrada=data,
            numero_nota=nota,
            valor_total=Decimal(valor),
            valor_por_litro=(Decimal(valor) / Decimal(litros)).quantize(Decimal("0.0001")),
        )
        db.add(e)
        await db.flush()
        await aplicar_movimentacao(
            db,
            organization_id=org_id,
            tipo=TipoMovimentacao.ENTRADA.value,
            origem=OrigemMovimentacao.ENTRADA_COMPRA.value,
            sinal=1,
            quantidade=Decimal(litros),
            combustivel_id=combustiveis[nome_comb].id,
            tanque_id=tanque.id,
            referencia_tipo="ENTRADA_COMBUSTIVEL",
            custo_unitario=e.valor_por_litro,
            descricao=f"NF {nota}",
        )

    # Abastecimentos demonstrativos (variam os últimos 30 dias)
    veiculos = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.organization_id == org_id, Veiculo.placa.in_([v[0] for v in veiculos_data])
            )
        )
    ).scalars().all()
    motoristas = (
        await db.execute(
            select(Motorista).where(Motorista.organization_id == org_id)
        )
    ).scalars().all()
    acesso = (
        await db.execute(
            select(AcessoMotorista).where(
                AcessoMotorista.organization_id == org_id,
                AcessoMotorista.login.like("joao.%"),
            )
        )
    ).scalar_one_or_none()

    if not veiculos or not motoristas or acesso is None:
        return

    from app.services.abastecimento import registrar_abastecimento

    joao = next((m for m in motoristas if m.id == acesso.motorista_id), motoristas[0])
    plano = [
        ("ABC1D23", 45, 50100, 10),
        ("DEF4G56", 200, 120400, 5),
        ("GHI7J89", 40, 85200, 3),
        ("ABC1D23", 50, 50650, 2),
        ("GHI7J89", 38, 85600, 1),
    ]
    for placa, litros, km, dias_atras in plano:
        veiculo = next((v for v in veiculos if v.placa == placa), None)
        if not veiculo:
            continue
        tanque = tanques.get("Tanque Diesel S10")
        if veiculo.combustivel_principal_id == combustiveis["Gasolina Comum"].id:
            tanque = tanques.get("Tanque Gasolina")
        if tanque is None:
            continue
        data = datetime.now(timezone.utc) - timedelta(days=dias_atras)
        try:
            await registrar_abastecimento(
                db,
                organization_id=org_id,
                veiculo=veiculo,
                tanque_id=tanque.id,
                combustivel_id=veiculo.combustivel_principal_id,
                quantidade_litros=Decimal(litros),
                quilometragem=km,
                data_abastecimento=data,
                motorista_id=joao.id,
                origem="APP_MOTORISTA",
            )
        except Exception:
            # Não interrompe o seed se algum abastecimento conflitar
            await db.rollback()
            continue


if __name__ == "__main__":
    resultado = asyncio.run(seed())
    print(resultado["mensagem"])
