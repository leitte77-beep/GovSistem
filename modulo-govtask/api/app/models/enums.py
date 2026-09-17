from enum import Enum


# ── Convênio ──────────────────────────────────────────────

class TipoConvenio(str, Enum):
    OBRA = "OBRA"
    AQUISICAO = "AQUISICAO"
    SERVICO = "SERVICO"
    OUTRO = "OUTRO"


class CategoriaRecurso(str, Enum):
    EMENDA_PARLAMENTAR = "EMENDA_PARLAMENTAR"
    CONVENIO = "CONVENIO"
    CONTRATO_REPASSE = "CONTRATO_REPASSE"
    TRANSFERENCIA_ESPECIAL = "TRANSFERENCIA_ESPECIAL"
    TRANSFERENCIA_VOLUNTARIA = "TRANSFERENCIA_VOLUNTARIA"
    FUNDO_A_FUNDO = "FUNDO_A_FUNDO"
    PROGRAMA_ESTADUAL = "PROGRAMA_ESTADUAL"
    PROGRAMA_FEDERAL = "PROGRAMA_FEDERAL"
    CUSTEIO = "CUSTEIO"
    INVESTIMENTO = "INVESTIMENTO"
    AQUISICAO = "AQUISICAO"
    OBRA = "OBRA"
    OUTRO = "OUTRO"


class EsferaRecurso(str, Enum):
    FEDERAL = "FEDERAL"
    ESTADUAL = "ESTADUAL"
    MUNICIPAL = "MUNICIPAL"
    OUTRA = "OUTRA"


class PrioridadeProcesso(str, Enum):
    BAIXA = "BAIXA"
    NORMAL = "NORMAL"
    ALTA = "ALTA"
    URGENTE = "URGENTE"


class SituacaoProcesso(str, Enum):
    OPORTUNIDADE = "OPORTUNIDADE"
    EM_ARTICULACAO = "EM_ARTICULACAO"
    PREPARANDO_PROPOSTA = "PREPARANDO_PROPOSTA"
    PROPOSTA_CADASTRADA = "PROPOSTA_CADASTRADA"
    EM_ANALISE_GOVERNO = "EM_ANALISE_GOVERNO"
    EM_DILIGENCIA = "EM_DILIGENCIA"
    AGUARDANDO_DOCUMENTACAO = "AGUARDANDO_DOCUMENTACAO"
    DOCUMENTACAO_INTERNA = "DOCUMENTACAO_INTERNA"
    AGUARDANDO_APROVACAO = "AGUARDANDO_APROVACAO"
    APROVADO = "APROVADO"
    FORMALIZACAO = "FORMALIZACAO"
    INSTRUMENTO_CELEBRADO = "INSTRUMENTO_CELEBRADO"
    AGUARDANDO_REPASSE = "AGUARDANDO_REPASSE"
    RECURSO_RECEBIDO = "RECURSO_RECEBIDO"
    PREPARANDO_CONTRATACAO = "PREPARANDO_CONTRATACAO"
    EM_LICITACAO = "EM_LICITACAO"
    LICITACAO_CONCLUIDA = "LICITACAO_CONCLUIDA"
    CONTRATO_CELEBRADO = "CONTRATO_CELEBRADO"
    AGUARDANDO_INICIO = "AGUARDANDO_INICIO"
    EM_EXECUCAO = "EM_EXECUCAO"
    OBRA_ANDAMENTO = "OBRA_ANDAMENTO"
    AQUISICAO_ANDAMENTO = "AQUISICAO_ANDAMENTO"
    EM_MEDICAO = "EM_MEDICAO"
    SUSPENSO = "SUSPENSO"
    PARALISADO = "PARALISADO"
    EM_PRESTACAO = "EM_PRESTACAO"
    PRESTACAO_ENVIADA = "PRESTACAO_ENVIADA"
    PRESTACAO_EM_ANALISE = "PRESTACAO_EM_ANALISE"
    PRESTACAO_EM_DILIGENCIA = "PRESTACAO_EM_DILIGENCIA"
    PRESTACAO_APROVADA = "PRESTACAO_APROVADA"
    CONCLUIDO = "CONCLUIDO"
    CANCELADO = "CANCELADO"

    @classmethod
    def default_flow(cls) -> list[str]:
        """Fluxo padrão sugerido na criação."""
        return [
            cls.OPORTUNIDADE.value, cls.EM_ARTICULACAO.value, cls.PREPARANDO_PROPOSTA.value,
            cls.PROPOSTA_CADASTRADA.value, cls.EM_ANALISE_GOVERNO.value, cls.APROVADO.value,
            cls.FORMALIZACAO.value, cls.INSTRUMENTO_CELEBRADO.value, cls.AGUARDANDO_REPASSE.value,
            cls.RECURSO_RECEBIDO.value, cls.EM_LICITACAO.value, cls.CONTRATO_CELEBRADO.value,
            cls.EM_EXECUCAO.value, cls.EM_PRESTACAO.value, cls.PRESTACAO_ENVIADA.value,
            cls.PRESTACAO_APROVADA.value, cls.CONCLUIDO.value,
        ]


class StatusConvenio(str, Enum):
    RASCUNHO = "RASCUNHO"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    SUSPENSO = "SUSPENSO"
    CONCLUIDO = "CONCLUIDO"
    CANCELADO = "CANCELADO"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.RASCUNHO: [cls.EM_ANDAMENTO, cls.CANCELADO],
            cls.EM_ANDAMENTO: [cls.SUSPENSO, cls.CONCLUIDO, cls.CANCELADO],
            cls.SUSPENSO: [cls.EM_ANDAMENTO, cls.CANCELADO],
            cls.CONCLUIDO: [],
            cls.CANCELADO: [],
        }

    def can_transition_to(self, target: "StatusConvenio") -> bool:
        if self == target:
            return True
        return target in self.valid_transitions().get(self, [])

    def assert_transition(self, target: "StatusConvenio") -> None:
        if not self.can_transition_to(target):
            raise ValueError(
                f"Transição inválida de '{self.value}' para '{target.value}' em Convênio"
            )


# ── Etapa ─────────────────────────────────────────────────

class NaturezaEtapa(str, Enum):
    INTERNA = "INTERNA"
    GOVERNO = "GOVERNO"


class StatusEtapa(str, Enum):
    PENDENTE = "PENDENTE"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    AGUARDANDO_GOVERNO = "AGUARDANDO_GOVERNO"
    CONCLUIDA = "CONCLUIDA"
    BLOQUEADA = "BLOQUEADA"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.PENDENTE: [cls.EM_ANDAMENTO, cls.BLOQUEADA],
            cls.EM_ANDAMENTO: [cls.AGUARDANDO_GOVERNO, cls.CONCLUIDA, cls.BLOQUEADA],
            cls.AGUARDANDO_GOVERNO: [cls.EM_ANDAMENTO, cls.CONCLUIDA, cls.BLOQUEADA],
            cls.CONCLUIDA: [],
            cls.BLOQUEADA: [cls.PENDENTE, cls.EM_ANDAMENTO],
        }

    def can_transition_to(self, target: "StatusEtapa") -> bool:
        if self == target:
            return True
        return target in self.valid_transitions().get(self, [])

    def assert_transition(self, target: "StatusEtapa") -> None:
        if not self.can_transition_to(target):
            raise ValueError(
                f"Transição inválida de '{self.value}' para '{target.value}' em Etapa"
            )


# ── Tarefa ────────────────────────────────────────────────

class Prioridade(str, Enum):
    BAIXA = "BAIXA"
    NORMAL = "NORMAL"
    ALTA = "ALTA"
    URGENTE = "URGENTE"


class StatusTarefa(str, Enum):
    """Ciclo de vida da tarefa (§3).

    Independente do status da demanda: concluir a tarefa não conclui a demanda.
    Os estados de espera (AGUARDANDO_*) existem para que o painel mostre *por
    que* a tarefa não anda, em vez de deixá-la parada em "em andamento".
    """

    NAO_INICIADA = "NAO_INICIADA"
    A_FAZER = "A_FAZER"
    AGUARDANDO_ACEITE = "AGUARDANDO_ACEITE"
    RECEBIDA = "RECEBIDA"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    AGUARDANDO_INFORMACAO = "AGUARDANDO_INFORMACAO"
    AGUARDANDO_OUTRO_SETOR = "AGUARDANDO_OUTRO_SETOR"
    AGUARDANDO_TERCEIRO = "AGUARDANDO_TERCEIRO"
    AGUARDANDO_DOCUMENTO = "AGUARDANDO_DOCUMENTO"
    ENTREGUE = "ENTREGUE"
    EM_REVISAO = "EM_REVISAO"
    DEVOLVIDA = "DEVOLVIDA"
    CONTESTADA = "CONTESTADA"
    BLOQUEADA = "BLOQUEADA"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"

    @classmethod
    def esperas(cls) -> list["StatusTarefa"]:
        """Estados em que a tarefa depende de alguém de fora para andar."""
        return [
            cls.AGUARDANDO_INFORMACAO,
            cls.AGUARDANDO_OUTRO_SETOR,
            cls.AGUARDANDO_TERCEIRO,
            cls.AGUARDANDO_DOCUMENTO,
        ]

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        esperas = cls.esperas()
        return {
            cls.NAO_INICIADA: [cls.A_FAZER, cls.AGUARDANDO_ACEITE, cls.EM_ANDAMENTO, cls.CANCELADA],
            cls.A_FAZER: [cls.EM_ANDAMENTO, cls.AGUARDANDO_ACEITE, cls.BLOQUEADA, cls.CANCELADA],
            cls.AGUARDANDO_ACEITE: [cls.RECEBIDA, cls.EM_ANDAMENTO, cls.BLOQUEADA, cls.CANCELADA],
            cls.RECEBIDA: [cls.EM_ANDAMENTO, *esperas, cls.BLOQUEADA, cls.CANCELADA],
            # CONCLUIDA direto de EM_ANDAMENTO é o caminho do servidor de
            # departamento (§158): Iniciar → Concluir, sem obrigá-lo a "entregar"
            # antes. Entrega e revisão continuam existindo para as tarefas que
            # exigem retorno ou aprovação — quem decide isso é a tarefa, não o
            # grafo de estados.
            cls.EM_ANDAMENTO: [
                cls.ENTREGUE, cls.EM_REVISAO, cls.CONTESTADA, cls.BLOQUEADA,
                cls.CONCLUIDA, *esperas, cls.CANCELADA,
            ],
            cls.AGUARDANDO_INFORMACAO: [cls.EM_ANDAMENTO, cls.BLOQUEADA, cls.CANCELADA],
            cls.AGUARDANDO_OUTRO_SETOR: [cls.EM_ANDAMENTO, cls.BLOQUEADA, cls.CANCELADA],
            cls.AGUARDANDO_TERCEIRO: [cls.EM_ANDAMENTO, cls.BLOQUEADA, cls.CANCELADA],
            cls.AGUARDANDO_DOCUMENTO: [cls.EM_ANDAMENTO, cls.BLOQUEADA, cls.CANCELADA],
            cls.ENTREGUE: [cls.CONCLUIDA, cls.EM_REVISAO, cls.DEVOLVIDA, cls.CANCELADA],
            cls.EM_REVISAO: [cls.CONCLUIDA, cls.DEVOLVIDA, cls.EM_ANDAMENTO, cls.CANCELADA],
            cls.DEVOLVIDA: [cls.EM_ANDAMENTO, cls.CANCELADA],
            cls.CONTESTADA: [cls.EM_ANDAMENTO, cls.CANCELADA],
            cls.BLOQUEADA: [cls.EM_ANDAMENTO, cls.A_FAZER, cls.CANCELADA],
            cls.CONCLUIDA: [],
            cls.CANCELADA: [],
        }

    def can_transition_to(self, target: "StatusTarefa") -> bool:
        if self == target:
            return True
        return target in self.valid_transitions().get(self, [])

    def assert_transition(self, target: "StatusTarefa") -> None:
        if not self.can_transition_to(target):
            raise ValueError(
                f"Transição inválida de '{self.value}' para '{target.value}' em Tarefa"
            )

    @classmethod
    def is_aberta(cls, status: "StatusTarefa") -> bool:
        """Tarefa ainda pendente de trabalho — entra no cálculo de atraso."""
        return status in (
            cls.NAO_INICIADA,
            cls.A_FAZER,
            cls.AGUARDANDO_ACEITE,
            cls.RECEBIDA,
            cls.EM_ANDAMENTO,
            cls.CONTESTADA,
            cls.DEVOLVIDA,
            cls.BLOQUEADA,
            *cls.esperas(),
        )


# ── Anexo ─────────────────────────────────────────────────

class TipoDocumento(str, Enum):
    OFICIO = "OFICIO"
    PROJETO = "PROJETO"
    EDITAL = "EDITAL"
    CONTRATO = "CONTRATO"
    FOTO = "FOTO"
    MEDICAO = "MEDICAO"
    OUTRO = "OUTRO"


# ── Evento Timeline ──────────────────────────────────────

class TipoEvento(str, Enum):
    CONVENIO_CRIADO = "CONVENIO_CRIADO"
    PROTOCOLO_REGISTRADO = "PROTOCOLO_REGISTRADO"
    ETAPA_ABERTA = "ETAPA_ABERTA"
    ETAPA_CONCLUIDA = "ETAPA_CONCLUIDA"
    TAREFA_CRIADA = "TAREFA_CRIADA"
    TAREFA_ATRIBUIDA = "TAREFA_ATRIBUIDA"
    TAREFA_ACEITA = "TAREFA_ACEITA"
    TAREFA_ENTREGUE = "TAREFA_ENTREGUE"
    TAREFA_DEVOLVIDA = "TAREFA_DEVOLVIDA"
    TAREFA_CONCLUIDA = "TAREFA_CONCLUIDA"
    PRAZO_DEFINIDO = "PRAZO_DEFINIDO"
    PRAZO_PRORROGADO = "PRAZO_PRORROGADO"
    CONTESTACAO_ABERTA = "CONTESTACAO_ABERTA"
    CONTESTACAO_DECIDIDA = "CONTESTACAO_DECIDIDA"
    ANEXO_ADICIONADO = "ANEXO_ADICIONADO"
    ENCAMINHADO_GOVERNO = "ENCAMINHADO_GOVERNO"
    RESPOSTA_GOVERNO_REGISTRADA = "RESPOSTA_GOVERNO_REGISTRADA"
    STATUS_ALTERADO = "STATUS_ALTERADO"
    DILIGENCIA_RECEBIDA = "DILIGENCIA_RECEBIDA"
    DILIGENCIA_RESPONDIDA = "DILIGENCIA_RESPONDIDA"
    DILIGENCIA_ENCERRADA = "DILIGENCIA_ENCERRADA"
    REPASSE_REGISTRADO = "REPASSE_REGISTRADO"
    MEDICAO_REGISTRADA = "MEDICAO_REGISTRADA"
    MEDICAO_APROVADA = "MEDICAO_APROVADA"
    MOVIMENTO_FINANCEIRO = "MOVIMENTO_FINANCEIRO"
    CONTRATO_CADASTRADO = "CONTRATO_CADASTRADO"
    ADITIVO_REGISTRADO = "ADITIVO_REGISTRADO"
    LICITACAO_VINCULADA = "LICITACAO_VINCULADA"
    PRESTACAO_CRIADA = "PRESTACAO_CRIADA"
    PRESTACAO_ENVIADA = "PRESTACAO_ENVIADA"
    PRESTACAO_APROVADA = "PRESTACAO_APROVADA"
    ENTREGA_REGISTRADA = "ENTREGA_REGISTRADA"
    DOCUMENTO_ENVIADO_EXTERNO = "DOCUMENTO_ENVIADO_EXTERNO"
    AUDITORIA_REGISTRADA = "AUDITORIA_REGISTRADA"
    OBSERVACAO_REGISTRADA = "OBSERVACAO_REGISTRADA"
    # ── Núcleo de demandas (v2) ───────────────────────────
    DEMANDA_CRIADA = "DEMANDA_CRIADA"
    DEMANDA_PUBLICADA = "DEMANDA_PUBLICADA"
    DEMANDA_ATUALIZADA = "DEMANDA_ATUALIZADA"
    DEMANDA_STATUS_ALTERADO = "DEMANDA_STATUS_ALTERADO"
    DEMANDA_ENCAMINHADA = "DEMANDA_ENCAMINHADA"
    DEMANDA_BLOQUEADA = "DEMANDA_BLOQUEADA"
    DEMANDA_DESBLOQUEADA = "DEMANDA_DESBLOQUEADA"
    DEMANDA_CONCLUIDA = "DEMANDA_CONCLUIDA"
    DEMANDA_REABERTA = "DEMANDA_REABERTA"
    DEMANDA_CANCELADA = "DEMANDA_CANCELADA"
    DEMANDA_ARQUIVADA = "DEMANDA_ARQUIVADA"
    PROXIMA_ACAO_DEFINIDA = "PROXIMA_ACAO_DEFINIDA"
    PARTICIPANTE_ADICIONADO = "PARTICIPANTE_ADICIONADO"
    PARTICIPANTE_REMOVIDO = "PARTICIPANTE_REMOVIDO"
    PROTOCOLO_ATUALIZADO = "PROTOCOLO_ATUALIZADO"
    DOCUMENTO_VERSIONADO = "DOCUMENTO_VERSIONADO"
    PRAZO_PROXIMO = "PRAZO_PROXIMO"
    PRAZO_VENCIDO = "PRAZO_VENCIDO"
    AUTOMACAO_EXECUTADA = "AUTOMACAO_EXECUTADA"
    COMENTARIO_ADICIONADO = "COMENTARIO_ADICIONADO"
    CHECKLIST_CRIADO = "CHECKLIST_CRIADO"
    CHECKLIST_ITEM_CONCLUIDO = "CHECKLIST_ITEM_CONCLUIDO"
    CHECKLIST_ITEM_REABERTO = "CHECKLIST_ITEM_REABERTO"
    REGISTRO_FINANCEIRO_LANCADO = "REGISTRO_FINANCEIRO_LANCADO"
    REGISTRO_FINANCEIRO_REMOVIDO = "REGISTRO_FINANCEIRO_REMOVIDO"
    OBRA_VINCULADA = "OBRA_VINCULADA"
    # ── Gestão avançada (v3) ──────────────────────────────
    DEMANDA_RELACIONADA = "DEMANDA_RELACIONADA"
    DEMANDA_RELACIONAMENTO_REMOVIDO = "DEMANDA_RELACIONAMENTO_REMOVIDO"
    DEMANDA_PAI_VINCULADA = "DEMANDA_PAI_VINCULADA"
    MARCO_CRIADO = "MARCO_CRIADO"
    MARCO_CONCLUIDO = "MARCO_CONCLUIDO"
    MARCO_REMOVIDO = "MARCO_REMOVIDO"
    RISCO_REGISTRADO = "RISCO_REGISTRADO"
    RISCO_ATUALIZADO = "RISCO_ATUALIZADO"
    RISCO_REMOVIDO = "RISCO_REMOVIDO"
    CAMPOS_CUSTOMIZADOS_ALTERADOS = "CAMPOS_CUSTOMIZADOS_ALTERADOS"
    ACOES_EM_LOTE = "ACOES_EM_LOTE"
    SLA_CONFIG_ALTERADO = "SLA_CONFIG_ALTERADO"
    WEBHOOK_ENDPOINT_CRIADO = "WEBHOOK_ENDPOINT_CRIADO"
    WEBHOOK_ENTREGUE = "WEBHOOK_ENTREGUE"
    WEBHOOK_FALHOU = "WEBHOOK_FALHOU"
    # ── Assinatura de documento (§78) ─────────────────────
    ASSINATURA_SOLICITADA = "ASSINATURA_SOLICITADA"
    ASSINATURA_EM_REVISAO = "ASSINATURA_EM_REVISAO"
    ASSINATURA_REGISTRADA = "ASSINATURA_REGISTRADA"
    ASSINATURA_CANCELADA = "ASSINATURA_CANCELADA"


# ── Contestação ───────────────────────────────────────────

class StatusContestacao(str, Enum):
    PENDENTE = "PENDENTE"
    APROVADA = "APROVADA"
    REJEITADA = "REJEITADA"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.PENDENTE: [cls.APROVADA, cls.REJEITADA],
            cls.APROVADA: [],
            cls.REJEITADA: [],
        }

    def can_transition_to(self, target: "StatusContestacao") -> bool:
        if self == target:
            return True
        return target in self.valid_transitions().get(self, [])


# ── Notificação ──────────────────────────────────────────

class TipoNotificacao(str, Enum):
    PRAZO_PROXIMO = "PRAZO_PROXIMO"
    PRAZO_VENCIDO = "PRAZO_VENCIDO"
    TAREFA_ATRIBUIDA = "TAREFA_ATRIBUIDA"
    TAREFA_ENTREGUE = "TAREFA_ENTREGUE"
    TAREFA_DEVOLVIDA = "TAREFA_DEVOLVIDA"
    CONTESTACAO_ABERTA = "CONTESTACAO_ABERTA"
    CONTESTACAO_DECIDIDA = "CONTESTACAO_DECIDIDA"
    DILIGENCIA_RECEBIDA = "DILIGENCIA_RECEBIDA"
    DILIGENCIA_RESPONDIDA = "DILIGENCIA_RESPONDIDA"
    PRESTACAO_ENVIADA = "PRESTACAO_ENVIADA"
    REPASSE_RECEBIDO = "REPASSE_RECEBIDO"
    COMENTARIO_MENCAO = "COMENTARIO_MENCAO"
    ATRASO_ESCALADO = "ATRASO_ESCALADO"
    PROTOCOLO_ATUALIZADO = "PROTOCOLO_ATUALIZADO"


class CanalNotificacao(str, Enum):
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"


# ── Diligência / Pendência Externa ─────────────────────────

class OrigemDiligencia(str, Enum):
    GOVERNO_FEDERAL = "GOVERNO_FEDERAL"
    GOVERNO_ESTADUAL = "GOVERNO_ESTADUAL"
    CONCEDENTE = "CONCEDENTE"
    MANDATARIA = "MANDATARIA"
    CONTROLE_INTERNO = "CONTROLE_INTERNO"
    OUTRO = "OUTRO"


class StatusDiligencia(str, Enum):
    RECEBIDA = "RECEBIDA"
    DISTRIBUIDA = "DISTRIBUIDA"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    RESPONDIDA_INTERNAMENTE = "RESPONDIDA_INTERNAMENTE"
    PROTOCOLADA = "PROTOCOLADA"
    ACEITA = "ACEITA"
    NOVA_CORRECAO_SOLICITADA = "NOVA_CORRECAO_SOLICITADA"
    ENCERRADA = "ENCERRADA"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.RECEBIDA: [cls.DISTRIBUIDA, cls.EM_ATENDIMENTO, cls.ENCERRADA],
            cls.DISTRIBUIDA: [cls.EM_ATENDIMENTO, cls.ENCERRADA],
            cls.EM_ATENDIMENTO: [
                cls.RESPONDIDA_INTERNAMENTE, cls.ENCERRADA,
            ],
            cls.RESPONDIDA_INTERNAMENTE: [cls.PROTOCOLADA, cls.ENCERRADA],
            cls.PROTOCOLADA: [cls.ACEITA, cls.NOVA_CORRECAO_SOLICITADA, cls.ENCERRADA],
            cls.NOVA_CORRECAO_SOLICITADA: [cls.EM_ATENDIMENTO, cls.ENCERRADA],
            cls.ACEITA: [cls.ENCERRADA],
            cls.ENCERRADA: [],
        }

    def can_transition_to(self, target: "StatusDiligencia") -> bool:
        if self == target:
            return True
        return target in self.valid_transitions().get(self, [])

    def assert_transition(self, target: "StatusDiligencia") -> None:
        if not self.can_transition_to(target):
            raise ValueError(
                f"Transição inválida de '{self.value}' para '{target.value}' em Diligência"
            )


# ── Repasse / Transferência ────────────────────────────────

class StatusRepasse(str, Enum):
    PREVISTO = "PREVISTO"
    RECEBIDO = "RECEBIDO"
    ATRASADO = "ATRASADO"
    CANCELADO = "CANCELADO"


# ── Medição ────────────────────────────────────────────────

class StatusMedicao(str, Enum):
    REGISTRADA = "REGISTRADA"
    EM_ANALISE = "EM_ANALISE"
    APROVADA = "APROVADA"
    REPROVADA = "REPROVADA"
    PAGA = "PAGA"


# ── Prestação de Contas ────────────────────────────────────

class StatusPrestacao(str, Enum):
    EM_PREPARACAO = "EM_PREPARACAO"
    PRONTA = "PRONTA"
    ENVIADA = "ENVIADA"
    EM_ANALISE = "EM_ANALISE"
    EM_DILIGENCIA = "EM_DILIGENCIA"
    APROVADA = "APROVADA"
    APROVADA_COM_OBSERVACAO = "APROVADA_COM_OBSERVACAO"
    REJEITADA = "REJEITADA"
    ENCERRADA = "ENCERRADA"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.EM_PREPARACAO: [cls.PRONTA, cls.ENVIADA, cls.ENCERRADA],
            cls.PRONTA: [cls.ENVIADA, cls.EM_DILIGENCIA, cls.ENCERRADA],
            cls.ENVIADA: [cls.EM_ANALISE, cls.EM_DILIGENCIA, cls.ENCERRADA],
            cls.EM_ANALISE: [
                cls.APROVADA, cls.APROVADA_COM_OBSERVACAO, cls.REJEITADA,
                cls.EM_DILIGENCIA, cls.ENCERRADA,
            ],
            cls.EM_DILIGENCIA: [cls.EM_ANALISE, cls.APROVADA, cls.REJEITADA, cls.ENCERRADA],
            cls.APROVADA: [cls.ENCERRADA],
            cls.APROVADA_COM_OBSERVACAO: [cls.ENCERRADA],
            cls.REJEITADA: [cls.EM_PREPARACAO, cls.EM_DILIGENCIA, cls.ENCERRADA],
            cls.ENCERRADA: [],
        }

    def can_transition_to(self, target: "StatusPrestacao") -> bool:
        if self == target:
            return True
        return target in self.valid_transitions().get(self, [])

    def assert_transition(self, target: "StatusPrestacao") -> None:
        if not self.can_transition_to(target):
            raise ValueError(
                f"Transição inválida de '{self.value}' para '{target.value}' em Prestação de Contas"
            )


# ── Movimento Financeiro ───────────────────────────────────

class TipoMovimento(str, Enum):
    EMPENHO = "EMPENHO"
    LIQUIDACAO = "LIQUIDACAO"
    PAGAMENTO = "PAGAMENTO"
    REPASSE_RECEBIDO = "REPASSE_RECEBIDO"
    RENDIMENTO = "RENDIMENTO"
    DEVOLUCAO = "DEVOLUCAO"
    OUTRO = "OUTRO"


# ── Contrato ───────────────────────────────────────────────

class StatusContrato(str, Enum):
    RASCUNHO = "RASCUNHO"
    ASSINADO = "ASSINADO"
    EM_VIGENCIA = "EM_VIGENCIA"
    CONCLUIDO = "CONCLUIDO"
    ENCERRADO = "ENCERRADO"
    RESCINDIDO = "RESCINDIDO"


class TipoAditivo(str, Enum):
    PRAZO = "PRAZO"
    VALOR = "VALOR"
    OBJETO = "OBJETO"
    OUTRO = "OUTRO"


# ── Licitação ──────────────────────────────────────────────

class StatusLicitacao(str, Enum):
    PREPARATORIA = "PREPARATORIA"
    EDITAL_PUBLICADO = "EDITAL_PUBLICADO"
    EM_DISPUTA = "EM_DISPUTA"
    JULGAMENTO = "JULGAMENTO"
    HOMOLOGADA = "HOMOLOGADA"
    ADJUDICADA = "ADJUDICADA"
    ANULADA = "ANULADA"
    DESERTA = "DESERTA"


# ── Entrega de Objeto ──────────────────────────────────────

class TipoEntrega(str, Enum):
    OBRA = "OBRA"
    AQUISICAO = "AQUISICAO"
    SERVICO = "SERVICO"
    OUTRO = "OUTRO"


# ── Classificação de Documento ─────────────────────────────

class ClassificacaoDocumento(str, Enum):
    PUBLICO = "PUBLICO"
    INTERNO = "INTERNO"
    RESTRITO = "RESTRITO"
    SIGILOSO = "SIGILOSO"


class CategoriaDocumento(str, Enum):
    PROPOSTA = "PROPOSTA"
    JURIDICO = "JURIDICO"
    ENGENHARIA = "ENGENHARIA"
    LICITACAO = "LICITACAO"
    CONTRATO = "CONTRATO"
    EXECUCAO = "EXECUCAO"
    MEDICOES = "MEDICOES"
    FINANCEIRO = "FINANCEIRO"
    PRESTACAO_CONTAS = "PRESTACAO_CONTAS"
    FOTOS = "FOTOS"
    DOCUMENTOS_EXTERNOS = "DOCUMENTOS_EXTERNOS"
    OUTROS = "OUTROS"


# ── Entrega / Inauguração ──────────────────────────────────

class StatusEntrega(str, Enum):
    REGISTRADA = "REGISTRADA"
    RECEBIMENTO_PROVISORIO = "RECEBIMENTO_PROVISORIO"
    RECEBIMENTO_DEFINITIVO = "RECEBIMENTO_DEFINITIVO"
    INAUGURADA = "INAUGURADA"
    ENCERRADA = "ENCERRADA"


# ══════════════════════════════════════════════════════════
# GovTask v2 — núcleo de Demandas
# ══════════════════════════════════════════════════════════

class ConfidencialidadeDemanda(str, Enum):
    """Quem pode enxergar a demanda (§96)."""

    NORMAL = "NORMAL"
    INTERNA = "INTERNA"
    RESTRITA = "RESTRITA"
    CONFIDENCIAL = "CONFIDENCIAL"


class OrigemDemanda(str, Enum):
    """De onde a demanda surgiu (§6). Complementado por `origem_descricao`."""

    DETERMINACAO_PREFEITO = "DETERMINACAO_PREFEITO"
    REUNIAO = "REUNIAO"
    CONVERSA = "CONVERSA"
    LIGACAO = "LIGACAO"
    WHATSAPP = "WHATSAPP"
    EMAIL = "EMAIL"
    OFICIO = "OFICIO"
    SOLICITACAO_INTERNA = "SOLICITACAO_INTERNA"
    SECRETARIO = "SECRETARIO"
    VEREADOR = "VEREADOR"
    DEPUTADO_ESTADUAL = "DEPUTADO_ESTADUAL"
    DEPUTADO_FEDERAL = "DEPUTADO_FEDERAL"
    SENADOR = "SENADOR"
    GOVERNO_ESTADUAL = "GOVERNO_ESTADUAL"
    GOVERNO_FEDERAL = "GOVERNO_FEDERAL"
    MINISTERIO = "MINISTERIO"
    SECRETARIA_ESTADUAL = "SECRETARIA_ESTADUAL"
    CIDADAO = "CIDADAO"
    EMPRESA = "EMPRESA"
    ORGAO_CONTROLE = "ORGAO_CONTROLE"
    PROCESSO_ADMINISTRATIVO = "PROCESSO_ADMINISTRATIVO"
    SISTEMA_EXTERNO = "SISTEMA_EXTERNO"
    OUTRO = "OUTRO"


class PrioridadeDemanda(str, Enum):
    """Prioridade da demanda (§44). Superconjunto de `Prioridade` das tarefas."""

    BAIXA = "BAIXA"
    NORMAL = "NORMAL"
    ALTA = "ALTA"
    URGENTE = "URGENTE"
    CRITICA = "CRITICA"

    @classmethod
    def peso(cls, valor: "str | PrioridadeDemanda") -> int:
        """Ordem de urgência — usada para ordenar listas e filas de atenção."""
        ordem = {
            cls.BAIXA: 0, cls.NORMAL: 1, cls.ALTA: 2,
            cls.URGENTE: 3, cls.CRITICA: 4,
        }
        try:
            return ordem[cls(valor)]
        except ValueError:
            return 1


class PapelParticipante(str, Enum):
    """Matriz de responsabilidades (§76), inspirada em RACI."""

    RESPONSAVEL = "RESPONSAVEL"
    APROVADOR = "APROVADOR"
    COLABORADOR = "COLABORADOR"
    CONSULTADO = "CONSULTADO"
    INFORMADO = "INFORMADO"


class TipoAutoridade(str, Enum):
    """Cadastro de autoridades e instituições externas (§7)."""

    DEPUTADO_FEDERAL = "DEPUTADO_FEDERAL"
    DEPUTADO_ESTADUAL = "DEPUTADO_ESTADUAL"
    SENADOR = "SENADOR"
    VEREADOR = "VEREADOR"
    MINISTRO = "MINISTRO"
    SECRETARIO_ESTADUAL = "SECRETARIO_ESTADUAL"
    SECRETARIO_MUNICIPAL = "SECRETARIO_MUNICIPAL"
    ORGAO = "ORGAO"
    MINISTERIO = "MINISTERIO"
    INSTITUICAO = "INSTITUICAO"
    ENTIDADE = "ENTIDADE"
    ASSOCIACAO = "ASSOCIACAO"
    EMPRESA = "EMPRESA"
    OUTRO = "OUTRO"


class StatusProtocolo(str, Enum):
    """Acompanhamento de protocolo em sistema externo (§34)."""

    PROTOCOLADO = "PROTOCOLADO"
    EM_ANALISE = "EM_ANALISE"
    EM_DILIGENCIA = "EM_DILIGENCIA"
    DOCUMENTACAO_COMPLEMENTAR = "DOCUMENTACAO_COMPLEMENTAR"
    APROVADO = "APROVADO"
    REJEITADO = "REJEITADO"
    ARQUIVADO = "ARQUIVADO"


class TipoRegistroFinanceiro(str, Enum):
    """Natureza de um lançamento financeiro gerencial da demanda (§61)."""

    PREVISAO = "PREVISAO"
    APROVACAO = "APROVACAO"
    CONTRAPARTIDA = "CONTRAPARTIDA"
    LICITADO = "LICITADO"
    CONTRATADO = "CONTRATADO"
    EMPENHO = "EMPENHO"
    LIQUIDACAO = "LIQUIDACAO"
    PAGAMENTO = "PAGAMENTO"
    NOTA_FISCAL = "NOTA_FISCAL"
    REPASSE_RECEBIDO = "REPASSE_RECEBIDO"
    DEVOLUCAO = "DEVOLUCAO"
    OUTRO = "OUTRO"


class TipoTarefa(str, Enum):
    """Natureza da tarefa (§77, §23)."""

    EXECUCAO = "EXECUCAO"
    APROVACAO = "APROVACAO"
    INFORMACAO = "INFORMACAO"
    REVISAO = "REVISAO"


class TipoMovimentacaoTarefa(str, Enum):
    """O que originou a mudança de mãos da tarefa (§20, §22, §23)."""

    ATRIBUICAO = "ATRIBUICAO"
    ENCAMINHAMENTO = "ENCAMINHAMENTO"
    DEVOLUCAO = "DEVOLUCAO"
    SOLICITACAO_INFORMACAO = "SOLICITACAO_INFORMACAO"
    REATRIBUICAO = "REATRIBUICAO"
    RETORNO = "RETORNO"


class TipoFeriado(str, Enum):
    """Origem do feriado, para o calendário municipal (§36)."""

    NACIONAL = "NACIONAL"
    ESTADUAL = "ESTADUAL"
    MUNICIPAL = "MUNICIPAL"
    PONTO_FACULTATIVO = "PONTO_FACULTATIVO"


class SeveridadeAlerta(str, Enum):
    """Classificação da central de alertas (§40).

    A severidade ordena a fila de atenção; a interface nunca depende só da cor
    para comunicá-la (§13, §107).
    """

    INFORMACAO = "INFORMACAO"
    AVISO = "AVISO"
    IMPORTANTE = "IMPORTANTE"
    URGENTE = "URGENTE"
    CRITICO = "CRITICO"

    @classmethod
    def peso(cls, valor: "str | SeveridadeAlerta") -> int:
        ordem = {
            cls.INFORMACAO: 0, cls.AVISO: 1, cls.IMPORTANTE: 2,
            cls.URGENTE: 3, cls.CRITICO: 4,
        }
        try:
            return ordem[cls(valor)]
        except ValueError:
            return 0


class TipoAlerta(str, Enum):
    """O que o alerta está dizendo (§40)."""

    PRAZO_PROXIMO = "PRAZO_PROXIMO"
    PRAZO_VENCIDO = "PRAZO_VENCIDO"
    TAREFA_ATRASADA = "TAREFA_ATRASADA"
    TAREFA_SEM_ACEITE = "TAREFA_SEM_ACEITE"
    DEMANDA_PARADA = "DEMANDA_PARADA"
    DEMANDA_BLOQUEADA = "DEMANDA_BLOQUEADA"
    AGUARDANDO_TERCEIRO = "AGUARDANDO_TERCEIRO"
    ETAPA_ATRASADA = "ETAPA_ATRASADA"
    PROTOCOLO_SEM_RESPOSTA = "PROTOCOLO_SEM_RESPOSTA"
    FOLLOWUP_DEVIDO = "FOLLOWUP_DEVIDO"
    CONVENIO_VENCENDO = "CONVENIO_VENCENDO"
    ESCALONAMENTO = "ESCALONAMENTO"


class ModoEtapa(str, Enum):
    """Como a etapa se relaciona com as de mesma ordem (§25)."""

    SEQUENCIAL = "SEQUENCIAL"
    PARALELA = "PARALELA"


class RegraConclusaoEtapa(str, Enum):
    """O que precisa acontecer para a etapa ser dada por concluída."""

    TODAS_TAREFAS = "TODAS_TAREFAS"
    QUALQUER_TAREFA = "QUALQUER_TAREFA"
    MANUAL = "MANUAL"


class StatusWorkflowVersao(str, Enum):
    RASCUNHO = "RASCUNHO"
    PUBLICADA = "PUBLICADA"
    ARQUIVADA = "ARQUIVADA"


class TipoContagemPrazo(str, Enum):
    """Como um prazo é contado (§36)."""

    DIAS_CORRIDOS = "DIAS_CORRIDOS"
    DIAS_UTEIS = "DIAS_UTEIS"
    DATA_FIXA = "DATA_FIXA"
    HORAS = "HORAS"


# ══════════════════════════════════════════════════════════
# GovTask v3 — gestão avançada (relacionamento, risco, marco,
# campos customizados, SLA e webhooks)
# ══════════════════════════════════════════════════════════

class TipoRelacionamentoDemanda(str, Enum):
    """Vínculo entre demandas (§220).

    Pai/filha é hierarquia: a filha tem `demanda_pai_id`. Aqui ficam os vínculos
    laterais, que não mudam quem manda em quem.
    """

    RELACIONADA = "RELACIONADA"
    DEPENDENTE = "DEPENDENTE"
    DUPLICADA = "DUPLICADA"


class StatusMarco(str, Enum):
    """Situação de um marco do projeto (§213)."""

    PENDENTE = "PENDENTE"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    CONCLUIDO = "CONCLUIDO"
    CANCELADO = "CANCELADO"


class NivelRisco(str, Enum):
    """Severidade derivada de probabilidade × impacto (§211)."""

    BAIXO = "BAIXO"
    MEDIO = "MEDIO"
    ALTO = "ALTO"
    CRITICO = "CRITICO"


class StatusRisco(str, Enum):
    """Ciclo de vida do risco registrado (§211)."""

    IDENTIFICADO = "IDENTIFICADO"
    EM_MITIGACAO = "EM_MITIGACAO"
    MITIGADO = "MITIGADO"
    MATERIALIZADO = "MATERIALIZADO"
    ENCERRADO = "ENCERRADO"


class TipoCampoCustomizado(str, Enum):
    """Tipos aceitos em campo adicional por tipo de demanda (§205)."""

    TEXTO = "TEXTO"
    TEXTO_LONGO = "TEXTO_LONGO"
    NUMERO = "NUMERO"
    MOEDA = "MOEDA"
    DATA = "DATA"
    SELECAO = "SELECAO"
    MULTIPLA_ESCOLHA = "MULTIPLA_ESCOLHA"
    BOOLEANO = "BOOLEANO"
    USUARIO = "USUARIO"
    DEPARTAMENTO = "DEPARTAMENTO"
    URL = "URL"


class TipoContagemSla(str, Enum):
    """Como o SLA interno conta o tempo (§153)."""

    HORAS = "HORAS"
    DIAS_CORRIDOS = "DIAS_CORRIDOS"
    DIAS_UTEIS = "DIAS_UTEIS"


class StatusWebhookEntrega(str, Enum):
    """Resultado de uma tentativa de entrega de webhook (§196)."""

    PENDENTE = "PENDENTE"
    SUCESSO = "SUCESSO"
    FALHA = "FALHA"
    DESCARTADO = "DESCARTADO"


# ── Assinatura de documento (§78) ─────────────────────────
class StatusAssinatura(str, Enum):
    """Ciclo de vida da assinatura de um documento.

    `ASSINADO` só é alcançado por evidência do módulo de assinatura (referência
    e hash) entregue por rota interna — nunca por um usuário comum trocando o
    status na mão, o que seria uma assinatura simulada.
    """

    RASCUNHO = "RASCUNHO"
    EM_REVISAO = "EM_REVISAO"
    AGUARDANDO_ASSINATURA = "AGUARDANDO_ASSINATURA"
    ASSINADO = "ASSINADO"
    CANCELADO = "CANCELADO"
