from enum import Enum


class UnitType(str, Enum):
    """Tipos de unidade da rede SUAS + entidades da rede."""

    CRAS = "CRAS"
    CREAS = "CREAS"
    CENTRO_POP = "CENTRO_POP"
    CENTRO_DIA = "CENTRO_DIA"
    ACOLHIMENTO = "ACOLHIMENTO"
    SEDE = "SEDE"
    ENTIDADE_REDE = "ENTIDADE_REDE"


class ProtecaoNivel(str, Enum):
    """Nível de proteção da Tipificação Nacional (Res. CNAS 109/2009)."""

    BASICA = "BASICA"
    ESPECIAL_MEDIA = "ESPECIAL_MEDIA"
    ESPECIAL_ALTA = "ESPECIAL_ALTA"


class DomainSource(str, Enum):
    """Origem de um registro de domínio configurável por tenant."""

    NACIONAL = "NACIONAL"
    LOCAL = "LOCAL"


class ReferralArea(str, Enum):
    """Área de destino dos códigos de encaminhamento (Prontuário SUAS)."""

    SAUDE = "SAUDE"
    EDUCACAO = "EDUCACAO"
    CONSELHO_TUTELAR = "CONSELHO_TUTELAR"
    CADUNICO = "CADUNICO"
    INSS_BPC = "INSS_BPC"
    TRABALHO_RENDA = "TRABALHO_RENDA"
    JUDICIARIO = "JUDICIARIO"
    REDE_SOCIOASSISTENCIAL = "REDE_SOCIOASSISTENCIAL"
    OUTRO = "OUTRO"


class BenefitCategory(str, Enum):
    """Categorias de benefícios eventuais (base nacional; valores por tenant)."""

    NATALIDADE = "NATALIDADE"
    FUNERAL = "FUNERAL"
    ALIMENTACAO = "ALIMENTACAO"
    CALAMIDADE = "CALAMIDADE"
    PASSAGEM = "PASSAGEM"
    DOCUMENTACAO = "DOCUMENTACAO"
    OUTRO = "OUTRO"


class AuditAction(str, Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    READ = "READ"
    LOGIN = "LOGIN"
    SEED = "SEED"
    MERGE = "MERGE"


# ── Famílias e pessoas (FASE 2) ───────────────────────────────────
class Sexo(str, Enum):
    FEMININO = "FEMININO"
    MASCULINO = "MASCULINO"
    OUTRO = "OUTRO"
    NAO_INFORMADO = "NAO_INFORMADO"


class Parentesco(str, Enum):
    RESPONSAVEL = "RESPONSAVEL"
    CONJUGE = "CONJUGE"
    FILHO = "FILHO"
    ENTEADO = "ENTEADO"
    PAI = "PAI"
    MAE = "MAE"
    AVO = "AVO"
    NETO = "NETO"
    IRMAO = "IRMAO"
    OUTRO_PARENTE = "OUTRO_PARENTE"
    NAO_PARENTE = "NAO_PARENTE"


class Escolaridade(str, Enum):
    NAO_ALFABETIZADO = "NAO_ALFABETIZADO"
    FUNDAMENTAL_INCOMPLETO = "FUNDAMENTAL_INCOMPLETO"
    FUNDAMENTAL_COMPLETO = "FUNDAMENTAL_COMPLETO"
    MEDIO_INCOMPLETO = "MEDIO_INCOMPLETO"
    MEDIO_COMPLETO = "MEDIO_COMPLETO"
    SUPERIOR_INCOMPLETO = "SUPERIOR_INCOMPLETO"
    SUPERIOR_COMPLETO = "SUPERIOR_COMPLETO"
    NAO_INFORMADO = "NAO_INFORMADO"


class TipoDeficiencia(str, Enum):
    NENHUMA = "NENHUMA"
    FISICA = "FISICA"
    VISUAL = "VISUAL"
    AUDITIVA = "AUDITIVA"
    INTELECTUAL = "INTELECTUAL"
    MENTAL_PSICOSSOCIAL = "MENTAL_PSICOSSOCIAL"
    MULTIPLA = "MULTIPLA"
    OUTRA = "OUTRA"


class FaixaRenda(str, Enum):
    """Faixas de renda familiar per capita (referência CadÚnico/Bolsa Família)."""

    EXTREMA_POBREZA = "EXTREMA_POBREZA"
    POBREZA = "POBREZA"
    BAIXA_RENDA = "BAIXA_RENDA"
    ACIMA_MEIO_SM = "ACIMA_MEIO_SM"
    NAO_INFORMADO = "NAO_INFORMADO"


class MembershipStatus(str, Enum):
    ATIVO = "ATIVO"
    TRANSFERIDO = "TRANSFERIDO"
    DESLIGADO = "DESLIGADO"


# ── Prontuário e atendimentos (FASE 3) ────────────────────────────
class CaseFileStatus(str, Enum):
    ATIVO = "ATIVO"
    ARQUIVADO = "ARQUIVADO"


class TipoAtendimento(str, Enum):
    INDIVIDUAL = "INDIVIDUAL"
    FAMILIAR = "FAMILIAR"
    GRUPO = "GRUPO"
    VISITA_DOMICILIAR = "VISITA_DOMICILIAR"
    ACAO_COLETIVA = "ACAO_COLETIVA"


class StatusRecepcao(str, Enum):
    AGUARDANDO = "AGUARDANDO"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    ATENDIDO = "ATENDIDO"
    DESISTIU = "DESISTIU"
    ENCAMINHADO = "ENCAMINHADO"


class TipoDocumento(str, Enum):
    """Tipos de documento anexável ao prontuário/atendimento."""

    DOCUMENTO_PESSOAL = "DOCUMENTO_PESSOAL"
    COMPROVANTE = "COMPROVANTE"
    LAUDO = "LAUDO"
    PARECER = "PARECER"
    FOTO = "FOTO"
    OFICIO = "OFICIO"
    OUTRO = "OUTRO"


class AuditAccessType(str, Enum):
    WRITE = "WRITE"
    READ_SENSIVEL = "READ_SENSIVEL"


# ── Acompanhamento, planos e PIA (FASE 4) ─────────────────────────
class AcompanhamentoTipo(str, Enum):
    PAIF = "PAIF"
    PAEFI = "PAEFI"
    MSE_LA = "MSE-LA"
    MSE_PSC = "MSE-PSC"


class AcompanhamentoSituacao(str, Enum):
    ATIVO = "ATIVO"
    SUSPENSO = "SUSPENSO"
    ENCERRADO = "ENCERRADO"


class MotivoDesligamento(str, Enum):
    OBJETIVOS_ALCANCADOS = "OBJETIVOS_ALCANCADOS"
    MUDANCA_TERRITORIO = "MUDANCA_TERRITORIO"
    NAO_ADESAO = "NAO_ADESAO"
    OBITO = "OBITO"
    ENCAMINHAMENTO_REDE = "ENCAMINHAMENTO_REDE"
    MEDIDA_ENCERRADA = "MEDIDA_ENCERRADA"
    TRANSFERENCIA_UNIDADE = "TRANSFERENCIA_UNIDADE"
    OUTRO = "OUTRO"


class AcaoStatus(str, Enum):
    PENDENTE = "PENDENTE"
    EM_ANDAMENTO = "EM_ANDAMENTO"
    CONCLUIDA = "CONCLUIDA"
    CANCELADA = "CANCELADA"


class ResultadoAvaliacao(str, Enum):
    POSITIVO = "POSITIVO"
    PARCIAL = "PARCIAL"
    NEGATIVO = "NEGATIVO"


class MedidaSocioeducativa(str, Enum):
    LA = "LA"
    PSC = "PSC"
    SEMILIBERDADE = "SEMILIBERDADE"
    INTERNACAO = "INTERNACAO"


class FrequenciaCumprimento(str, Enum):
    SEMANAL = "SEMANAL"
    QUINZENAL = "QUINZENAL"
    MENSAL = "MENSAL"
    BIMESTRAL = "BIMESTRAL"


class TipoRelatorioPia(str, Enum):
    INICIAL = "INICIAL"
    ACOMPANHAMENTO = "ACOMPANHAMENTO"
    FINAL = "FINAL"


# ── Benefícios eventuais (FASE 5) ───────────────────────────────
class ConcessaoStatus(str, Enum):
    SOLICITADO = "SOLICITADO"
    EM_ANALISE = "EM_ANALISE"
    APROVADO = "APROVADO"
    ENTREGUE = "ENTREGUE"
    NEGADO = "NEGADO"
    CANCELADO = "CANCELADO"


# ── Ações coletivas e SCFV (FASE 6) ────────────────────────────
class AcaoColetivaTipo(str, Enum):
    GRUPO_SCFV = "GRUPO_SCFV"
    OFICINA = "OFICINA"
    PALESTRA = "PALESTRA"
    EVENTO = "EVENTO"
    OUTRO = "OUTRO"


class FaixaEtaria(str, Enum):
    CRIANCA = "CRIANCA"
    ADOLESCENTE = "ADOLESCENTE"
    ADULTO = "ADULTO"
    IDOSO = "IDOSO"
    INTERGERACIONAL = "INTERGERACIONAL"


class Periodicidade(str, Enum):
    SEMANAL = "SEMANAL"
    QUINZENAL = "QUINZENAL"
    MENSAL = "MENSAL"
    EVENTO_UNICO = "EVENTO_UNICO"


class StatusInscricao(str, Enum):
    ATIVA = "ATIVA"
    LISTA_ESPERA = "LISTA_ESPERA"
    DESLIGADA = "DESLIGADA"
    CONCLUIDA = "CONCLUIDA"


class StatusAcaoColetiva(str, Enum):
    ATIVA = "ATIVA"
    ENCERRADA = "ENCERRADA"
    SUSPENSA = "SUSPENSA"


# ── Encaminhamentos e rede (FASE 7) ───────────────────────────
class EncaminhamentoTipo(str, Enum):
    INTERNO = "INTERNO"
    EXTERNO = "EXTERNO"


class EncaminhamentoStatus(str, Enum):
    PENDENTE = "PENDENTE"
    ACEITO = "ACEITO"
    RECUSADO = "RECUSADO"
    DEVOLVIDO = "DEVOLVIDO"
    CANCELADO = "CANCELADO"
    OFICIO_GERADO = "OFICIO_GERADO"
    ENVIADO = "ENVIADO"


# ── Agenda, recepção e visitas (FASE 8) ────────────────────────
class AppointmentStatus(str, Enum):
    AGENDADO = "AGENDADO"
    AGUARDANDO = "AGUARDANDO"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    CONCLUIDO = "CONCLUIDO"
    FALTOU = "FALTOU"
    CANCELADO = "CANCELADO"


class AppointmentTipo(str, Enum):
    ATENDIMENTO = "ATENDIMENTO"
    VISITA_DOMICILIAR = "VISITA_DOMICILIAR"
    GRUPO = "GRUPO"
    REUNIAO = "REUNIAO"
    OUTRO = "OUTRO"


class VisitaStatus(str, Enum):
    PLANEJADA = "PLANEJADA"
    REALIZADA = "REALIZADA"
    CANCELADA = "CANCELADA"


# ── Perfis de acesso do módulo (RBAC) ─────────────────────────────
class RoleName(str, Enum):
    ADMIN = "ADMIN"
    RECEPCAO = "recepcao"
    TECNICO_MEDIO = "tecnico_medio"
    TECNICO_SUPERIOR = "tecnico_superior"
    COORDENADOR_UNIDADE = "coordenador_unidade"
    GESTOR_MUNICIPAL = "gestor_municipal"
    VIGILANCIA = "vigilancia"
    CONSELHO = "conselho"
    SUPORTE_GOVASSIST = "suporte_govassist"
