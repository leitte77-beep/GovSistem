"""Cenário de abastecimentos em posto credenciado, usado pelos testes do portal e das notas."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.models.abastecimento import Abastecimento
from app.models.combustivel import Fornecedor
from app.models.unidade import Unidade
from app.models.veiculo import Veiculo

async def _cenario(client, _db, make_tenant, setup_frota):
    admin = await make_tenant("ADMIN")
    org = admin["org"]
    f = await setup_frota(org)
    saude = Unidade(organization_id=org.id, nome="Saúde")
    educ = Unidade(organization_id=org.id, nome="Educação")
    posto = Fornecedor(organization_id=org.id, razao_social="Posto Pinhalzinho", posto_credenciado=True,
                       cpf_cnpj="12.345.678/0001-90")
    outro = Fornecedor(organization_id=org.id, razao_social="Outro Posto", posto_credenciado=True)
    _db.add_all([saude, educ, posto, outro])
    await _db.flush()
    carro = f["veiculo"]
    carro.unidade_id = saude.id
    onibus = Veiculo(organization_id=org.id, placa="EDU1A23", modelo="Onibus", tipo="ONIBUS",
                     quilometragem_atual=1000, situacao="DISPONIVEL", unidade_id=educ.id)
    _db.add(onibus)
    await _db.flush()
    agora = datetime.now(timezone.utc)

    def ab(v, un, p, litros, preco, dias=0, status="CONFIRMADO"):
        return Abastecimento(
            organization_id=org.id, veiculo_id=v.id, combustivel_id=f["combustivel"].id,
            modalidade="POSTO_CREDENCIADO", fornecedor_id=p.id, unidade_id=un.id,
            quantidade_litros=Decimal(litros), quilometragem=50000,
            data_abastecimento=agora - timedelta(days=dias),
            preco_litro=Decimal(preco) if preco else None,
            custo_total=(Decimal(litros) * Decimal(preco)) if preco else None,
            origem="APP_MOTORISTA", status=status,
        )

    itens = {
        "s1": ab(carro, saude, posto, "40", "6.00"),
        "s2": ab(carro, saude, posto, "30", "6.00"),
        "s_cancelado": ab(carro, saude, posto, "99", "6.00", status="CANCELADO"),
        "s_outro_posto": ab(carro, saude, outro, "10", "6.00"),
        "s_antigo": ab(carro, saude, posto, "10", "6.00", dias=400),
        "e1": ab(onibus, educ, posto, "100", "6.00"),
    }
    _db.add_all(itens.values())
    await _db.commit()
    hoje = date.today()
    filtro = {"fornecedor_id": str(posto.id), "unidade_id": str(saude.id),
              "periodo_inicio": (hoje - timedelta(days=30)).isoformat(), "periodo_fim": hoje.isoformat()}
    return admin, saude, educ, posto, itens, filtro
