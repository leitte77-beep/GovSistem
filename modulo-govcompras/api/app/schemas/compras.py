import uuid
from datetime import date

from pydantic import Field

from app.schemas.comuns import Base


class CatalogoItemIn(Base):
    codigo: str = Field(..., min_length=1, max_length=30)
    descricao: str = Field(..., min_length=2)
    unidade_medida: str
    categoria: str | None = None
    especificacao_padrao: str | None = None


class HistoricoPrecoOut(Base):
    fonte: str
    valor: float
    data_referencia: date
    fornecedor_id: uuid.UUID | None = None


class CatalogoItemOut(CatalogoItemIn):
    id: uuid.UUID
    ativo: bool
    ultimo_valor: float | None = None
    media_historica: float | None = None
    historico_precos: list[HistoricoPrecoOut] = []


class FornecedorIn(Base):
    razao_social: str = Field(..., min_length=2)
    nome_fantasia: str | None = None
    cnpj: str = Field(..., min_length=11, max_length=18)
    endereco: str | None = None
    municipio: str | None = None
    uf: str | None = None
    cep: str | None = None
    telefone: str | None = None
    whatsapp: str | None = None
    email: str | None = None
    representante: str | None = None
    categorias_fornecidas: str | None = None
    observacoes: str | None = None


class FornecedorOut(FornecedorIn):
    id: uuid.UUID
    situacao: str


class FornecedorDocumentoIn(Base):
    tipo: str
    validade_ate: date | None = None


class FornecedorDocumentoOut(FornecedorDocumentoIn):
    id: uuid.UUID
    vencido: bool


class CotacaoItemIn(Base):
    catalogo_item_id: uuid.UUID | None = None
    descricao: str
    quantidade: float = Field(..., gt=0)


class CotacaoIn(Base):
    numero: str
    data_abertura: date
    prazo_resposta: date | None = None
    fornecedor_ids: list[uuid.UUID] = []
    itens: list[CotacaoItemIn] = []


class CotacaoPrecoIn(Base):
    cotacao_item_id: uuid.UUID
    valor_unitario: float = Field(..., gt=0)
    marca_modelo: str | None = None


class CotacaoFornecedorOut(Base):
    id: uuid.UUID
    fornecedor_id: uuid.UUID
    fornecedor_nome: str | None = None
    situacao: str
    enviada_em: str | None = None
    respondida_em: str | None = None


class CotacaoOut(Base):
    id: uuid.UUID
    processo_id: uuid.UUID
    numero: str
    data_abertura: date
    prazo_resposta: date | None = None
    status: str
    fornecedores: list[CotacaoFornecedorOut] = []


class MapaComparativoLinha(Base):
    item_id: uuid.UUID
    descricao: str
    quantidade: float
    menor_preco: float | None = None
    media: float | None = None
    mediana: float | None = None
    maior_preco: float | None = None
    precos_por_fornecedor: dict[str, float] = {}
    alerta: str | None = None


class MapaComparativoOut(Base):
    linhas: list[MapaComparativoLinha]
