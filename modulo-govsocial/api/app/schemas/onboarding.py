import uuid
from typing import Optional

from pydantic import BaseModel


class TenantWizardStep(BaseModel):
    step: str
    completed: bool = False


class TenantOnboardingStatus(BaseModel):
    tenant_id: uuid.UUID
    tenant_name: str
    steps: list[TenantWizardStep]
    ready: bool = False


class SystemHealthOut(BaseModel):
    status: str
    version: str
    tenants_ativos: int
    total_familias: int
    total_atendimentos_mes: int
    ultimo_rma_fechado: Optional[str] = None


class WizardStepRequest(BaseModel):
    data: dict = {}


class SystemMetricsOut(BaseModel):
    tenants_ativos: int
    total_familias: int
    total_atendimentos_mes: int
    total_usuarios: int
    ultimo_rma_fechado: Optional[str] = None


class OrganizationConfigOut(BaseModel):
    nome_municipio: str
    brasao_url: Optional[str] = None
    cor_destaque: Optional[str] = None
