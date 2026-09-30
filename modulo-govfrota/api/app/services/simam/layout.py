"""Layout SIM-AM 2026 (v1.2b, publicado em 23/09/2026) — arquivos de frota como DADOS.

Mudança de layout = mudar esta especificação, não o código. Conferido com o
manual (Módulo Patrimônio/Controle Interno e "Regras Básicas", págs. 14–16):
arquivo = nome da tabela + ".txt"; separador "|" também após o último campo;
fim de linha "\n"; decimais com ponto; datas AAAA-MM-DD; sem cabeçalho;
Windows-1252; os .txt vão dentro de um .zip.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

SEPARADOR = "|"
FIM_DE_LINHA = "\n"
SEPARADOR_DECIMAL = "."
FORMATO_DATA = "%Y-%m-%d"
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
    "EntradaExtraCombustivel": [
        N("idPessoa", 7),
        C("flEntidadeRepassador", 1),
        N("tpDocRepassador", 2),
        C("nrDocRepassador", 15),
        N("idTipoCategoriaObjetoDespesa", 3),
        N("idTipoObjetoDespesa", 9),
        N("idTipoEntradaCombustivel", 2),
        DT("dtEntrada"),
        C("nrCPF", 15),
        D("nrQuantidade", 14, 3),
        N("cdControleLeiAto", 7),
        N("nrConvenioOrigem", 9, False),
        N("nrAnoConvenioOrigem", 4, False),
        C("dsObjetoConvenioOrigem", 1000, False),
        C("dsNotaExplicativa", 250, False),
    ],
    "SaidaExtraCombustivel": [
        N("idPessoa", 7),
        N("idTipoCategoriaObjetoDespesa", 3),
        N("idTipoObjetoDespesa", 9),
        N("idTipoSaidaCombustivel", 2),
        DT("dtSaida"),
        C("flEntidadeRecebedor", 1, False),
        N("tpDocRecebedor", 2, False),
        C("nrDocRecebedor", 15, False),
        C("nrCPF", 15),
        D("nrQuantidade", 14, 3),
        N("cdControleLeiAto", 7, False),
        N("nrConvenioOrigem", 9, False),
        N("nrAnoConvenioOrigem", 4, False),
        C("dsObjetoConvenioOrigem", 1000, False),
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

# TipoCategoriaXObjetoDespesa (combinações válidas de categoria × objeto).
CATEGORIAS = {1: "Combustível", 2: "Pneus", 3: "Energia elétrica consumida por veículos e equipamentos"}
OBJETOS = {
    (1, 1): "Gasolina",
    (1, 2): "Etanol",
    (1, 3): "Diesel",
    (1, 4): "Biodiesel",
    (1, 5): "GNV",
    (1, 6): "Querosene",
    (1, 26): "Veículos FLEX e assemelhados",
    (2, 27): "Pneus para caminhões",
    (2, 28): "Pneus para tratores",
    (2, 29): "Pneus para veículos e utilitários",
    (2, 30): "Pneus para outros veículos e equipamentos",
    (3, 8): "Energia elétrica consumida por veículos e equipamentos",
}
OBJETO_FLEX = 26
# Categorias aceitas em cada arquivo (regras 1110/1179, 1189/1198, 1209).
CATEGORIAS_DO_ARQUIVO = {
    "VeiculoEquipamento": {1, 3},
    "ConsumoCombustivel": {1, 3},
    "EntradaExtraCombustivel": {1, 2},
    "SaidaExtraCombustivel": {1, 2},
    "EstoqueCombustivel": {1},
}
TP_DOC_CPF, TP_DOC_CNPJ = 2, 3

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
