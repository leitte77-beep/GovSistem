"""Modelos do GovInfra.

O import de todos os módulos aqui garante que `Base.metadata` esteja completo
para o Alembic e para o `create_all` da suíte de testes.
"""

from app.models.arquivos import Arquivo, Assinatura
from app.models.base import Base
from app.models.bloqueios import Bloqueio, MotivoBloqueio
from app.models.cacambas import (
    Cacamba,
    EntregaCacamba,
    MovimentacaoCacamba,
    RetiradaCacamba,
    SolicitacaoCacamba,
    TipoResiduo,
)
from app.models.combustivel import Abastecimento, MovimentoCombustivel, Tanque
from app.models.frota import (
    CategoriaMaquina,
    Habilitacao,
    LeituraMedidor,
    Maquina,
    Veiculo,
)
from app.models.governanca import (
    Configuracao,
    Contador,
    DataBloqueada,
    Notificacao,
    Regiao,
    RegistroAuditoria,
)
from app.models.manutencao import Manutencao, PlanoManutencao
from app.models.organizacao import Organizacao, User
from app.models.pessoas import Imovel, Pessoa, PessoaImovel
from app.models.porteira import (
    Apontamento,
    Beneficiario,
    HistoricoSituacao,
    HorasAdicionais,
    MovimentoHoras,
    OrdemMaquina,
    OrdemServico,
    OrdemVeiculo,
    Programa,
    SaldoHoras,
    SolicitacaoServico,
    TipoServico,
    Viagem,
    Vistoria,
)

__all__ = [
    "Base",
    # Organização e acesso
    "Organizacao",
    "User",
    # Pessoas e imóveis
    "Pessoa",
    "Imovel",
    "PessoaImovel",
    # Bloqueios
    "MotivoBloqueio",
    "Bloqueio",
    # Caçambas
    "TipoResiduo",
    "Cacamba",
    "MovimentacaoCacamba",
    "SolicitacaoCacamba",
    "EntregaCacamba",
    "RetiradaCacamba",
    # Frota
    "CategoriaMaquina",
    "Maquina",
    "Veiculo",
    "LeituraMedidor",
    "Habilitacao",
    # Porteira Adentro
    "Programa",
    "Beneficiario",
    "SaldoHoras",
    "MovimentoHoras",
    "TipoServico",
    "SolicitacaoServico",
    "HistoricoSituacao",
    "Vistoria",
    "OrdemServico",
    "OrdemMaquina",
    "OrdemVeiculo",
    "Apontamento",
    "Viagem",
    "HorasAdicionais",
    # Combustível
    "Tanque",
    "MovimentoCombustivel",
    "Abastecimento",
    # Manutenção
    "PlanoManutencao",
    "Manutencao",
    # Arquivos
    "Arquivo",
    "Assinatura",
    # Governança
    "RegistroAuditoria",
    "Notificacao",
    "Configuracao",
    "Regiao",
    "DataBloqueada",
    "Contador",
]
