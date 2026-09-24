"""As duas perguntas que o gestor faz ao abrir um pedido:

    "E agora?"       → qual é a próxima ação
    "Está bem?"      → a saúde, com o motivo em palavras

Nada aqui vem de IA nem de caixa-preta: são regras transparentes, calculadas
a partir do que já está gravado — situação, prazo, última movimentação,
complemento pendente e espera externa. O painel mostra o motivo junto, para
o número nunca aparecer sozinho.
"""

import unicodedata
from datetime import date, datetime, timezone

from app.models.pedido import Encaminhamento, Pedido, SituacaoPedido, StatusEncaminhamento
from app.schemas.pedido import ProximaAcaoOut, UsuarioResumo

ENCERRADAS = {SituacaoPedido.CONCLUIDO.value, SituacaoPedido.CANCELADO.value}

DIAS_ATENCAO_PARADO = 7
DIAS_CRITICO_PARADO = 15

NORMAL = "NORMAL"
ATENCAO = "ATENCAO"
CRITICA = "CRITICA"


def hoje_utc() -> date:
    return datetime.now(timezone.utc).date()


def normalizar(texto: str | None) -> str:
    """Compara rótulos sem depender de caixa ou acento."""
    if not texto:
        return ""
    base = unicodedata.normalize("NFKD", texto)
    base = "".join(c for c in base if not unicodedata.combining(c))
    return " ".join(base.lower().split())


def encaminhamento_aberto(pedido: Pedido) -> Encaminhamento | None:
    """A passagem em curso. Mesma regra de `services.pedidos`."""
    for enc in pedido.encaminhamentos:
        if enc.status in {
            StatusEncaminhamento.AGUARDANDO.value,
            StatusEncaminhamento.EM_EXECUCAO.value,
            StatusEncaminhamento.AGUARDANDO_COMPLEMENTO.value,
        }:
            return enc
    return None


def _dias_de_atraso(pedido: Pedido, hoje: date) -> int:
    if pedido.prazo_atual is None:
        return 0
    return max(0, (hoje - pedido.prazo_atual).days)


def _dias_parado(pedido: Pedido) -> int:
    if pedido.ultima_movimentacao_em is None:
        return 0
    return max(0, (datetime.now(timezone.utc) - pedido.ultima_movimentacao_em).days)


def avaliar_saude(
    pedido: Pedido, *, hoje: date | None = None, verificar_anexos: bool = True
) -> tuple[str, list[str]]:
    """Nível de saúde e os motivos, do mais grave para o menos."""
    if pedido.situacao in ENCERRADAS:
        return NORMAL, []

    hoje = hoje or hoje_utc()
    criticos: list[str] = []
    atencao: list[str] = []

    if pedido.complemento_pendente:
        atencao.append("Aguardando o Assessor responder um complemento.")

    if pedido.situacao == SituacaoPedido.AGUARDANDO_TERCEIRO.value:
        atraso = _dias_de_atraso(pedido, hoje)
        if atraso > 0:
            atencao.append(f"Aguardando terceiro há {atraso} dia(s) além da previsão.")
    else:
        atraso = _dias_de_atraso(pedido, hoje)
        if atraso > 0 and pedido.situacao == SituacaoPedido.EM_SETOR.value:
            criticos.append(f"Prazo vencido há {atraso} dia(s).")

    parado = _dias_parado(pedido)
    if parado >= DIAS_CRITICO_PARADO:
        criticos.append(f"Sem movimentação há {parado} dias.")
    elif parado >= DIAS_ATENCAO_PARADO:
        atencao.append(f"Parado há {parado} dias.")

    motivos = criticos + atencao
    if criticos:
        return CRITICA, motivos
    if atencao:
        return ATENCAO, motivos
    return NORMAL, []


def resumo_proxima_acao(pedido: Pedido) -> str:
    """Uma linha, para o card: 'Executar «Projeto e orçamento»'."""
    if pedido.situacao in ENCERRADAS:
        return ""
    if pedido.complemento_pendente:
        return "Responder complemento ao setor"
    if pedido.situacao == SituacaoPedido.AGUARDANDO_TERCEIRO.value:
        return "Acompanhar o órgão externo"
    if pedido.situacao == SituacaoPedido.COM_ASSESSOR.value:
        return "Encaminhar a um setor ou concluir"
    enc = encaminhamento_aberto(pedido)
    if enc is None:
        return "Encaminhar a um setor ou concluir"
    return f"Executar “{enc.assunto}”"


def descrever_proxima_acao(
    pedido: Pedido, *, hoje: date | None = None
) -> ProximaAcaoOut | None:
    """A próxima ação em detalhe, para o cartão do topo da tela do pedido."""
    if pedido.situacao in ENCERRADAS:
        return None

    hoje = hoje or hoje_utc()
    enc = encaminhamento_aberto(pedido)
    atraso = _dias_de_atraso(pedido, hoje)

    if pedido.complemento_pendente:
        return ProximaAcaoOut(
            titulo="Responder complemento ao setor",
            descricao=enc.complemento_pedido if enc else "",
            setor=None,
            prazo=None,
            dias_de_atraso=0,
        )
    if pedido.situacao == SituacaoPedido.AGUARDANDO_TERCEIRO.value:
        return ProximaAcaoOut(
            titulo="Acompanhar o órgão externo",
            descricao="O pedido está fora da prefeitura, aguardando retorno.",
            dias_de_atraso=atraso,
        )
    if pedido.situacao == SituacaoPedido.COM_ASSESSOR.value or enc is None:
        return ProximaAcaoOut(
            titulo="Encaminhar a um setor ou concluir",
            descricao="O pedido está na mesa do Assessor.",
        )

    if enc.responsavel_id is None:
        titulo = f"Assumir “{enc.assunto}”"
    else:
        titulo = f"Executar “{enc.assunto}”"
    return ProximaAcaoOut(
        titulo=titulo,
        descricao=enc.instrucoes or "",
        setor=enc.setor,
        responsavel=(
            UsuarioResumo.model_validate(enc.responsavel) if enc.responsavel else None
        ),
        prazo=enc.prazo,
        dias_de_atraso=atraso,
    )
