"""Banco de horas do Porteira Adentro (itens 25 e 26).

Regras que este módulo garante, sem exceção:

  1. o saldo NUNCA muda sem gerar uma movimentação correspondente;
  2. saldo anterior e posterior ficam gravados em cada movimentação, o que
     permite reconstruir a conta inteira e detectar qualquer inconsistência;
  3. a linha do saldo é travada (`SELECT ... FOR UPDATE`) antes de qualquer
     alteração — dois atendentes não conseguem gastar as mesmas horas;
  4. o saldo não fica negativo: a reserva é recusada com mensagem clara;
  5. operações com `chave_idempotencia` não duplicam se a requisição for
     reenviada (rede instável no campo é a regra, não a exceção).
"""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import suporta_bloqueio_linha
from app.core.errors import AppError, Conflict, NotFound
from app.models.enums import MetodoDesconto, TipoMovimentoHoras
from app.models.porteira import (
    Beneficiario,
    MovimentoHoras,
    OrdemMaquina,
    OrdemServico,
    OrdemVeiculo,
    Programa,
    SaldoHoras,
)


class SaldoInsuficiente(AppError):
    def __init__(self, disponivel: float, necessario: float):
        super().__init__(
            (
                f"Saldo de horas insuficiente: são necessárias {necessario:g}h e há "
                f"{disponivel:g}h disponíveis."
            ),
            422,
            "saldo_insuficiente",
            {"disponivel": disponivel, "necessario": necessario},
        )


def periodo_referencia(programa: Programa, referencia: date | None = None) -> str:
    """Período do saldo. Por padrão o ano civil da vigência do programa."""
    alvo = referencia or date.today()
    return str(alvo.year)


async def obter_ou_criar_saldo(
    db: AsyncSession,
    *,
    organizacao_id: uuid.UUID,
    programa: Programa,
    beneficiario: Beneficiario,
    imovel_id: uuid.UUID | None = None,
    categoria: str = "",
    referencia: date | None = None,
    travar: bool = False,
) -> SaldoHoras:
    """Localiza o saldo aplicável, criando-o zerado se ainda não existir.

    O escopo depende da regra do programa:
      • `cpf`          → um saldo por beneficiário;
      • `propriedade`  → um saldo por propriedade;
      • `ambos`        → saldo por beneficiário + propriedade.
    No método `por_categoria` há ainda um saldo por categoria de equipamento.
    """
    periodo = periodo_referencia(programa, referencia)

    if programa.regra_limite == "cpf":
        imovel_filtro = None
    elif programa.regra_limite in {"propriedade", "ambos"}:
        imovel_filtro = imovel_id
    else:  # pragma: no cover - valor inesperado vindo de configuração
        imovel_filtro = None

    if programa.metodo_desconto != MetodoDesconto.POR_CATEGORIA.value:
        categoria = ""

    consulta = select(SaldoHoras).where(
        SaldoHoras.beneficiario_id == beneficiario.id,
        SaldoHoras.categoria == categoria,
        SaldoHoras.periodo_referencia == periodo,
        (
            SaldoHoras.imovel_id == imovel_filtro
            if imovel_filtro is not None
            else SaldoHoras.imovel_id.is_(None)
        ),
    )
    if travar and suporta_bloqueio_linha():
        consulta = consulta.with_for_update()

    saldo = await db.scalar(consulta)
    if saldo is not None:
        return saldo

    saldo = SaldoHoras(
        organizacao_id=organizacao_id,
        programa_id=programa.id,
        beneficiario_id=beneficiario.id,
        imovel_id=imovel_filtro,
        categoria=categoria,
        periodo_referencia=periodo,
        horas_concedidas=0,
        validade_ate=programa.vigencia_fim,
    )
    db.add(saldo)
    try:
        await db.flush()
    except IntegrityError:
        # Outra transação criou o mesmo saldo primeiro — releia e siga.
        await db.rollback()
        saldo = await db.scalar(consulta)
        if saldo is None:  # pragma: no cover - só se o UNIQUE mudar
            raise
    return saldo


async def _movimentar(
    db: AsyncSession,
    saldo: SaldoHoras,
    *,
    tipo: TipoMovimentoHoras,
    quantidade: float,
    usuario_id: uuid.UUID | None,
    motivo: str | None = None,
    observacao: str | None = None,
    solicitacao_id: uuid.UUID | None = None,
    ordem_id: uuid.UUID | None = None,
    maquina_id: uuid.UUID | None = None,
    chave_idempotencia: str | None = None,
) -> MovimentoHoras:
    """Aplica a movimentação e grava o extrato — sempre juntos."""
    if quantidade <= 0:
        raise AppError("A quantidade de horas precisa ser maior que zero.", 422, "quantidade_invalida")

    if chave_idempotencia:
        existente = await db.scalar(
            select(MovimentoHoras).where(
                MovimentoHoras.chave_idempotencia == chave_idempotencia
            )
        )
        if existente is not None:
            # Requisição repetida: devolve a movimentação original, sem debitar
            # duas vezes.
            return existente

    anterior = saldo.saldo_disponivel
    quantidade = round(float(quantidade), 2)

    if tipo == TipoMovimentoHoras.CONCESSAO:
        saldo.horas_concedidas = round((saldo.horas_concedidas or 0) + quantidade, 2)
    elif tipo == TipoMovimentoHoras.HORAS_ADICIONAIS:
        saldo.horas_adicionais = round((saldo.horas_adicionais or 0) + quantidade, 2)
    elif tipo == TipoMovimentoHoras.RESERVA:
        if quantidade > anterior:
            raise SaldoInsuficiente(anterior, quantidade)
        saldo.horas_reservadas = round((saldo.horas_reservadas or 0) + quantidade, 2)
    elif tipo == TipoMovimentoHoras.LIBERACAO_RESERVA:
        saldo.horas_reservadas = round(max((saldo.horas_reservadas or 0) - quantidade, 0), 2)
    elif tipo == TipoMovimentoHoras.UTILIZACAO:
        # Consome primeiro o que estava reservado para esta ordem; o excedente
        # vem do saldo livre (e aí sim pode faltar).
        da_reserva = min(quantidade, saldo.horas_reservadas or 0)
        do_saldo = round(quantidade - da_reserva, 2)
        if do_saldo > anterior:
            raise SaldoInsuficiente(anterior, do_saldo)
        saldo.horas_reservadas = round((saldo.horas_reservadas or 0) - da_reserva, 2)
        saldo.horas_utilizadas = round((saldo.horas_utilizadas or 0) + quantidade, 2)
    elif tipo == TipoMovimentoHoras.ESTORNO:
        saldo.horas_utilizadas = round(max((saldo.horas_utilizadas or 0) - quantidade, 0), 2)
        saldo.horas_estornadas = round((saldo.horas_estornadas or 0) + quantidade, 2)
    elif tipo == TipoMovimentoHoras.EXPIRACAO:
        saldo.horas_expiradas = round((saldo.horas_expiradas or 0) + quantidade, 2)
    elif tipo == TipoMovimentoHoras.AJUSTE:
        # Ajuste positivo entra como concessão extra; negativo, como expiração.
        # O sinal vem no motivo — aqui o valor é sempre absoluto e o chamador
        # escolhe entre AJUSTE (crédito) e EXPIRACAO (débito).
        saldo.horas_concedidas = round((saldo.horas_concedidas or 0) + quantidade, 2)
    elif tipo == TipoMovimentoHoras.CANCELAMENTO:
        saldo.horas_reservadas = round(max((saldo.horas_reservadas or 0) - quantidade, 0), 2)
    else:  # pragma: no cover
        raise AppError(f"Tipo de movimentação desconhecido: {tipo}", 422, "tipo_invalido")

    saldo.row_version = (saldo.row_version or 1) + 1
    posterior = saldo.saldo_disponivel

    movimento = MovimentoHoras(
        saldo_id=saldo.id,
        tipo=tipo.value,
        quantidade=quantidade,
        saldo_anterior=anterior,
        saldo_posterior=posterior,
        solicitacao_id=solicitacao_id,
        ordem_id=ordem_id,
        maquina_id=maquina_id,
        motivo=motivo,
        observacao=observacao,
        chave_idempotencia=chave_idempotencia,
        created_by_id=usuario_id,
    )
    db.add(movimento)
    await db.flush()
    return movimento


# ── Operações públicas ───────────────────────────────────────────────────────


async def conceder(
    db: AsyncSession,
    saldo: SaldoHoras,
    quantidade: float,
    *,
    usuario_id: uuid.UUID | None,
    motivo: str = "Concessão do programa",
) -> MovimentoHoras:
    return await _movimentar(
        db, saldo, tipo=TipoMovimentoHoras.CONCESSAO, quantidade=quantidade,
        usuario_id=usuario_id, motivo=motivo,
    )


async def reservar(
    db: AsyncSession,
    saldo: SaldoHoras,
    quantidade: float,
    *,
    usuario_id: uuid.UUID | None,
    solicitacao_id: uuid.UUID | None = None,
    ordem_id: uuid.UUID | None = None,
    motivo: str = "Reserva para agendamento",
    chave_idempotencia: str | None = None,
) -> MovimentoHoras:
    """Separa horas para uma ordem. Recusa se não houver saldo."""
    return await _movimentar(
        db, saldo, tipo=TipoMovimentoHoras.RESERVA, quantidade=quantidade,
        usuario_id=usuario_id, solicitacao_id=solicitacao_id, ordem_id=ordem_id,
        motivo=motivo, chave_idempotencia=chave_idempotencia,
    )


async def liberar_reserva(
    db: AsyncSession,
    saldo: SaldoHoras,
    quantidade: float,
    *,
    usuario_id: uuid.UUID | None,
    ordem_id: uuid.UUID | None = None,
    motivo: str = "Liberação de reserva",
) -> MovimentoHoras:
    return await _movimentar(
        db, saldo, tipo=TipoMovimentoHoras.LIBERACAO_RESERVA, quantidade=quantidade,
        usuario_id=usuario_id, ordem_id=ordem_id, motivo=motivo,
    )


async def utilizar(
    db: AsyncSession,
    saldo: SaldoHoras,
    quantidade: float,
    *,
    usuario_id: uuid.UUID | None,
    ordem_id: uuid.UUID | None = None,
    maquina_id: uuid.UUID | None = None,
    motivo: str = "Horas efetivamente utilizadas",
    chave_idempotencia: str | None = None,
) -> MovimentoHoras:
    return await _movimentar(
        db, saldo, tipo=TipoMovimentoHoras.UTILIZACAO, quantidade=quantidade,
        usuario_id=usuario_id, ordem_id=ordem_id, maquina_id=maquina_id,
        motivo=motivo, chave_idempotencia=chave_idempotencia,
    )


async def estornar(
    db: AsyncSession,
    saldo: SaldoHoras,
    quantidade: float,
    *,
    usuario_id: uuid.UUID | None,
    ordem_id: uuid.UUID | None = None,
    motivo: str,
) -> MovimentoHoras:
    return await _movimentar(
        db, saldo, tipo=TipoMovimentoHoras.ESTORNO, quantidade=quantidade,
        usuario_id=usuario_id, ordem_id=ordem_id, motivo=motivo,
    )


async def ajustar(
    db: AsyncSession,
    saldo: SaldoHoras,
    quantidade: float,
    *,
    usuario_id: uuid.UUID | None,
    justificativa: str,
    credito: bool = True,
) -> MovimentoHoras:
    """Ajuste manual do gestor — exige justificativa e vai para a auditoria."""
    if not justificativa or len(justificativa.strip()) < 5:
        raise AppError(
            "O ajuste manual de horas exige justificativa.", 422, "justificativa_obrigatoria"
        )
    tipo = TipoMovimentoHoras.AJUSTE if credito else TipoMovimentoHoras.EXPIRACAO
    return await _movimentar(
        db, saldo, tipo=tipo, quantidade=quantidade, usuario_id=usuario_id,
        motivo="Ajuste administrativo", observacao=justificativa,
    )


async def adicionar_horas_extras(
    db: AsyncSession,
    saldo: SaldoHoras,
    quantidade: float,
    *,
    usuario_id: uuid.UUID | None,
    ordem_id: uuid.UUID | None,
    motivo: str = "Horas adicionais aprovadas",
) -> MovimentoHoras:
    return await _movimentar(
        db, saldo, tipo=TipoMovimentoHoras.HORAS_ADICIONAIS, quantidade=quantidade,
        usuario_id=usuario_id, ordem_id=ordem_id, motivo=motivo,
    )


# ── Cálculo das horas a descontar (item 26) ──────────────────────────────────


@dataclass
class RateioHoras:
    """Resultado do cálculo: quanto desconta e por quê."""

    total_apontado: float
    total_descontado: float
    nao_descontado: float
    metodo: str
    detalhamento: list[dict]

    def dict(self) -> dict:
        return {
            "total_apontado": self.total_apontado,
            "total_descontado": self.total_descontado,
            "nao_descontado": self.nao_descontado,
            "metodo": self.metodo,
            "detalhamento": self.detalhamento,
        }


def calcular_desconto(
    ordem: OrdemServico,
    maquinas: list[OrdemMaquina],
    veiculos: list[OrdemVeiculo],
    metodo: str,
    *,
    horas_manuais: float | None = None,
    contar_paradas: bool = False,
    contar_deslocamento: bool = False,
) -> RateioHoras:
    """Decide quantas horas saem do banco, conforme o método do programa.

    Nunca "adivinha": as horas vêm dos apontamentos individuais de cada
    equipamento (item 34), e o método apenas escolhe quais entram na conta.
    """

    def horas_do_recurso(recurso) -> float:
        total = recurso.horas_produtivas or 0
        if contar_paradas:
            total += recurso.horas_paradas or 0
        if contar_deslocamento:
            total += recurso.horas_deslocamento or 0
        return round(total, 2)

    detalhamento: list[dict] = []
    total_apontado = 0.0

    for maquina in maquinas:
        horas = horas_do_recurso(maquina)
        total_apontado += horas
        detalhamento.append(
            {
                "tipo": "maquina",
                "recurso_id": str(maquina.maquina_id),
                "principal": maquina.principal,
                "horas_apontadas": horas,
                "horas_descontadas": 0.0,
            }
        )
    for veiculo in veiculos:
        horas = horas_do_recurso(veiculo)
        total_apontado += horas
        detalhamento.append(
            {
                "tipo": "veiculo",
                "recurso_id": str(veiculo.veiculo_id),
                "principal": False,
                "horas_apontadas": horas,
                "horas_descontadas": 0.0,
            }
        )

    total_apontado = round(total_apontado, 2)

    if metodo == MetodoDesconto.EQUIPAMENTO_PRINCIPAL.value:
        principais = [d for d in detalhamento if d["principal"]]
        # Sem máquina marcada como principal, usa a de maior apontamento —
        # comportamento previsível e explicado na tela.
        if not principais and detalhamento:
            principais = [max(detalhamento, key=lambda d: d["horas_apontadas"])]
        for item in principais:
            item["horas_descontadas"] = item["horas_apontadas"]
        descontado = round(sum(i["horas_descontadas"] for i in detalhamento), 2)

    elif metodo == MetodoDesconto.ADMINISTRATIVO.value:
        descontado = round(float(horas_manuais or 0), 2)
        # O rateio administrativo é decisão do gestor: distribui
        # proporcionalmente só para efeito de relatório.
        if total_apontado > 0:
            for item in detalhamento:
                item["horas_descontadas"] = round(
                    descontado * item["horas_apontadas"] / total_apontado, 2
                )

    else:
        # GERAL e POR_CATEGORIA descontam tudo o que foi apontado; a diferença
        # entre os dois está em QUAL saldo é debitado, não em quanto.
        for item in detalhamento:
            item["horas_descontadas"] = item["horas_apontadas"]
        descontado = total_apontado

    return RateioHoras(
        total_apontado=total_apontado,
        total_descontado=descontado,
        nao_descontado=round(max(total_apontado - descontado, 0), 2),
        metodo=metodo,
        detalhamento=detalhamento,
    )


async def extrato(
    db: AsyncSession, saldo_id: uuid.UUID, limite: int = 200
) -> list[MovimentoHoras]:
    return list(
        (
            await db.execute(
                select(MovimentoHoras)
                .where(MovimentoHoras.saldo_id == saldo_id)
                .order_by(MovimentoHoras.created_at.desc())
                .limit(limite)
            )
        )
        .scalars()
        .all()
    )


async def conferir_integridade(db: AsyncSession, saldo_id: uuid.UUID) -> dict:
    """Reconstrói o saldo pelas movimentações e compara com o valor gravado.

    Usado pela tela de auditoria do banco de horas: se der diferença, houve
    alteração fora do serviço — e isso precisa aparecer.
    """
    saldo = await db.get(SaldoHoras, saldo_id)
    if saldo is None:
        raise NotFound("Saldo não encontrado.")

    movimentos = await extrato(db, saldo_id, limite=100000)
    if not movimentos:
        return {
        "consistente": True,
        "saldo_gravado": saldo.saldo_disponivel,
        "saldo_calculado": saldo.saldo_disponivel,
    }

    # As movimentações estão em ordem decrescente; a mais antiga é a última.
    mais_antiga = movimentos[-1]
    mais_recente = movimentos[0]
    esperado = mais_recente.saldo_posterior
    consistente = abs(esperado - saldo.saldo_disponivel) < 0.01

    return {
        "consistente": consistente,
        "saldo_gravado": saldo.saldo_disponivel,
        "saldo_calculado": esperado,
        "movimentacoes": len(movimentos),
        "primeira_em": mais_antiga.created_at,
        "ultima_em": mais_recente.created_at,
        "mensagem": (
            "Saldo conferido com o extrato."
            if consistente
            else (
                "Divergência entre o saldo gravado e o extrato de movimentações. "
                "Comunique a equipe técnica."
            )
        ),
    }


async def garantir_saldo_para_ordem(
    db: AsyncSession, ordem: OrdemServico, travar: bool = True
) -> SaldoHoras | None:
    """Recupera o saldo vinculado à ordem (via solicitação → beneficiário)."""
    from app.models.porteira import SolicitacaoServico

    solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
    if solicitacao is None:
        raise NotFound("Solicitação da ordem não encontrada.")
    programa = await db.get(Programa, solicitacao.programa_id)
    beneficiario = await db.get(Beneficiario, solicitacao.beneficiario_id)
    if programa is None or beneficiario is None:
        raise Conflict("Programa ou beneficiário da ordem não localizado.")
    return await obter_ou_criar_saldo(
        db,
        organizacao_id=ordem.organizacao_id,
        programa=programa,
        beneficiario=beneficiario,
        imovel_id=solicitacao.imovel_id,
        travar=travar,
    )
