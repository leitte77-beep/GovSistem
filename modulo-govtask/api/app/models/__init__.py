from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import (
    CanalNotificacao,
    CategoriaDocumento,
    CategoriaRecurso,
    ClassificacaoDocumento,
    ConfidencialidadeDemanda,
    EsferaRecurso,
    ModoEtapa,
    NaturezaEtapa,
    OrigemDemanda,
    OrigemDiligencia,
    PapelParticipante,
    Prioridade,
    PrioridadeDemanda,
    PrioridadeProcesso,
    RegraConclusaoEtapa,
    SeveridadeAlerta,
    SituacaoProcesso,
    StatusContestacao,
    StatusContrato,
    StatusConvenio,
    StatusDiligencia,
    StatusEntrega,
    StatusEtapa,
    StatusLicitacao,
    StatusMedicao,
    StatusPrestacao,
    StatusProtocolo,
    StatusRepasse,
    StatusTarefa,
    StatusWorkflowVersao,
    TipoAditivo,
    TipoAlerta,
    TipoAutoridade,
    TipoContagemPrazo,
    TipoConvenio,
    TipoDocumento,
    TipoEntrega,
    TipoEvento,
    TipoFeriado,
    TipoMovimentacaoTarefa,
    TipoMovimento,
    TipoNotificacao,
    TipoRegistroFinanceiro,
    TipoTarefa,
    # v3 — gestão avançada
    NivelRisco,
    StatusMarco,
    StatusRisco,
    StatusWebhookEntrega,
    TipoCampoCustomizado,
    TipoContagemSla,
    TipoRelacionamentoDemanda,
    StatusAssinatura,
    StatusEnvio,
)
from app.models.user import User
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user_role import UserRole
from app.models.organization import Organization
from app.models.refresh_token import RefreshToken
from app.models.setor import Setor
from app.models.convenio import Convenio
from app.models.etapa import Etapa
from app.models.tarefa import Tarefa
from app.models.anexo import Anexo
from app.models.evento_timeline import EventoTimeline
from app.models.contestacao import Contestacao
from app.models.notificacao import Notificacao
from app.models.notificacao_preferencia import NotificacaoPreferencia
from app.models.assinatura_documento import AssinaturaDocumento
from app.models.notificacao_envio import NotificacaoEnvio
from app.models.comentario import Comentario
from app.models.comentario_demanda import (
    ComentarioDemanda,
    ComentarioMencao,
    ComentarioRevisao,
)
from app.models.checklist import Checklist, ChecklistItem
from app.models.demanda_financeiro import RegistroFinanceiroDemanda
from app.models.visao_salva import VisaoSalva
from app.models.template_fluxo import TemplateFluxo, TemplateEtapa
from app.models.diligencia import Diligencia
from app.models.repasse import Repasse
from app.models.medicao import Medicao
from app.models.movimento_financeiro import MovimentoFinanceiro
from app.models.contrato import Contrato, Aditivo
from app.models.licitacao import Licitacao
from app.models.prestacao_contas import PrestacaoContas, PrestacaoItem
from app.models.entrega_objeto import EntregaObjeto
from app.models.obra import Obra, CronogramaItem, DiarioObra, RegistroFotografico, VistoriaObra
from app.models.tarefa_dependencia import TarefaDependencia
from app.models.tarefa_prazo_historico import TarefaPrazoHistorico
from app.models.processo_status import ProcessoStatus
from app.models.processo_favorito import ProcessoFavorito
from app.models.auditoria import Auditoria
from app.models.escalonamento import EscalonamentoConfig, EscalamentoAtraso
from app.models.catalogo import (
    CategoriaDemanda,
    DemandaTag,
    StatusDemanda,
    Tag,
    TipoDemanda,
)
from app.models.autoridade import Autoridade, AutoridadeContato
from app.models.sequencia import SequenciaNumeracao
from app.models.demanda import Demanda
from app.models.demanda_participante import DemandaParticipante, DemandaSeguidor
from app.models.protocolo_externo import ProtocoloAtualizacao, ProtocoloExterno
from app.models.tarefa_movimentacao import TarefaMovimentacao
from app.models.alerta import Alerta, AlertaConfig
from app.models.calendario import Feriado
from app.models.automacao import Automacao, AutomacaoExecucao
from app.models.registro_demanda import RegistroDemanda
from app.models.planejamento_demanda import AusenciaSubstituicao, ModeloDemanda, RecorrenciaDemanda
from app.models.relacionamento_demanda import DemandaRelacionamento
from app.models.marco import DemandaMarco
from app.models.risco import DemandaRisco
from app.models.campo_customizado import CampoCustomizado
from app.models.sla import SlaConfig
from app.models.webhook import WebhookEndpoint, WebhookEntrega
from app.models.workflow import (
    Workflow,
    WorkflowEtapa,
    WorkflowTarefaModelo,
    WorkflowVersao,
)

__all__ = [
    "Base",
    "TimestampMixin",
    "SoftDeleteMixin",
    "CanalNotificacao",
    "CategoriaDocumento",
    "CategoriaRecurso",
    "ClassificacaoDocumento",
    "ConfidencialidadeDemanda",
    "OrigemDemanda",
    "PapelParticipante",
    "PrioridadeDemanda",
    "StatusProtocolo",
    "TipoAutoridade",
    "TipoContagemPrazo",
    "EsferaRecurso",
    "NaturezaEtapa",
    "OrigemDiligencia",
    "Prioridade",
    "PrioridadeProcesso",
    "SituacaoProcesso",
    "StatusConvenio",
    "StatusContestacao",
    "StatusContrato",
    "StatusDiligencia",
    "StatusEntrega",
    "StatusEtapa",
    "StatusLicitacao",
    "StatusMedicao",
    "StatusPrestacao",
    "StatusRepasse",
    "StatusTarefa",
    "TipoAditivo",
    "TipoConvenio",
    "TipoDocumento",
    "TipoEntrega",
    "TipoEvento",
    "TipoMovimento",
    "TipoNotificacao",
    "User",
    "Role",
    "RolePermission",
    "UserRole",
    "Organization",
    "RefreshToken",
    "Setor",
    "Convenio",
    "Etapa",
    "Tarefa",
    "Anexo",
    "EventoTimeline",
    "Contestacao",
    "Notificacao",
    "NotificacaoPreferencia",
    "AssinaturaDocumento",
    "StatusAssinatura",
    "NotificacaoEnvio",
    "StatusEnvio",
    "Comentario",
    "TemplateFluxo",
    "TemplateEtapa",
    "Diligencia",
    "Repasse",
    "Medicao",
    "MovimentoFinanceiro",
    "Contrato",
    "Aditivo",
    "Licitacao",
    "PrestacaoContas",
    "PrestacaoItem",
    "EntregaObjeto",
    "Obra",
    "CronogramaItem",
    "DiarioObra",
    "RegistroFotografico",
    "VistoriaObra",
    "TarefaDependencia",
    "TarefaPrazoHistorico",
    "ProcessoStatus",
    "ProcessoFavorito",
    "Auditoria",
    "EscalonamentoConfig",
    "EscalamentoAtraso",
    "TipoDemanda",
    "CategoriaDemanda",
    "StatusDemanda",
    "Tag",
    "DemandaTag",
    "Autoridade",
    "AutoridadeContato",
    "SequenciaNumeracao",
    "Demanda",
    "DemandaParticipante",
    "DemandaSeguidor",
    "ProtocoloExterno",
    "ProtocoloAtualizacao",
    "TarefaMovimentacao",
    "Workflow",
    "WorkflowVersao",
    "WorkflowEtapa",
    "WorkflowTarefaModelo",
    "Alerta",
    "AlertaConfig",
    "Feriado",
    "SeveridadeAlerta",
    "TipoAlerta",
    "TipoFeriado",
    "ModoEtapa",
    "RegraConclusaoEtapa",
    "StatusWorkflowVersao",
    "TipoTarefa",
    "TipoMovimentacaoTarefa",
    "Automacao",
    "AutomacaoExecucao",
    "ComentarioDemanda",
    "ComentarioMencao",
    "ComentarioRevisao",
    "Checklist",
    "ChecklistItem",
    "RegistroFinanceiroDemanda",
    "TipoRegistroFinanceiro",
    "VisaoSalva",
    "RegistroDemanda",
    "AusenciaSubstituicao",
    "ModeloDemanda",
    "RecorrenciaDemanda",
    "DemandaRelacionamento",
    "DemandaMarco",
    "DemandaRisco",
    "CampoCustomizado",
    "SlaConfig",
    "WebhookEndpoint",
    "WebhookEntrega",
    "NivelRisco",
    "StatusMarco",
    "StatusRisco",
    "StatusWebhookEntrega",
    "TipoCampoCustomizado",
    "TipoContagemSla",
    "TipoRelacionamentoDemanda",
]
