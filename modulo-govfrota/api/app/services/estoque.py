"""Controle de estoque de combustível via movimentações append-only.

Regras críticas:
- O estoque NUNCA é digitado manualmente — deriva das movimentações.
- Toda alteração do estoque passa por `aplicar_movimentacao`, que bloqueia a
  linha do tanque (SELECT ... FOR UPDATE em PostgreSQL) para garantir
  consistência sob concorrência (dois motoristas abastecendo ao mesmo tempo).
- Movimentações nunca são apagadas; correções geram novas movimentações
  auditáveis (cancelamento/estorno).
"""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.combustivel import Tanque
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.models.estoque import MovimentacaoEstoque


def status_estoque(estoque_atual: Decimal, estoque_minimo: Decimal) -> str:
    """Regra única de status do estoque de um tanque (usada em tanques e dashboard)."""
    if estoque_atual <= 0:
        return "CRITICO"
    if estoque_minimo > 0 and estoque_atual <= estoque_minimo:
        return "BAIXO"
    return "NORMAL"


class EstoqueError(Exception):
    def __init__(self, codigo: str, mensagem: str):
        self.codigo = codigo
        self.mensagem = mensagem
        super().__init__(mensagem)


async def aplicar_movimentacao(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    tipo: str,
    origem: str,
    sinal: int,
    quantidade: Decimal,
    combustivel_id: uuid.UUID,
    tanque_id: uuid.UUID,
    tanque_origem_id: uuid.UUID | None = None,
    referencia_id: uuid.UUID | None = None,
    referencia_tipo: str | None = None,
    descricao: str | None = None,
    custo_unitario: Decimal | None = None,
    responsavel_usuario_id: uuid.UUID | None = None,
    responsavel_motorista_id: uuid.UUID | None = None,
    permitir_negativo: bool = False,
) -> MovimentacaoEstoque:
    """Aplica uma movimentação sobre o estoque de um tanque com lock otimista.

    - `sinal`: +1 para entradas no tanque, -1 para saídas.
    - Valida compatibilidade tanque × combustível.
    - Valida estoque suficiente quando `permitir_negativo` é False.
    """
    if quantidade is None or quantidade <= 0:
        raise EstoqueError("QUANTIDADE_INVALIDA", "Quantidade deve ser maior que zero.")
    if sinal not in (1, -1):
        raise EstoqueError("SINAL_INVALIDO", "Sinal da movimentação inválido.")

    # Lock pessimista na linha do tanque (PostgreSQL). SQLite (testes) não suporta.
    # populate_existing é obrigatório: o Tanque pode já ter sido carregado no
    # identity map da sessão (ex.: auto-seleção de tanque no endpoint) e o
    # SELECT FOR UPDATE retornaria o objeto em cache com estoque_atual
    # desatualizado — perdendo a atualização sob concorrência.
    stmt = select(Tanque).where(
        Tanque.id == tanque_id,
        Tanque.organization_id == organization_id,
        Tanque.deleted_at.is_(None),
    )
    if db.bind is not None and db.bind.dialect.name != "sqlite":
        stmt = stmt.with_for_update()
    result = await db.execute(stmt.execution_options(populate_existing=True))
    tanque = result.scalar_one_or_none()
    if tanque is None:
        raise EstoqueError("TANQUE_INEXISTENTE", "Tanque não encontrado nesta organização.")

    if tanque.combustivel_id != combustivel_id:
        raise EstoqueError(
            "COMBUSTIVEL_INCOMPATIVEL",
            "Combustível incompatível com o tanque selecionado.",
        )

    novo_saldo = Decimal(tanque.estoque_atual) + Decimal(sinal) * quantidade
    if sinal < 0 and novo_saldo < 0 and not permitir_negativo:
        raise EstoqueError(
            "ESTOQUE_INSUFICIENTE",
            f"Estoque insuficiente no tanque {tanque.nome} "
            f"(disponível: {tanque.estoque_atual} L, solicitado: {quantidade} L).",
        )

    tanque.estoque_atual = novo_saldo

    movimentacao = MovimentacaoEstoque(
        organization_id=organization_id,
        tipo=tipo,
        origem=origem,
        sinal=sinal,
        quantidade=quantidade,
        combustivel_id=combustivel_id,
        tanque_destino_id=tanque_id,
        tanque_origem_id=tanque_origem_id,
        referencia_id=referencia_id,
        referencia_tipo=referencia_tipo,
        descricao=descricao,
        custo_unitario=custo_unitario,
        responsavel_usuario_id=responsavel_usuario_id,
        responsavel_motorista_id=responsavel_motorista_id,
        saldo_apos=novo_saldo,
    )
    db.add(movimentacao)
    await db.flush()
    return movimentacao


async def custo_medio_combustivel(db: AsyncSession, organization_id: uuid.UUID, combustivel_id: uuid.UUID) -> Decimal | None:
    """Custo médio ponderado por litro com base nas ENTRADAS registradas.

    Metodologia: soma(quantidade × valor_por_litro das entradas válidas)
    / soma(quantidade), considerando apenas entradas com valor informado.
    """
    from app.models.estoque import EntradaCombustivel

    result = await db.execute(
        select(EntradaCombustivel.quantidade_litros, EntradaCombustivel.valor_total)
        .where(
            EntradaCombustivel.organization_id == organization_id,
            EntradaCombustivel.combustivel_id == combustivel_id,
            EntradaCombustivel.cancelada.is_(False),
            EntradaCombustivel.valor_total.isnot(None),
        )
    )
    total_qtd = Decimal("0")
    total_valor = Decimal("0")
    for qtd, valor in result.all():
        total_qtd += Decimal(qtd)
        total_valor += Decimal(valor)
    if total_qtd <= 0:
        return None
    return (total_valor / total_qtd).quantize(Decimal("0.0001"))


async def transferir_estoque(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    tanque_origem_id: uuid.UUID,
    tanque_destino_id: uuid.UUID,
    quantidade: Decimal,
    responsavel_usuario_id: uuid.UUID | None = None,
    permitir_negativo: bool = False,
) -> list[MovimentacaoEstoque]:
    """Transferência entre tanques do mesmo combustível."""
    origem_result = await db.execute(
        select(Tanque)
        .where(
            Tanque.id == tanque_origem_id,
            Tanque.organization_id == organization_id,
            Tanque.deleted_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    tanque_origem = origem_result.scalar_one_or_none()
    destino_result = await db.execute(
        select(Tanque)
        .where(
            Tanque.id == tanque_destino_id,
            Tanque.organization_id == organization_id,
            Tanque.deleted_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    tanque_destino = destino_result.scalar_one_or_none()
    if tanque_origem is None or tanque_destino is None:
        raise EstoqueError("TANQUE_INEXISTENTE", "Tanque não encontrado nesta organização.")
    if tanque_origem.combustivel_id != tanque_destino.combustivel_id:
        raise EstoqueError(
            "COMBUSTIVEL_INCOMPATIVEL",
            "A transferência exige tanques com o mesmo combustível.",
        )
    if tanque_origem.id == tanque_destino.id:
        raise EstoqueError("TRANSFERENCIA_INVALIDA", "Origem e destino devem ser diferentes.")

    saida = await aplicar_movimentacao(
        db,
        organization_id=organization_id,
        tipo=TipoMovimentacao.TRANSFERENCIA_SAIDA.value,
        origem=OrigemMovimentacao.TRANSFERENCIA.value,
        sinal=-1,
        quantidade=quantidade,
        combustivel_id=tanque_origem.combustivel_id,
        tanque_id=tanque_origem.id,
        tanque_origem_id=tanque_destino_id,
        descricao=f"Transferência para o tanque {tanque_destino.nome}",
        responsavel_usuario_id=responsavel_usuario_id,
        permitir_negativo=permitir_negativo,
    )
    entrada = await aplicar_movimentacao(
        db,
        organization_id=organization_id,
        tipo=TipoMovimentacao.TRANSFERENCIA_ENTRADA.value,
        origem=OrigemMovimentacao.TRANSFERENCIA.value,
        sinal=1,
        quantidade=quantidade,
        combustivel_id=tanque_destino.combustivel_id,
        tanque_id=tanque_destino.id,
        tanque_origem_id=tanque_origem_id,
        descricao=f"Transferência do tanque {tanque_origem.nome}",
        responsavel_usuario_id=responsavel_usuario_id,
    )
    return [saida, entrada]
