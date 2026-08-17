import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.comuns import Base, HistoricoEtapaOut, PendenciaOut


class ProcessoResumoOut(Base):
    id: uuid.UUID
    numero_processo: str
    exercicio: int
    tipo_processo: str
    status_geral: str
    secretaria_id: uuid.UUID
    secretaria_nome: str | None = None
    objeto: str
    valor_estimado: float | None = None
    etapa_atual_nome: str | None = None
    etapa_atual_codigo: str | None = None
    responsavel_setor: str | None = None
    responsavel_usuario: str | None = None
    dias_na_etapa: int | None = None
    status_sla: str | None = None
    favorito: bool = False
    created_at: datetime


class ProcessoDetalheOut(ProcessoResumoOut):
    solicitacao_id: uuid.UUID | None = None
    processo_origem_id: uuid.UUID | None = None
    origem_contrato_id: uuid.UUID | None = None
    template_id: uuid.UUID
    proxima_etapa_nome: str | None = None
    pendencias: list[PendenciaOut] = []


class AbrirProcessoIn(Base):
    tipo_processo: str
    secretaria_id: uuid.UUID
    setor_id: uuid.UUID | None = None
    objeto: str = Field(..., min_length=5)
    valor_estimado: float | None = None
    solicitacao_id: uuid.UUID | None = None
    origem_contrato_id: uuid.UUID | None = None


class DevolverIn(Base):
    transicao_id: uuid.UUID | None = None
    justificativa: str = Field(..., min_length=5, max_length=2000)


class CancelarIn(Base):
    justificativa: str = Field(..., min_length=5, max_length=2000)


class HistoricoOut(Base):
    itens: list[HistoricoEtapaOut]


class EtapaFluxoOut(Base):
    codigo: str
    nome: str
    ordem: int


class TransicaoDisponivelOut(Base):
    id: uuid.UUID
    tipo: str
    rotulo: str | None = None
    etapa_destino_nome: str | None = None
    exige_justificativa: bool
