"""DTOs da Fase 2: cidadão, documentos, vínculos, deduplicação e unificação."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

_SEXO = "^(MASCULINO|FEMININO|INTERSEXO|NAO_INFORMADO|OUTRO)$"
_TIPO_PLANO = "^(SAUDE_SUPLEMENTAR|PLANO_PRIVADO|OUTRO)$"


class CidadaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=3, max_length=200)
    nome_social: str | None = Field(default=None, max_length=200)
    cpf: str | None = Field(default=None, max_length=14)
    cns: str | None = Field(default=None, max_length=20)
    data_nascimento: date | None = None
    sexo: str = Field(default="NAO_INFORMADO", pattern=_SEXO)
    identidade_genero: str | None = Field(default=None, max_length=60)
    orientacao_sexual: str | None = Field(default=None, max_length=60)
    raca_cor: str | None = Field(default=None, max_length=40)
    etnia: str | None = Field(default=None, max_length=80)
    nacionalidade: str | None = Field(default=None, max_length=80)
    municipio_nascimento_ibge: str | None = Field(default=None, min_length=7, max_length=7)
    ocupacao_cbo: str | None = Field(default=None, min_length=6, max_length=6)
    escolaridade: str | None = Field(default=None, max_length=80)
    situacao_rua: bool = False
    mae_id: uuid.UUID | None = None
    nome_mae: str | None = Field(default=None, max_length=200)
    observacoes: str | None = Field(default=None, max_length=4000)


class CidadaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=3, max_length=200)
    nome_social: str | None = Field(default=None, max_length=200)
    cpf: str | None = Field(default=None, max_length=14)
    cns: str | None = Field(default=None, max_length=20)
    data_nascimento: date | None = None
    sexo: str | None = Field(default=None, pattern=_SEXO)
    identidade_genero: str | None = Field(default=None, max_length=60)
    orientacao_sexual: str | None = Field(default=None, max_length=60)
    raca_cor: str | None = Field(default=None, max_length=40)
    etnia: str | None = Field(default=None, max_length=80)
    nacionalidade: str | None = Field(default=None, max_length=80)
    municipio_nascimento_ibge: str | None = Field(default=None, min_length=7, max_length=7)
    ocupacao_cbo: str | None = Field(default=None, min_length=6, max_length=6)
    escolaridade: str | None = Field(default=None, max_length=80)
    situacao_rua: bool | None = None
    mae_id: uuid.UUID | None = None
    nome_mae: str | None = Field(default=None, max_length=200)
    observacoes: str | None = Field(default=None, max_length=4000)


class CidadaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    nome: str
    nome_social: str | None = None
    nome_exibicao: str
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None
    data_nascimento: date | None = None
    sexo: str
    identidade_genero: str | None = None
    orientacao_sexual: str | None = None
    raca_cor: str | None = None
    etnia: str | None = None
    nacionalidade: str | None = None
    municipio_nascimento_ibge: str | None = None
    ocupacao_cbo: str | None = None
    escolaridade: str | None = None
    situacao_rua: bool
    mae_id: uuid.UUID | None = None
    nome_mae: str | None = None
    unificado_para_id: uuid.UUID | None = None
    unificado_em: datetime | None = None
    observacoes: str | None = None
    ativo: bool
    versao: int
    created_at: datetime
    baixa_em: datetime | None = None
    baixa_motivo: str | None = None


class CidadaoBuscaRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    termo: str = Field(min_length=2, max_length=200)
    limite: int = Field(default=50, ge=1, le=100)
    cursor: str | None = None
    incluir_unificados: bool = False


class CidadaoResumoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    nome: str
    nome_social: str | None = None
    nome_exibicao: str
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None
    data_nascimento: date | None = None
    nome_mae: str | None = None
    ativo: bool
    versao: int
    unificado_para_id: uuid.UUID | None = None


class CidadaoBuscaOut(CidadaoResumoOut):
    score: int | None = None
    motivo_match: str | None = None


class CidadaoResumo(BaseModel):
    id: uuid.UUID
    nome: str
    nome_social: str | None = None
    nome_exibicao: str
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None
    data_nascimento: date | None = None
    nome_mae: str | None = None


class DuplicidadeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    candidato_id: uuid.UUID
    pontuacao: int
    motivos: list | None = None
    status: str
    decisao_por_id: uuid.UUID | None = None
    decisao_em: datetime | None = None
    justificativa: str | None = None
    candidato: CidadaoResumo | None = None


class DecisaoDuplicidadeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decisao: str = Field(pattern="^(MESMO|DIFERENTE)$")
    justificativa: str = Field(min_length=20, max_length=2000)


class UnificacaoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destino_id: uuid.UUID
    campos: dict[str, str] | None = Field(
        default=None,
        description="Mapa campo -> ORIGEM|DESTINO. Ausente mantém o destino.",
    )
    justificativa: str = Field(min_length=20, max_length=2000)


class ReversaoUnificacaoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    justificativa: str = Field(min_length=20, max_length=2000)


class UnificacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    origem_id: uuid.UUID
    destino_id: uuid.UUID
    campos_escolhidos: dict | None = None
    dados_antes_destino: dict | None = None
    status: str
    justificativa: str
    autor_id: uuid.UUID | None = None
    revertida_em: datetime | None = None
    revertida_por_id: uuid.UUID | None = None
    justificativa_reversao: str | None = None
    created_at: datetime


class BaixaCidadaoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)
    data: datetime | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class CidadaoBaixaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    tipo: str
    motivo: str
    data: datetime
    usuario_id: uuid.UUID | None = None
    observacoes: str | None = None
    created_at: datetime


class ReativacaoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    motivo: str = Field(min_length=10, max_length=400)
    data: datetime | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class DocumentoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: str = Field(
        pattern=(
            "^(CPF|CNS|RG|CNH|CERTIDAO_NASCIMENTO|CERTIDAO_CASAMENTO|"
            "PASSAPORTE|OUTRO)$"
        )
    )
    numero: str = Field(min_length=1, max_length=60)
    orgao_emissor: str | None = Field(default=None, max_length=80)
    uf_emissor: str | None = Field(default=None, min_length=2, max_length=2)
    data_emissao: date | None = None
    validade: date | None = None
    principal: bool = False
    observacoes: str | None = Field(default=None, max_length=2000)


class DocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    tipo: str
    numero_mascarado: str | None = None
    orgao_emissor: str | None = None
    uf_emissor: str | None = None
    data_emissao: date | None = None
    validade: date | None = None
    principal: bool
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class ContatoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: str = Field(pattern="^(TELEFONE|EMAIL|WHATSAPP|OUTRO)$")
    valor: str = Field(min_length=3, max_length=200)
    principal: bool = False
    observacoes: str | None = Field(default=None, max_length=2000)


class ContatoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    tipo: str
    valor_mascarado: str | None = None
    principal: bool
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class EnderecoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: str = Field(default="RESIDENCIAL", pattern="^(RESIDENCIAL|COMERCIAL|OUTRO)$")
    cep: str | None = Field(default=None, max_length=9)
    logradouro: str | None = Field(default=None, max_length=240)
    numero: str | None = Field(default=None, max_length=30)
    complemento: str | None = Field(default=None, max_length=120)
    bairro: str | None = Field(default=None, max_length=120)
    municipio_ibge: str | None = Field(default=None, min_length=7, max_length=7)
    uf: str | None = Field(default=None, min_length=2, max_length=2)
    pais: str = Field(default="Brasil", max_length=80)
    referencia: str | None = Field(default=None, max_length=240)
    principal: bool = False


class EnderecoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    tipo: str
    cep: str | None = None
    logradouro: str | None = None
    numero: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    municipio_ibge: str | None = None
    uf: str | None = None
    pais: str
    referencia: str | None = None
    principal: bool
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class PlanoSaudeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operadora: str = Field(min_length=2, max_length=160)
    plano: str | None = Field(default=None, max_length=160)
    tipo: str = Field(default="SAUDE_SUPLEMENTAR", pattern=_TIPO_PLANO)
    numero_carteira: str | None = Field(default=None, max_length=80)
    principal: bool = False
    vigencia_inicio: date | None = None
    vigencia_fim: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class PlanoSaudeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    operadora: str
    plano: str | None = None
    tipo: str
    numero_carteira_mascarado: str | None = None
    principal: bool
    vigencia_inicio: date
    vigencia_fim: date | None = None
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class AlergiaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    substancia: str = Field(min_length=2, max_length=200)
    tipo: str | None = Field(default=None, max_length=60)
    gravidade: str | None = Field(default=None, max_length=40)
    reacao: str | None = Field(default=None, max_length=2000)
    data_inicio: date | None = None
    observacoes: str | None = Field(default=None, max_length=2000)


class AlergiaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    substancia: str
    tipo: str | None = None
    gravidade: str | None = None
    reacao: str | None = None
    data_inicio: date | None = None
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class CondicaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo_codigo: str = Field(default="CID10", pattern="^(CID10|CIAP2|CIPE|OUTRO)$")
    codigo: str = Field(min_length=2, max_length=20)
    descricao: str | None = Field(default=None, max_length=300)
    data_inicio: date | None = None
    data_fim: date | None = None
    situacao: str = Field(default="ATIVA", pattern="^(ATIVA|RESOLVIDA)$")
    observacoes: str | None = Field(default=None, max_length=2000)


class CondicaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    tipo_codigo: str
    codigo: str
    descricao: str | None = None
    data_inicio: date | None = None
    data_fim: date | None = None
    situacao: str
    observacoes: str | None = None
    ativo: bool
    versao: int
    baixa_em: datetime | None = None


class FotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    cidadao_id: uuid.UUID
    mime: str
    tamanho_bytes: int
    hash_sha256: str
    status_antivirus: str
    principal: bool
    versao: int
    baixa_em: datetime | None = None
    url_temporaria: str | None = None


class RecemNascidoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=3, max_length=200)
    nome_social: str | None = Field(default=None, max_length=200)
    cpf: str | None = Field(default=None, max_length=14)
    cns: str | None = Field(default=None, max_length=20)
    data_nascimento: date
    sexo: str = Field(default="NAO_INFORMADO", pattern=_SEXO)
    observacoes: str | None = Field(default=None, max_length=4000)


class ConsultaCADSUSRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cpf: str | None = Field(default=None, max_length=14)
    cns: str | None = Field(default=None, max_length=20)


class ConsultaCADSUSOut(BaseModel):
    status: str
    mensagem: str | None = None
    encontrado_local: bool = False
    cidadao_id: uuid.UUID | None = None
    nome_exibicao: str | None = None
    cpf_mascarado: str | None = None
    cns_mascarado: str | None = None


class ConsultaCepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cep: str = Field(min_length=8, max_length=9)


class ConsultaCepOut(BaseModel):
    status: str
    cep: str
    logradouro: str | None = None
    bairro: str | None = None
    municipio_ibge: str | None = None
    uf: str | None = None
    mensagem: str | None = None
