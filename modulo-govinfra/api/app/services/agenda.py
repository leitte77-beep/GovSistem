"""Agenda, disponibilidade e detecção de conflitos (itens 14 e 30).

Este módulo responde a três perguntas, sempre no backend:

  • o recurso (caçamba, máquina, veículo, operador) está livre no período?
  • a capacidade do dia comporta mais um atendimento?
  • quais conflitos existem se eu marcar assim mesmo?

O agendamento por arrastar e soltar da tela chama exatamente as mesmas funções:
a interface não tem atalho para pular validação.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cacambas import Cacamba, SolicitacaoCacamba
from app.models.enums import (
    CACAMBA_INDISPONIVEL,
    EQUIPAMENTO_NAO_AGENDAVEL,
    SOLICITACAO_ATIVA,
    SituacaoCacamba,
    SituacaoOrdem,
)
from app.models.frota import Habilitacao, Maquina, Veiculo
from app.models.porteira import OrdemMaquina, OrdemServico, OrdemVeiculo
from app.services import configuracoes


@dataclass
class Conflito:
    codigo: str
    mensagem: str
    recurso_tipo: str | None = None
    recurso_id: str | None = None
    detalhes: dict = field(default_factory=dict)

    def dict(self) -> dict:
        return {
            "codigo": self.codigo,
            "mensagem": self.mensagem,
            "recurso_tipo": self.recurso_tipo,
            "recurso_id": self.recurso_id,
            "detalhes": self.detalhes,
        }


def _dia_completo(dia: date) -> tuple[datetime, datetime]:
    inicio = datetime.combine(dia, time.min).replace(tzinfo=timezone.utc)
    return inicio, inicio + timedelta(days=1)


def _sobrepoe(inicio_a: datetime, fim_a: datetime, inicio_b: datetime, fim_b: datetime) -> bool:
    return inicio_a < fim_b and inicio_b < fim_a


# ── Caçambas ─────────────────────────────────────────────────────────────────


async def cacambas_livres(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    entrega_em: date,
    retirada_prevista: date,
    ignorar_solicitacao_id: uuid.UUID | None = None,
) -> list[Cacamba]:
    """Caçambas que podem atender o período informado.

    Uma caçamba serve se estiver disponível hoje OU se o atendimento em que ela
    está hoje termina antes da nova entrega (retorno previsto — item 15.1).
    """
    todas = list(
        (
            await db.execute(
                select(Cacamba).where(
                    Cacamba.organizacao_id == organizacao_id,
                    Cacamba.deleted_at.is_(None),
                    Cacamba.situacao.notin_(
                        [
                            SituacaoCacamba.INATIVA.value,
                            SituacaoCacamba.BAIXADA.value,
                            SituacaoCacamba.EM_MANUTENCAO.value,
                            SituacaoCacamba.INDISPONIVEL.value,
                        ]
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    if not todas:
        return []

    ids = [c.id for c in todas]
    ocupacoes = await _ocupacao_cacambas(
        db, organizacao_id, ids, ignorar_solicitacao_id=ignorar_solicitacao_id
    )

    livres: list[Cacamba] = []
    for cacamba in todas:
        conflito = False
        for inicio, fim in ocupacoes.get(cacamba.id, []):
            # Sobreposição de períodos de uso.
            if entrega_em <= fim and inicio <= retirada_prevista:
                conflito = True
                break
        if conflito:
            continue
        # Caçamba em limpeza/vistoria hoje pode ser agendada para daqui a dias,
        # mas não para hoje.
        if cacamba.situacao in CACAMBA_INDISPONIVEL and entrega_em <= date.today():
            continue
        livres.append(cacamba)
    return livres


async def _ocupacao_cacambas(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    cacamba_ids: Sequence[uuid.UUID],
    ignorar_solicitacao_id: uuid.UUID | None = None,
) -> dict[uuid.UUID, list[tuple[date, date]]]:
    """Períodos já comprometidos de cada caçamba."""
    if not cacamba_ids:
        return {}
    consulta = select(SolicitacaoCacamba).where(
        SolicitacaoCacamba.organizacao_id == organizacao_id,
        SolicitacaoCacamba.cacamba_id.in_(cacamba_ids),
        SolicitacaoCacamba.deleted_at.is_(None),
        SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
    )
    if ignorar_solicitacao_id:
        consulta = consulta.where(SolicitacaoCacamba.id != ignorar_solicitacao_id)

    ocupacoes: dict[uuid.UUID, list[tuple[date, date]]] = {}
    for solicitacao in (await db.execute(consulta)).scalars().all():
        inicio = solicitacao.data_prevista_entrega or solicitacao.data_agendada
        fim = solicitacao.data_prevista_retirada or inicio
        if inicio is None:
            continue
        ocupacoes.setdefault(solicitacao.cacamba_id, []).append((inicio, fim or inicio))
    return ocupacoes


async def veiculos_livres_no_dia(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    dia: date,
    *,
    apenas_porta_cacamba: bool = False,
) -> list[Veiculo]:
    """Veículos aptos e sem ordem de serviço ocupando o dia inteiro."""
    consulta = select(Veiculo).where(
        Veiculo.organizacao_id == organizacao_id,
        Veiculo.deleted_at.is_(None),
        Veiculo.situacao.notin_(EQUIPAMENTO_NAO_AGENDAVEL),
    )
    if apenas_porta_cacamba:
        consulta = consulta.where(Veiculo.transporta_cacamba.is_(True))

    candidatos = list((await db.execute(consulta)).scalars().all())
    if not candidatos:
        return []

    inicio, fim = _dia_completo(dia)
    ocupados = set(
        (
            await db.execute(
                select(OrdemVeiculo.veiculo_id)
                .join(OrdemServico, OrdemServico.id == OrdemVeiculo.ordem_id)
                .where(
                    OrdemServico.organizacao_id == organizacao_id,
                    OrdemServico.situacao.in_(
                        [SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]
                    ),
                    OrdemVeiculo.inicio_previsto < fim,
                    OrdemVeiculo.fim_previsto > inicio,
                )
            )
        )
        .scalars()
        .all()
    )
    return [v for v in candidatos if v.id not in ocupados]


async def capacidade_do_dia(
    db: AsyncSession, organizacao_id: uuid.UUID, dia: date
) -> dict:
    """Quantas entregas/retiradas já estão marcadas e qual o teto configurado."""
    limites = await configuracoes.obter_varias(
        db,
        organizacao_id,
        ["cacamba_capacidade_entregas_dia", "cacamba_capacidade_retiradas_dia"],
    )
    entregas = await db.scalar(
        select(func.count())
        .select_from(SolicitacaoCacamba)
        .where(
            SolicitacaoCacamba.organizacao_id == organizacao_id,
            SolicitacaoCacamba.deleted_at.is_(None),
            SolicitacaoCacamba.data_prevista_entrega == dia,
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
        )
    ) or 0
    retiradas = await db.scalar(
        select(func.count())
        .select_from(SolicitacaoCacamba)
        .where(
            SolicitacaoCacamba.organizacao_id == organizacao_id,
            SolicitacaoCacamba.deleted_at.is_(None),
            SolicitacaoCacamba.data_prevista_retirada == dia,
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
        )
    ) or 0

    teto_entregas = int(limites["cacamba_capacidade_entregas_dia"] or 0)
    teto_retiradas = int(limites["cacamba_capacidade_retiradas_dia"] or 0)

    return {
        "data": dia,
        "entregas": entregas,
        "entregas_capacidade": teto_entregas,
        "retiradas": retiradas,
        "retiradas_capacidade": teto_retiradas,
        "ocupacao_percentual": (
            round(100 * entregas / teto_entregas) if teto_entregas else 0
        ),
        "lotado": bool(teto_entregas and entregas >= teto_entregas),
    }


async def conflitos_agendamento_cacamba(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    data_entrega: date,
    data_retirada: date,
    cacamba_id: uuid.UUID | None,
    veiculo_id: uuid.UUID | None,
    ignorar_solicitacao_id: uuid.UUID | None = None,
) -> list[Conflito]:
    """Conflitos que impedem confirmar o agendamento."""
    conflitos: list[Conflito] = []

    capacidade = await capacidade_do_dia(db, organizacao_id, data_entrega)
    if capacidade["lotado"]:
        conflitos.append(
            Conflito(
                codigo="capacidade_excedida",
                mensagem=(
                    f"A capacidade de entregas de {data_entrega.strftime('%d/%m/%Y')} já está "
                    f"completa ({capacidade['entregas']} de {capacidade['entregas_capacidade']})."
                ),
                detalhes=capacidade,
            )
        )

    if cacamba_id:
        cacamba = await db.get(Cacamba, cacamba_id)
        if cacamba is None or cacamba.deleted_at is not None:
            conflitos.append(
                Conflito(codigo="cacamba_inexistente", mensagem="A caçamba informada não existe.")
            )
        else:
            if cacamba.situacao in {
                SituacaoCacamba.EM_MANUTENCAO.value,
                SituacaoCacamba.BAIXADA.value,
                SituacaoCacamba.INATIVA.value,
                SituacaoCacamba.INDISPONIVEL.value,
            }:
                conflitos.append(
                    Conflito(
                        codigo="cacamba_indisponivel",
                        mensagem=(
                            f"A caçamba {cacamba.codigo} está em situação "
                            f"'{cacamba.situacao.replace('_', ' ')}' e não pode ser reservada."
                        ),
                        recurso_tipo="cacamba",
                        recurso_id=str(cacamba.id),
                    )
                )
            ocupacoes = await _ocupacao_cacambas(
                db, organizacao_id, [cacamba_id], ignorar_solicitacao_id=ignorar_solicitacao_id
            )
            for inicio, fim in ocupacoes.get(cacamba_id, []):
                if data_entrega <= fim and inicio <= data_retirada:
                    conflitos.append(
                        Conflito(
                            codigo="cacamba_ja_reservada",
                            mensagem=(
                                f"A caçamba {cacamba.codigo} já está comprometida de "
                                f"{inicio.strftime('%d/%m')} a {fim.strftime('%d/%m')}."
                            ),
                            recurso_tipo="cacamba",
                            recurso_id=str(cacamba_id),
                        )
                    )
                    break

    if veiculo_id:
        veiculo = await db.get(Veiculo, veiculo_id)
        if veiculo is None or veiculo.deleted_at is not None:
            conflitos.append(
                Conflito(codigo="veiculo_inexistente", mensagem="O veículo informado não existe.")
            )
        elif veiculo.situacao in EQUIPAMENTO_NAO_AGENDAVEL:
            conflitos.append(
                Conflito(
                    codigo="veiculo_indisponivel",
                    mensagem=(
                        f"O veículo {veiculo.placa} está em situação "
                        f"'{veiculo.situacao.replace('_', ' ')}'."
                    ),
                    recurso_tipo="veiculo",
                    recurso_id=str(veiculo_id),
                )
            )

    return conflitos


# ── Máquinas, veículos e operadores (Porteira Adentro) ───────────────────────


async def recursos_ocupados(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    inicio: datetime,
    fim: datetime,
    *,
    ignorar_ordem_id: uuid.UUID | None = None,
) -> dict:
    """IDs de máquinas, veículos, operadores e motoristas ocupados no período."""
    condicoes_ordem = [
        OrdemServico.organizacao_id == organizacao_id,
        OrdemServico.deleted_at.is_(None),
        OrdemServico.situacao.in_([SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]),
    ]
    if ignorar_ordem_id:
        condicoes_ordem.append(OrdemServico.id != ignorar_ordem_id)

    maquinas = (
        await db.execute(
            select(OrdemMaquina.maquina_id, OrdemMaquina.operador_id)
            .join(OrdemServico, OrdemServico.id == OrdemMaquina.ordem_id)
            .where(
                *condicoes_ordem,
                OrdemMaquina.inicio_previsto < fim,
                OrdemMaquina.fim_previsto > inicio,
            )
        )
    ).all()

    veiculos = (
        await db.execute(
            select(OrdemVeiculo.veiculo_id, OrdemVeiculo.motorista_id)
            .join(OrdemServico, OrdemServico.id == OrdemVeiculo.ordem_id)
            .where(
                *condicoes_ordem,
                OrdemVeiculo.inicio_previsto < fim,
                OrdemVeiculo.fim_previsto > inicio,
            )
        )
    ).all()

    return {
        "maquinas": {linha[0] for linha in maquinas},
        "operadores": {linha[1] for linha in maquinas if linha[1]},
        "veiculos": {linha[0] for linha in veiculos},
        "motoristas": {linha[1] for linha in veiculos if linha[1]},
    }


async def validar_alocacao(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    inicio: datetime,
    fim: datetime,
    maquinas: list[dict],
    veiculos: list[dict],
    ignorar_ordem_id: uuid.UUID | None = None,
    permitir_excecao_habilitacao: bool = False,
) -> list[Conflito]:
    """Valida a alocação completa de uma ordem (item 30).

    Cada item de `maquinas` é {"maquina_id": ..., "operador_id": ...}; idem para
    `veiculos` com "veiculo_id"/"motorista_id".
    """
    conflitos: list[Conflito] = []
    if fim <= inicio:
        conflitos.append(
            Conflito(
                codigo="periodo_invalido",
                mensagem="O horário de término precisa ser posterior ao de início.",
            )
        )
        return conflitos

    ocupados = await recursos_ocupados(
        db, organizacao_id, inicio, fim, ignorar_ordem_id=ignorar_ordem_id
    )
    limites = await configuracoes.obter_varias(
        db,
        organizacao_id,
        ["porteira_intervalo_deslocamento_minutos", "porteira_jornada_maxima_horas"],
    )
    folga = timedelta(minutes=int(limites["porteira_intervalo_deslocamento_minutos"] or 0))

    # ── Máquinas e operadores ───────────────────────────────────────────────
    vistos_maquina: set = set()
    for item in maquinas:
        maquina_id = item.get("maquina_id")
        operador_id = item.get("operador_id")
        if maquina_id in vistos_maquina:
            conflitos.append(
                Conflito(
                    codigo="maquina_repetida",
                    mensagem="A mesma máquina foi informada duas vezes na ordem.",
                    recurso_tipo="maquina",
                    recurso_id=str(maquina_id),
                )
            )
            continue
        vistos_maquina.add(maquina_id)

        maquina = await db.get(Maquina, maquina_id)
        if maquina is None or maquina.deleted_at is not None:
            conflitos.append(
                Conflito(codigo="maquina_inexistente", mensagem="Máquina informada não existe.")
            )
            continue
        if maquina.situacao in EQUIPAMENTO_NAO_AGENDAVEL:
            conflitos.append(
                Conflito(
                    codigo="maquina_indisponivel",
                    mensagem=(
                        f"A máquina {maquina.codigo} — {maquina.nome} está em situação "
                        f"'{maquina.situacao.replace('_', ' ')}' e não pode ser agendada."
                    ),
                    recurso_tipo="maquina",
                    recurso_id=str(maquina_id),
                )
            )
        if maquina_id in ocupados["maquinas"]:
            conflitos.append(
                Conflito(
                    codigo="maquina_agendada",
                    mensagem=(
                        f"A máquina {maquina.codigo} já está agendada em outra ordem "
                        "neste período."
                    ),
                    recurso_tipo="maquina",
                    recurso_id=str(maquina_id),
                )
            )

        if operador_id:
            conflitos.extend(
                await _validar_pessoa_recurso(
                    db,
                    organizacao_id,
                    user_id=operador_id,
                    inicio=inicio,
                    fim=fim,
                    ocupados=ocupados["operadores"],
                    papel="operador",
                    maquina=maquina,
                    folga=folga,
                    jornada_maxima=float(limites["porteira_jornada_maxima_horas"] or 0),
                    permitir_excecao=permitir_excecao_habilitacao,
                    ignorar_ordem_id=ignorar_ordem_id,
                )
            )

    # ── Veículos e motoristas ───────────────────────────────────────────────
    vistos_veiculo: set = set()
    for item in veiculos:
        veiculo_id = item.get("veiculo_id")
        motorista_id = item.get("motorista_id")
        if veiculo_id in vistos_veiculo:
            conflitos.append(
                Conflito(
                    codigo="veiculo_repetido",
                    mensagem="O mesmo veículo foi informado duas vezes na ordem.",
                    recurso_tipo="veiculo",
                    recurso_id=str(veiculo_id),
                )
            )
            continue
        vistos_veiculo.add(veiculo_id)

        veiculo = await db.get(Veiculo, veiculo_id)
        if veiculo is None or veiculo.deleted_at is not None:
            conflitos.append(
                Conflito(codigo="veiculo_inexistente", mensagem="Veículo informado não existe.")
            )
            continue
        if veiculo.situacao in EQUIPAMENTO_NAO_AGENDAVEL:
            conflitos.append(
                Conflito(
                    codigo="veiculo_indisponivel",
                    mensagem=(
                        f"O veículo {veiculo.placa} está em situação "
                        f"'{veiculo.situacao.replace('_', ' ')}'."
                    ),
                    recurso_tipo="veiculo",
                    recurso_id=str(veiculo_id),
                )
            )
        if veiculo_id in ocupados["veiculos"]:
            conflitos.append(
                Conflito(
                    codigo="veiculo_agendado",
                    mensagem=f"O veículo {veiculo.placa} já está agendado neste período.",
                    recurso_tipo="veiculo",
                    recurso_id=str(veiculo_id),
                )
            )
        if veiculo.licenciamento_ate and veiculo.licenciamento_ate < inicio.date():
            conflitos.append(
                Conflito(
                    codigo="documento_vencido",
                    mensagem=(
                        f"O licenciamento do veículo {veiculo.placa} venceu em "
                        f"{veiculo.licenciamento_ate.strftime('%d/%m/%Y')}."
                    ),
                    recurso_tipo="veiculo",
                    recurso_id=str(veiculo_id),
                )
            )

        if motorista_id:
            conflitos.extend(
                await _validar_pessoa_recurso(
                    db,
                    organizacao_id,
                    user_id=motorista_id,
                    inicio=inicio,
                    fim=fim,
                    ocupados=ocupados["motoristas"],
                    papel="motorista",
                    veiculo=veiculo,
                    folga=folga,
                    jornada_maxima=float(limites["porteira_jornada_maxima_horas"] or 0),
                    permitir_excecao=permitir_excecao_habilitacao,
                    ignorar_ordem_id=ignorar_ordem_id,
                )
            )

    return conflitos


async def _validar_pessoa_recurso(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    user_id: uuid.UUID,
    inicio: datetime,
    fim: datetime,
    ocupados: set,
    papel: str,
    folga: timedelta,
    jornada_maxima: float,
    permitir_excecao: bool,
    maquina: Maquina | None = None,
    veiculo: Veiculo | None = None,
    ignorar_ordem_id: uuid.UUID | None = None,
) -> list[Conflito]:
    """Habilitação, afastamento, conflito de agenda e jornada do servidor."""
    conflitos: list[Conflito] = []
    rotulo = "operador" if papel == "operador" else "motorista"

    if user_id in ocupados:
        conflitos.append(
            Conflito(
                codigo=f"{papel}_agendado",
                mensagem=f"O {rotulo} já está alocado em outra ordem neste período.",
                recurso_tipo=papel,
                recurso_id=str(user_id),
            )
        )

    habilitacao = await db.scalar(
        select(Habilitacao).where(
            Habilitacao.organizacao_id == organizacao_id,
            Habilitacao.user_id == user_id,
            Habilitacao.deleted_at.is_(None),
        )
    )

    if habilitacao is None:
        conflito = Conflito(
            codigo=f"{papel}_sem_habilitacao",
            mensagem=(
                f"O {rotulo} não possui cadastro de habilitação no módulo. "
                "Registre CNH, cursos e equipamentos autorizados antes de agendar."
            ),
            recurso_tipo=papel,
            recurso_id=str(user_id),
        )
        if not permitir_excecao:
            conflitos.append(conflito)
        return conflitos

    if habilitacao.cnh_vencida(inicio.date()):
        conflito = Conflito(
            codigo="cnh_vencida",
            mensagem=(
                f"A CNH do {rotulo} venceu em "
                f"{habilitacao.cnh_validade.strftime('%d/%m/%Y')}."
            ),
            recurso_tipo=papel,
            recurso_id=str(user_id),
        )
        if not permitir_excecao:
            conflitos.append(conflito)

    if habilitacao.afastado_em(inicio):
        conflitos.append(
            Conflito(
                codigo=f"{papel}_afastado",
                mensagem=f"O {rotulo} está afastado na data do serviço.",
                recurso_tipo=papel,
                recurso_id=str(user_id),
            )
        )

    # Autorização específica para o equipamento.
    if maquina is not None:
        autorizadas = habilitacao.maquinas_autorizadas or []
        categorias = habilitacao.categorias_autorizadas or []
        categoria_chave = maquina.categoria.chave if maquina.categoria else None
        autorizado = (
            not autorizadas and not categorias and habilitacao.opera_maquinas
        ) or str(maquina.id) in autorizadas or (categoria_chave and categoria_chave in categorias)
        if not autorizado and not permitir_excecao:
            conflitos.append(
                Conflito(
                    codigo="operador_nao_habilitado",
                    mensagem=(
                        f"O operador não está autorizado a operar a máquina {maquina.codigo}. "
                        "Um gestor pode liberar por exceção, com justificativa registrada."
                    ),
                    recurso_tipo="operador",
                    recurso_id=str(user_id),
                )
            )

    if veiculo is not None:
        autorizados = habilitacao.veiculos_autorizados or []
        autorizado = (not autorizados and habilitacao.dirige_veiculos) or str(veiculo.id) in autorizados
        if not autorizado and not permitir_excecao:
            conflitos.append(
                Conflito(
                    codigo="motorista_nao_habilitado",
                    mensagem=(
                        f"O motorista não está autorizado a conduzir o veículo {veiculo.placa}."
                    ),
                    recurso_tipo="motorista",
                    recurso_id=str(user_id),
                )
            )

    # Jornada do dia: soma o que já está agendado + o novo período.
    if jornada_maxima:
        horas_no_dia = await _horas_agendadas_no_dia(
            db, organizacao_id, user_id, inicio.date(), papel, ignorar_ordem_id
        )
        novas = (fim - inicio).total_seconds() / 3600
        limite = habilitacao.jornada_maxima_horas or jornada_maxima
        if horas_no_dia + novas > limite + 0.01:
            conflitos.append(
                Conflito(
                    codigo="jornada_excedida",
                    mensagem=(
                        f"A jornada do {rotulo} ficaria em {horas_no_dia + novas:.1f}h no dia, "
                        f"acima do limite de {limite:g}h."
                    ),
                    recurso_tipo=papel,
                    recurso_id=str(user_id),
                    detalhes={"horas_agendadas": round(horas_no_dia, 2), "horas_novas": round(novas, 2)},
                )
            )

    return conflitos


async def _horas_agendadas_no_dia(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    user_id: uuid.UUID,
    dia: date,
    papel: str,
    ignorar_ordem_id: uuid.UUID | None = None,
) -> float:
    inicio, fim = _dia_completo(dia)
    condicoes = [
        OrdemServico.organizacao_id == organizacao_id,
        OrdemServico.situacao.in_([SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]),
    ]
    if ignorar_ordem_id:
        condicoes.append(OrdemServico.id != ignorar_ordem_id)

    if papel == "operador":
        linhas = (
            await db.execute(
                select(OrdemMaquina.inicio_previsto, OrdemMaquina.fim_previsto)
                .join(OrdemServico, OrdemServico.id == OrdemMaquina.ordem_id)
                .where(
                    *condicoes,
                    OrdemMaquina.operador_id == user_id,
                    OrdemMaquina.inicio_previsto < fim,
                    OrdemMaquina.fim_previsto > inicio,
                )
            )
        ).all()
    else:
        linhas = (
            await db.execute(
                select(OrdemVeiculo.inicio_previsto, OrdemVeiculo.fim_previsto)
                .join(OrdemServico, OrdemServico.id == OrdemVeiculo.ordem_id)
                .where(
                    *condicoes,
                    OrdemVeiculo.motorista_id == user_id,
                    OrdemVeiculo.inicio_previsto < fim,
                    OrdemVeiculo.fim_previsto > inicio,
                )
            )
        ).all()

    total = 0.0
    for linha_inicio, linha_fim in linhas:
        if linha_inicio and linha_fim:
            total += (linha_fim - linha_inicio).total_seconds() / 3600
    return round(total, 2)


async def ocupacao_porteira_no_dia(
    db: AsyncSession, organizacao_id: uuid.UUID, dia: date
) -> dict:
    inicio, fim = _dia_completo(dia)
    ordens = await db.scalar(
        select(func.count())
        .select_from(OrdemServico)
        .where(
            OrdemServico.organizacao_id == organizacao_id,
            OrdemServico.deleted_at.is_(None),
            OrdemServico.data_prevista == dia,
            OrdemServico.situacao.in_(
                [SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]
            ),
        )
    ) or 0
    teto = int(
        await configuracoes.obter(db, organizacao_id, "porteira_capacidade_servicos_dia") or 0
    )
    return {
        "data": dia,
        "servicos": ordens,
        "capacidade": teto,
        "ocupacao_percentual": round(100 * ordens / teto) if teto else 0,
        "lotado": bool(teto and ordens >= teto),
    }
