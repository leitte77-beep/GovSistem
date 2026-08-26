from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import (
    BasePreventiva,
    CategoriaFornecedor,
    GravidadeOcorrencia,
    OrigemMovimentacao,
    PrioridadeManutencao,
    SituacaoVeiculo,
    StatusAbastecimento,
    StatusManutencao,
    StatusOcorrencia,
    TipoMovimentacao,
    TipoOrganizacao,
    TipoVeiculo,
)
from app.models.auth_models import Organization, Role, RolePermission, User, UserRole
from app.models.configuracoes import ConfiguracaoGovFrota
from app.models.veiculo import AlteracaoQuilometragem, Veiculo, VeiculoDocumento
from app.models.motorista import AcessoMotorista, Motorista
from app.models.combustivel import Combustivel, Fornecedor, Oficina, Tanque
from app.models.estoque import EntradaCombustivel, InventarioTanque, MovimentacaoEstoque
from app.models.abastecimento import Abastecimento, CorrecaoAbastecimento
from app.models.manutencao import Manutencao, ManutencaoItem, PlanoPreventivo
from app.models.ocorrencia import Ocorrencia
from app.models.auditoria import Auditoria, Notificacao
from app.models.anexo import Anexo

__all__ = [
    "Base",
    "TimestampMixin",
    "SoftDeleteMixin",
    "TipoOrganizacao",
    "TipoVeiculo",
    "SituacaoVeiculo",
    "CategoriaFornecedor",
    "TipoMovimentacao",
    "OrigemMovimentacao",
    "StatusAbastecimento",
    "PrioridadeManutencao",
    "StatusManutencao",
    "GravidadeOcorrencia",
    "StatusOcorrencia",
    "BasePreventiva",
    "Organization",
    "Role",
    "RolePermission",
    "User",
    "UserRole",
    "ConfiguracaoGovFrota",
    "Veiculo",
    "VeiculoDocumento",
    "AlteracaoQuilometragem",
    "Motorista",
    "AcessoMotorista",
    "Combustivel",
    "Tanque",
    "Fornecedor",
    "Oficina",
    "EntradaCombustivel",
    "MovimentacaoEstoque",
    "InventarioTanque",
    "Abastecimento",
    "CorrecaoAbastecimento",
    "Manutencao",
    "ManutencaoItem",
    "PlanoPreventivo",
    "Ocorrencia",
    "Auditoria",
    "Notificacao",
    "Anexo",
]
