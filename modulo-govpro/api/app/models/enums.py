"""Enums de domínio do GovPro (SPE).

Cada enum corresponde a uma regra de negócio; valores são persistidos como
strings e devem ser estáveis (evitar renomear após dados em produção).
"""

from enum import Enum


# ── Perfis de acesso do módulo (RBAC por papel + escopo de unidade) ──────────
class RoleName(str, Enum):
    ADMIN = "ADMIN"
    SERVIDOR = "SERVIDOR"
    CHEFE_UNIDADE = "CHEFE_UNIDADE"
    PROTOCOLO = "PROTOCOLO"
    AUTORIDADE_SIGNATARIA = "AUTORIDADE_SIGNATARIA"
    GESTOR_SIGILO = "GESTOR_SIGILO"
    ARQUIVISTA = "ARQUIVISTA"
    DPO = "DPO"
    AUDITOR = "AUDITOR"


# ── Níveis de acesso (LAI art. 23 ss.; informação pessoal art. 31) ───────────
class NivelAcesso(str, Enum):
    PUBLICO = "PUBLICO"
    RESTRITO = "RESTRITO"
    SIGILOSO = "SIGILOSO"


class GrauSigilo(str, Enum):
    """Graus de classificação de informação sigilosa (LAI art. 24)."""

    RESERVADO = "RESERVADO"  # até 5 anos
    SECRETO = "SECRETO"  # até 15 anos
    ULTRASSECRETO = "ULTRASSECRETO"  # até 25 anos


# ── Máquina de estados do processo ───────────────────────────────────────────
class SituacaoProcesso(str, Enum):
    EM_TRAMITACAO = "EM_TRAMITACAO"
    SOBRESTADO = "SOBRESTADO"
    ENCERRADO = "ENCERRADO"
    ARQUIVADO = "ARQUIVADO"


class SituacaoDocumento(str, Enum):
    RASCUNHO = "RASCUNHO"
    EM_ASSINATURA = "EM_ASSINATURA"  # parcialmente assinado (aguardando demais signatários)
    ASSINADO = "ASSINADO"
    PUBLICADO = "PUBLICADO"
    DESENTRANHADO = "DESENTRANHADO"


class FormatoDocumento(str, Enum):
    NATO_DIGITAL = "NATO_DIGITAL"
    DIGITALIZADO = "DIGITALIZADO"
    CAPTURADO = "CAPTURADO"


class NivelAssinatura(str, Enum):
    """Lei 14.063/2020: simples / avançada / qualificada."""

    SIMPLES = "SIMPLES"
    AVANCADA = "AVANCADA"
    QUALIFICADA = "QUALIFICADA"


class TipoPessoa(str, Enum):
    PF = "PF"
    PJ = "PJ"


class EstadoProcessoUnidade(str, Enum):
    RECEBIDO = "RECEBIDO"
    EM_ANALISE = "EM_ANALISE"
    CONCLUIDO = "CONCLUIDO"
    DEVOLVIDO = "DEVOLVIDO"


class TipoTramitacao(str, Enum):
    ENVIO = "ENVIO"
    DEVOLUCAO = "DEVOLUCAO"
    REENCAMINHAMENTO = "REENCAMINHAMENTO"


class TipoEvento(str, Enum):
    """Eventos da linha do tempo (andamentos) do processo."""

    AUTUACAO = "AUTUACAO"
    JUNTADA = "JUNTADA"
    PRODUCAO_DOCUMENTO = "PRODUCAO_DOCUMENTO"
    ASSINATURA = "ASSINATURA"
    TRAMITACAO = "TRAMITACAO"
    DEVOLUCAO = "DEVOLUCAO"
    DESENTRANHAMENTO = "DESENTRANHAMENTO"
    SOBRESTAMENTO = "SOBRESTAMENTO"
    REATIVACAO = "REATIVACAO"
    DESPACHO = "DESPACHO"
    ENCERRAMENTO = "ENCERRAMENTO"
    REABERTURA = "REABERTURA"
    OUTRO = "OUTRO"


class ActorTipo(str, Enum):
    INTERNO = "INTERNO"
    EXTERNO = "EXTERNO"
    SISTEMA = "SISTEMA"


class AuditAction(str, Enum):
    """Ações registradas na trilha (prova, não log de debug)."""

    LOGIN = "LOGIN"
    LOGIN_FALHA = "LOGIN_FALHA"
    LOGOUT = "LOGOUT"
    LEITURA = "LEITURA"
    CRIACAO = "CRIACAO"
    EDICAO = "EDICAO"
    ASSINATURA = "ASSINATURA"
    CANCELAMENTO = "CANCELAMENTO"
    TRAMITACAO = "TRAMITACAO"
    MUDANCA_NIVEL_ACESSO = "MUDANCA_NIVEL_ACESSO"
    CLASSIFICACAO = "CLASSIFICACAO"
    CONCESSAO_CREDENCIAL = "CONCESSAO_CREDENCIAL"
    REVOGACAO_CREDENCIAL = "REVOGACAO_CREDENCIAL"
    DOWNLOAD = "DOWNLOAD"
    EXPORTACAO = "EXPORTACAO"
    ELIMINACAO = "ELIMINACAO"
    PARAMETRIZACAO = "PARAMETRIZACAO"
    SEED = "SEED"


class EstrategiaNumeracao(str, Enum):
    NUP17 = "NUP17"
    SEQUENCIAL_SIMPLES = "SEQUENCIAL_SIMPLES"
    CUSTOM = "CUSTOM"


# ── Cidadão / peticionamento (Fase 3) ────────────────────────────────────────
class TipoPeticionamento(str, Enum):
    NOVO = "NOVO"
    INTERCORRENTE = "INTERCORRENTE"


class StatusPeticionamento(str, Enum):
    RASCUNHO = "RASCUNHO"
    CONCLUIDO = "CONCLUIDO"
    REJEITADO = "REJEITADO"


class StatusIntimacao(str, Enum):
    DISPONIBILIZADA = "DISPONIBILIZADA"
    CONSULTADA = "CONSULTADA"
    CIENTE = "CIENTE"
    DECURSO = "DECURSO"


class TipoManifestacao(str, Enum):
    """Lei 13.460/2017 — canal de ouvidoria."""

    DENUNCIA = "DENUNCIA"
    RECLAMACAO = "RECLAMACAO"
    ELOGIO = "ELOGIO"
    SUGESTAO = "SUGESTAO"
    SOLICITACAO = "SOLICITACAO"


# ── Prazos e gestão (Fase 4) ─────────────────────────────────────────────────
class TipoPrazo(str, Enum):
    LEGAL = "LEGAL"
    INTERNO = "INTERNO"
    INTIMACAO = "INTIMACAO"
    RECURSO = "RECURSO"


class ModoContagem(str, Enum):
    CORRIDOS = "CORRIDOS"
    UTEIS = "UTEIS"


class EscopoFeriado(str, Enum):
    NACIONAL = "NACIONAL"
    ESTADUAL = "ESTADUAL"
    MUNICIPAL = "MUNICIPAL"


class TipoIndisponibilidade(str, Enum):
    PROGRAMADA = "PROGRAMADA"
    INCIDENTE = "INCIDENTE"


# ── Arquivística (Fase 5) ────────────────────────────────────────────────────
class FaseCicloVida(str, Enum):
    """Ciclo de vida do documento (e-ARQ Brasil / CONARQ)."""

    CORRENTE = "CORRENTE"
    INTERMEDIARIA = "INTERMEDIARIA"
    PERMANENTE = "PERMANENTE"


class DestinacaoFinal(str, Enum):
    ELIMINACAO = "ELIMINACAO"
    GUARDA_PERMANENTE = "GUARDA_PERMANENTE"


class StatusEliminacao(str, Enum):
    ELABORACAO = "ELABORACAO"
    APROVADA = "APROVADA"
    EDITAL_PUBLICADO = "EDITAL_PUBLICADO"
    ELIMINADA = "ELIMINADA"


class TipoMovimentacaoArquivistica(str, Enum):
    TRANSFERENCIA = "TRANSFERENCIA"
    RECOLHIMENTO = "RECOLHIMENTO"
