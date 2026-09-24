"""Motor de recomendação de datas (itens 15 e 31).

Determinístico, explicável e configurável — sem aprendizado de máquina. Para
cada data da janela o motor soma critérios positivos e penalidades, todos com
peso vindo das configurações do módulo, e devolve as melhores opções com a
explicação em português do porquê.

Duas regras de projeto importantes:

  • quando falta recurso OBRIGATÓRIO (sem caçamba, sem máquina, sem operador
    habilitado), a data não é recomendada — o motor devolve o impedimento em
    vez de uma sugestão bonita e inútil;
  • a pontuação é sempre acompanhada dos motivos, para que o atendente entenda
    e possa discordar com conhecimento de causa.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.geo import distancia_km
from app.models.cacambas import SolicitacaoCacamba
from app.models.enums import (
    EQUIPAMENTO_NAO_AGENDAVEL,
    PESO_PRIORIDADE,
    SOLICITACAO_ATIVA,
    ServicoAfetado,
    SituacaoOrdem,
)
from app.models.frota import Habilitacao, Maquina, Veiculo
from app.models.manutencao import PlanoManutencao
from app.models.pessoas import Imovel
from app.models.porteira import OrdemServico, SolicitacaoServico
from app.services import agenda, configuracoes, elegibilidade

# Acima disto a confiança da recomendação é considerada alta.
LIMIAR_CONFIANCA_ALTA = 70
LIMIAR_CONFIANCA_MEDIA = 45


@dataclass
class OpcaoData:
    data: date
    pontuacao: int
    motivos_favoraveis: list[str] = field(default_factory=list)
    alertas: list[str] = field(default_factory=list)
    impedimentos: list[str] = field(default_factory=list)
    recursos: dict = field(default_factory=dict)
    ocupacao_percentual: int = 0
    distancia_estimada_km: float | None = None

    @property
    def viavel(self) -> bool:
        return not self.impedimentos

    @property
    def confianca(self) -> str:
        if self.pontuacao >= LIMIAR_CONFIANCA_ALTA:
            return "alta"
        if self.pontuacao >= LIMIAR_CONFIANCA_MEDIA:
            return "media"
        return "baixa"

    def explicacao(self) -> str:
        """Frase pronta para a tela, no formato do item 15.3."""
        dia_semana = [
            "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira",
            "Sexta-feira", "Sábado", "Domingo",
        ][self.data.weekday()]
        cabecalho = f"{dia_semana}, {self.data.strftime('%d de %B')}".replace(
            "January", "janeiro").replace("February", "fevereiro").replace("March", "março").replace(
            "April", "abril").replace("May", "maio").replace("June", "junho").replace(
            "July", "julho").replace("August", "agosto").replace("September", "setembro").replace(
            "October", "outubro").replace("November", "novembro").replace("December", "dezembro")
        if not self.viavel:
            return f"{cabecalho} não pode ser usada: " + "; ".join(self.impedimentos) + "."
        if not self.motivos_favoraveis:
            return f"{cabecalho} está livre, sem destaques."
        return f"{cabecalho} foi recomendada porque " + ", ".join(self.motivos_favoraveis) + "."

    def dict(self) -> dict:
        return {
            "data": self.data,
            "pontuacao": self.pontuacao,
            "viavel": self.viavel,
            "confianca": self.confianca,
            "explicacao": self.explicacao(),
            "motivos_favoraveis": self.motivos_favoraveis,
            "alertas": self.alertas,
            "impedimentos": self.impedimentos,
            "recursos": self.recursos,
            "ocupacao_percentual": self.ocupacao_percentual,
            "distancia_estimada_km": self.distancia_estimada_km,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Caçambas
# ─────────────────────────────────────────────────────────────────────────────


async def recomendar_datas_cacamba(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    data_preferida: date | None = None,
    dias_uso: int | None = None,
    bairro: str | None = None,
    regiao_id: uuid.UUID | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    prioridade: str = "normal",
    ignorar_solicitacao_id: uuid.UUID | None = None,
    quantidade: int = 3,
) -> list[OpcaoData]:
    """Melhores datas para entregar uma caçamba."""
    limites = await configuracoes.obter_varias(
        db,
        organizacao_id,
        [
            "cacamba_janela_recomendacao_dias",
            "cacamba_antecedencia_minima_dias",
            "cacamba_periodo_padrao_dias",
            "cacamba_pesos_recomendacao",
        ],
    )
    pesos: dict[str, int] = limites["cacamba_pesos_recomendacao"] or {}
    janela = int(limites["cacamba_janela_recomendacao_dias"] or 30)
    antecedencia = int(limites["cacamba_antecedencia_minima_dias"] or 0)
    dias_uso = int(dias_uso or limites["cacamba_periodo_padrao_dias"] or 3)

    hoje = date.today()
    primeira = hoje + timedelta(days=antecedencia)

    # Carga única do que é comum a todas as datas — evita N consultas por dia.
    veiculos_aptos = list(
        (
            await db.execute(
                select(Veiculo).where(
                    Veiculo.organizacao_id == organizacao_id,
                    Veiculo.deleted_at.is_(None),
                    Veiculo.transporta_cacamba.is_(True),
                    Veiculo.situacao.notin_(EQUIPAMENTO_NAO_AGENDAVEL),
                )
            )
        )
        .scalars()
        .all()
    )

    opcoes: list[OpcaoData] = []
    for deslocamento in range(janela + 1):
        dia = primeira + timedelta(days=deslocamento)
        opcao = await _avaliar_dia_cacamba(
            db,
            organizacao_id,
            dia=dia,
            dias_uso=dias_uso,
            pesos=pesos,
            data_preferida=data_preferida,
            bairro=bairro,
            regiao_id=regiao_id,
            latitude=latitude,
            longitude=longitude,
            prioridade=prioridade,
            veiculos_aptos=veiculos_aptos,
            ignorar_solicitacao_id=ignorar_solicitacao_id,
        )
        opcoes.append(opcao)

    viaveis = [o for o in opcoes if o.viavel]
    viaveis.sort(key=lambda o: (-o.pontuacao, o.data))
    if viaveis:
        return viaveis[:quantidade]

    # Nenhuma data viável: devolve as três primeiras com o impedimento explícito
    # (o item 31 exige informar claramente em vez de recomendar sem recurso).
    return opcoes[:quantidade]


async def _avaliar_dia_cacamba(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    dia: date,
    dias_uso: int,
    pesos: dict[str, int],
    data_preferida: date | None,
    bairro: str | None,
    regiao_id: uuid.UUID | None,
    latitude: float | None,
    longitude: float | None,
    prioridade: str,
    veiculos_aptos: list[Veiculo],
    ignorar_solicitacao_id: uuid.UUID | None,
) -> OpcaoData:
    opcao = OpcaoData(data=dia, pontuacao=0)
    retirada = dia + timedelta(days=dias_uso)

    # ── Data operacional (feriado, dia sem atendimento) ─────────────────────
    operacional, motivo = await elegibilidade.data_operacional(
        db, organizacao_id, dia, ServicoAfetado.CACAMBAS.value
    )
    if not operacional:
        opcao.impedimentos.append(motivo or "data sem atendimento")
        return opcao

    # ── Caçamba disponível (recurso obrigatório) ────────────────────────────
    livres = await agenda.cacambas_livres(
        db,
        organizacao_id,
        entrega_em=dia,
        retirada_prevista=retirada,
        ignorar_solicitacao_id=ignorar_solicitacao_id,
    )
    if not livres:
        opcao.impedimentos.append("não há caçamba disponível para o período")
        return opcao

    opcao.pontuacao += pesos.get("cacamba_disponivel", 30)
    opcao.recursos["cacambas_disponiveis"] = len(livres)
    opcao.recursos["cacamba_sugerida"] = {
        "id": str(livres[0].id),
        "codigo": livres[0].codigo,
        "capacidade_m3": livres[0].capacidade_m3,
    }
    if len(livres) >= 2:
        opcao.motivos_favoraveis.append(f"há {len(livres)} caçambas disponíveis")
    else:
        opcao.motivos_favoraveis.append("há uma caçamba disponível")
        opcao.alertas.append("Última caçamba livre para este período — margem apertada.")

    # Caçamba que retorna justo antes da data ganha ponto: aproveita o retorno.
    retornos = await db.scalar(
        select(func.count())
        .select_from(SolicitacaoCacamba)
        .where(
            SolicitacaoCacamba.organizacao_id == organizacao_id,
            SolicitacaoCacamba.data_prevista_retirada.between(dia - timedelta(days=2), dia),
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
        )
    ) or 0
    if retornos:
        opcao.pontuacao += pesos.get("retorno_previsto", 12)
        opcao.motivos_favoraveis.append(
            f"{retornos} caçamba(s) retornam ao pátio nos dias anteriores"
        )

    # ── Veículo disponível (recurso obrigatório) ────────────────────────────
    if not veiculos_aptos:
        opcao.impedimentos.append("não há caminhão cadastrado para transporte de caçamba")
        return opcao

    inicio_dia, fim_dia = datetime.combine(dia, time.min).replace(tzinfo=timezone.utc), datetime.combine(
        dia, time.max
    ).replace(tzinfo=timezone.utc)
    ocupados = await agenda.recursos_ocupados(db, organizacao_id, inicio_dia, fim_dia)
    veiculos_livres = [v for v in veiculos_aptos if v.id not in ocupados["veiculos"]]
    if not veiculos_livres:
        opcao.impedimentos.append("todos os caminhões estão comprometidos neste dia")
        return opcao

    opcao.pontuacao += pesos.get("veiculo_disponivel", 18)
    opcao.recursos["veiculo_sugerido"] = {
        "id": str(veiculos_livres[0].id),
        "placa": veiculos_livres[0].placa,
        "nome": veiculos_livres[0].nome,
    }

    # Motorista habilitado disponível.
    motoristas = await _motoristas_disponiveis(db, organizacao_id, dia, ocupados["motoristas"])
    if motoristas:
        opcao.pontuacao += pesos.get("motorista_disponivel", 10)
    else:
        opcao.alertas.append("Nenhum motorista habilitado livre — confirme a escala do dia.")

    # ── Ocupação da agenda ──────────────────────────────────────────────────
    capacidade = await agenda.capacidade_do_dia(db, organizacao_id, dia)
    opcao.ocupacao_percentual = capacidade["ocupacao_percentual"]
    if capacidade["lotado"]:
        opcao.impedimentos.append(
            f"a capacidade de entregas do dia já está completa "
            f"({capacidade['entregas']} de {capacidade['entregas_capacidade']})"
        )
        return opcao

    if capacidade["ocupacao_percentual"] <= 50:
        opcao.pontuacao += pesos.get("agenda_livre", 20)
        opcao.motivos_favoraveis.append(
            f"a capacidade diária está em {capacidade['ocupacao_percentual']}%"
        )
    elif capacidade["ocupacao_percentual"] >= 85:
        opcao.pontuacao += pesos.get("penalidade_agenda_cheia", -40) // 2
        opcao.alertas.append(
            f"Agenda quase cheia ({capacidade['ocupacao_percentual']}% da capacidade)."
        )

    if capacidade["retiradas"] > capacidade["retiradas_capacidade"] * 0.8 and capacidade[
        "retiradas_capacidade"
    ]:
        opcao.pontuacao += pesos.get("penalidade_muitas_retiradas", -10)
        opcao.alertas.append("Muitas retiradas já programadas para este dia.")

    # ── Sinergia de rota: atendimentos na mesma região ──────────────────────
    if bairro or regiao_id:
        condicoes = [
            SolicitacaoCacamba.organizacao_id == organizacao_id,
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
        ]
        if regiao_id:
            condicoes.append(SolicitacaoCacamba.regiao_id == regiao_id)
        elif bairro:
            condicoes.append(SolicitacaoCacamba.bairro == bairro)

        mesmo_dia = await db.scalar(
            select(func.count())
            .select_from(SolicitacaoCacamba)
            .where(
                *condicoes,
                (
                    (SolicitacaoCacamba.data_prevista_entrega == dia)
                    | (SolicitacaoCacamba.data_prevista_retirada == dia)
                ),
            )
        ) or 0
        if mesmo_dia:
            opcao.pontuacao += pesos.get("mesma_regiao", 15)
            opcao.motivos_favoraveis.append(
                f"já há {mesmo_dia} atendimento(s) programado(s) na mesma região"
            )
            opcao.pontuacao += pesos.get("rota_combinada", 12)

    # ── Proximidade geográfica com atendimentos do dia ──────────────────────
    if latitude is not None and longitude is not None:
        vizinhos = (
            await db.execute(
                select(SolicitacaoCacamba.latitude, SolicitacaoCacamba.longitude).where(
                    SolicitacaoCacamba.organizacao_id == organizacao_id,
                    SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
                    SolicitacaoCacamba.latitude.is_not(None),
                    (
                        (SolicitacaoCacamba.data_prevista_entrega == dia)
                        | (SolicitacaoCacamba.data_prevista_retirada == dia)
                    ),
                )
            )
        ).all()
        distancias = [
            d
            for d in (distancia_km(latitude, longitude, lat, lon) for lat, lon in vizinhos)
            if d is not None
        ]
        if distancias:
            menor = min(distancias)
            opcao.distancia_estimada_km = menor
            if menor <= 3:
                opcao.pontuacao += pesos.get("proximidade_geografica", 10)
                opcao.motivos_favoraveis.append(
                    f"outro atendimento ocorre a {menor:.1f} km do local"
                )
            elif menor > 20:
                opcao.pontuacao += pesos.get("penalidade_distancia", -8)
                opcao.alertas.append(
                    f"O atendimento mais próximo do dia está a {menor:.1f} km."
                )

    # ── Preferência do cidadão ──────────────────────────────────────────────
    if data_preferida:
        diferenca = abs((dia - data_preferida).days)
        if diferenca == 0:
            opcao.pontuacao += pesos.get("preferencia_cidadao", 14)
            opcao.motivos_favoraveis.append("é exatamente a data pedida pelo cidadão")
        elif diferenca <= 2:
            opcao.pontuacao += pesos.get("preferencia_cidadao", 14) // 2
            opcao.motivos_favoraveis.append(
                f"está a {diferenca} dia(s) da data pedida pelo cidadão"
            )

    # ── Prioridade do atendimento ───────────────────────────────────────────
    peso_prioridade = PESO_PRIORIDADE.get(prioridade, 1)
    if peso_prioridade >= 2:
        # Atendimento urgente valoriza datas próximas.
        proximidade = max(0, 10 - (dia - date.today()).days)
        opcao.pontuacao += pesos.get("prioridade", 8) * peso_prioridade * proximidade // 10

    return opcao


async def _motoristas_disponiveis(
    db: AsyncSession, organizacao_id: uuid.UUID, dia: date, ocupados: set
) -> list[Habilitacao]:
    habilitacoes = list(
        (
            await db.execute(
                select(Habilitacao).where(
                    Habilitacao.organizacao_id == organizacao_id,
                    Habilitacao.deleted_at.is_(None),
                    Habilitacao.dirige_veiculos.is_(True),
                    Habilitacao.situacao == "ativa",
                )
            )
        )
        .scalars()
        .all()
    )
    return [
        h
        for h in habilitacoes
        if h.user_id not in ocupados and not h.cnh_vencida(dia) and not h.afastado_em(dia)
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Porteira Adentro
# ─────────────────────────────────────────────────────────────────────────────


async def recomendar_datas_servico(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    solicitacao: SolicitacaoServico,
    categorias_necessarias: list[str] | None = None,
    horas_previstas: float | None = None,
    saldo_disponivel: float | None = None,
    quantidade: int = 3,
) -> list[OpcaoData]:
    """Melhores datas para executar um serviço rural (item 31)."""
    limites = await configuracoes.obter_varias(
        db,
        organizacao_id,
        [
            "porteira_janela_recomendacao_dias",
            "porteira_antecedencia_minima_dias",
            "porteira_raio_agrupamento_km",
            "porteira_pesos_recomendacao",
        ],
    )
    pesos: dict[str, int] = limites["porteira_pesos_recomendacao"] or {}
    janela = int(limites["porteira_janela_recomendacao_dias"] or 30)
    antecedencia = int(limites["porteira_antecedencia_minima_dias"] or 0)
    raio = float(limites["porteira_raio_agrupamento_km"] or 15)

    horas_previstas = float(horas_previstas or solicitacao.horas_estimadas or 4)
    imovel = await db.get(Imovel, solicitacao.imovel_id)

    # Máquinas compatíveis com o serviço.
    consulta_maquinas = select(Maquina).where(
        Maquina.organizacao_id == organizacao_id,
        Maquina.deleted_at.is_(None),
        Maquina.situacao.notin_(EQUIPAMENTO_NAO_AGENDAVEL),
    )
    maquinas = list((await db.execute(consulta_maquinas)).scalars().all())
    if categorias_necessarias:
        compativeis = [
            m
            for m in maquinas
            if m.categoria is not None and m.categoria.chave in categorias_necessarias
        ]
        maquinas = compativeis or []

    operadores = list(
        (
            await db.execute(
                select(Habilitacao).where(
                    Habilitacao.organizacao_id == organizacao_id,
                    Habilitacao.deleted_at.is_(None),
                    Habilitacao.opera_maquinas.is_(True),
                    Habilitacao.situacao == "ativa",
                )
            )
        )
        .scalars()
        .all()
    )

    hoje = date.today()
    primeira = hoje + timedelta(days=antecedencia)
    opcoes: list[OpcaoData] = []

    for deslocamento in range(janela + 1):
        dia = primeira + timedelta(days=deslocamento)
        opcao = await _avaliar_dia_servico(
            db,
            organizacao_id,
            dia=dia,
            pesos=pesos,
            solicitacao=solicitacao,
            imovel=imovel,
            maquinas=maquinas,
            operadores=operadores,
            horas_previstas=horas_previstas,
            saldo_disponivel=saldo_disponivel,
            raio_km=raio,
        )
        opcoes.append(opcao)

    viaveis = [o for o in opcoes if o.viavel]
    viaveis.sort(key=lambda o: (-o.pontuacao, o.data))
    return (viaveis or opcoes)[:quantidade]


async def _avaliar_dia_servico(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    dia: date,
    pesos: dict[str, int],
    solicitacao: SolicitacaoServico,
    imovel: Imovel | None,
    maquinas: list[Maquina],
    operadores: list[Habilitacao],
    horas_previstas: float,
    saldo_disponivel: float | None,
    raio_km: float,
) -> OpcaoData:
    opcao = OpcaoData(data=dia, pontuacao=0)

    operacional, motivo = await elegibilidade.data_operacional(
        db, organizacao_id, dia, ServicoAfetado.PORTEIRA_ADENTRO.value
    )
    if not operacional:
        opcao.impedimentos.append(motivo or "data sem atendimento")
        return opcao

    # ── Saldo de horas (recurso obrigatório) ────────────────────────────────
    if saldo_disponivel is not None and horas_previstas > saldo_disponivel:
        opcao.impedimentos.append(
            f"saldo insuficiente ({saldo_disponivel:g}h disponíveis para {horas_previstas:g}h "
            "previstas)"
        )
        return opcao
    if saldo_disponivel is not None:
        opcao.pontuacao += pesos.get("saldo_suficiente", 20)

    # ── Máquina compatível disponível (recurso obrigatório) ─────────────────
    if not maquinas:
        opcao.impedimentos.append("não há máquina compatível cadastrada para este tipo de serviço")
        return opcao

    inicio = datetime.combine(dia, time(7, 0)).replace(tzinfo=timezone.utc)
    fim = inicio + timedelta(hours=max(horas_previstas, 1))
    ocupados = await agenda.recursos_ocupados(db, organizacao_id, inicio, fim)

    maquinas_livres = [m for m in maquinas if m.id not in ocupados["maquinas"]]
    if not maquinas_livres:
        opcao.impedimentos.append("todas as máquinas compatíveis estão comprometidas neste dia")
        return opcao

    opcao.pontuacao += pesos.get("maquina_disponivel", 30)
    opcao.recursos["maquina_sugerida"] = {
        "id": str(maquinas_livres[0].id),
        "codigo": maquinas_livres[0].codigo,
        "nome": maquinas_livres[0].nome,
    }
    opcao.recursos["maquinas_disponiveis"] = len(maquinas_livres)
    opcao.motivos_favoraveis.append(
        f"a {maquinas_livres[0].nome.lower()} estará disponível"
        if len(maquinas_livres) == 1
        else f"há {len(maquinas_livres)} máquinas compatíveis disponíveis"
    )

    # ── Operador habilitado (recurso obrigatório) ───────────────────────────
    operadores_livres = [
        o
        for o in operadores
        if o.user_id not in ocupados["operadores"]
        and not o.cnh_vencida(dia)
        and not o.afastado_em(dia)
    ]
    if not operadores_livres:
        opcao.impedimentos.append("não há operador habilitado disponível neste dia")
        return opcao

    opcao.pontuacao += pesos.get("operador_habilitado", 22)
    opcao.recursos["operadores_disponiveis"] = len(operadores_livres)
    opcao.motivos_favoraveis.append("o operador habilitado não possui conflito de agenda")

    # ── Manutenção prevista para a máquina sugerida ─────────────────────────
    plano = await db.scalar(
        select(PlanoManutencao).where(
            PlanoManutencao.maquina_id == maquinas_livres[0].id,
            PlanoManutencao.ativo.is_(True),
            PlanoManutencao.proxima_data.is_not(None),
            PlanoManutencao.proxima_data <= dia + timedelta(days=5),
        )
    )
    if plano is not None:
        opcao.pontuacao += pesos.get("penalidade_manutencao_prevista", -25)
        opcao.alertas.append(
            f"A máquina tem manutenção preventiva prevista para "
            f"{plano.proxima_data.strftime('%d/%m/%Y')}."
        )

    # ── Ocupação do dia ─────────────────────────────────────────────────────
    ocupacao = await agenda.ocupacao_porteira_no_dia(db, organizacao_id, dia)
    opcao.ocupacao_percentual = ocupacao["ocupacao_percentual"]
    if ocupacao["lotado"]:
        opcao.impedimentos.append(
            f"a capacidade de serviços do dia já está completa "
            f"({ocupacao['servicos']} de {ocupacao['capacidade']})"
        )
        return opcao
    if ocupacao["ocupacao_percentual"] <= 50:
        opcao.pontuacao += pesos.get("agenda_livre", 18)
    elif ocupacao["ocupacao_percentual"] >= 85:
        opcao.pontuacao += pesos.get("penalidade_agenda_cheia", -35) // 2
        opcao.alertas.append(f"Agenda em {ocupacao['ocupacao_percentual']}% da capacidade.")

    # ── Agrupamento por proximidade ─────────────────────────────────────────
    if imovel is not None and imovel.tem_coordenada:
        vizinhos = (
            await db.execute(
                select(Imovel.latitude, Imovel.longitude)
                .join(SolicitacaoServico, SolicitacaoServico.imovel_id == Imovel.id)
                .join(OrdemServico, OrdemServico.solicitacao_id == SolicitacaoServico.id)
                .where(
                    OrdemServico.organizacao_id == organizacao_id,
                    OrdemServico.data_prevista == dia,
                    OrdemServico.situacao.in_(
                        [SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]
                    ),
                    Imovel.latitude.is_not(None),
                    Imovel.id != imovel.id,
                )
            )
        ).all()
        distancias = [
            d
            for d in (
                distancia_km(imovel.latitude, imovel.longitude, lat, lon) for lat, lon in vizinhos
            )
            if d is not None
        ]
        if distancias:
            menor = min(distancias)
            opcao.distancia_estimada_km = menor
            if menor <= raio_km:
                opcao.pontuacao += pesos.get("servico_proximo", 20)
                opcao.motivos_favoraveis.append(
                    f"outro atendimento ocorrerá a {menor:.1f} km da propriedade no mesmo dia"
                )
            else:
                opcao.pontuacao += pesos.get("penalidade_distancia", -10)
                opcao.alertas.append(
                    f"O serviço mais próximo do dia está a {menor:.1f} km — deslocamento maior."
                )

    # ── Preferência do produtor ─────────────────────────────────────────────
    if solicitacao.data_desejada:
        diferenca = abs((dia - solicitacao.data_desejada).days)
        if diferenca == 0:
            opcao.pontuacao += pesos.get("preferencia_produtor", 12)
            opcao.motivos_favoraveis.append("é a data pedida pelo produtor")
        elif diferenca <= 3:
            opcao.pontuacao += pesos.get("preferencia_produtor", 12) // 2

    # ── Prioridade e ordem de aprovação ─────────────────────────────────────
    peso_prioridade = PESO_PRIORIDADE.get(solicitacao.prioridade, 1)
    if peso_prioridade >= 2:
        proximidade = max(0, 10 - (dia - date.today()).days)
        opcao.pontuacao += pesos.get("prioridade", 10) * peso_prioridade * proximidade // 10

    return opcao


def exige_justificativa(opcao_escolhida: OpcaoData | None, pontuacao_minima: int) -> bool:
    """A data escolhida pelo atendente precisa de justificativa?

    Sim quando a data não estava entre as recomendadas ou quando a pontuação
    ficou abaixo do mínimo configurado (item 15.3).
    """
    if opcao_escolhida is None:
        return True
    return opcao_escolhida.pontuacao < pontuacao_minima
