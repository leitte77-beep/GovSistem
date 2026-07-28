import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ImportJobOut(BaseModel):
    id: uuid.UUID
    tipo: str
    status: str
    nome_arquivo: str
    total_linhas: Optional[int]
    linhas_processadas: Optional[int]
    novos: Optional[int]
    atualizados: Optional[int]
    conflitos: Optional[int]
    erros: Optional[int]
    criado_por_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


class ImportLogItem(BaseModel):
    id: uuid.UUID
    linha: int
    status: str
    nis: Optional[str]
    cpf: Optional[str]
    nome: Optional[str]
    mensagem: Optional[str]
    family_id_match: Optional[uuid.UUID]
    created_at: datetime


class ImportResultOut(BaseModel):
    job: ImportJobOut
    summary: dict
    logs: list[ImportLogItem]
