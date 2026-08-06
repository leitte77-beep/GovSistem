"""Enumerações de domínio do GovInfra.

Todas são gravadas como texto — legíveis direto no banco e estáveis entre
migrações, sem depender de tipos ENUM nativos do PostgreSQL (que exigem
migration para cada valor novo).

Nenhuma situação é texto livre: onde o usuário precisa de flexibilidade
(motivos de bloqueio, tipos de serviço, tipos de resíduo) existe tabela de
domínio configurável, não string solta.
"""

from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:  # pragma: no cover - conveniência
        return self.value

    @classmethod
    def valores(cls) -> list[str]:
        return [item.value for item in cls]


# ─────────────────────────────────────────────────────────────────────────────
# Caçambas
# ─────────────────────────────────────────────────────────────────────────────


class SituacaoCacamba(StrEnum):
    DISPONIVEL = "disponivel"
    RESERVADA = "reservada"
    AGUARDANDO_ENTREGA = "aguardando_entrega"
    EM_TRANSPORTE_ENTREGA = "em_transporte_entrega"
    EM_USO = "em_uso"
    AGUARDANDO_RETIRADA = "aguardando_retirada"
    EM_TRANSPORTE_RETORNO = "em_transporte_retorno"
    EM_LIMPEZA = "em_limpeza"
    EM_VISTORIA = "em_vistoria"
    EM_MANUTENCAO = "em_manutencao"
    INDISPONIVEL = "indisponivel"
    INATIVA = "inativa"
    BAIXADA = "baixada"


# Situações em que a caçamba não pode ser reservada para um novo atendimento.
CACAMBA_INDISPONIVEL = {
    SituacaoCacamba.RESERVADA.value,
    SituacaoCacamba.AGUARDANDO_ENTREGA.value,
    SituacaoCacamba.EM_TRANSPORTE_ENTREGA.value,
    SituacaoCacamba.EM_USO.value,
    SituacaoCacamba.AGUARDANDO_RETIRADA.value,
    SituacaoCacamba.EM_TRANSPORTE_RETORNO.value,
    SituacaoCacamba.EM_LIMPEZA.value,
    SituacaoCacamba.EM_VISTORIA.value,
    SituacaoCacamba.EM_MANUTENCAO.value,
    SituacaoCacamba.INDISPONIVEL.value,
    SituacaoCacamba.INATIVA.value,
    SituacaoCacamba.BAIXADA.value,
}


class SituacaoSolicitacao(StrEnum):
    RASCUNHO = "rascunho"
    PENDENTE = "pendente"
    EM_ANALISE = "em_analise"
    AGUARDANDO_DOCUMENTOS = "aguardando_documentos"
    APROVADA = "aprovada"
    REPROVADA = "reprovada"
    AGUARDANDO_AGENDAMENTO = "aguardando_agendamento"
    AGENDADA = "agendada"
    AGUARDANDO_ENTREGA = "aguardando_entrega"
    EM_TRANSPORTE = "em_transporte"
    EM_USO = "em_uso"
    AGUARDANDO_RETIRADA = "aguardando_retirada"
    EM_RETIRADA = "em_retirada"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


# Uma solicitação "ativa" ocupa o cidadão/endereço e conta nos limites.
SOLICITACAO_ATIVA = {
    SituacaoSolicitacao.PENDENTE.value,
    SituacaoSolicitacao.EM_ANALISE.value,
    SituacaoSolicitacao.AGUARDANDO_DOCUMENTOS.value,
    SituacaoSolicitacao.APROVADA.value,
    SituacaoSolicitacao.AGUARDANDO_AGENDAMENTO.value,
    SituacaoSolicitacao.AGENDADA.value,
    SituacaoSolicitacao.AGUARDANDO_ENTREGA.value,
    SituacaoSolicitacao.EM_TRANSPORTE.value,
    SituacaoSolicitacao.EM_USO.value,
    SituacaoSolicitacao.AGUARDANDO_RETIRADA.value,
    SituacaoSolicitacao.EM_RETIRADA.value,
}

SOLICITACAO_ENCERRADA = {
    SituacaoSolicitacao.CONCLUIDA.value,
    SituacaoSolicitacao.CANCELADA.value,
    SituacaoSolicitacao.REPROVADA.value,
}

# Transições permitidas. Qualquer mudança fora deste mapa é recusada pela API,
# independentemente do que a tela tenha enviado.
TRANSICOES_SOLICITACAO: dict[str, set] = {
    SituacaoSolicitacao.RASCUNHO.value: {
        SituacaoSolicitacao.PENDENTE.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.PENDENTE.value: {
        SituacaoSolicitacao.EM_ANALISE.value,
        SituacaoSolicitacao.AGUARDANDO_DOCUMENTOS.value,
        SituacaoSolicitacao.APROVADA.value,
        SituacaoSolicitacao.REPROVADA.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.EM_ANALISE.value: {
        SituacaoSolicitacao.AGUARDANDO_DOCUMENTOS.value,
        SituacaoSolicitacao.APROVADA.value,
        SituacaoSolicitacao.REPROVADA.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.AGUARDANDO_DOCUMENTOS.value: {
        SituacaoSolicitacao.EM_ANALISE.value,
        SituacaoSolicitacao.APROVADA.value,
        SituacaoSolicitacao.REPROVADA.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.APROVADA.value: {
        SituacaoSolicitacao.AGUARDANDO_AGENDAMENTO.value,
        SituacaoSolicitacao.AGENDADA.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.AGUARDANDO_AGENDAMENTO.value: {
        SituacaoSolicitacao.AGENDADA.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.AGENDADA.value: {
        SituacaoSolicitacao.AGUARDANDO_ENTREGA.value,
        SituacaoSolicitacao.EM_TRANSPORTE.value,
        SituacaoSolicitacao.AGENDADA.value,  # reagendamento
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.AGUARDANDO_ENTREGA.value: {
        SituacaoSolicitacao.EM_TRANSPORTE.value,
        SituacaoSolicitacao.EM_USO.value,
        SituacaoSolicitacao.AGENDADA.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.EM_TRANSPORTE.value: {
        SituacaoSolicitacao.EM_USO.value,
        SituacaoSolicitacao.CANCELADA.value,
    },
    SituacaoSolicitacao.EM_USO.value: {
        SituacaoSolicitacao.AGUARDANDO_RETIRADA.value,
        SituacaoSolicitacao.EM_RETIRADA.value,
    },
    SituacaoSolicitacao.AGUARDANDO_RETIRADA.value: {
        SituacaoSolicitacao.EM_RETIRADA.value,
        SituacaoSolicitacao.CONCLUIDA.value,
    },
    SituacaoSolicitacao.EM_RETIRADA.value: {SituacaoSolicitacao.CONCLUIDA.value},
    SituacaoSolicitacao.CONCLUIDA.value: set(),
    SituacaoSolicitacao.CANCELADA.value: set(),
    SituacaoSolicitacao.REPROVADA.value: {SituacaoSolicitacao.EM_ANALISE.value},
}


class Prioridade(StrEnum):
    BAIXA = "baixa"
    NORMAL = "normal"
    ALTA = "alta"
    URGENTE = "urgente"


PESO_PRIORIDADE = {
    Prioridade.BAIXA.value: 0,
    Prioridade.NORMAL.value: 1,
    Prioridade.ALTA.value: 2,
    Prioridade.URGENTE.value: 3,
}


class DestinoRetirada(StrEnum):
    """Para onde a caçamba vai depois de retirada."""

    DISPONIVEL = "disponivel"
    LIMPEZA = "limpeza"
    VISTORIA = "vistoria"
    MANUTENCAO = "manutencao"
    INDISPONIVEL = "indisponivel"


# ─────────────────────────────────────────────────────────────────────────────
# Pessoas, imóveis e bloqueios
# ─────────────────────────────────────────────────────────────────────────────


class TipoPessoa(StrEnum):
    CIDADAO = "cidadao"
    PRODUTOR_RURAL = "produtor_rural"
    PROPRIETARIO = "proprietario"
    ARRENDATARIO = "arrendatario"
    REPRESENTANTE = "representante"
    RESPONSAVEL_IMOVEL = "responsavel_imovel"
    PESSOA_JURIDICA = "pessoa_juridica"


class SituacaoCadastro(StrEnum):
    ATIVO = "ativo"
    INATIVO = "inativo"
    PENDENTE = "pendente"
    BLOQUEADO = "bloqueado"


class TipoImovel(StrEnum):
    URBANO = "urbano"
    RURAL = "rural"


class RelacaoImovel(StrEnum):
    PROPRIETARIO = "proprietario"
    ARRENDATARIO = "arrendatario"
    POSSEIRO = "posseiro"
    REPRESENTANTE = "representante"
    RESPONSAVEL = "responsavel"
    MORADOR = "morador"


class ServicoAfetado(StrEnum):
    """Qual serviço o bloqueio impede."""

    CACAMBAS = "cacambas"
    PORTEIRA_ADENTRO = "porteira_adentro"
    TODOS = "todos"


class TipoBloqueio(StrEnum):
    TEMPORARIO = "temporario"
    ATE_REGULARIZACAO = "ate_regularizacao"
    PERMANENTE = "permanente"


class SituacaoBloqueio(StrEnum):
    ATIVO = "ativo"
    ENCERRADO = "encerrado"
    REVOGADO = "revogado"


# ─────────────────────────────────────────────────────────────────────────────
# Porteira Adentro
# ─────────────────────────────────────────────────────────────────────────────


class SituacaoServico(StrEnum):
    RASCUNHO = "rascunho"
    PROTOCOLADA = "protocolada"
    AGUARDANDO_DOCUMENTOS = "aguardando_documentos"
    EM_ANALISE = "em_analise"
    AGUARDANDO_VISTORIA = "aguardando_vistoria"
    VISTORIA_AGENDADA = "vistoria_agendada"
    VISTORIA_REALIZADA = "vistoria_realizada"
    AGUARDANDO_PARECER = "aguardando_parecer"
    AGUARDANDO_APROVACAO = "aguardando_aprovacao"
    APROVADA = "aprovada"
    REPROVADA = "reprovada"
    AGUARDANDO_AGENDAMENTO = "aguardando_agendamento"
    AGENDADA = "agendada"
    EM_EXECUCAO = "em_execucao"
    PAUSADA = "pausada"
    AGUARDANDO_HORAS_ADICIONAIS = "aguardando_horas_adicionais"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


SERVICO_ATIVO = {
    SituacaoServico.PROTOCOLADA.value,
    SituacaoServico.AGUARDANDO_DOCUMENTOS.value,
    SituacaoServico.EM_ANALISE.value,
    SituacaoServico.AGUARDANDO_VISTORIA.value,
    SituacaoServico.VISTORIA_AGENDADA.value,
    SituacaoServico.VISTORIA_REALIZADA.value,
    SituacaoServico.AGUARDANDO_PARECER.value,
    SituacaoServico.AGUARDANDO_APROVACAO.value,
    SituacaoServico.APROVADA.value,
    SituacaoServico.AGUARDANDO_AGENDAMENTO.value,
    SituacaoServico.AGENDADA.value,
    SituacaoServico.EM_EXECUCAO.value,
    SituacaoServico.PAUSADA.value,
    SituacaoServico.AGUARDANDO_HORAS_ADICIONAIS.value,
}

TRANSICOES_SERVICO: dict[str, set] = {
    SituacaoServico.RASCUNHO.value: {
        SituacaoServico.PROTOCOLADA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.PROTOCOLADA.value: {
        SituacaoServico.EM_ANALISE.value,
        SituacaoServico.AGUARDANDO_DOCUMENTOS.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.AGUARDANDO_DOCUMENTOS.value: {
        SituacaoServico.EM_ANALISE.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.EM_ANALISE.value: {
        SituacaoServico.AGUARDANDO_VISTORIA.value,
        SituacaoServico.AGUARDANDO_APROVACAO.value,
        SituacaoServico.AGUARDANDO_DOCUMENTOS.value,
        SituacaoServico.REPROVADA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.AGUARDANDO_VISTORIA.value: {
        SituacaoServico.VISTORIA_AGENDADA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.VISTORIA_AGENDADA.value: {
        SituacaoServico.VISTORIA_REALIZADA.value,
        SituacaoServico.AGUARDANDO_VISTORIA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.VISTORIA_REALIZADA.value: {
        SituacaoServico.AGUARDANDO_PARECER.value,
        SituacaoServico.AGUARDANDO_APROVACAO.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.AGUARDANDO_PARECER.value: {
        SituacaoServico.AGUARDANDO_APROVACAO.value,
        SituacaoServico.REPROVADA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.AGUARDANDO_APROVACAO.value: {
        SituacaoServico.APROVADA.value,
        SituacaoServico.REPROVADA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.APROVADA.value: {
        SituacaoServico.AGUARDANDO_AGENDAMENTO.value,
        SituacaoServico.AGENDADA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.AGUARDANDO_AGENDAMENTO.value: {
        SituacaoServico.AGENDADA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.AGENDADA.value: {
        SituacaoServico.EM_EXECUCAO.value,
        SituacaoServico.AGENDADA.value,  # reagendamento
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.EM_EXECUCAO.value: {
        SituacaoServico.PAUSADA.value,
        SituacaoServico.AGUARDANDO_HORAS_ADICIONAIS.value,
        SituacaoServico.CONCLUIDA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.PAUSADA.value: {
        SituacaoServico.EM_EXECUCAO.value,
        SituacaoServico.AGUARDANDO_HORAS_ADICIONAIS.value,
        SituacaoServico.CONCLUIDA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.AGUARDANDO_HORAS_ADICIONAIS.value: {
        SituacaoServico.EM_EXECUCAO.value,
        SituacaoServico.PAUSADA.value,
        SituacaoServico.CONCLUIDA.value,
        SituacaoServico.CANCELADA.value,
    },
    SituacaoServico.CONCLUIDA.value: set(),
    SituacaoServico.REPROVADA.value: {SituacaoServico.EM_ANALISE.value},
    SituacaoServico.CANCELADA.value: set(),
}


class SituacaoOrdem(StrEnum):
    EMITIDA = "emitida"
    EM_EXECUCAO = "em_execucao"
    PAUSADA = "pausada"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class TipoMovimentoHoras(StrEnum):
    CONCESSAO = "concessao"
    RESERVA = "reserva"
    LIBERACAO_RESERVA = "liberacao_reserva"
    UTILIZACAO = "utilizacao"
    ESTORNO = "estorno"
    AJUSTE = "ajuste"
    HORAS_ADICIONAIS = "horas_adicionais"
    EXPIRACAO = "expiracao"
    CANCELAMENTO = "cancelamento"


class MetodoDesconto(StrEnum):
    """Como as horas do banco são descontadas (item 26 da especificação)."""

    GERAL = "geral"                       # soma as horas de todos os equipamentos
    EQUIPAMENTO_PRINCIPAL = "equipamento_principal"  # só a máquina principal
    POR_CATEGORIA = "por_categoria"       # saldos separados por categoria
    ADMINISTRATIVO = "administrativo"     # o gestor define manualmente


class SituacaoHorasAdicionais(StrEnum):
    SOLICITADA = "solicitada"
    EM_ANALISE = "em_analise"
    APROVADA = "aprovada"
    REJEITADA = "rejeitada"
    CANCELADA = "cancelada"
    UTILIZADA = "utilizada"


class SituacaoBeneficiario(StrEnum):
    ATIVO = "ativo"
    SUSPENSO = "suspenso"
    ENCERRADO = "encerrado"
    PENDENTE = "pendente"


class TipoApontamento(StrEnum):
    """Natureza das horas apontadas na execução."""

    PRODUTIVA = "produtiva"
    PARADA = "parada"
    DESLOCAMENTO = "deslocamento"
    ABASTECIMENTO = "abastecimento"


# ─────────────────────────────────────────────────────────────────────────────
# Frota
# ─────────────────────────────────────────────────────────────────────────────


class SituacaoEquipamento(StrEnum):
    DISPONIVEL = "disponivel"
    RESERVADA = "reservada"
    EM_DESLOCAMENTO = "em_deslocamento"
    EM_OPERACAO = "em_operacao"
    PARADA = "parada"
    EM_ABASTECIMENTO = "em_abastecimento"
    EM_MANUTENCAO_PREVENTIVA = "em_manutencao_preventiva"
    EM_MANUTENCAO_CORRETIVA = "em_manutencao_corretiva"
    INDISPONIVEL = "indisponivel"
    INATIVA = "inativa"
    BAIXADA = "baixada"


# Equipamento nestas situações não pode ser agendado para novo serviço.
EQUIPAMENTO_NAO_AGENDAVEL = {
    SituacaoEquipamento.EM_MANUTENCAO_PREVENTIVA.value,
    SituacaoEquipamento.EM_MANUTENCAO_CORRETIVA.value,
    SituacaoEquipamento.INDISPONIVEL.value,
    SituacaoEquipamento.INATIVA.value,
    SituacaoEquipamento.BAIXADA.value,
}


class TipoMedidor(StrEnum):
    HORIMETRO = "horimetro"
    ODOMETRO = "odometro"


class TipoCombustivel(StrEnum):
    DIESEL_S10 = "diesel_s10"
    DIESEL_S500 = "diesel_s500"
    GASOLINA = "gasolina"
    ETANOL = "etanol"
    ARLA32 = "arla32"


class TipoVeiculo(StrEnum):
    CAMINHAO_BASCULANTE = "caminhao_basculante"
    CAMINHAO_CACAMBA = "caminhao_cacamba"
    CAMINHAO_PRANCHA = "caminhao_prancha"
    CAMINHAO_PIPA = "caminhao_pipa"
    CAMINHAO_COMBOIO = "caminhao_comboio"
    VEICULO_APOIO = "veiculo_apoio"
    OUTRO = "outro"


class SituacaoHabilitacao(StrEnum):
    ATIVA = "ativa"
    SUSPENSA = "suspensa"
    VENCIDA = "vencida"
    INATIVA = "inativa"


# ─────────────────────────────────────────────────────────────────────────────
# Combustível e manutenção
# ─────────────────────────────────────────────────────────────────────────────


class TipoMovimentoCombustivel(StrEnum):
    ENTRADA = "entrada"
    SAIDA = "saida"
    AJUSTE = "ajuste"
    PERDA = "perda"
    TRANSFERENCIA = "transferencia"


class TipoManutencao(StrEnum):
    PREVENTIVA = "preventiva"
    CORRETIVA = "corretiva"


class SituacaoManutencao(StrEnum):
    ABERTA = "aberta"
    AGUARDANDO_PECA = "aguardando_peca"
    EM_EXECUCAO = "em_execucao"
    CONCLUIDA = "concluida"
    CANCELADA = "cancelada"


class BaseGatilhoPlano(StrEnum):
    """Base de cálculo do plano preventivo."""

    PERIODO = "periodo"
    QUILOMETRAGEM = "quilometragem"
    HORIMETRO = "horimetro"


class TipoAlerta(StrEnum):
    CONSUMO_ACIMA_MEDIA = "consumo_acima_media"
    ABASTECIMENTO_DUPLICADO = "abastecimento_duplicado"
    ACIMA_CAPACIDADE_TANQUE = "acima_capacidade_tanque"
    HORIMETRO_INCONSISTENTE = "horimetro_inconsistente"
    QUILOMETRAGEM_INCONSISTENTE = "quilometragem_inconsistente"
    ABASTECIMENTO_SEM_ORDEM = "abastecimento_sem_ordem"
    ABASTECIMENTO_EM_MANUTENCAO = "abastecimento_em_manutencao"
    CONSUMO_SEM_PRODUCAO = "consumo_sem_producao"
    DIVERGENCIA_PREVISTO_REALIZADO = "divergencia_previsto_realizado"
    ESTOQUE_BAIXO = "estoque_baixo"
    ESTOQUE_NEGATIVO = "estoque_negativo"


# ─────────────────────────────────────────────────────────────────────────────
# Arquivos, assinaturas, auditoria e notificações
# ─────────────────────────────────────────────────────────────────────────────


class CategoriaArquivo(StrEnum):
    FOTO_LOCAL = "foto_local"
    FOTO_ANTES = "foto_antes"
    FOTO_DEPOIS = "foto_depois"
    FOTO_PAINEL = "foto_painel"
    COMPROVANTE = "comprovante"
    NOTA_FISCAL = "nota_fiscal"
    DOCUMENTO = "documento"
    TERMO = "termo"
    LAUDO = "laudo"
    VIDEO = "video"
    OUTRO = "outro"


class MetodoAssinatura(StrEnum):
    """Deixa explícito o valor jurídico da assinatura coletada.

    `desenhada` e `codigo` são assinaturas SIMPLES de recebimento — não se
    confundem com assinatura digital qualificada (ICP-Brasil), que só existe
    quando o documento assinado é anexado (`documento_assinado`).
    """

    DESENHADA = "desenhada"
    CODIGO = "codigo"
    DOCUMENTO_ASSINADO = "documento_assinado"
    ELETRONICA_PLATAFORMA = "eletronica_plataforma"


class PapelAssinante(StrEnum):
    CIDADAO = "cidadao"
    PRODUTOR = "produtor"
    ATENDENTE = "atendente"
    TECNICO = "tecnico"
    OPERADOR = "operador"
    MOTORISTA = "motorista"
    GESTOR = "gestor"
    RECEBEDOR = "recebedor"


class AcaoAuditoria(StrEnum):
    CRIAR = "criar"
    ALTERAR = "alterar"
    EXCLUIR = "excluir"
    APROVAR = "aprovar"
    REPROVAR = "reprovar"
    CANCELAR = "cancelar"
    REABRIR = "reabrir"
    BLOQUEAR = "bloquear"
    DESBLOQUEAR = "desbloquear"
    EXCECAO_BLOQUEIO = "excecao_bloqueio"
    AJUSTE_HORAS = "ajuste_horas"
    RESERVA_HORAS = "reserva_horas"
    ESTORNO_HORAS = "estorno_horas"
    AGENDAR = "agendar"
    REAGENDAR = "reagendar"
    TROCA_CACAMBA = "troca_cacamba"
    TROCA_MAQUINA = "troca_maquina"
    ALTERAR_HORIMETRO = "alterar_horimetro"
    ALTERAR_QUILOMETRAGEM = "alterar_quilometragem"
    ENTREGA = "entrega"
    RETIRADA = "retirada"
    INICIAR_SERVICO = "iniciar_servico"
    PAUSAR_SERVICO = "pausar_servico"
    CONCLUIR_SERVICO = "concluir_servico"
    ABASTECIMENTO = "abastecimento"
    AJUSTE_ESTOQUE = "ajuste_estoque"
    MANUTENCAO = "manutencao"
    ALTERAR_CONFIGURACAO = "alterar_configuracao"
    DOWNLOAD_SENSIVEL = "download_sensivel"
    ACESSO_NEGADO = "acesso_negado"
    LOGIN = "login"


class ResultadoAuditoria(StrEnum):
    SUCESSO = "sucesso"
    NEGADO = "negado"
    ERRO = "erro"


class TipoNotificacao(StrEnum):
    SOLICITACAO_CADASTRADA = "solicitacao_cadastrada"
    SOLICITACAO_APROVADA = "solicitacao_aprovada"
    SOLICITACAO_REJEITADA = "solicitacao_rejeitada"
    AGENDAMENTO_CONFIRMADO = "agendamento_confirmado"
    AGENDAMENTO_ALTERADO = "agendamento_alterado"
    ENTREGA_PROXIMA = "entrega_proxima"
    RETIRADA_PROXIMA = "retirada_proxima"
    RETIRADA_ATRASADA = "retirada_atrasada"
    VISTORIA_AGENDADA = "vistoria_agendada"
    ORDEM_EMITIDA = "ordem_emitida"
    SERVICO_INICIADO = "servico_iniciado"
    SERVICO_PAUSADO = "servico_pausado"
    HORAS_ADICIONAIS_SOLICITADAS = "horas_adicionais_solicitadas"
    HORAS_ADICIONAIS_APROVADAS = "horas_adicionais_aprovadas"
    DOCUMENTO_VENCENDO = "documento_vencendo"
    MANUTENCAO_PROXIMA = "manutencao_proxima"
    ESTOQUE_DIESEL_BAIXO = "estoque_diesel_baixo"
    INCONSISTENCIA_DETECTADA = "inconsistencia_detectada"


class CanalNotificacao(StrEnum):
    SISTEMA = "sistema"
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    SMS = "sms"


class SituacaoNotificacao(StrEnum):
    NAO_LIDA = "nao_lida"
    LIDA = "lida"
    ARQUIVADA = "arquivada"


ROTULOS: dict[str, str] = {
    # Caçambas
    SituacaoCacamba.DISPONIVEL.value: "Disponível",
    SituacaoCacamba.RESERVADA.value: "Reservada",
    SituacaoCacamba.AGUARDANDO_ENTREGA.value: "Aguardando entrega",
    SituacaoCacamba.EM_TRANSPORTE_ENTREGA.value: "Em transporte para entrega",
    SituacaoCacamba.EM_USO.value: "Em uso",
    SituacaoCacamba.AGUARDANDO_RETIRADA.value: "Aguardando retirada",
    SituacaoCacamba.EM_TRANSPORTE_RETORNO.value: "Em transporte para retorno",
    SituacaoCacamba.EM_LIMPEZA.value: "Em limpeza",
    SituacaoCacamba.EM_VISTORIA.value: "Em vistoria",
    SituacaoCacamba.EM_MANUTENCAO.value: "Em manutenção",
    SituacaoCacamba.INDISPONIVEL.value: "Indisponível",
    SituacaoCacamba.INATIVA.value: "Inativa",
    SituacaoCacamba.BAIXADA.value: "Baixada",
    # Solicitação
    SituacaoSolicitacao.RASCUNHO.value: "Rascunho",
    SituacaoSolicitacao.PENDENTE.value: "Pendente",
    SituacaoSolicitacao.EM_ANALISE.value: "Em análise",
    SituacaoSolicitacao.AGUARDANDO_DOCUMENTOS.value: "Aguardando documentos",
    SituacaoSolicitacao.APROVADA.value: "Aprovada",
    SituacaoSolicitacao.REPROVADA.value: "Reprovada",
    SituacaoSolicitacao.AGUARDANDO_AGENDAMENTO.value: "Aguardando agendamento",
    SituacaoSolicitacao.AGENDADA.value: "Agendada",
    SituacaoSolicitacao.AGUARDANDO_ENTREGA.value: "Aguardando entrega",
    SituacaoSolicitacao.EM_TRANSPORTE.value: "Em transporte",
    SituacaoSolicitacao.EM_USO.value: "Em uso",
    SituacaoSolicitacao.AGUARDANDO_RETIRADA.value: "Aguardando retirada",
    SituacaoSolicitacao.EM_RETIRADA.value: "Em retirada",
    SituacaoSolicitacao.CONCLUIDA.value: "Concluída",
    SituacaoSolicitacao.CANCELADA.value: "Cancelada",
    # Prioridade
    Prioridade.BAIXA.value: "Baixa",
    Prioridade.NORMAL.value: "Normal",
    Prioridade.ALTA.value: "Alta",
    Prioridade.URGENTE.value: "Urgente",
}


def rotulo(valor: str) -> str:
    """Texto legível de uma situação — a interface nunca depende só da cor."""
    return ROTULOS.get(valor, (valor or "").replace("_", " ").capitalize())
