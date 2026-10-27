"""Catálogo de permissões e grupos nacionais do GovSaúde.

Formato da permissão: ``recurso:acao``. O grupo define o conjunto padrão; o
usuário pode ter concessões/revogações individuais. O acesso efetivo é
(permissões dos grupos ∪ extras) − revogadas, sempre combinado com o escopo
(tenant, estabelecimento, equipe, especialidade) e com o nível de sigilo.
"""

from __future__ import annotations

from enum import Enum


class Permissao(str, Enum):
    # Plataforma / administração
    SISTEMA_LER = "sistema:ler"
    USUARIO_LER = "usuario:ler"
    USUARIO_GERENCIAR = "usuario:gerenciar"
    GRUPO_LER = "grupo:ler"
    GRUPO_GERENCIAR = "grupo:gerenciar"
    CONFIGURACAO_LER = "configuracao:ler"
    CONFIGURACAO_EDITAR = "configuracao:editar"
    AUDITORIA_LER = "auditoria:ler"
    AUDITORIA_EXPORTAR = "auditoria:exportar"
    JOB_LER = "job:ler"
    TERMO_GERENCIAR = "termo:gerenciar"
    LGPD_ACESSOS = "lgpd:acessos"
    REFERENCIA_LER = "referencia:ler"
    INTEGRACAO_LER = "integracao:ler"
    INTEGRACAO_GERENCIAR = "integracao:gerenciar"
    NOTIFICACAO_LER = "notificacao:ler"
    NOTIFICACAO_GERENCIAR = "notificacao:gerenciar"
    DASHBOARD_LER = "dashboard:ler"
    RELATORIO_LER = "relatorio:ler"
    RELATORIO_EXPORTAR = "relatorio:exportar"

    # Rede / cadastros
    ESTABELECIMENTO_LER = "estabelecimento:ler"
    ESTABELECIMENTO_GERENCIAR = "estabelecimento:gerenciar"
    EQUIPE_LER = "equipe:ler"
    EQUIPE_GERENCIAR = "equipe:gerenciar"
    PROFISSIONAL_LER = "profissional:ler"
    PROFISSIONAL_GERENCIAR = "profissional:gerenciar"

    # Cidadão / território
    CIDADAO_LER = "cidadao:ler"
    CIDADAO_CRIAR = "cidadao:criar"
    CIDADAO_EDITAR = "cidadao:editar"
    CIDADAO_BAIXAR = "cidadao:baixar"
    CIDADAO_VER_DOCUMENTO = "cidadao:ver_documento"
    TERRITORIO_LER = "territorio:ler"
    TERRITORIO_GERENCIAR = "territorio:gerenciar"
    VISITA_LER = "visita:ler"
    VISITA_CRIAR = "visita:criar"

    # Agenda / fila / clínica
    AGENDA_LER = "agenda:ler"
    AGENDA_GERENCIAR = "agenda:gerenciar"
    FILA_LER = "fila:ler"
    FILA_GERENCIAR = "fila:gerenciar"
    PRONTUARIO_LER = "prontuario:ler"
    PRONTUARIO_CRIAR = "prontuario:criar"
    PRONTUARIO_EDITAR = "prontuario:editar"
    PRONTUARIO_ASSINAR = "prontuario:assinar"
    PRONTUARIO_RETIFICAR = "prontuario:retificar"
    PRONTUARIO_LER_SIGILOSO = "prontuario:ler_sigiloso"
    QUEBRA_SIGILO = "*:quebra_sigilo"
    PRESCRICAO_CRIAR = "prescricao:criar"
    EXAME_SOLICITAR = "exame:solicitar"
    ENCAMINHAMENTO_CRIAR = "encaminhamento:criar"
    NOTIFICACAO_COMPULSORIA = "notificacao_compulsoria:criar"

    # Programas / odontologia
    PROGRAMA_LER = "programa:ler"
    PROGRAMA_GERENCIAR = "programa:gerenciar"
    PROGRAMA_BUSCA_ATIVA = "programa:busca_ativa"
    ODONTOLOGIA_LER = "odontologia:ler"
    ODONTOLOGIA_GERENCIAR = "odontologia:gerenciar"

    # Imunização / farmácia / laboratório
    IMUNIZACAO_LER = "imunizacao:ler"
    IMUNIZACAO_APLICAR = "imunizacao:aplicar"
    IMUNIZACAO_GERENCIAR = "imunizacao:gerenciar"
    ESTOQUE_LER = "estoque:ler"
    ESTOQUE_MOVIMENTAR = "estoque:movimentar"
    ESTOQUE_AJUSTAR = "estoque:ajustar"
    ESTOQUE_INVENTARIO = "estoque:inventario"
    DISPENSACAO_LER = "dispensacao:ler"
    DISPENSACAO_CRIAR = "dispensacao:criar"
    DISPENSACAO_ESTORNAR = "dispensacao:estornar"
    ESTOQUE_CONTROLADOS = "estoque:controlados"
    LABORATORIO_LER = "laboratorio:ler"
    LABORATORIO_COLETAR = "laboratorio:coletar"
    LABORATORIO_RESULTADO = "laboratorio:resultado"
    LABORATORIO_LIBERAR = "laboratorio:liberar"
    LABORATORIO_GERENCIAR = "laboratorio:gerenciar"
    SISCAN_ACOMPANHAR = "siscan:acompanhar"

    # Regulação / faturamento / vigilância
    REGULACAO_LER = "regulacao:ler"
    REGULACAO_GERENCIAR = "regulacao:gerenciar"
    CONTRATO_LER = "contrato:ler"
    CONTRATO_GERENCIAR = "contrato:gerenciar"
    AUTORIZACAO_GERENCIAR = "autorizacao:gerenciar"
    FATURAMENTO_LER = "faturamento:ler"
    FATURAMENTO_GERENCIAR = "faturamento:gerenciar"
    FATURAMENTO_EXPORTAR = "faturamento:exportar"
    VIGILANCIA_LER = "vigilancia:ler"
    VIGILANCIA_GERENCIAR = "vigilancia:gerenciar"
    VIGILANCIA_DENUNCIA = "vigilancia:denuncia"

    # Indicadores
    INDICADOR_LER = "indicador:ler"
    INDICADOR_GERENCIAR = "indicador:gerenciar"


ALL_PERMISSIONS: frozenset[Permissao] = frozenset(Permissao)


def _p(*valores: Permissao) -> frozenset[Permissao]:
    return frozenset(valores)


_LEITURA = _p(
    Permissao.DASHBOARD_LER,
    Permissao.RELATORIO_LER,
    Permissao.ESTABELECIMENTO_LER,
    Permissao.EQUIPE_LER,
    Permissao.PROFISSIONAL_LER,
    Permissao.CIDADAO_LER,
    Permissao.TERRITORIO_LER,
    Permissao.AGENDA_LER,
    Permissao.FILA_LER,
    Permissao.PROGRAMA_LER,
    Permissao.IMUNIZACAO_LER,
    Permissao.ESTOQUE_LER,
    Permissao.DISPENSACAO_LER,
    Permissao.LABORATORIO_LER,
    Permissao.REGULACAO_LER,
    Permissao.FATURAMENTO_LER,
    Permissao.VIGILANCIA_LER,
    Permissao.INDICADOR_LER,
    Permissao.NOTIFICACAO_LER,
    Permissao.REFERENCIA_LER,
    Permissao.SISTEMA_LER,
)

_ATENDIMENTO_BASICO = _p(
    Permissao.CIDADAO_CRIAR,
    Permissao.CIDADAO_EDITAR,
    Permissao.AGENDA_GERENCIAR,
    Permissao.FILA_GERENCIAR,
)

_CLINICO = _p(
    Permissao.PRONTUARIO_LER,
    Permissao.PRONTUARIO_CRIAR,
    Permissao.PRONTUARIO_EDITAR,
    Permissao.PRONTUARIO_ASSINAR,
    Permissao.PRONTUARIO_RETIFICAR,
    Permissao.PRESCRICAO_CRIAR,
    Permissao.EXAME_SOLICITAR,
    Permissao.ENCAMINHAMENTO_CRIAR,
    Permissao.PROGRAMA_GERENCIAR,
    Permissao.PROGRAMA_BUSCA_ATIVA,
    Permissao.ODONTOLOGIA_LER,
    Permissao.ODONTOLOGIA_GERENCIAR,
    Permissao.NOTIFICACAO_COMPULSORIA,
)

_GESTAO = _p(
    Permissao.USUARIO_LER,
    Permissao.USUARIO_GERENCIAR,
    Permissao.GRUPO_LER,
    Permissao.GRUPO_GERENCIAR,
    Permissao.CONFIGURACAO_LER,
    Permissao.CONFIGURACAO_EDITAR,
    Permissao.AUDITORIA_LER,
    Permissao.AUDITORIA_EXPORTAR,
    Permissao.JOB_LER,
    Permissao.TERMO_GERENCIAR,
    Permissao.ESTABELECIMENTO_GERENCIAR,
    Permissao.EQUIPE_GERENCIAR,
    Permissao.PROFISSIONAL_GERENCIAR,
    Permissao.TERRITORIO_GERENCIAR,
    Permissao.VISITA_LER,
    Permissao.VISITA_CRIAR,
    Permissao.CIDADAO_BAIXAR,
    Permissao.CIDADAO_VER_DOCUMENTO,
    Permissao.RELATORIO_EXPORTAR,
    Permissao.INTEGRACAO_LER,
    Permissao.INTEGRACAO_GERENCIAR,
    Permissao.INDICADOR_GERENCIAR,
    Permissao.PROGRAMA_BUSCA_ATIVA,
    Permissao.CONTRATO_LER,
    Permissao.CONTRATO_GERENCIAR,
    Permissao.AUTORIZACAO_GERENCIAR,
    Permissao.FATURAMENTO_GERENCIAR,
    Permissao.FATURAMENTO_EXPORTAR,
    Permissao.VIGILANCIA_GERENCIAR,
    Permissao.LGPD_ACESSOS,
    Permissao.NOTIFICACAO_GERENCIAR,
)

_FARMACIA = _p(
    Permissao.ESTOQUE_LER,
    Permissao.ESTOQUE_MOVIMENTAR,
    Permissao.ESTOQUE_AJUSTAR,
    Permissao.ESTOQUE_INVENTARIO,
    Permissao.DISPENSACAO_LER,
    Permissao.DISPENSACAO_CRIAR,
    Permissao.DISPENSACAO_ESTORNAR,
)

_LABORATORIO = _p(
    Permissao.LABORATORIO_LER,
    Permissao.LABORATORIO_COLETAR,
    Permissao.LABORATORIO_RESULTADO,
)

_IMUNIZACAO = _p(
    Permissao.IMUNIZACAO_LER,
    Permissao.IMUNIZACAO_APLICAR,
)

_VIGILANCIA = _p(
    Permissao.VIGILANCIA_LER,
    Permissao.VIGILANCIA_GERENCIAR,
    Permissao.VIGILANCIA_DENUNCIA,
    Permissao.QUEBRA_SIGILO,
)

_ACS = _p(
    Permissao.CIDADAO_LER,
    Permissao.CIDADAO_CRIAR,
    Permissao.CIDADAO_EDITAR,
    Permissao.TERRITORIO_LER,
    Permissao.TERRITORIO_GERENCIAR,
    Permissao.VISITA_LER,
    Permissao.VISITA_CRIAR,
    Permissao.AGENDA_LER,
    Permissao.FILA_LER,
    Permissao.NOTIFICACAO_LER,
    Permissao.PROGRAMA_LER,
    Permissao.PROGRAMA_BUSCA_ATIVA,
    Permissao.IMUNIZACAO_LER,
    Permissao.INDICADOR_LER,
)

GRUPOS_NACIONAIS: dict[str, dict] = {
    "ADMIN": {
        "nome": "Administrador do módulo",
        "permissoes": ALL_PERMISSIONS,
        "requer_consentimento": False,
    },
    "gestor_municipal": {
        "nome": "Gestor municipal",
        "permissoes": _LEITURA
        | _ATENDIMENTO_BASICO
        | _CLINICO
        | _GESTAO
        | _FARMACIA
        | _LABORATORIO
        | _IMUNIZACAO
        | _VIGILANCIA
        | _p(
            Permissao.IMUNIZACAO_GERENCIAR,
            Permissao.LABORATORIO_GERENCIAR,
            Permissao.SISCAN_ACOMPANHAR,
        ),
        "requer_consentimento": False,
    },
    "coordenador_unidade": {
        "nome": "Coordenador de unidade",
        "permissoes": _LEITURA
        | _ATENDIMENTO_BASICO
        | _CLINICO
        | _GESTAO
        | _FARMACIA
        | _LABORATORIO
        | _IMUNIZACAO
        | _p(
            Permissao.IMUNIZACAO_GERENCIAR,
            Permissao.LABORATORIO_GERENCIAR,
            Permissao.SISCAN_ACOMPANHAR,
        ),
        "requer_consentimento": False,
    },
    "recepcao": {
        "nome": "Recepção",
        "permissoes": _LEITURA | _ATENDIMENTO_BASICO,
        "requer_consentimento": False,
    },
    "medico": {
        "nome": "Médico",
        "permissoes": _LEITURA
        | _CLINICO
        | _p(Permissao.PRONTUARIO_LER_SIGILOSO, Permissao.SISCAN_ACOMPANHAR),
        "requer_consentimento": False,
    },
    "enfermeiro": {
        "nome": "Enfermeiro",
        "permissoes": _LEITURA | _CLINICO | _IMUNIZACAO | _p(Permissao.SISCAN_ACOMPANHAR),
        "requer_consentimento": False,
    },
    "tecnico_enfermagem": {
        "nome": "Técnico de enfermagem",
        "permissoes": _p(
            Permissao.DASHBOARD_LER,
            Permissao.CIDADAO_LER,
            Permissao.AGENDA_LER,
            Permissao.FILA_LER,
            Permissao.PRONTUARIO_LER,
            Permissao.PRONTUARIO_CRIAR,
            Permissao.IMUNIZACAO_LER,
            Permissao.NOTIFICACAO_LER,
        ),
        "requer_consentimento": False,
    },
    "cirurgiao_dentista": {
        "nome": "Cirurgião-dentista",
        "permissoes": _LEITURA | _CLINICO,
        "requer_consentimento": False,
    },
    "asb_tsb": {
        "nome": "ASB / TSB",
        "permissoes": _p(
            Permissao.DASHBOARD_LER,
            Permissao.CIDADAO_LER,
            Permissao.AGENDA_LER,
            Permissao.FILA_LER,
            Permissao.ODONTOLOGIA_LER,
            Permissao.ESTOQUE_LER,
            Permissao.NOTIFICACAO_LER,
        ),
        "requer_consentimento": False,
    },
    "farmaceutico": {
        "nome": "Farmacêutico",
        "permissoes": _LEITURA
        | _FARMACIA
        | _p(
            Permissao.DISPENSACAO_CRIAR,
            Permissao.DISPENSACAO_ESTORNAR,
            Permissao.ESTOQUE_CONTROLADOS,
        ),
        "requer_consentimento": False,
    },
    "auxiliar_farmacia": {
        "nome": "Auxiliar de farmácia",
        "permissoes": _p(
            Permissao.DASHBOARD_LER,
            Permissao.ESTOQUE_LER,
            Permissao.ESTOQUE_MOVIMENTAR,
            Permissao.DISPENSACAO_LER,
            Permissao.DISPENSACAO_CRIAR,
            Permissao.NOTIFICACAO_LER,
        ),
        "requer_consentimento": False,
    },
    "almoxarife": {
        "nome": "Almoxarife",
        "permissoes": _p(
            Permissao.ESTOQUE_LER,
            Permissao.ESTOQUE_MOVIMENTAR,
            Permissao.ESTOQUE_AJUSTAR,
            Permissao.ESTOQUE_INVENTARIO,
            Permissao.RELATORIO_LER,
            Permissao.NOTIFICACAO_LER,
        ),
        "requer_consentimento": False,
    },
    "acs": {
        "nome": "Agente comunitário de saúde",
        "permissoes": _ACS,
        "requer_consentimento": False,
    },
    "ace": {
        "nome": "Agente de combate a endemias",
        "permissoes": _ACS | _p(Permissao.VIGILANCIA_LER),
        "requer_consentimento": False,
    },
    "vacinador": {
        "nome": "Vacinador",
        "permissoes": _LEITURA | _IMUNIZACAO,
        "requer_consentimento": False,
    },
    "laboratorio_tecnico": {
        "nome": "Técnico de laboratório",
        "permissoes": _LEITURA | _LABORATORIO,
        "requer_consentimento": False,
    },
    "laboratorio_responsavel": {
        "nome": "Responsável pelo laboratório",
        "permissoes": _LEITURA
        | _LABORATORIO
        | _p(Permissao.LABORATORIO_LIBERAR, Permissao.LABORATORIO_GERENCIAR),
        "requer_consentimento": False,
    },
    "regulador": {
        "nome": "Regulador",
        "permissoes": _LEITURA
        | _p(
            Permissao.REGULACAO_GERENCIAR,
            Permissao.AUTORIZACAO_GERENCIAR,
            Permissao.PRONTUARIO_LER,
        ),
        "requer_consentimento": False,
    },
    "faturista": {
        "nome": "Faturista",
        "permissoes": _p(
            Permissao.DASHBOARD_LER,
            Permissao.FATURAMENTO_LER,
            Permissao.FATURAMENTO_GERENCIAR,
            Permissao.FATURAMENTO_EXPORTAR,
            Permissao.RELATORIO_LER,
            Permissao.RELATORIO_EXPORTAR,
            Permissao.ESTABELECIMENTO_LER,
            Permissao.PROFISSIONAL_LER,
            Permissao.CONTRATO_LER,
            Permissao.REFERENCIA_LER,
            Permissao.NOTIFICACAO_LER,
        ),
        "requer_consentimento": False,
    },
    "multiprofissional": {
        "nome": "Equipe multiprofissional",
        "permissoes": _LEITURA | _CLINICO | _p(Permissao.PRONTUARIO_LER_SIGILOSO),
        "requer_consentimento": False,
    },
    "fiscal_vigilancia_sanitaria": {
        "nome": "Fiscal de vigilância sanitária",
        "permissoes": _VIGILANCIA,
        "requer_consentimento": False,
    },
    "coordenador_vigilancia": {
        "nome": "Coordenador de vigilância",
        "permissoes": _LEITURA | _VIGILANCIA,
        "requer_consentimento": False,
    },
    "encarregado_dados": {
        "nome": "Encarregado de dados (DPO)",
        "permissoes": _p(
            Permissao.DASHBOARD_LER,
            Permissao.AUDITORIA_LER,
            Permissao.AUDITORIA_EXPORTAR,
            Permissao.LGPD_ACESSOS,
            Permissao.SISTEMA_LER,
            Permissao.JOB_LER,
            Permissao.NOTIFICACAO_LER,
        ),
        "requer_consentimento": False,
    },
    "consulta_gestao": {
        "nome": "Consulta de gestão (agregados)",
        "permissoes": _p(
            Permissao.DASHBOARD_LER,
            Permissao.INDICADOR_LER,
            Permissao.RELATORIO_LER,
            Permissao.RELATORIO_EXPORTAR,
            Permissao.ESTABELECIMENTO_LER,
            Permissao.EQUIPE_LER,
            Permissao.FATURAMENTO_LER,
            Permissao.SISTEMA_LER,
        ),
        "requer_consentimento": False,
    },
    "suporte_plataforma": {
        "nome": "Suporte da plataforma (somente com consentimento)",
        "permissoes": _p(Permissao.SISTEMA_LER, Permissao.DASHBOARD_LER),
        "requer_consentimento": True,
    },
}

ALIASES_SAAS: dict[str, str] = {
    "GOVSAUDE_ADMIN": "ADMIN",
    "PLATFORM_ADMIN": "ADMIN",
    "ORG_ADMIN": "ADMIN",
    "ADMIN": "ADMIN",
    "SUPPORT": "suporte_plataforma",
    "ORG_MEMBER": "consulta_gestao",
}

for _codigo in GRUPOS_NACIONAIS:
    ALIASES_SAAS.setdefault(_codigo, _codigo)


def normalizar_grupo_saas(papel: str) -> str | None:
    chave = (papel or "").strip()
    if chave in ALIASES_SAAS:
        return ALIASES_SAAS[chave]
    baixa = chave.lower()
    if baixa in GRUPOS_NACIONAIS:
        return baixa
    if baixa == "admin":
        return "ADMIN"
    return None


def grupos_para_papeis(papeis: list[str] | None) -> set[str]:
    grupos = {normalizar_grupo_saas(p) for p in (papeis or [])}
    grupos.discard(None)
    if not grupos:
        return {"consulta_gestao"}
    return grupos  # type: ignore[return-value]


def permissoes_do_grupo(codigo: str) -> frozenset[str]:
    definicao = GRUPOS_NACIONAIS.get(codigo)
    if not definicao:
        return frozenset()
    return frozenset(p.value for p in definicao["permissoes"])


ROTULOS_GRUPO: dict[str, str] = {
    codigo: definicao["nome"] for codigo, definicao in GRUPOS_NACIONAIS.items()
}
