import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.comuns import Base


class ComentarioIn(Base):
    conteudo: str = Field(..., min_length=1, max_length=4000)


class ComentarioOut(Base):
    id: uuid.UUID
    autor_id: uuid.UUID
    autor_nome: str | None = None
    conteudo: str
    mencoes_usuario_ids: list[str] | None = None
    created_at: datetime


class DocumentoOut(Base):
    id: uuid.UUID
    categoria: str
    nome_arquivo: str
    versao: int
    status: str
    descricao: str | None = None
    created_at: datetime


class NotificacaoOut(Base):
    id: uuid.UUID
    tipo: str
    titulo: str
    mensagem: str
    entidade_tipo: str | None = None
    entidade_id: uuid.UUID | None = None
    link: str | None = None
    situacao: str
    created_at: datetime


class AuditoriaLogOut(Base):
    id: uuid.UUID
    usuario_nome: str | None = None
    usuario_perfil: str | None = None
    acao: str
    entidade_tipo: str | None = None
    entidade_id: uuid.UUID | None = None
    entidade_descricao: str | None = None
    resultado: str
    justificativa: str | None = None
    created_at: datetime


class DashboardOut(Base):
    processos_em_andamento: int
    processos_atrasados: int
    por_etapa: dict[str, int]
    valor_em_contratacao: float
    contratos_ativos: int
    valor_contratado: float
    contratos_vencendo: int
    atas_vencendo: int
