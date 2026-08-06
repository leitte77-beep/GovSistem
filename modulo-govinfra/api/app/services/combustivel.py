"""Controle de diesel: estoque, abastecimentos e detecção de inconsistências
(item 37).

O estoque é movimentado sempre em par com o abastecimento, na mesma transação:
não existe abastecer sem baixar o tanque, nem baixar o tanque sem registro.
Os alertas são calculados no momento do lançamento e ficam gravados junto do
abastecimento — a inconsistência não se perde num relatório que ninguém abre.
"""

import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import suporta_bloqueio_linha
from app.core.errors import AppError, PermissionDenied
from app.models.combustivel import Abastecimento, MovimentoCombustivel, Tanque
from app.models.enums import (
    SituacaoEquipamento,
    TipoAlerta,
    TipoMedidor,
    TipoMovimentoCombustivel,
)
from app.models.frota import LeituraMedidor, Maquina, Veiculo
from app.services import configuracoes


class EstoqueInsuficiente(AppError):
    def __init__(self, disponivel: float, solicitado: float):
        super().__init__(
            (
                f"Estoque insuficiente no tanque: há {disponivel:g} litros e foram "
                f"solicitados {solicitado:g}."
            ),
            422,
            "estoque_insuficiente",
            {"disponivel": disponivel, "solicitado": solicitado},
        )


async def movimentar_estoque(
    db: AsyncSession,
    tanque_id: uuid.UUID,
    *,
    tipo: TipoMovimentoCombustivel,
    litros: float,
    usuario_id: uuid.UUID | None,
    abastecimento_id: uuid.UUID | None = None,
    fornecedor: str | None = None,
    nota_fiscal: str | None = None,
    lote: str | None = None,
    valor_unitario: float | None = None,
    motivo: str | None = None,
    justificativa: str | None = None,
    permitir_negativo: bool = False,
    chave_idempotencia: str | None = None,
) -> MovimentoCombustivel:
    """Aplica a movimentação com a linha do tanque travada."""
    if litros <= 0:
        raise AppError("A quantidade precisa ser maior que zero.", 422, "quantidade_invalida")

    if chave_idempotencia:
        existente = await db.scalar(
            select(MovimentoCombustivel).where(
                MovimentoCombustivel.chave_idempotencia == chave_idempotencia
            )
        )
        if existente is not None:
            return existente

    consulta = select(Tanque).where(Tanque.id == tanque_id)
    if suporta_bloqueio_linha():
        consulta = consulta.with_for_update()
    tanque = await db.scalar(consulta)
    if tanque is None:
        raise AppError("Tanque não encontrado.", 404, "nao_encontrado")

    anterior = float(tanque.estoque_atual_litros or 0)
    litros = round(float(litros), 2)

    if tipo == TipoMovimentoCombustivel.ENTRADA:
        posterior = round(anterior + litros, 2)
        if tanque.capacidade_litros and posterior > tanque.capacidade_litros + 0.01:
            raise AppError(
                (
                    f"A entrada de {litros:g} litros ultrapassa a capacidade do tanque "
                    f"({tanque.capacidade_litros:g} litros)."
                ),
                422,
                "acima_capacidade",
            )
    else:
        posterior = round(anterior - litros, 2)
        if posterior < 0 and not permitir_negativo:
            raise EstoqueInsuficiente(anterior, litros)

    if posterior < 0 and permitir_negativo and not justificativa:
        raise AppError(
            "Estoque negativo exige justificativa registrada.", 422, "justificativa_obrigatoria"
        )

    tanque.estoque_atual_litros = posterior
    tanque.row_version = (tanque.row_version or 1) + 1

    movimento = MovimentoCombustivel(
        tanque_id=tanque.id,
        tipo=tipo.value,
        quantidade_litros=litros,
        saldo_anterior=anterior,
        saldo_posterior=posterior,
        abastecimento_id=abastecimento_id,
        fornecedor=fornecedor,
        nota_fiscal=nota_fiscal,
        lote=lote,
        valor_unitario=valor_unitario,
        valor_total=round(valor_unitario * litros, 2) if valor_unitario else None,
        motivo=motivo,
        justificativa=justificativa,
        permitiu_negativo=posterior < 0,
        chave_idempotencia=chave_idempotencia,
        created_by_id=usuario_id,
    )
    db.add(movimento)
    await db.flush()
    return movimento


async def detectar_alertas(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    maquina: Maquina | None,
    veiculo: Veiculo | None,
    litros: float,
    horimetro: float | None,
    quilometragem: float | None,
    abastecido_em: datetime,
    tanque: Tanque | None,
    ordem_id: uuid.UUID | None,
) -> list[dict]:
    """Roda todas as verificações do item 37.4 e devolve os alertas encontrados."""
    limites = await configuracoes.obter_varias(
        db,
        organizacao_id,
        [
            "combustivel_tolerancia_consumo_percentual",
            "combustivel_janela_duplicidade_minutos",
            "combustivel_exige_ordem_servico",
        ],
    )
    alertas: list[dict] = []
    equipamento = maquina or veiculo

    def alerta(tipo: TipoAlerta, mensagem: str, **detalhes):
        alertas.append({"tipo": tipo.value, "mensagem": mensagem, "detalhes": detalhes})

    # ── Quantidade acima da capacidade do tanque do equipamento ─────────────
    capacidade = getattr(equipamento, "capacidade_tanque_litros", None) if equipamento else None
    if capacidade and litros > capacidade * 1.05:
        alerta(
            TipoAlerta.ACIMA_CAPACIDADE_TANQUE,
            (
                f"Foram lançados {litros:g} litros, acima da capacidade do tanque do "
                f"equipamento ({capacidade:g} litros)."
            ),
            litros=litros,
            capacidade=capacidade,
        )

    # ── Abastecimento duplicado ─────────────────────────────────────────────
    janela = int(limites["combustivel_janela_duplicidade_minutos"] or 0)
    if janela and equipamento is not None:
        condicao = (
            Abastecimento.maquina_id == maquina.id
            if maquina is not None
            else Abastecimento.veiculo_id == veiculo.id
        )
        recente = await db.scalar(
            select(func.count())
            .select_from(Abastecimento)
            .where(
                Abastecimento.organizacao_id == organizacao_id,
                condicao,
                Abastecimento.deleted_at.is_(None),
                Abastecimento.abastecido_em >= abastecido_em - timedelta(minutes=janela),
                Abastecimento.abastecido_em <= abastecido_em + timedelta(minutes=janela),
            )
        ) or 0
        if recente:
            alerta(
                TipoAlerta.ABASTECIMENTO_DUPLICADO,
                (
                    f"Já existe outro abastecimento deste equipamento em um intervalo de "
                    f"{janela} minutos. Confirme se não é lançamento em duplicidade."
                ),
                janela_minutos=janela,
            )

    # ── Medidor inconsistente ───────────────────────────────────────────────
    if maquina is not None and horimetro is not None:
        if horimetro < (maquina.horimetro_atual or 0) - 0.01:
            alerta(
                TipoAlerta.HORIMETRO_INCONSISTENTE,
                (
                    f"O horímetro informado ({horimetro:g}h) é menor que o último registrado "
                    f"({maquina.horimetro_atual:g}h)."
                ),
                informado=horimetro,
                ultimo=maquina.horimetro_atual,
            )
    if veiculo is not None and quilometragem is not None:
        if quilometragem < (veiculo.odometro_atual or 0) - 0.01:
            alerta(
                TipoAlerta.QUILOMETRAGEM_INCONSISTENTE,
                (
                    f"A quilometragem informada ({quilometragem:g} km) é menor que a última "
                    f"registrada ({veiculo.odometro_atual:g} km)."
                ),
                informado=quilometragem,
                ultimo=veiculo.odometro_atual,
            )

    # ── Abastecimento sem ordem de serviço ──────────────────────────────────
    if limites["combustivel_exige_ordem_servico"] and not ordem_id:
        alerta(
            TipoAlerta.ABASTECIMENTO_SEM_ORDEM,
            "Abastecimento sem ordem de serviço vinculada, e a configuração exige o vínculo.",
        )

    # ── Abastecimento com o equipamento em manutenção ───────────────────────
    if equipamento is not None and equipamento.situacao in {
        SituacaoEquipamento.EM_MANUTENCAO_PREVENTIVA.value,
        SituacaoEquipamento.EM_MANUTENCAO_CORRETIVA.value,
    }:
        alerta(
            TipoAlerta.ABASTECIMENTO_EM_MANUTENCAO,
            "O equipamento está em manutenção e recebeu abastecimento.",
        )

    # ── Consumo acima da média histórica ────────────────────────────────────
    tolerancia = float(limites["combustivel_tolerancia_consumo_percentual"] or 0)
    if tolerancia and maquina is not None and horimetro is not None:
        media = await consumo_medio_maquina(db, maquina.id)
        anterior = await _ultimo_abastecimento_maquina(db, maquina.id, abastecido_em)
        if media and anterior is not None and anterior.horimetro is not None:
            horas = horimetro - anterior.horimetro
            if horas > 0:
                consumo = litros / horas
                if consumo > media * (1 + tolerancia / 100):
                    alerta(
                        TipoAlerta.CONSUMO_ACIMA_MEDIA,
                        (
                            f"Consumo de {consumo:.2f} L/h neste período, "
                            f"{(consumo / media - 1) * 100:.0f}% acima da média histórica "
                            f"({media:.2f} L/h)."
                        ),
                        consumo=round(consumo, 2),
                        media=round(media, 2),
                    )
            elif horas <= 0:
                alerta(
                    TipoAlerta.CONSUMO_SEM_PRODUCAO,
                    "Houve abastecimento sem avanço do horímetro desde o lançamento anterior.",
                )

    # ── Estoque do tanque ───────────────────────────────────────────────────
    if tanque is not None:
        restante = (tanque.estoque_atual_litros or 0) - litros
        if restante < 0:
            alerta(
                TipoAlerta.ESTOQUE_NEGATIVO,
                f"O lançamento deixaria o tanque {tanque.nome} com saldo negativo.",
            )
        elif tanque.estoque_minimo_litros and restante <= tanque.estoque_minimo_litros:
            alerta(
                TipoAlerta.ESTOQUE_BAIXO,
                (
                    f"O tanque {tanque.nome} ficará com {restante:g} litros, no ou abaixo do "
                    f"mínimo de {tanque.estoque_minimo_litros:g}."
                ),
            )

    return alertas


async def _ultimo_abastecimento_maquina(
    db: AsyncSession, maquina_id: uuid.UUID, antes_de: datetime
) -> Abastecimento | None:
    return await db.scalar(
        select(Abastecimento)
        .where(
            Abastecimento.maquina_id == maquina_id,
            Abastecimento.deleted_at.is_(None),
            Abastecimento.abastecido_em < antes_de,
        )
        .order_by(Abastecimento.abastecido_em.desc())
        .limit(1)
    )


async def consumo_medio_maquina(db: AsyncSession, maquina_id: uuid.UUID) -> float | None:
    """Litros por hora com base no histórico de abastecimentos (item 37.3)."""
    registros = list(
        (
            await db.execute(
                select(Abastecimento)
                .where(
                    Abastecimento.maquina_id == maquina_id,
                    Abastecimento.deleted_at.is_(None),
                    Abastecimento.horimetro.is_not(None),
                )
                .order_by(Abastecimento.abastecido_em)
            )
        )
        .scalars()
        .all()
    )
    if len(registros) < 2:
        maquina = await db.get(Maquina, maquina_id)
        return maquina.consumo_medio_litros_hora if maquina else None

    horas = (registros[-1].horimetro or 0) - (registros[0].horimetro or 0)
    # O primeiro abastecimento encheu o tanque no início da contagem: os litros
    # que interessam são os dos abastecimentos seguintes.
    litros = sum(r.quantidade_litros or 0 for r in registros[1:])
    if horas <= 0:
        return None
    return round(litros / horas, 3)


async def consumo_medio_veiculo(db: AsyncSession, veiculo_id: uuid.UUID) -> float | None:
    """Quilômetros por litro com base no histórico."""
    registros = list(
        (
            await db.execute(
                select(Abastecimento)
                .where(
                    Abastecimento.veiculo_id == veiculo_id,
                    Abastecimento.deleted_at.is_(None),
                    Abastecimento.quilometragem.is_not(None),
                )
                .order_by(Abastecimento.abastecido_em)
            )
        )
        .scalars()
        .all()
    )
    if len(registros) < 2:
        veiculo = await db.get(Veiculo, veiculo_id)
        return veiculo.consumo_medio_km_litro if veiculo else None

    km = (registros[-1].quilometragem or 0) - (registros[0].quilometragem or 0)
    litros = sum(r.quantidade_litros or 0 for r in registros[1:])
    if litros <= 0:
        return None
    return round(km / litros, 3)


async def registrar_leitura_medidor(
    db: AsyncSession,
    *,
    maquina: Maquina | None,
    veiculo: Veiculo | None,
    valor: float | None,
    origem: str,
    usuario_id: uuid.UUID | None,
    pode_corrigir: bool = False,
    justificativa: str | None = None,
    ordem_id: uuid.UUID | None = None,
) -> LeituraMedidor | None:
    """Atualiza horímetro/odômetro registrando o histórico.

    Valor menor que o último exige permissão específica e justificativa — é a
    regra dos itens 27 e 28, verificada aqui e não na tela.
    """
    if valor is None:
        return None

    if maquina is not None:
        anterior = float(maquina.horimetro_atual or 0)
        tipo = TipoMedidor.HORIMETRO
    elif veiculo is not None:
        anterior = float(veiculo.odometro_atual or 0)
        tipo = TipoMedidor.ODOMETRO
    else:
        return None

    correcao = valor < anterior - 0.01
    if correcao:
        if not pode_corrigir:
            rotulo = "horímetro" if tipo == TipoMedidor.HORIMETRO else "quilometragem"
            raise PermissionDenied(

                    f"O {rotulo} informado ({valor:g}) é menor que o último registrado "
                    f"({anterior:g}). Apenas usuários com permissão de correção podem "
                    "registrar essa alteração, mediante justificativa."

            )
        if not justificativa or len(justificativa.strip()) < 5:
            raise AppError(
                "A correção de medidor exige justificativa.", 422, "justificativa_obrigatoria"
            )

    leitura = LeituraMedidor(
        maquina_id=maquina.id if maquina else None,
        veiculo_id=veiculo.id if veiculo else None,
        tipo=tipo.value,
        valor_anterior=anterior,
        valor=round(float(valor), 2),
        origem="correcao" if correcao else origem,
        correcao=correcao,
        justificativa=justificativa,
        ordem_id=ordem_id,
        created_by_id=usuario_id,
    )
    db.add(leitura)

    if maquina is not None:
        maquina.horimetro_atual = leitura.valor
    else:
        veiculo.odometro_atual = leitura.valor

    await db.flush()
    return leitura
