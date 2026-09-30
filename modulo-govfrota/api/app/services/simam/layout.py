"""Layout SIM-AM 2026 (v1.2b) — arquivos de frota/combustível como DADOS.

Mudança de layout = mudar esta especificação, não o código.

Regras gerais do manual: .txt, um registro por linha, separador "|" também
após o último campo, sem cabeçalho, ordem rigorosa dos campos, codificação
Windows-1252, obrigatórios nunca em branco, arquivos enviados dentro de .zip.

CONFERIR COM O PDF (páginas 699–722) antes do primeiro envio — itens marcados
"# conferir" foram montados a partir do resumo do layout, não do manual:
- nomes exatos dos arquivos;
- separador decimal e fim de linha;
- formato de data;
- ordem e nomes dos campos de EntradaExtraCombustivel e SaidaExtraCombustivel.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

SEPARADOR = "|"
FIM_DE_LINHA = "\r\n"  # conferir
SEPARADOR_DECIMAL = "."  # conferir (exemplo do resumo usa ponto: 120500.000)
FORMATO_DATA = "%d/%m/%Y"  # conferir
CODIFICACAO = "cp1252"


@dataclass(frozen=True)
class Campo:
    nome: str
    tipo: str  # N (inteiro), D (decimal), C (caractere), DT (data)
    tamanho: int
    obrigatorio: bool = True
    decimais: int = 0


def N(nome, tam, obrig=True):
    return Campo(nome, "N", tam, obrig)


def D(nome, tam, dec, obrig=True):
    return Campo(nome, "D", tam, obrig, dec)


def C(nome, tam, obrig=True):
    return Campo(nome, "C", tam, obrig)


def DT(nome, obrig=True):
    return Campo(nome, "DT", 10, obrig)


ARQUIVOS: dict[str, list[Campo]] = {
    "VeiculoEquipamento": [
        N("idPessoa", 7),
        C("cdBem", 10),
        N("nrAnoFabricacao", 4),
        N("idTipoCategoriaObjetoDespesa", 3),
        N("idTipoObjetoDespesa", 9),
        C("cdModeloFIPE", 12),
        C("nrPlaca", 12, False),
        C("nrRenavam", 20, False),
    ],
    "HodometroHorimetro": [
        N("idPessoa", 7),
        C("cdBem", 10),
        N("nrSequencialHodoHori", 7),
        N("nrMes", 2),
        N("nrAno", 4),
        N("idTipoMedidor", 2),
        D("nrMedicaoInicial", 14, 3),
        D("nrMedicaoFinal", 14, 3),
        D("nrMedicaoDeclarada", 14, 3),
        C("dsNotaExplicativa", 250, False),
    ],
    "ConsumoCombustivel": [
        N("idPessoa", 7),
        N("nrSequencialConsumo", 9),
        C("cdBem", 10),
        N("idTipoCategoriaObjetoDespesa", 3),
        N("idTipoObjetoDespesa", 9),
        N("nrMesConsumo", 2),
        N("nrAnoConsumo", 4),
        D("nrQuantidade", 14, 3),
    ],
    "EstornoConsumoCombustivel": [
        N("idPessoa", 7),
        N("nrEstorno", 9),
        N("nrAnoEstorno", 4),
        N("nrMesEstorno", 2),
        N("nrSequencialConsumo", 9),
        D("nrQuantidade", 14, 3),
        C("dsMotivo", 250),
    ],
    # conferir: ordem/nomes montados a partir da lista de campos do resumo.
    "EntradaExtraCombustivel": [
        N("idPessoa", 7),
        N("nrEntrada", 9),
        N("nrAnoEntrada", 4),
        C("nmRepassador", 150),
        C("nrCPFCNPJRepassador", 14),
        N("idTipoCategoriaObjetoDespesa", 3),
        N("idTipoObjetoDespesa", 9),
        N("idTipoEntradaCombustivel", 2),
        DT("dtEntrada"),
        C("nrCPF", 11),
        D("nrQuantidade", 14, 3),
        C("nrLeiAto", 20, False),
        N("nrAnoLeiAto", 4, False),
        C("nrConvenioOrigem", 20, False),
        N("nrAnoConvenioOrigem", 4, False),
        C("dsObjetoConvenioOrigem", 250, False),
        C("dsNotaExplicativa", 250, False),
    ],
    # conferir: ordem/nomes montados a partir da lista de campos do resumo.
    "SaidaExtraCombustivel": [
        N("idPessoa", 7),
        N("nrSaida", 9),
        N("nrAnoSaida", 4),
        N("idTipoCategoriaObjetoDespesa", 3),
        N("idTipoObjetoDespesa", 9),
        N("idTipoSaidaCombustivel", 2),
        DT("dtSaida"),
        C("nrCPF", 11),
        D("nrQuantidade", 14, 3),
        C("nmRecebedor", 150, False),
        C("nrCPFCNPJRecebedor", 14, False),
        C("nrConvenio", 20, False),
        N("nrAnoConvenio", 4, False),
        C("dsObjetoConvenio", 250, False),
        C("dsNotaExplicativa", 250, False),
    ],
    "EstoqueCombustivel": [
        N("idPessoa", 7),
        N("idTipoCategoriaObjetoDespesa", 3),
        N("idTipoObjetoDespesa", 9),
        N("nrMesBase", 2),
        N("nrAnoBase", 4),
        D("nrQuantidadeInicial", 14, 3),
        D("nrQuantidadeFinal", 14, 3),
    ],
}

TIPOS_MEDIDOR = {1: "Hodômetro", 2: "Horímetro", 3: "Não usa hodômetro/horímetro"}
TIPOS_ENTRADA = {"DOACAO": 1, "CONVENIO": 2, "AJUSTE_LIQUIDACAO": 3}
TIPOS_SAIDA = {
    1: "Evaporação",
    2: "Furto",
    3: "Vazamento",
    4: "Uso interno em oficinas",
    5: "Uso em obras e serviços",
    6: "Convênios",
    99: "Outras saídas",
}
# Saídas que dispensam nota explicativa (regra do layout).
SAIDAS_SEM_NOTA_OBRIGATORIA = {4, 5, 6}


class ErroLayout(ValueError):
    pass


def _texto(valor) -> str:
    # Remove o separador e quebras de linha: quebrariam o registro.
    return " ".join(str(valor).replace(SEPARADOR, "/").split())


def formatar_campo(campo: Campo, valor) -> str:
    if valor is None or valor == "":
        if campo.obrigatorio:
            raise ErroLayout(f"{campo.nome} é obrigatório.")
        return ""
    if campo.tipo == "N":
        texto = str(int(valor))
    elif campo.tipo == "D":
        quantum = Decimal(1).scaleb(-campo.decimais)
        texto = str(Decimal(valor).quantize(quantum, rounding=ROUND_HALF_UP))
        if SEPARADOR_DECIMAL != ".":
            texto = texto.replace(".", SEPARADOR_DECIMAL)
    elif campo.tipo == "DT":
        if not isinstance(valor, date):
            valor = date.fromisoformat(str(valor)[:10])
        texto = valor.strftime(FORMATO_DATA)
    else:
        texto = _texto(valor)
    limite = campo.tamanho + (1 if campo.tipo == "D" else 0)
    if len(texto.replace("-", "")) > limite:
        if campo.tipo == "C":
            texto = texto[: campo.tamanho]
        else:
            raise ErroLayout(f"{campo.nome} excede {campo.tamanho} posições ({texto}).")
    return texto


def formatar_linha(arquivo: str, linha: dict) -> str:
    campos = ARQUIVOS[arquivo]
    partes = [formatar_campo(c, linha.get(c.nome)) for c in campos]
    return SEPARADOR.join(partes) + SEPARADOR + FIM_DE_LINHA


def gerar_txt(arquivo: str, linhas: list[dict]) -> bytes:
    conteudo = "".join(formatar_linha(arquivo, linha) for linha in linhas)
    return conteudo.encode(CODIFICACAO, errors="replace")
