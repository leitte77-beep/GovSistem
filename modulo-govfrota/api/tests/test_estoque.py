"""Testes do controle de estoque de combustível.

Foco em regressões críticas de concorrência e rastreabilidade (§55-§57):
- O estoque atual NUNCA pode depender de leitura em cache do identity map.
- Movimentações são append-only; cancelamentos/estornos geram novas linhas.
"""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import Base
from app.models.combustivel import Combustivel, Tanque
from app.models.estoque import MovimentacaoEstoque
from app.services.estoque import (
    EstoqueError,
    aplicar_movimentacao,
)
from app.models.enums import OrigemMovimentacao, TipoMovimentacao


@pytest.mark.asyncio
async def test_estoque_nao_usa_valor_cacheado_do_identity_map():
    """Regressão de concorrência: SELECT ... FOR UPDATE não pode retornar o
    objeto em cache do identity map.

    Cenário (§56): o tanque já foi carregado na sessão (auto-seleção no
    endpoint); uma transação concorrente baixou o estoque; a movimentação
    seguinte deve ENXERGAR o valor atualizado do banco, não o cacheado.
    """
    import os
    import tempfile

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool

    from app.models import Organization

    db_file = tempfile.mktemp(suffix=".db")
    try:
        engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}", poolclass=NullPool)
        session_factory = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with session_factory() as s1:
            org = Organization(name="Org", slug=uuid.uuid4().hex)
            s1.add(org)
            await s1.flush()
            comb = Combustivel(
                organization_id=org.id, nome="Diesel", unidade="litro", ativo=True
            )
            s1.add(comb)
            await s1.flush()
            tanque = Tanque(
                organization_id=org.id,
                nome="Tanque",
                combustivel_id=comb.id,
                capacidade_maxima="1000",
                estoque_inicial="50",
                estoque_atual="50",
                estoque_minimo="0",
            )
            s1.add(tanque)
            await s1.commit()

            # Simula o endpoint: carrega o tanque no identity map de s1 (estoque 50)
            cacheado = (
                await s1.execute(select(Tanque).where(Tanque.id == tanque.id))
            ).scalar_one()
            assert Decimal(str(cacheado.estoque_atual)) == Decimal("50")

            # Sessão concorrente (s2, outra conexão): baixa 40 L e confirma
            async with session_factory() as s2:
                tk = (
                    await s2.execute(select(Tanque).where(Tanque.id == tanque.id))
                ).scalar_one()
                tk.estoque_atual = Decimal("10")
                await s2.commit()

            # cacheado em s1 continua 50 (expire_on_commit=False)
            assert Decimal(str(cacheado.estoque_atual)) == Decimal("50")

            # Sem populate_existing, aplicar_movimentacao usaria 50 (cache) e
            # aceitaria a saída de 30 L. Com a correção, vê 10 -> insuficiente.
            with pytest.raises(EstoqueError) as exc:
                await aplicar_movimentacao(
                    s1,
                    organization_id=org.id,
                    tipo=TipoMovimentacao.SAIDA.value,
                    origem=OrigemMovimentacao.ABASTECIMENTO.value,
                    sinal=-1,
                    quantidade=Decimal("30"),
                    combustivel_id=comb.id,
                    tanque_id=tanque.id,
                    permitir_negativo=False,
                )
            assert exc.value.codigo == "ESTOQUE_INSUFICIENTE"

        await engine.dispose()
    finally:
        if os.path.exists(db_file):
            os.remove(db_file)


@pytest.mark.asyncio
async def test_estoque_insuficiente_nao_altera_estoque(_db):
    """Estoque insuficiente deve falhar sem mutar estoque/movimentações."""
    from app.models import Organization

    org = Organization(name="Org", slug=uuid.uuid4().hex)
    _db.add(org)
    await _db.flush()
    comb = Combustivel(organization_id=org.id, nome="Diesel", unidade="litro", ativo=True)
    _db.add(comb)
    await _db.flush()
    tanque = Tanque(
        organization_id=org.id, nome="T", combustivel_id=comb.id,
        capacidade_maxima="1000", estoque_inicial="50", estoque_atual="50",
        estoque_minimo="0",
    )
    _db.add(tanque)
    await _db.commit()

    with pytest.raises(EstoqueError):
        await aplicar_movimentacao(
            _db, organization_id=org.id, tipo=TipoMovimentacao.SAIDA.value,
            origem=OrigemMovimentacao.ABASTECIMENTO.value, sinal=-1,
            quantidade=Decimal("100"), combustivel_id=comb.id, tanque_id=tanque.id,
        )

    movs = (await _db.execute(select(MovimentacaoEstoque))).scalars().all()
    assert len(movs) == 0
    tk = (await _db.execute(select(Tanque).where(Tanque.id == tanque.id))).scalar_one()
    assert tk.estoque_atual == Decimal("50")


@pytest.mark.asyncio
async def test_movimentacoes_append_only(_db):
    """Movimentações são append-only — nunca há atualização/exclusão."""
    from app.models import Organization

    org = Organization(name="Org", slug=uuid.uuid4().hex)
    _db.add(org)
    await _db.flush()
    comb = Combustivel(organization_id=org.id, nome="Diesel", unidade="litro", ativo=True)
    _db.add(comb)
    await _db.flush()
    tanque = Tanque(
        organization_id=org.id, nome="T", combustivel_id=comb.id,
        capacidade_maxima="1000", estoque_inicial="0", estoque_atual="0",
        estoque_minimo="0",
    )
    _db.add(tanque)
    await _db.commit()

    m1 = await aplicar_movimentacao(
        _db, organization_id=org.id, tipo=TipoMovimentacao.ENTRADA.value,
        origem=OrigemMovimentacao.ENTRADA_COMPRA.value, sinal=1, quantidade=Decimal("100"),
        combustivel_id=comb.id, tanque_id=tanque.id,
    )
    m2 = await aplicar_movimentacao(
        _db, organization_id=org.id, tipo=TipoMovimentacao.SAIDA.value,
        origem=OrigemMovimentacao.ABASTECIMENTO.value, sinal=-1, quantidade=Decimal("40"),
        combustivel_id=comb.id, tanque_id=tanque.id,
    )
    await _db.commit()

    # Estorno gera NOVA movimentação (tipo ESTORNO), nunca apaga a original
    estorno = await aplicar_movimentacao(
        _db, organization_id=org.id, tipo=TipoMovimentacao.ESTORNO.value,
        origem=OrigemMovimentacao.ESTORNO_ABASTECIMENTO.value, sinal=1, quantidade=Decimal("40"),
        combustivel_id=comb.id, tanque_id=tanque.id, referencia_id=m2.id,
    )
    await _db.commit()

    movs = (await _db.execute(select(MovimentacaoEstoque).order_by(MovimentacaoEstoque.created_at))).scalars().all()
    assert [m.id for m in movs] == [m1.id, m2.id, estorno.id]
    tk = (await _db.execute(select(Tanque).where(Tanque.id == tanque.id))).scalar_one()
    assert tk.estoque_atual == Decimal("100")


@pytest.mark.asyncio
async def test_quantidade_invalida_bloqueada(_db):
    from app.models import Organization

    org = Organization(name="Org", slug=uuid.uuid4().hex)
    _db.add(org)
    await _db.flush()
    comb = Combustivel(organization_id=org.id, nome="Diesel", unidade="litro", ativo=True)
    _db.add(comb)
    await _db.flush()
    tanque = Tanque(
        organization_id=org.id, nome="T", combustivel_id=comb.id,
        capacidade_maxima="1000", estoque_inicial="0", estoque_atual="0", estoque_minimo="0",
    )
    _db.add(tanque)
    await _db.commit()

    for qtd in ["0", "-5"]:
        with pytest.raises(EstoqueError) as exc:
            await aplicar_movimentacao(
                _db, organization_id=org.id, tipo=TipoMovimentacao.ENTRADA.value,
                origem=OrigemMovimentacao.ENTRADA_COMPRA.value, sinal=1, quantidade=Decimal(qtd),
                combustivel_id=comb.id, tanque_id=tanque.id,
            )
        assert exc.value.codigo == "QUANTIDADE_INVALIDA"
