"""Enumerações compartilhadas entre os domínios do GovCompras.

Nenhuma delas representa um LIMITE legal (valor de dispensa, prazo, índice) —
essas ficam em `configuracoes` (seção 141: "não inventar dados legais"). São
apenas os estados e categorias que o próprio fluxo de trabalho precisa nomear.
"""

from enum import Enum


class TipoProcesso(str, Enum):
    PREGAO = "pregao"
    CONCORRENCIA = "concorrencia"
    DISPENSA = "dispensa"
    INEXIGIBILIDADE = "inexigibilidade"
    CREDENCIAMENTO = "credenciamento"
    ADESAO_ATA = "adesao_ata"
    CONTRATACAO_EMERGENCIAL = "contratacao_emergencial"


class StatusGeralProcesso(str, Enum):
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDO = "concluido"
    CANCELADO = "cancelado"
    SUSPENSO = "suspenso"


class TipoEtapa(str, Enum):
    MANUAL = "manual"
    GATE_ENTIDADE = "gate_entidade"


class TipoRequisito(str, Enum):
    MANUAL_CHECK = "manual_check"
    ENTIDADE_STATUS = "entidade_status"


class TipoTransicao(str, Enum):
    AVANCAR = "avancar"
    DEVOLVER = "devolver"
    CANCELAR = "cancelar"


class ResultadoEtapa(str, Enum):
    EM_ANDAMENTO = "em_andamento"
    AVANCOU = "avancou"
    DEVOLVIDA = "devolvida"
    CANCELADA = "cancelada"


class StatusSLA(str, Enum):
    DENTRO_DO_PRAZO = "dentro_do_prazo"
    ATENCAO = "atencao"
    ATRASADO = "atrasado"
    CRITICO = "critico"


class Prioridade(str, Enum):
    BAIXA = "baixa"
    NORMAL = "normal"
    ALTA = "alta"
    URGENTE = "urgente"
    EMERGENCIAL = "emergencial"


class TipoObjeto(str, Enum):
    BEM = "bem"
    SERVICO = "servico"
    OBRA = "obra"


class StatusSolicitacao(str, Enum):
    RASCUNHO = "rascunho"
    ENVIADA = "enviada"
    EM_PROCESSAMENTO = "em_processamento"
    ATENDIDA = "atendida"
    CANCELADA = "cancelada"


class StatusDocumentoPlanejamento(str, Enum):
    RASCUNHO = "rascunho"
    EM_REVISAO = "em_revisao"
    APROVADO = "aprovado"


class StatusTopico(str, Enum):
    PENDENTE = "pendente"
    PREENCHIDO = "preenchido"
    APROVADO = "aprovado"


class SituacaoFornecedor(str, Enum):
    ATIVO = "ativo"
    INATIVO = "inativo"
    IMPEDIDO = "impedido"


class StatusCotacao(str, Enum):
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class StatusDotacao(str, Enum):
    SOLICITADA = "solicitada"
    CONFIRMADA = "confirmada"
    DEVOLVIDA = "devolvida"
    INDISPONIVEL = "indisponivel"


class DecisaoAutorizacao(str, Enum):
    AUTORIZADO = "autorizado"
    NAO_AUTORIZADO = "nao_autorizado"


class StatusEdital(str, Enum):
    MINUTA = "minuta"
    PUBLICADO = "publicado"
    RETIFICADO = "retificado"
    REVOGADO = "revogado"


class SituacaoProposta(str, Enum):
    CLASSIFICADA = "classificada"
    DESCLASSIFICADA = "desclassificada"
    VENCEDORA = "vencedora"


class StatusContrato(str, Enum):
    VIGENTE = "vigente"
    ENCERRADO = "encerrado"
    RESCINDIDO = "rescindido"


class TipoAditivo(str, Enum):
    PRAZO = "prazo"
    VALOR = "valor"
    QUANTITATIVO = "quantitativo"
    SUPRESSAO = "supressao"
    ACRESCIMO = "acrescimo"
    OUTROS = "outros"


class StatusAta(str, Enum):
    VIGENTE = "vigente"
    ENCERRADA = "encerrada"


class StatusConsumoAta(str, Enum):
    SOLICITADA = "solicitada"
    APROVADA = "aprovada"
    NEGADA = "negada"
    CONSUMIDA = "consumida"


class StatusOcorrencia(str, Enum):
    ABERTA = "aberta"
    RESOLVIDA = "resolvida"


class ClassificacaoOcorrencia(str, Enum):
    INFORMATIVA = "informativa"
    ATENCAO = "atencao"
    IRREGULARIDADE = "irregularidade"
    GRAVE = "grave"


class StatusMedicao(str, Enum):
    AGUARDANDO_ANALISE = "aguardando_analise"
    APROVADA = "aprovada"
    APROVADA_COM_RESSALVA = "aprovada_com_ressalva"
    REJEITADA = "rejeitada"


class StatusNotaFiscal(str, Enum):
    RECEBIDA = "recebida"
    ATESTADA = "atestada"
    PAGA = "paga"


class StatusDocumento(str, Enum):
    RASCUNHO = "rascunho"
    EM_REVISAO = "em_revisao"
    AGUARDANDO_APROVACAO = "aguardando_aprovacao"
    APROVADO = "aprovado"
    REJEITADO = "rejeitado"
    SUBSTITUIDO = "substituido"


class CategoriaDocumento(str, Enum):
    PLANEJAMENTO = "planejamento"
    PESQUISA = "pesquisa"
    JURIDICO = "juridico"
    EDITAL = "edital"
    PUBLICACOES = "publicacoes"
    HABILITACAO = "habilitacao"
    CONTRATO = "contrato"
    FISCALIZACAO = "fiscalizacao"
    ADITIVOS = "aditivos"
    PAGAMENTOS = "pagamentos"
    OUTROS = "outros"


class TipoNotificacao(str, Enum):
    ETAPA_ATRIBUIDA = "etapa_atribuida"
    DEVOLUCAO = "devolucao"
    SLA_ATRASADO = "sla_atrasado"
    MENCAO = "mencao"
    CONTRATO_VENCENDO = "contrato_vencendo"
    ATA_LIMITE = "ata_limite"
    DOCUMENTO_DEVOLVIDO = "documento_devolvido"
    COTACAO_RECEBIDA = "cotacao_recebida"


class SituacaoNotificacao(str, Enum):
    NAO_LIDA = "nao_lida"
    LIDA = "lida"


class AcaoAuditoria(str, Enum):
    LOGIN = "login"
    CRIAR = "criar"
    EDITAR = "editar"
    AVANCAR_ETAPA = "avancar_etapa"
    DEVOLVER_ETAPA = "devolver_etapa"
    CANCELAR_PROCESSO = "cancelar_processo"
    REABRIR_PROCESSO = "reabrir_processo"
    APROVAR = "aprovar"
    PUBLICAR = "publicar"
    GERAR_CONTRATO = "gerar_contrato"
    EXCLUIR = "excluir"
    ACESSO_NEGADO = "acesso_negado"


class ResultadoAuditoria(str, Enum):
    SUCESSO = "sucesso"
    FALHA = "falha"
    NEGADO = "negado"


class TipoIntegracao(str, Enum):
    PNCP = "pncp"
    PORTAL_TRANSPARENCIA = "portal_transparencia"
    DIARIO_OFICIAL = "diario_oficial"
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    ASSINATURA_ICP = "assinatura_icp"


class StatusIntegracao(str, Enum):
    PENDENTE = "pendente"
    ENVIADO = "enviado"
    FALHA = "falha"
    NAO_CONFIGURADO = "nao_configurado"
