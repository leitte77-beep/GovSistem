"""Importa todos os modelos para que `Base.metadata` fique completo — usado
pelo Alembic (`alembic/env.py`) e pela suíte de testes (`create_all`)."""

from app.models.ata import AtaItemSaldo, AtaRegistroPreco, AtaSolicitacaoConsumo
from app.models.base import Base
from app.models.compras import (
    CatalogoItem,
    CatalogoItemPrecoHistorico,
    Cotacao,
    CotacaoFornecedor,
    CotacaoItem,
    CotacaoPreco,
    Fornecedor,
    FornecedorDocumento,
)
from app.models.contrato import Aditivo, Apostilamento, Contrato, ContratoItemSaldo, ContratoSaldo
from app.models.dotacao import Autorizacao, DotacaoOrcamentaria, ProcessoDotacao
from app.models.fiscalizacao import Medicao, NotaFiscal, OcorrenciaContrato
from app.models.governanca import (
    AuditoriaLog,
    Comentario,
    ContadorNumeracao,
    Documento,
    IntegracaoLog,
    Notificacao,
)
from app.models.licitacao import (
    Adjudicacao,
    Edital,
    EditalTemplate,
    Homologacao,
    Proposta,
    Publicacao,
    Sessao,
)
from app.models.organizacao import Organizacao, Secretaria, Setor, User
from app.models.planejamento import Dfd, Etp, EtpTopico, MatrizRisco, MatrizRiscoItem, TermoReferencia
from app.models.processo import ProcessoHistoricoEtapa, ProcessoInstancia
from app.models.solicitacao import Solicitacao, SolicitacaoItem
from app.models.workflow import WorkflowEtapa, WorkflowEtapaRequisito, WorkflowTemplate, WorkflowTransicao

__all__ = [
    "Adjudicacao",
    "Aditivo",
    "Apostilamento",
    "AtaItemSaldo",
    "AtaRegistroPreco",
    "AtaSolicitacaoConsumo",
    "AuditoriaLog",
    "Autorizacao",
    "Base",
    "CatalogoItem",
    "CatalogoItemPrecoHistorico",
    "Comentario",
    "ContadorNumeracao",
    "Contrato",
    "ContratoItemSaldo",
    "ContratoSaldo",
    "Cotacao",
    "CotacaoFornecedor",
    "CotacaoItem",
    "CotacaoPreco",
    "Dfd",
    "Documento",
    "DotacaoOrcamentaria",
    "Edital",
    "EditalTemplate",
    "Etp",
    "EtpTopico",
    "Fornecedor",
    "FornecedorDocumento",
    "Homologacao",
    "IntegracaoLog",
    "MatrizRisco",
    "MatrizRiscoItem",
    "Medicao",
    "NotaFiscal",
    "Notificacao",
    "OcorrenciaContrato",
    "Organizacao",
    "ProcessoDotacao",
    "ProcessoHistoricoEtapa",
    "ProcessoInstancia",
    "Proposta",
    "Publicacao",
    "Secretaria",
    "Sessao",
    "Setor",
    "Solicitacao",
    "SolicitacaoItem",
    "TermoReferencia",
    "User",
    "WorkflowEtapa",
    "WorkflowEtapaRequisito",
    "WorkflowTemplate",
    "WorkflowTransicao",
]
