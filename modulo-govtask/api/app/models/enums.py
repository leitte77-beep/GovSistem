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
    AGUARDANDO_ACEITE = "AGUARDANDO_ACEITE"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    ENTREGUE = "ENTREGUE"
    DEVOLVIDA = "DEVOLVIDA"
    CONTESTADA = "CONTESTADA"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"

    @classmethod
    def valid_transitions(cls) -> dict[str, list[str]]:
        return {
            cls.AGUARDANDO_ACEITE: [cls.EM_ANDAMENTO, cls.CANCELADA],
            cls.EM_ANDAMENTO: [
                cls.ENTREGUE, cls.CONTESTADA, cls.CANCELADA,
            ],
            cls.ENTREGUE: [cls.CONCLUIDA, cls.DEVOLVIDA, cls.CANCELADA],
            cls.DEVOLVIDA: [cls.EM_ANDAMENTO, cls.CANCELADA],
            cls.CONTESTADA: [cls.EM_ANDAMENTO, cls.CANCELADA],
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
        return status in (
            cls.AGUARDANDO_ACEITE,
            cls.EM_ANDAMENTO,
            cls.CONTESTADA,
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
