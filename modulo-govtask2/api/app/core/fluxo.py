"""Vocabulário fixo do GovTask: tipos de pedido, setores e prazos sugeridos.

Não existe mais trilha de fases. O pedido anda num vai e vem: o Assessor
encaminha para um setor, o setor executa e devolve ao Assessor, que decide o
próximo encaminhamento. O que continua em código — e não numa tela de
administração — é o vocabulário estável: de onde o pedido pode vir, para
quais setores pode ir e qual prazo o sistema sugere para cada setor.

Mudar o fluxo agora é mudar quem o Assessor escolhe encaminhar; não há mais
ordem obrigatória de fases.
"""

from datetime import date, timedelta
from enum import Enum


class TipoPedido(str, Enum):
    """O que o Prefeito pediu. Define o rótulo e o prazo sugerido."""

    AQUISICAO = "AQUISICAO"
    OBRA = "OBRA"
    OUTRO = "OUTRO"


class SetorPadrao(str, Enum):
    """Setores semeados em toda prefeitura. O município cria os seus além destes."""

    GABINETE = "GABINETE"
    ASSESSORIA = "ASSESSORIA"
    JURIDICO = "JURIDICO"
    CONTABILIDADE = "CONTABILIDADE"
    ENGENHARIA = "ENGENHARIA"
    LICITACAO = "LICITACAO"
    TESOURARIA = "TESOURARIA"
    EXTERNO = "EXTERNO"


# (codigo, nome, imutavel). `imutavel` protege o setor de espera externa.
SETORES_PADRAO: tuple[tuple[str, str, bool], ...] = (
    (SetorPadrao.GABINETE.value, "Gabinete", False),
    (SetorPadrao.ASSESSORIA.value, "Assessoria", False),
    (SetorPadrao.JURIDICO.value, "Jurídico", False),
    (SetorPadrao.CONTABILIDADE.value, "Contabilidade", False),
    (SetorPadrao.ENGENHARIA.value, "Engenharia", False),
    (SetorPadrao.LICITACAO.value, "Licitação", False),
    (SetorPadrao.TESOURARIA.value, "Tesouraria", False),
    (SetorPadrao.EXTERNO.value, "Órgão externo", True),
)

# Setor de espera por terceiro: o pedido fica com o Assessor, sem cobrar
# prazo de departamento.
SETOR_EXTERNO = SetorPadrao.EXTERNO.value

ROTULO_TIPO: dict[str, str] = {
    "AQUISICAO": "Aquisição (veículo, equipamento, bem)",
    "OBRA": "Obra",
    "OUTRO": "Outro pedido formal",
}

# Prazo sugerido, em dias, por setor de destino. É só uma sugestão: o
# Assessor pode informar outro prazo no envio, e o engenheiro pode negociar.
PRAZOS_SUGERIDOS: dict[str, int] = {
    SetorPadrao.ASSESSORIA.value: 3,
    SetorPadrao.JURIDICO.value: 5,
    SetorPadrao.GABINETE.value: 2,
    SetorPadrao.ENGENHARIA.value: 30,
    SetorPadrao.LICITACAO.value: 45,
    SetorPadrao.CONTABILIDADE.value: 30,
    SetorPadrao.TESOURARIA.value: 15,
    SetorPadrao.EXTERNO.value: 60,
}
PRAZO_SUGERIDO_PADRAO = 5


def tipo_valido(tipo: TipoPedido | str) -> str:
    """Normaliza o tipo; desconhecido cai em OUTRO em vez de quebrar."""
    if isinstance(tipo, TipoPedido):
        return tipo.value
    try:
        return TipoPedido(tipo).value
    except ValueError:
        return TipoPedido.OUTRO.value


def sugerir_prazo(setor: str | None, base: date) -> date:
    """Data sugerida para um encaminhamento a um setor."""
    dias = PRAZOS_SUGERIDOS.get((setor or "").upper(), PRAZO_SUGERIDO_PADRAO)
    return base + timedelta(days=dias)
