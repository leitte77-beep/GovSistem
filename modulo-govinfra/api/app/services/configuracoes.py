"""Configurações operacionais do módulo (item 48).

Nenhum limite de atendimento é constante no código: tudo passa por aqui. O
catálogo abaixo é a *semente* — o gestor altera os valores pela tela de
configurações, e a auditoria registra cada mudança.

Uso típico dentro de uma regra:

    limite = await obter(db, organizacao_id, "cacamba_limite_mensal_cpf")
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.governanca import Configuracao

# (area, chave, valor padrão, tipo, rótulo, descrição)
CATALOGO: list[tuple] = [
    # ── Caçambas ────────────────────────────────────────────────────────────
    ("cacambas", "cacamba_limite_diario_cpf", 1, "numero",
     "Solicitações por CPF no mesmo dia",
     "Quantas solicitações o mesmo CPF pode abrir num único dia."),
    ("cacambas", "cacamba_limite_mensal_cpf", 2, "numero",
     "Solicitações por CPF no mês",
     "Limite mensal de solicitações por CPF. Use 0 para não limitar."),
    ("cacambas", "cacamba_intervalo_minimo_dias", 15, "numero",
     "Intervalo mínimo entre solicitações (dias)",
     "Quantidade de dias que o cidadão precisa esperar após a conclusão do atendimento anterior."),
    ("cacambas", "cacamba_uma_ativa_por_cpf", True, "booleano",
     "Uma solicitação ativa por CPF",
     "Impede abrir nova solicitação enquanto houver outra em andamento para o mesmo CPF."),
    ("cacambas", "cacamba_uma_ativa_por_endereco", True, "booleano",
     "Uma solicitação ativa por endereço",
     "Impede duas caçambas ativas no mesmo endereço."),
    ("cacambas", "cacamba_periodo_padrao_dias", 3, "numero",
     "Período padrão de uso (dias)",
     "Prazo sugerido entre a entrega e a retirada."),
    ("cacambas", "cacamba_periodo_maximo_dias", 7, "numero",
     "Período máximo de uso (dias)",
     "Prazo máximo que a caçamba pode permanecer no local."),
    ("cacambas", "cacamba_capacidade_entregas_dia", 8, "numero",
     "Capacidade diária de entregas",
     "Quantas entregas a equipe consegue fazer por dia."),
    ("cacambas", "cacamba_capacidade_retiradas_dia", 8, "numero",
     "Capacidade diária de retiradas",
     "Quantas retiradas a equipe consegue fazer por dia."),
    ("cacambas", "cacamba_antecedencia_minima_dias", 1, "numero",
     "Antecedência mínima do agendamento (dias)",
     "Menor prazo entre a data de hoje e a data agendada."),
    ("cacambas", "cacamba_dias_atendimento", [0, 1, 2, 3, 4], "lista",
     "Dias da semana com atendimento",
     "0 = segunda-feira … 6 = domingo."),
    ("cacambas", "cacamba_janela_recomendacao_dias", 30, "numero",
     "Janela do algoritmo de recomendação (dias)",
     "Quantos dias à frente o motor de sugestão analisa."),
    ("cacambas", "cacamba_pontuacao_minima_sem_justificativa", 40, "numero",
     "Pontuação mínima para agendar sem justificativa",
     "Abaixo desta pontuação o atendente precisa justificar a escolha da data."),
    ("cacambas", "cacamba_pesos_recomendacao", {
        "cacamba_disponivel": 30,
        "retorno_previsto": 12,
        "veiculo_disponivel": 18,
        "motorista_disponivel": 10,
        "agenda_livre": 20,
        "mesma_regiao": 15,
        "proximidade_geografica": 10,
        "rota_combinada": 12,
        "preferencia_cidadao": 14,
        "prioridade": 8,
        "penalidade_agenda_cheia": -40,
        "penalidade_sem_veiculo": -50,
        "penalidade_distancia": -8,
        "penalidade_muitas_retiradas": -10,
        "penalidade_manutencao_proxima": -6,
    }, "objeto",
     "Pesos do algoritmo de recomendação de datas",
     "Ajuste fino do motor de sugestão de melhor dia para as caçambas."),
    # ── Porteira Adentro ────────────────────────────────────────────────────
    ("porteira", "porteira_antecedencia_minima_dias", 2, "numero",
     "Antecedência mínima do agendamento (dias)",
     "Menor prazo entre hoje e a data do serviço."),
    ("porteira", "porteira_capacidade_servicos_dia", 4, "numero",
     "Serviços por dia",
     "Quantos serviços a Secretaria consegue executar por dia."),
    ("porteira", "porteira_janela_recomendacao_dias", 30, "numero",
     "Janela do algoritmo de recomendação (dias)",
     "Quantos dias à frente o motor de sugestão analisa."),
    ("porteira", "porteira_raio_agrupamento_km", 15, "numero",
     "Raio para agrupar serviços da mesma região (km)",
     "Serviços dentro deste raio no mesmo dia ganham pontuação por economia de deslocamento."),
    ("porteira", "porteira_intervalo_deslocamento_minutos", 60, "numero",
     "Intervalo mínimo entre serviços do mesmo recurso (minutos)",
     "Tempo reservado para deslocamento entre duas propriedades."),
    ("porteira", "porteira_jornada_maxima_horas", 8, "numero",
     "Jornada máxima do operador (horas/dia)",
     "Somatório de horas agendadas para o mesmo operador em um dia."),
    ("porteira", "porteira_pesos_recomendacao", {
        "maquina_disponivel": 30,
        "operador_habilitado": 22,
        "veiculo_disponivel": 12,
        "saldo_suficiente": 20,
        "agenda_livre": 18,
        "servico_proximo": 20,
        "preferencia_produtor": 12,
        "prioridade": 10,
        "penalidade_agenda_cheia": -35,
        "penalidade_manutencao_prevista": -25,
        "penalidade_distancia": -10,
        "penalidade_jornada": -20,
    }, "objeto",
     "Pesos do algoritmo de recomendação do Porteira Adentro",
     "Ajuste fino do motor de sugestão de melhor data para os serviços rurais."),
    # ── Combustível ─────────────────────────────────────────────────────────
    ("combustivel", "combustivel_tolerancia_consumo_percentual", 25, "numero",
     "Tolerância de consumo acima da média (%)",
     "Acima deste percentual o abastecimento gera alerta de consumo fora do padrão."),
    ("combustivel", "combustivel_tolerancia_previsto_realizado", 30, "numero",
     "Tolerância entre previsto e realizado (%)",
     "Divergência aceitável entre o combustível previsto na ordem e o efetivamente consumido."),
    ("combustivel", "combustivel_janela_duplicidade_minutos", 30, "numero",
     "Janela para detectar abastecimento duplicado (minutos)",
     "Dois lançamentos do mesmo equipamento nesta janela geram alerta."),
    ("combustivel", "combustivel_exige_ordem_servico", False, "booleano",
     "Exigir ordem de serviço no abastecimento",
     "Quando ligado, todo abastecimento precisa estar vinculado a uma ordem."),
    ("combustivel", "combustivel_permite_estoque_negativo", False, "booleano",
     "Permitir estoque negativo",
     "Mesmo ligado, exige permissão administrativa e justificativa a cada lançamento."),
    ("combustivel", "combustivel_preco_referencia_litro", 6.2, "numero",
     "Preço de referência do diesel (R$/litro)",
     "Usado para estimar custo quando o lançamento não informa valor."),
    # ── Geral ───────────────────────────────────────────────────────────────
    ("geral", "geral_alerta_documento_dias", 30, "numero",
     "Antecedência do alerta de documento vencendo (dias)",
     "Licenciamento, seguro e CNH próximos do vencimento."),
    ("geral", "geral_alerta_retirada_dias", 1, "numero",
     "Antecedência do aviso de retirada (dias)",
     "Quantos dias antes da data prevista o sistema avisa a equipe."),
    ("geral", "geral_texto_termo_cacamba",
     "Declaro estar ciente das regras de utilização da caçamba municipal, "
     "responsabilizando-me pelo material depositado e pela devolução do "
     "equipamento nas condições em que foi recebido.", "texto",
     "Texto do termo de responsabilidade (caçambas)",
     "Exibido na etapa de confirmação da solicitação."),
    ("geral", "geral_texto_termo_porteira",
     "Declaro que as informações prestadas são verdadeiras e que estou ciente "
     "das regras do programa, inclusive quanto ao limite de horas concedido.", "texto",
     "Texto do termo de responsabilidade (Porteira Adentro)",
     "Exibido na etapa de confirmação da solicitação de serviço."),
    ("geral", "geral_motivos_cancelamento", [
        "Solicitado pelo cidadão",
        "Duplicidade",
        "Endereço não localizado",
        "Falta de recurso disponível",
        "Determinação administrativa",
        "Outro",
    ], "lista", "Motivos de cancelamento", "Opções oferecidas ao cancelar um atendimento."),
    ("geral", "geral_motivos_pausa", [
        "Chuva",
        "Quebra de equipamento",
        "Falta de combustível",
        "Almoço",
        "Aguardando material",
        "Impedimento no local",
        "Outro",
    ], "lista", "Motivos de pausa", "Opções oferecidas ao pausar a execução de um serviço."),
]

# Índice rápido chave → padrão, usado quando a configuração ainda não existe.
PADROES: dict[str, Any] = {item[1]: item[2] for item in CATALOGO}
AREAS: dict[str, str] = {item[1]: item[0] for item in CATALOGO}


async def garantir_configuracoes_padrao(db: AsyncSession, organizacao_id: uuid.UUID) -> int:
    """Cria as configurações que ainda não existem. Idempotente."""
    existentes = set(
        (
            await db.execute(
                select(Configuracao.chave).where(Configuracao.organizacao_id == organizacao_id)
            )
        )
        .scalars()
        .all()
    )
    criadas = 0
    for area, chave, valor, tipo, rotulo, descricao in CATALOGO:
        if chave in existentes:
            continue
        db.add(
            Configuracao(
                organizacao_id=organizacao_id,
                area=area,
                chave=chave,
                valor={"valor": valor},
                tipo=tipo,
                rotulo=rotulo,
                descricao=descricao,
            )
        )
        criadas += 1
    if criadas:
        await db.flush()
    return criadas


async def obter(db: AsyncSession, organizacao_id: uuid.UUID, chave: str, padrao: Any = None) -> Any:
    """Lê uma configuração, caindo para o padrão do catálogo se não existir."""
    registro = await db.scalar(
        select(Configuracao).where(
            Configuracao.organizacao_id == organizacao_id, Configuracao.chave == chave
        )
    )
    if registro is None:
        return padrao if padrao is not None else PADROES.get(chave)
    conteudo = (registro.valor or {}).get("valor")
    return conteudo if conteudo is not None else PADROES.get(chave)


async def obter_varias(
    db: AsyncSession, organizacao_id: uuid.UUID, chaves: list[str]
) -> dict[str, Any]:
    """Lê várias configurações em uma consulta só — usado pelas regras que
    precisam de meia dúzia de limites de uma vez."""
    registros = (
        await db.execute(
            select(Configuracao).where(
                Configuracao.organizacao_id == organizacao_id, Configuracao.chave.in_(chaves)
            )
        )
    ).scalars().all()
    encontrados = {
        registro.chave: (registro.valor or {}).get("valor") for registro in registros
    }
    return {
        chave: (
            encontrados[chave]
            if chave in encontrados and encontrados[chave] is not None
            else PADROES.get(chave)
        )
        for chave in chaves
    }


async def definir(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    chave: str,
    valor: Any,
    usuario_id: uuid.UUID | None = None,
) -> tuple[Configuracao, Any]:
    """Grava uma configuração. Retorna (registro, valor anterior)."""
    registro = await db.scalar(
        select(Configuracao).where(
            Configuracao.organizacao_id == organizacao_id, Configuracao.chave == chave
        )
    )
    if registro is None:
        area = AREAS.get(chave, "geral")
        registro = Configuracao(
            organizacao_id=organizacao_id,
            area=area,
            chave=chave,
            valor={"valor": valor},
            rotulo=chave.replace("_", " ").capitalize(),
        )
        db.add(registro)
        await db.flush()
        return registro, None

    if not registro.editavel:
        from app.core.errors import PermissionDenied

        raise PermissionDenied("Esta configuração não pode ser alterada pela interface.")

    anterior = (registro.valor or {}).get("valor")
    registro.valor = {"valor": valor}
    registro.updated_by_id = usuario_id
    await db.flush()
    return registro, anterior
