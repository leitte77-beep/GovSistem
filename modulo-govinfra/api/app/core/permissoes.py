"""Catálogo de permissões do GovInfra e mapeamento por perfil.

Princípio adotado: **toda** regra de acesso é verificada aqui, no backend. A
interface esconde botões apenas por conforto visual — a API repete a checagem em
cada operação, inclusive nas que já foram "validadas" na tela.

O modelo é híbrido, igual ao restante do sistema:
  perfil  → conjunto padrão de permissões (tabela abaixo);
  usuário → concessões e revogações individuais (coluna `permissoes_extras` /
            `permissoes_revogadas` em `govinfra_usuarios`).

O efetivo é: (permissões do perfil ∪ extras) − revogadas, com o
`administrador` sempre podendo tudo.
"""

from collections.abc import Iterable
from enum import Enum


class Perfil(str, Enum):
    """Perfis previstos no item 46 da especificação."""

    ADMINISTRADOR = "administrador"
    GESTOR = "gestor"
    ATENDENTE = "atendente"
    TECNICO = "tecnico"
    OPERADOR = "operador"
    MOTORISTA = "motorista"
    COMBUSTIVEL = "combustivel"
    MANUTENCAO = "manutencao"
    CONSULTA = "consulta"

    def __str__(self) -> str:  # pragma: no cover - conveniência
        return self.value


ROTULOS_PERFIL: dict[str, str] = {
    Perfil.ADMINISTRADOR.value: "Administrador do módulo",
    Perfil.GESTOR.value: "Gestor da Infraestrutura",
    Perfil.ATENDENTE.value: "Atendente",
    Perfil.TECNICO.value: "Técnico / fiscal",
    Perfil.OPERADOR.value: "Operador de máquina",
    Perfil.MOTORISTA.value: "Motorista",
    Perfil.COMBUSTIVEL.value: "Responsável pelo combustível",
    Perfil.MANUTENCAO.value: "Responsável pela manutenção",
    Perfil.CONSULTA.value: "Consulta (somente leitura)",
}


class P(str, Enum):
    """Permissões granulares. O valor é a chave usada na API e no banco."""

    # Painel e consultas gerais
    DASHBOARD_VISUALIZAR = "govinfra.dashboard.visualizar"
    MAPA_VISUALIZAR = "govinfra.mapa.visualizar"
    BUSCA_GLOBAL = "govinfra.busca.global"

    # Pessoas e imóveis
    PESSOAS_VISUALIZAR = "govinfra.pessoas.visualizar"
    PESSOAS_CRIAR = "govinfra.pessoas.criar"
    PESSOAS_EDITAR = "govinfra.pessoas.editar"
    PESSOAS_VER_CPF = "govinfra.pessoas.ver_cpf"
    IMOVEIS_VISUALIZAR = "govinfra.imoveis.visualizar"
    IMOVEIS_CRIAR = "govinfra.imoveis.criar"
    IMOVEIS_EDITAR = "govinfra.imoveis.editar"

    # Bloqueios
    BLOQUEIOS_VISUALIZAR = "govinfra.bloqueios.visualizar"
    BLOQUEIOS_CRIAR = "govinfra.bloqueios.criar"
    BLOQUEIOS_REMOVER = "govinfra.bloqueios.remover"
    BLOQUEIOS_EXCECAO = "govinfra.bloqueios.excecao"

    # Caçambas
    CACAMBAS_VISUALIZAR = "govinfra.cacambas.visualizar"
    CACAMBAS_CRIAR = "govinfra.cacambas.criar"
    CACAMBAS_EDITAR = "govinfra.cacambas.editar"
    CACAMBAS_BAIXAR = "govinfra.cacambas.baixar"
    CACAMBAS_MOVIMENTAR = "govinfra.cacambas.movimentar"

    # Solicitações (caçamba)
    SOLICITACOES_VISUALIZAR = "govinfra.solicitacoes.visualizar"
    SOLICITACOES_CRIAR = "govinfra.solicitacoes.criar"
    SOLICITACOES_EDITAR = "govinfra.solicitacoes.editar"
    SOLICITACOES_APROVAR = "govinfra.solicitacoes.aprovar"
    SOLICITACOES_REPROVAR = "govinfra.solicitacoes.reprovar"
    SOLICITACOES_CANCELAR = "govinfra.solicitacoes.cancelar"
    ENTREGAS_REGISTRAR = "govinfra.entregas.registrar"
    RETIRADAS_REGISTRAR = "govinfra.retiradas.registrar"

    # Agenda
    AGENDA_VISUALIZAR = "govinfra.agenda.visualizar"
    AGENDA_AGENDAR = "govinfra.agenda.agendar"
    AGENDA_REAGENDAR = "govinfra.agenda.reagendar"

    # Porteira Adentro
    PORTEIRA_VISUALIZAR = "govinfra.porteira.visualizar"
    PORTEIRA_CRIAR = "govinfra.porteira.criar"
    PORTEIRA_ANALISAR = "govinfra.porteira.analisar"
    PORTEIRA_APROVAR = "govinfra.porteira.aprovar"
    VISTORIAS_REALIZAR = "govinfra.vistorias.realizar"
    HORAS_VISUALIZAR = "govinfra.horas.visualizar"
    HORAS_CONCEDER = "govinfra.horas.conceder"
    HORAS_AJUSTAR = "govinfra.horas.ajustar"
    HORAS_ADICIONAIS_SOLICITAR = "govinfra.horas_adicionais.solicitar"
    HORAS_ADICIONAIS_APROVAR = "govinfra.horas_adicionais.aprovar"

    # Ordens de serviço e execução
    ORDENS_VISUALIZAR = "govinfra.ordens.visualizar"
    ORDENS_EMITIR = "govinfra.ordens.emitir"
    ORDENS_EXECUTAR = "govinfra.ordens.executar"
    ORDENS_CORRIGIR = "govinfra.ordens.corrigir"
    VIAGENS_REGISTRAR = "govinfra.viagens.registrar"

    # Frota
    MAQUINAS_VISUALIZAR = "govinfra.maquinas.visualizar"
    MAQUINAS_GERENCIAR = "govinfra.maquinas.gerenciar"
    VEICULOS_VISUALIZAR = "govinfra.veiculos.visualizar"
    VEICULOS_GERENCIAR = "govinfra.veiculos.gerenciar"
    VEICULOS_VER_RENAVAM = "govinfra.veiculos.ver_renavam"
    OPERADORES_VISUALIZAR = "govinfra.operadores.visualizar"
    OPERADORES_GERENCIAR = "govinfra.operadores.gerenciar"
    MEDIDORES_CORRIGIR = "govinfra.medidores.corrigir"

    # Combustível
    COMBUSTIVEL_VISUALIZAR = "govinfra.combustivel.visualizar"
    COMBUSTIVEL_REGISTRAR = "govinfra.combustivel.registrar"
    COMBUSTIVEL_ESTOQUE = "govinfra.combustivel.estoque"
    COMBUSTIVEL_AJUSTAR = "govinfra.combustivel.ajustar"

    # Manutenções
    MANUTENCOES_VISUALIZAR = "govinfra.manutencoes.visualizar"
    MANUTENCOES_GERENCIAR = "govinfra.manutencoes.gerenciar"

    # Relatórios, configuração e auditoria
    RELATORIOS_VISUALIZAR = "govinfra.relatorios.visualizar"
    RELATORIOS_EXPORTAR = "govinfra.relatorios.exportar"
    CONFIGURACOES_VISUALIZAR = "govinfra.configuracoes.visualizar"
    CONFIGURACOES_EDITAR = "govinfra.configuracoes.editar"
    AUDITORIA_VISUALIZAR = "govinfra.auditoria.visualizar"
    ARQUIVOS_BAIXAR = "govinfra.arquivos.baixar"
    ARQUIVOS_ENVIAR = "govinfra.arquivos.enviar"
    ARQUIVOS_REMOVER = "govinfra.arquivos.remover"

    def __str__(self) -> str:  # pragma: no cover
        return self.value


DESCRICOES: dict[str, str] = {
    P.PESSOAS_VER_CPF.value: "Ver o CPF completo (sem máscara) das pessoas cadastradas",
    P.VEICULOS_VER_RENAVAM.value: "Ver o RENAVAM completo dos veículos",
    P.BLOQUEIOS_EXCECAO.value: "Liberar atendimento apesar de bloqueio ativo, com justificativa registrada",
    P.HORAS_AJUSTAR.value: "Lançar ajuste manual no banco de horas do produtor",
    P.MEDIDORES_CORRIGIR.value: "Corrigir horímetro ou quilometragem para valor menor que o último registro",
    P.ORDENS_CORRIGIR.value: "Corrigir horas apontadas na ordem de serviço já encerrada",
    P.COMBUSTIVEL_AJUSTAR.value: "Ajustar estoque de combustível, inclusive permitindo saldo negativo",
}


# Conjuntos reaproveitados na composição dos perfis.
_LEITURA_BASICA: frozenset[P] = frozenset(
    {
        P.DASHBOARD_VISUALIZAR,
        P.MAPA_VISUALIZAR,
        P.BUSCA_GLOBAL,
        P.PESSOAS_VISUALIZAR,
        P.IMOVEIS_VISUALIZAR,
        P.BLOQUEIOS_VISUALIZAR,
        P.CACAMBAS_VISUALIZAR,
        P.SOLICITACOES_VISUALIZAR,
        P.AGENDA_VISUALIZAR,
        P.PORTEIRA_VISUALIZAR,
        P.HORAS_VISUALIZAR,
        P.ORDENS_VISUALIZAR,
        P.MAQUINAS_VISUALIZAR,
        P.VEICULOS_VISUALIZAR,
        P.OPERADORES_VISUALIZAR,
        P.COMBUSTIVEL_VISUALIZAR,
        P.MANUTENCOES_VISUALIZAR,
        P.RELATORIOS_VISUALIZAR,
        P.ARQUIVOS_BAIXAR,
    }
)

_ATENDIMENTO: frozenset[P] = frozenset(
    {
        P.PESSOAS_CRIAR,
        P.PESSOAS_EDITAR,
        P.IMOVEIS_CRIAR,
        P.IMOVEIS_EDITAR,
        P.SOLICITACOES_CRIAR,
        P.SOLICITACOES_EDITAR,
        P.PORTEIRA_CRIAR,
        P.AGENDA_AGENDAR,
        P.ARQUIVOS_ENVIAR,
    }
)

_GESTAO: frozenset[P] = frozenset(
    {
        P.SOLICITACOES_APROVAR,
        P.SOLICITACOES_REPROVAR,
        P.SOLICITACOES_CANCELAR,
        P.AGENDA_REAGENDAR,
        P.BLOQUEIOS_CRIAR,
        P.BLOQUEIOS_REMOVER,
        P.BLOQUEIOS_EXCECAO,
        P.PORTEIRA_ANALISAR,
        P.PORTEIRA_APROVAR,
        P.HORAS_CONCEDER,
        P.HORAS_AJUSTAR,
        P.HORAS_ADICIONAIS_APROVAR,
        P.ORDENS_EMITIR,
        P.ORDENS_CORRIGIR,
        P.CACAMBAS_CRIAR,
        P.CACAMBAS_EDITAR,
        P.CACAMBAS_BAIXAR,
        P.CACAMBAS_MOVIMENTAR,
        P.MAQUINAS_GERENCIAR,
        P.VEICULOS_GERENCIAR,
        P.OPERADORES_GERENCIAR,
        P.MANUTENCOES_GERENCIAR,
        P.RELATORIOS_EXPORTAR,
        P.CONFIGURACOES_VISUALIZAR,
        P.PESSOAS_VER_CPF,
        P.VEICULOS_VER_RENAVAM,
        P.MEDIDORES_CORRIGIR,
        P.ARQUIVOS_ENVIAR,
        P.ARQUIVOS_REMOVER,
    }
)


PERMISSOES_POR_PERFIL: dict[str, frozenset[P]] = {
    # O administrador não aparece aqui: ele recebe TODAS as permissões em
    # `permissoes_do_perfil`, para que uma permissão nova nunca fique órfã.
    Perfil.GESTOR.value: _LEITURA_BASICA | _ATENDIMENTO | _GESTAO | frozenset(
        {P.AUDITORIA_VISUALIZAR, P.ENTREGAS_REGISTRAR, P.RETIRADAS_REGISTRAR}
    ),
    Perfil.ATENDENTE.value: _LEITURA_BASICA | _ATENDIMENTO,
    Perfil.TECNICO.value: _LEITURA_BASICA
    | frozenset(
        {
            P.VISTORIAS_REALIZAR,
            P.ARQUIVOS_ENVIAR,
            P.IMOVEIS_EDITAR,
            P.PORTEIRA_ANALISAR,
        }
    ),
    Perfil.OPERADOR.value: frozenset(
        {
            P.DASHBOARD_VISUALIZAR,
            P.AGENDA_VISUALIZAR,
            P.ORDENS_VISUALIZAR,
            P.ORDENS_EXECUTAR,
            P.HORAS_ADICIONAIS_SOLICITAR,
            P.COMBUSTIVEL_REGISTRAR,
            P.MAQUINAS_VISUALIZAR,
            P.MAPA_VISUALIZAR,
            P.ARQUIVOS_ENVIAR,
            P.ARQUIVOS_BAIXAR,
        }
    ),
    Perfil.MOTORISTA.value: frozenset(
        {
            P.DASHBOARD_VISUALIZAR,
            P.AGENDA_VISUALIZAR,
            P.ORDENS_VISUALIZAR,
            P.SOLICITACOES_VISUALIZAR,
            P.ENTREGAS_REGISTRAR,
            P.RETIRADAS_REGISTRAR,
            P.VIAGENS_REGISTRAR,
            P.COMBUSTIVEL_REGISTRAR,
            P.VEICULOS_VISUALIZAR,
            P.CACAMBAS_VISUALIZAR,
            P.MAPA_VISUALIZAR,
            P.ARQUIVOS_ENVIAR,
            P.ARQUIVOS_BAIXAR,
        }
    ),
    Perfil.COMBUSTIVEL.value: _LEITURA_BASICA
    | frozenset(
        {
            P.COMBUSTIVEL_REGISTRAR,
            P.COMBUSTIVEL_ESTOQUE,
            P.RELATORIOS_EXPORTAR,
            P.ARQUIVOS_ENVIAR,
        }
    ),
    Perfil.MANUTENCAO.value: _LEITURA_BASICA
    | frozenset(
        {
            P.MANUTENCOES_GERENCIAR,
            P.MAQUINAS_GERENCIAR,
            P.VEICULOS_GERENCIAR,
            P.CACAMBAS_EDITAR,
            P.RELATORIOS_EXPORTAR,
            P.ARQUIVOS_ENVIAR,
        }
    ),
    Perfil.CONSULTA.value: _LEITURA_BASICA,
}


TODAS: frozenset[P] = frozenset(P)


def permissoes_do_perfil(perfil: str) -> frozenset[P]:
    if perfil == Perfil.ADMINISTRADOR.value:
        return TODAS
    return PERMISSOES_POR_PERFIL.get(perfil, frozenset())


def permissoes_efetivas(
    perfil: str,
    extras: Iterable[str] | None = None,
    revogadas: Iterable[str] | None = None,
) -> set[str]:
    """Permissões finais do usuário: (perfil ∪ extras) − revogadas.

    O administrador nunca perde permissão por revogação individual — retirar
    acesso dele é feito trocando o perfil, o que fica registrado na auditoria.
    """
    if perfil == Perfil.ADMINISTRADOR.value:
        return {p.value for p in TODAS}

    efetivas = {p.value for p in permissoes_do_perfil(perfil)}
    efetivas |= {str(e) for e in (extras or [])}
    efetivas -= {str(r) for r in (revogadas or [])}
    return efetivas


def catalogo() -> list[dict]:
    """Catálogo exibido na tela de permissões (agrupado por área)."""
    grupos: dict[str, list[dict]] = {}
    for permissao in sorted(TODAS, key=lambda p: p.value):
        partes = permissao.value.split(".")
        area = partes[1] if len(partes) > 2 else "geral"
        grupos.setdefault(area, []).append(
            {
                "chave": permissao.value,
                "acao": partes[-1],
                "descricao": DESCRICOES.get(permissao.value),
            }
        )
    return [
        {"area": area, "permissoes": itens}
        for area, itens in sorted(grupos.items(), key=lambda item: item[0])
    ]


def mapa_perfis() -> list[dict]:
    return [
        {
            "chave": perfil.value,
            "rotulo": ROTULOS_PERFIL[perfil.value],
            "permissoes": sorted(p.value for p in permissoes_do_perfil(perfil.value)),
        }
        for perfil in Perfil
    ]
