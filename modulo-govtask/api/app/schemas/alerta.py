"""Schemas da central de alertas e do calendário (§36–§40, §151)."""

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import SeveridadeAlerta, TipoAlerta, TipoFeriado
from app.schemas.demanda import PessoaOut


class AlertaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipo: TipoAlerta
    severidade: SeveridadeAlerta
    titulo: str
    detalhe: Optional[str] = None
    demanda_id: Optional[uuid.UUID] = None
    tarefa_id: Optional[uuid.UUID] = None
    responsavel: Optional[PessoaOut] = None
    metadados: Optional[dict] = None
    lido_em: Optional[datetime] = None
    resolvido_em: Optional[datetime] = None
    created_at: datetime

    # Preenchido na rota, para o card abrir a demanda sem uma segunda consulta.
    demanda_numero: Optional[str] = None
    demanda_titulo: Optional[str] = None


class ResumoAlertas(BaseModel):
    """Contagem por severidade — é o que o sino do cabeçalho mostra (§40)."""

    total: int
    criticos: int
    urgentes: int
    importantes: int
    avisos: int
    informacoes: int
    meus: int
    nao_lidos: int


class PaginaAlertas(BaseModel):
    items: list[AlertaOut]
    total: int
    page: int
    page_size: int
    resumo: ResumoAlertas


class DispensarAlertaRequest(BaseModel):
    motivo: str = Field(min_length=3)


class AlertaConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ativo: bool
    marcos_prazo: list[int]
    escalonamento: list[dict]
    inatividade_dias: list[int]
    dias_sem_aceite: int
    ponto_facultativo_e_util: bool
    ultima_varredura_em: Optional[datetime] = None


class AlertaConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ativo: Optional[bool] = None
    marcos_prazo: Optional[list[int]] = None
    escalonamento: Optional[list[dict]] = None
    inatividade_dias: Optional[list[int]] = None
    dias_sem_aceite: Optional[int] = Field(default=None, ge=0, le=60)
    ponto_facultativo_e_util: Optional[bool] = None

    @model_validator(mode="after")
    def validar(self):
        if self.marcos_prazo is not None:
            if any(d < 0 or d > 365 for d in self.marcos_prazo):
                raise ValueError("Marcos de prazo devem estar entre 0 e 365 dias")
        if self.inatividade_dias is not None:
            if any(d < 1 or d > 365 for d in self.inatividade_dias):
                raise ValueError("Marcos de inatividade devem estar entre 1 e 365 dias")
        if self.escalonamento is not None:
            alvos = {"RESPONSAVEL", "CHEFE_SETOR", "RESPONSAVEL_GERAL", "GABINETE"}
            for degrau in self.escalonamento:
                if degrau.get("alvo") not in alvos:
                    raise ValueError(
                        f"Alvo de escalonamento inválido: {degrau.get('alvo')}. "
                        f"Use um de {sorted(alvos)}"
                    )
                if not isinstance(degrau.get("dias"), int) or degrau["dias"] < 0:
                    raise ValueError("Cada degrau precisa de 'dias' inteiro e não negativo")
        return self


class FeriadoCriar(BaseModel):
    nome: str = Field(min_length=2, max_length=160)
    tipo: TipoFeriado = TipoFeriado.MUNICIPAL
    data: Optional[date] = None
    dia: Optional[int] = Field(default=None, ge=1, le=31)
    mes: Optional[int] = Field(default=None, ge=1, le=12)
    recorrente_anual: bool = False
    conta_como_util: bool = False

    @model_validator(mode="after")
    def validar(self):
        if self.recorrente_anual:
            if self.dia is None or self.mes is None:
                raise ValueError("Feriado recorrente exige dia e mês")
        elif self.data is None:
            raise ValueError("Informe a data, ou marque como recorrente com dia e mês")
        return self


class FeriadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nome: str
    tipo: TipoFeriado
    data: Optional[date] = None
    dia: Optional[int] = None
    mes: Optional[int] = None
    recorrente_anual: bool
    conta_como_util: bool
    ativo: bool
    organization_id: Optional[uuid.UUID] = None


class SimularPrazoRequest(BaseModel):
    """Confere quando um prazo cai, segundo o calendário do município."""

    inicio: Optional[date] = None
    dias: int = Field(ge=0, le=999)
    contagem: str = Field(default="DIAS_UTEIS", pattern="^(DIAS_UTEIS|DIAS_CORRIDOS)$")


class SimularPrazoOut(BaseModel):
    inicio: date
    vencimento: date
    dias: int
    contagem: str
    dias_corridos_equivalentes: int
