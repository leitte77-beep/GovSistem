"""Schemas de permissões, backup, restauração, auditoria e relatórios."""

import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.enums import (
    BackupType,
    ConflictStrategy,
    Permission,
    PermissionEffect,
    Profile,
    ResourceType,
    SubjectType,
)


class PermissionEntryIn(BaseModel):
    destino_tipo: SubjectType
    destino_id: Optional[uuid.UUID] = None
    destino_perfil: Optional[Profile] = None
    permissoes: List[Permission]
    efeito: PermissionEffect = PermissionEffect.ALLOW
    aplicar_em: str = Field(
        default="item_e_subpastas",
        description="somente_item | item_e_subpastas | documentos_existentes | novos_documentos",
    )
    expira_em: Optional[datetime] = None
    motivo: Optional[str] = None


class PermissionEntryOut(BaseModel):
    id: uuid.UUID
    recurso_tipo: str
    recurso_id: uuid.UUID
    destino_tipo: str
    destino_id: Optional[uuid.UUID] = None
    destino_perfil: Optional[str] = None
    destino_nome: Optional[str] = None
    permissoes: List[str]
    efeito: str
    aplicar_subpastas: bool
    expira_em: Optional[datetime] = None
    motivo: Optional[str] = None
    herdada_de: Optional[str] = None
    criado_em: datetime


class EffectivePermissionsOut(BaseModel):
    recurso_tipo: str
    recurso_id: uuid.UUID
    permissoes: List[str]
    origem: dict


class AuditOut(BaseModel):
    id: uuid.UUID
    acao: str
    usuario_id: Optional[uuid.UUID] = None
    usuario_nome: Optional[str] = None
    recurso_tipo: Optional[str] = None
    recurso_id: Optional[uuid.UUID] = None
    recurso_nome: Optional[str] = None
    ip: Optional[str] = None
    navegador: Optional[str] = None
    resultado: str
    detalhe: Optional[str] = None
    dados_anteriores: Optional[dict] = None
    dados_posteriores: Optional[dict] = None
    correlacao: Optional[str] = None
    data_hora: datetime


class BackupJobIn(BaseModel):
    nome: str = Field(min_length=2, max_length=150)
    tipo: BackupType = BackupType.FULL
    agendamento_cron: Optional[str] = "0 2 * * *"
    destino: str = Field(min_length=1, max_length=500)
    incluir_banco: bool = True
    incluir_arquivos: bool = True
    retencao_diaria: int = 7
    retencao_semanal: int = 4
    retencao_mensal: int = 12
    criptografar: bool = False
    ativo: bool = True


class BackupJobOut(BaseModel):
    id: uuid.UUID
    nome: str
    tipo: str
    agendamento_cron: Optional[str] = None
    destino: str
    incluir_banco: bool
    incluir_arquivos: bool
    retencao_diaria: int
    retencao_semanal: int
    retencao_mensal: int
    criptografar: bool
    ativo: bool
    ultima_execucao: Optional[datetime] = None
    proxima_execucao: Optional[datetime] = None
    aviso_destino: Optional[str] = None


class BackupExecutionOut(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    job_nome: Optional[str] = None
    tipo: str
    situacao: str
    iniciado_em: Optional[datetime] = None
    finalizado_em: Optional[datetime] = None
    duracao_segundos: Optional[float] = None
    destino: Optional[str] = None
    total_bytes: int
    total_arquivos: int
    manifesto_sha256: Optional[str] = None
    mensagem: Optional[str] = None
    verificado_em: Optional[datetime] = None
    resultado_verificacao: Optional[str] = None
    disparado_por_id: Optional[uuid.UUID] = None


class BackupRunRequest(BaseModel):
    tipo: Optional[BackupType] = None


class RestorePlanRequest(BaseModel):
    escopo: str = Field(default="completo", description="completo | documento | pasta | secretaria")
    escopo_id: Optional[uuid.UUID] = None
    estrategia_conflito: ConflictStrategy = ConflictStrategy.NOVA_VERSAO


class RestoreRunRequest(RestorePlanRequest):
    confirmar: bool = False
    gerar_ponto_seguranca: bool = True


class RestoreJobOut(BaseModel):
    id: uuid.UUID
    execucao_id: uuid.UUID
    escopo: str
    escopo_id: Optional[uuid.UUID] = None
    estrategia_conflito: str
    situacao: str
    plano: Optional[dict] = None
    ponto_seguranca: Optional[str] = None
    mensagem: Optional[str] = None
    total_restaurado: int
    iniciado_em: Optional[datetime] = None
    finalizado_em: Optional[datetime] = None


class IntegrityCheckOut(BaseModel):
    id: uuid.UUID
    escopo: str
    execucao_id: Optional[uuid.UUID] = None
    verificados: int
    ok: int
    falhas: int
    ausentes: int
    detalhes: Optional[dict] = None
    criado_em: datetime


class QuotaIn(BaseModel):
    escopo_tipo: str = Field(description="institution | secretariat | department")
    escopo_id: Optional[uuid.UUID] = None
    limite_mb: int = Field(ge=1)
    alerta_percentual: float = 80.0


class RetentionPolicyIn(BaseModel):
    nome: str = Field(min_length=2, max_length=150)
    descricao: Optional[str] = None
    dias_retencao: int = Field(ge=1)
    bloquear_exclusao: bool = True
    acao_apos: str = "alertar"


class NotificationOut(BaseModel):
    id: uuid.UUID
    tipo: str
    titulo: str
    corpo: Optional[str] = None
    recurso_tipo: Optional[str] = None
    recurso_id: Optional[uuid.UUID] = None
    estado: str
    criado_em: datetime


class HealthOut(BaseModel):
    status: str
    versao: str
    ambiente: str
    servicos: dict
