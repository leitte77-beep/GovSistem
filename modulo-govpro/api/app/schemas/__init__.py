"""DTOs (Pydantic v2) da Fase 1 — minimização de dados por finalidade (LGPD).

CPF/CNPJ são mascarados por padrão nas respostas; revelação auditada é Fase futura.
"""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.br_validators import mask_cpf_cnpj
from app.models.enums import NivelAcesso, NivelAssinatura, TipoPessoa


# ── Interessados ──────────────────────────────────────────────────────────────
class InteressadoInput(BaseModel):
    tipo_pessoa: str = TipoPessoa.PF.value
    nome: str
    cpf_cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None


class InteressadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo_pessoa: str
    nome: str
    cpf_cnpj: Optional[str] = None
    email: Optional[str] = None

    @field_validator("cpf_cnpj", mode="after")
    @classmethod
    def _mascara(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return mask_cpf_cnpj(v)
        return v


# ── Processos ─────────────────────────────────────────────────────────────────
class ProcessoAutuarInput(BaseModel):
    tipo_processo_id: uuid.UUID
    especificacao: str = Field(min_length=3, max_length=500)
    interessados: list[InteressadoInput] = []
    nivel_acesso: str = NivelAcesso.PUBLICO.value
    hipotese_legal_id: Optional[uuid.UUID] = None
    classe_id: Optional[uuid.UUID] = None
    observacoes: Optional[str] = None
    unidade_protocolizadora_id: Optional[uuid.UUID] = None


class ProcessoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nup: str
    numero_antigo: Optional[str] = None
    tipo_processo_id: uuid.UUID
    especificacao: str
    nivel_acesso: str
    hipotese_legal_id: Optional[uuid.UUID] = None
    situacao: str
    unidade_protocolizadora_id: Optional[uuid.UUID] = None
    responsavel_id: Optional[uuid.UUID] = None
    data_autuacao: Optional[datetime] = None
    created_at: datetime


# ── Documentos ────────────────────────────────────────────────────────────────
class DocumentoCreate(BaseModel):
    titulo: str = Field(min_length=3, max_length=500)
    conteudo_html: Optional[str] = None
    tipo_documento_id: Optional[uuid.UUID] = None
    nivel_acesso: str = NivelAcesso.PUBLICO.value
    hipotese_legal_id: Optional[uuid.UUID] = None
    unidade_id: Optional[uuid.UUID] = None


class DocumentoEdit(BaseModel):
    titulo: Optional[str] = None
    conteudo_html: str


class DocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    processo_id: uuid.UUID
    tipo_documento_id: Optional[uuid.UUID] = None
    numero: Optional[str] = None
    titulo: str
    formato: str
    nivel_acesso: str
    situacao: str
    versao_atual: int
    codigo_verificador: Optional[str] = None
    hash_conteudo: Optional[str] = None
    assinado_em: Optional[datetime] = None
    created_at: datetime


# ── Tramitações ───────────────────────────────────────────────────────────────
class TramitacaoDestino(BaseModel):
    unidade_id: uuid.UUID
    prazo_dias: Optional[int] = None
    observacao: Optional[str] = None


class TramitacaoCreate(BaseModel):
    unidade_origem_id: uuid.UUID
    destinos: list[TramitacaoDestino] = Field(min_length=1)


class DevolucaoCreate(BaseModel):
    unidade_origem_id: uuid.UUID
    unidade_destino_id: uuid.UUID
    motivo: str = Field(min_length=3)


class TramitacaoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    processo_id: uuid.UUID
    unidade_origem_id: Optional[uuid.UUID] = None
    unidade_destino_id: uuid.UUID
    tipo: str
    prazo_dias: Optional[int] = None
    observacao: Optional[str] = None
    recebida: bool
    recebida_em: Optional[datetime] = None
    created_at: datetime


# ── Assinatura ────────────────────────────────────────────────────────────────
class AssinaturaCreate(BaseModel):
    papel_cargo: Optional[str] = None
    nivel: str = NivelAssinatura.SIMPLES.value
    # ICP-Brasil (nivel QUALIFICADA): formato do artefato e certificado PKCS#12.
    formato: str = "CADES"
    certificado_pfx_base64: Optional[str] = None
    certificado_senha: Optional[str] = None


class AssinaturaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    documento_id: uuid.UUID
    signatario_nome: str
    papel_cargo: Optional[str] = None
    nivel: str
    hash_assinado: str
    algoritmo: Optional[str] = None
    certificado_serial: Optional[str] = None
    validacao_resultado: Optional[str] = None
    created_at: datetime


# ── Andamentos ────────────────────────────────────────────────────────────────
class AndamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo_evento: str
    descricao: str
    unidade_id: Optional[uuid.UUID] = None
    usuario_id: Optional[uuid.UUID] = None
    created_at: datetime


# ── Modelos de documento e textos padrão ─────────────────────────────────────
class ModeloDocumentoCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    tipo_documento_id: Optional[uuid.UUID] = None
    conteudo_html: Optional[str] = None


class ModeloDocumentoUpdate(BaseModel):
    nome: Optional[str] = None
    tipo_documento_id: Optional[uuid.UUID] = None
    conteudo_html: Optional[str] = None
    ativo: Optional[bool] = None


class ModeloDocumentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    tipo_documento_id: Optional[uuid.UUID] = None
    conteudo_html: Optional[str] = None
    ativo: bool


class TextoPadraoCreate(BaseModel):
    nome: str = Field(min_length=2, max_length=200)
    conteudo: Optional[str] = None


class TextoPadraoUpdate(BaseModel):
    nome: Optional[str] = None
    conteudo: Optional[str] = None
    ativo: Optional[bool] = None


class TextoPadraoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    conteudo: Optional[str] = None
    ativo: bool
