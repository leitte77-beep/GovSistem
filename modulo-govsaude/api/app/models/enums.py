"""Enums de domínio fechados (CHECKs no banco)."""

from __future__ import annotations

from enum import Enum


class TipoOrganizacao(str, Enum):
    MUNICIPIO = "MUNICIPIO"
    CONSORCIO = "CONSORCIO"
    ESTADO_REGIONAL = "ESTADO_REGIONAL"
    ENTIDADE = "ENTIDADE"


class NivelSigilo(str, Enum):
    NORMAL = "NORMAL"
    RESTRITO_ESPECIALIDADE = "RESTRITO_ESPECIALIDADE"
    SIGILOSO = "SIGILOSO"
    SIGILO_DENUNCIA = "SIGILO_DENUNCIA"

    @property
    def ordem(self) -> int:
        return {
            self.NORMAL: 0,
            self.RESTRITO_ESPECIALIDADE: 1,
            self.SIGILOSO: 2,
            self.SIGILO_DENUNCIA: 3,
        }[self]


class AcaoAuditoria(str, Enum):
    LOGIN = "LOGIN"
    LOGIN_FALHA = "LOGIN_FALHA"
    LOGOUT = "LOGOUT"
    CRIAR = "CRIAR"
    ATUALIZAR = "ATUALIZAR"
    BAIXAR = "BAIXAR"
    LER = "LER"
    READ_SENSIVEL = "READ_SENSIVEL"
    IMPRIMIR = "IMPRIMIR"
    EXPORTAR = "EXPORTAR"
    DOWNLOAD = "DOWNLOAD"
    ASSINAR = "ASSINAR"
    QUEBRA_SIGILO = "QUEBRA_SIGILO"
    PERMISSAO = "PERMISSAO"
    INTEGRACAO = "INTEGRACAO"
    JOB = "JOB"
    TERMO = "TERMO"
    MFA = "MFA"


class ResultadoAuditoria(str, Enum):
    SUCESSO = "SUCESSO"
    FALHA = "FALHA"
    NEGADO = "NEGADO"


class OperacaoEnvio(str, Enum):
    INCLUSAO = "INCLUSAO"
    ALTERACAO = "ALTERACAO"
    EXCLUSAO = "EXCLUSAO"


class SituacaoEnvio(str, Enum):
    PENDENTE = "PENDENTE"
    INVALIDO = "INVALIDO"
    VALIDADO = "VALIDADO"
    ENVIANDO = "ENVIANDO"
    ENVIADO = "ENVIADO"
    ACEITO = "ACEITO"
    REJEITADO = "REJEITADO"
    ERRO_TRANSITORIO = "ERRO_TRANSITORIO"
    CANCELADO = "CANCELADO"


class SexoCidadao(str, Enum):
    MASCULINO = "MASCULINO"
    FEMININO = "FEMININO"
    INTERSEXO = "INTERSEXO"
    NAO_INFORMADO = "NAO_INFORMADO"
    OUTRO = "OUTRO"


class TipoDocumento(str, Enum):
    CPF = "CPF"
    CNS = "CNS"
    RG = "RG"
    CNH = "CNH"
    CERTIDAO_NASCIMENTO = "CERTIDAO_NASCIMENTO"
    CERTIDAO_CASAMENTO = "CERTIDAO_CASAMENTO"
    PASSAPORTE = "PASSAPORTE"
    OUTRO = "OUTRO"


class TipoContato(str, Enum):
    TELEFONE = "TELEFONE"
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"
    OUTRO = "OUTRO"


class TipoEndereco(str, Enum):
    RESIDENCIAL = "RESIDENCIAL"
    COMERCIAL = "COMERCIAL"
    OUTRO = "OUTRO"


class TipoPlanoSaude(str, Enum):
    SAUDE_SUPLEMENTAR = "SAUDE_SUPLEMENTAR"
    PLANO_PRIVADO = "PLANO_PRIVADO"
    OUTRO = "OUTRO"


class TipoCondicao(str, Enum):
    CID10 = "CID10"
    CIAP2 = "CIAP2"
    CIPE = "CIPE"
    OUTRO = "OUTRO"


class SituacaoCondicao(str, Enum):
    ATIVA = "ATIVA"
    RESOLVIDA = "RESOLVIDA"


class StatusDuplicidade(str, Enum):
    PENDENTE = "PENDENTE"
    MESMO = "MESMO"
    DIFERENTE = "DIFERENTE"
    IGNORADO = "IGNORADO"


class StatusUnificacao(str, Enum):
    ATIVA = "ATIVA"
    REVERTIDA = "REVERTIDA"


class TipoBaixaCidadao(str, Enum):
    BAIXA = "BAIXA"
    REATIVACAO = "REATIVACAO"


class StatusJob(str, Enum):
    PENDENTE = "PENDENTE"
    EXECUTANDO = "EXECUTANDO"
    CONCLUIDO = "CONCLUIDO"
    FALHOU = "FALHOU"
    CANCELADO = "CANCELADO"


class CanalNotificacao(str, Enum):
    SISTEMA = "SISTEMA"
    EMAIL = "EMAIL"
    PUSH = "PUSH"
    WHATSAPP = "WHATSAPP"


class SituacaoNotificacao(str, Enum):
    NAO_LIDA = "NAO_LIDA"
    LIDA = "LIDA"
    ARQUIVADA = "ARQUIVADA"


class StatusAntivirus(str, Enum):
    PENDENTE = "PENDENTE"
    LIMPO = "LIMPO"
    INFECTADO = "INFECTADO"
    FALHA = "FALHA"
    NAO_APLICAVEL = "NAO_APLICAVEL"


class TipoAnexo(str, Enum):
    DOCUMENTO = "DOCUMENTO"
    FOTO = "FOTO"
    LAUDO = "LAUDO"
    OUTRO = "OUTRO"


class StatusTermo(str, Enum):
    PENDENTE = "PENDENTE"
    ACEITO = "ACEITO"
    RECUSADO = "RECUSADO"


class TipoEquipe(str, Enum):
    """Tipos de equipe da APS (domínio fechado, validado na aplicação)."""

    ESF = "ESF"
    EAP = "EAP"
    ESB = "ESB"
    EMULTI = "EMULTI"
    OUTRA = "OUTRA"


class TipoServicoClassificacao(str, Enum):
    SERVICO = "SERVICO"
    CLASSIFICACAO = "CLASSIFICACAO"


class TipoEscala(str, Enum):
    REGULAR = "REGULAR"
    EXTRA = "EXTRA"
    SOBREAVISO = "SOBREAVISO"


class TipoPlantao(str, Enum):
    PRESENCIAL = "PRESENCIAL"
    SOBREAVISO = "SOBREAVISO"


class SituacaoTurno(str, Enum):
    ATIVA = "ATIVA"
    CANCELADA = "CANCELADA"
    CONCLUIDA = "CONCLUIDA"


class SituacaoEnteConsorciado(str, Enum):
    ATIVO = "ATIVO"
    INATIVO = "INATIVO"
    SUSPENSO = "SUSPENSO"


class SituacaoImportacao(str, Enum):
    PENDENTE_ESPECIFICACAO_OFICIAL = "PENDENTE_ESPECIFICACAO_OFICIAL"
    EXECUTANDO = "EXECUTANDO"
    CONCLUIDA = "CONCLUIDA"
    FALHOU = "FALHOU"


__all__ = [
    "AcaoAuditoria",
    "CanalNotificacao",
    "NivelSigilo",
    "SexoCidadao",
    "SituacaoCondicao",
    "OperacaoEnvio",
    "ResultadoAuditoria",
    "MetodoIdentificacao",
    "OrigemAgendamento",
    "OrigemFila",
    "SituacaoAgendamento",
    "SituacaoEnteConsorciado",
    "SituacaoEnvio",
    "SituacaoFila",
    "SituacaoImportacao",
    "SituacaoNotificacao",
    "SituacaoTurno",
    "StatusAntivirus",
    "StatusDuplicidade",
    "StatusJob",
    "StatusTermo",
    "StatusUnificacao",
    "TipoAgenda",
    "TipoAnexo",
    "TipoBaixaCidadao",
    "TipoBloqueioAgenda",
    "TipoChamada",
    "TipoCondicao",
    "TipoContato",
    "TipoDocumento",
    "TipoEndereco",
    "TipoEquipe",
    "TipoEscala",
    "TipoOrganizacao",
    "TipoPlanoSaude",
    "TipoPlantao",
    "TipoServicoClassificacao",
]


class TipoAgenda(str, Enum):
    CONSULTA = "CONSULTA"
    PROCEDIMENTO = "PROCEDIMENTO"
    RETORNO = "RETORNO"
    ODONTOLOGIA = "ODONTOLOGIA"
    VACINACAO = "VACINACAO"
    ACOLHIMENTO = "ACOLHIMENTO"
    OUTRO = "OUTRO"


class TipoBloqueioAgenda(str, Enum):
    BLOQUEIO = "BLOQUEIO"
    FERIADO = "FERIADO"
    MANUTENCAO = "MANUTENCAO"
    AUSENCIA = "AUSENCIA"
    OUTRO = "OUTRO"


class SituacaoAgendamento(str, Enum):
    AGENDADO = "AGENDADO"
    CONFIRMADO = "CONFIRMADO"
    AGUARDANDO = "AGUARDANDO"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    ATENDIDO = "ATENDIDO"
    CANCELADO = "CANCELADO"
    FALTOU = "FALTOU"
    VENCIDO = "VENCIDO"
    REAGENDADO = "REAGENDADO"


class OrigemAgendamento(str, Enum):
    RECEPCAO = "RECEPCAO"
    APP = "APP"
    WEB = "WEB"
    TELEFONE = "TELEFONE"
    PRESENCIAL = "PRESENCIAL"
    IMPORTACAO = "IMPORTACAO"
    OUTRO = "OUTRO"


class OrigemFila(str, Enum):
    AGENDAMENTO = "AGENDAMENTO"
    DEMANDA_ESPONTANEA = "DEMANDA_ESPONTANEA"
    RETORNO = "RETORNO"
    ENCAIXE = "ENCAIXE"


class SituacaoFila(str, Enum):
    AGUARDANDO = "AGUARDANDO"
    CHAMADO = "CHAMADO"
    EM_TRIAGEM = "EM_TRIAGEM"
    AGUARDANDO_ATENDIMENTO = "AGUARDANDO_ATENDIMENTO"
    EM_ATENDIMENTO = "EM_ATENDIMENTO"
    ATENDIDO = "ATENDIDO"
    EVADIDO = "EVADIDO"
    CANCELADO = "CANCELADO"


class TipoChamada(str, Enum):
    NORMAL = "NORMAL"
    PREFERENCIAL = "PREFERENCIAL"
    RECHAMADA = "RECHAMADA"


class MetodoIdentificacao(str, Enum):
    CODIGO_BARRAS = "CODIGO_BARRAS"
    QR_CODE = "QR_CODE"
    BIOMETRIA = "BIOMETRIA"
    MANUAL = "MANUAL"
