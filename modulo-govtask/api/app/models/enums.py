from enum import Enum


# ── Convênio ──────────────────────────────────────────────

class TipoConvenio(str, Enum):
    OBRA = "OBRA"
    AQUISICAO = "AQUISICAO"
    SERVICO = "SERVICO"
    OUTRO = "OUTRO"


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


class CanalNotificacao(str, Enum):
    IN_APP = "IN_APP"
    EMAIL = "EMAIL"
