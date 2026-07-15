import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DadosDomicilioCreate(BaseModel):
    tipo_construcao: Optional[str] = None
    abastecimento_agua: Optional[str] = None
    iluminacao_eletrica: Optional[bool] = None
    destino_lixo: Optional[str] = None
    escoamento_sanitario: Optional[str] = None
    total_comodos: Optional[int] = None
    total_dormitorios: Optional[int] = None
    tipo_domicilio: Optional[str] = None
    acesso_pavimentacao: Optional[bool] = None
    material_piso: Optional[str] = None
    total_pessoas: Optional[int] = None
    total_mulheres_gravidas: Optional[int] = 0
    total_maes_amamentando: Optional[int] = 0
    total_pessoas_deficiencia: Optional[int] = 0
    total_idosos: Optional[int] = 0
    observacoes: Optional[str] = None


class DadosDomicilioOut(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    tipo_construcao: Optional[str]
    abastecimento_agua: Optional[str]
    iluminacao_eletrica: Optional[bool]
    destino_lixo: Optional[str]
    escoamento_sanitario: Optional[str]
    total_comodos: Optional[int]
    total_dormitorios: Optional[int]
    tipo_domicilio: Optional[str]
    acesso_pavimentacao: Optional[bool]
    material_piso: Optional[str]
    total_pessoas: Optional[int]
    total_mulheres_gravidas: Optional[int]
    total_maes_amamentando: Optional[int]
    total_pessoas_deficiencia: Optional[int]
    total_idosos: Optional[int]
    observacoes: Optional[str]
    created_at: datetime
    updated_at: datetime
