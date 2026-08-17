"""Catálogo de permissões do GovCompras e mapeamento por perfil.

Princípio adotado: **toda** regra de acesso é verificada aqui, no backend. A
interface esconde botões apenas por conforto visual — a API repete a checagem
em cada operação (seção 82 — "quem solicitou não pode autorizar").

O modelo é híbrido, igual ao restante do sistema:
  perfil  → conjunto padrão de permissões (tabela abaixo);
  usuário → concessões e revogações individuais (`permissoes_extras` /
            `permissoes_revogadas` em `govcompras_users`).

O efetivo é: (permissões do perfil ∪ extras) − revogadas, com o
`administrador` sempre podendo tudo.
"""

from collections.abc import Iterable
from enum import Enum


class Perfil(str, Enum):
    """Perfis do módulo (seção 79 da especificação)."""

    ADMINISTRADOR = "administrador"
    SOLICITANTE = "solicitante"        # Secretaria solicitante
    COMPRAS = "compras"
    LICITACAO = "licitacao"
    CONTABILIDADE = "contabilidade"
    JURIDICO = "juridico"
    FISCAL = "fiscal"
    CONSULTA = "consulta"

    def __str__(self) -> str:  # pragma: no cover
        return self.value


ROTULOS_PERFIL: dict[str, str] = {
    Perfil.ADMINISTRADOR.value: "Administrador do módulo",
    Perfil.SOLICITANTE.value: "Secretaria solicitante",
    Perfil.COMPRAS.value: "Departamento de Compras",
    Perfil.LICITACAO.value: "Comissão/Setor de Licitações",
    Perfil.CONTABILIDADE.value: "Contabilidade",
    Perfil.JURIDICO.value: "Jurídico",
    Perfil.FISCAL.value: "Fiscal de contrato",
    Perfil.CONSULTA.value: "Consulta (somente leitura)",
}


class P(str, Enum):
    """Permissões granulares. O valor é a chave usada na API e no banco."""

    DASHBOARD_VISUALIZAR = "govcompras.dashboard.visualizar"
    BUSCA_GLOBAL = "govcompras.busca.global"

    PROCESSOS_VISUALIZAR = "govcompras.processos.visualizar"
    PROCESSOS_AVANCAR = "govcompras.processos.avancar"
    PROCESSOS_DEVOLVER = "govcompras.processos.devolver"
    PROCESSOS_CANCELAR = "govcompras.processos.cancelar"
    PROCESSOS_REABRIR = "govcompras.processos.reabrir"

    SOLICITACOES_VISUALIZAR = "govcompras.solicitacoes.visualizar"
    SOLICITACOES_CRIAR = "govcompras.solicitacoes.criar"
    SOLICITACOES_EDITAR = "govcompras.solicitacoes.editar"
    SOLICITACOES_ENVIAR = "govcompras.solicitacoes.enviar"

    PLANEJAMENTO_VISUALIZAR = "govcompras.planejamento.visualizar"
    PLANEJAMENTO_EDITAR = "govcompras.planejamento.editar"
    PLANEJAMENTO_APROVAR = "govcompras.planejamento.aprovar"

    CATALOGO_VISUALIZAR = "govcompras.catalogo.visualizar"
    CATALOGO_GERENCIAR = "govcompras.catalogo.gerenciar"
    FORNECEDORES_VISUALIZAR = "govcompras.fornecedores.visualizar"
    FORNECEDORES_GERENCIAR = "govcompras.fornecedores.gerenciar"
    COTACOES_VISUALIZAR = "govcompras.cotacoes.visualizar"
    COTACOES_GERENCIAR = "govcompras.cotacoes.gerenciar"

    DOTACAO_VISUALIZAR = "govcompras.dotacao.visualizar"
    DOTACAO_CONFIRMAR = "govcompras.dotacao.confirmar"
    AUTORIZACAO_DECIDIR = "govcompras.autorizacao.decidir"

    LICITACAO_VISUALIZAR = "govcompras.licitacao.visualizar"
    LICITACAO_GERENCIAR = "govcompras.licitacao.gerenciar"
    EDITAL_PUBLICAR = "govcompras.edital.publicar"
    HOMOLOGACAO_DECIDIR = "govcompras.homologacao.decidir"

    CONTRATOS_VISUALIZAR = "govcompras.contratos.visualizar"
    CONTRATOS_GERENCIAR = "govcompras.contratos.gerenciar"
    ATAS_VISUALIZAR = "govcompras.atas.visualizar"
    ATAS_GERENCIAR = "govcompras.atas.gerenciar"
    FISCALIZACAO_REGISTRAR = "govcompras.fiscalizacao.registrar"

    DOCUMENTOS_VISUALIZAR = "govcompras.documentos.visualizar"
    DOCUMENTOS_ENVIAR = "govcompras.documentos.enviar"
    COMENTARIOS_CRIAR = "govcompras.comentarios.criar"

    RELATORIOS_VISUALIZAR = "govcompras.relatorios.visualizar"
    RELATORIOS_EXPORTAR = "govcompras.relatorios.exportar"
    AUDITORIA_VISUALIZAR = "govcompras.auditoria.visualizar"

    CONFIGURACOES_VISUALIZAR = "govcompras.configuracoes.visualizar"
    CONFIGURACOES_EDITAR = "govcompras.configuracoes.editar"
    WORKFLOW_GERENCIAR = "govcompras.workflow.gerenciar"
    USUARIOS_GERENCIAR = "govcompras.usuarios.gerenciar"

    def __str__(self) -> str:  # pragma: no cover
        return self.value


_LEITURA_BASICA: frozenset[P] = frozenset(
    {
        P.DASHBOARD_VISUALIZAR,
        P.BUSCA_GLOBAL,
        P.PROCESSOS_VISUALIZAR,
        P.SOLICITACOES_VISUALIZAR,
        P.PLANEJAMENTO_VISUALIZAR,
        P.CATALOGO_VISUALIZAR,
        P.FORNECEDORES_VISUALIZAR,
        P.COTACOES_VISUALIZAR,
        P.DOTACAO_VISUALIZAR,
        P.LICITACAO_VISUALIZAR,
        P.CONTRATOS_VISUALIZAR,
        P.ATAS_VISUALIZAR,
        P.DOCUMENTOS_VISUALIZAR,
        P.RELATORIOS_VISUALIZAR,
    }
)

PERMISSOES_POR_PERFIL: dict[str, frozenset[P]] = {
    # O administrador não aparece aqui: recebe TODAS as permissões, para que
    # uma permissão nova nunca fique órfã.
    Perfil.SOLICITANTE.value: _LEITURA_BASICA
    | frozenset(
        {
            P.SOLICITACOES_CRIAR,
            P.SOLICITACOES_EDITAR,
            P.SOLICITACOES_ENVIAR,
            P.PLANEJAMENTO_EDITAR,
            P.PROCESSOS_AVANCAR,
            P.DOCUMENTOS_ENVIAR,
            P.COMENTARIOS_CRIAR,
        }
    ),
    Perfil.COMPRAS.value: _LEITURA_BASICA
    | frozenset(
        {
            P.CATALOGO_GERENCIAR,
            P.FORNECEDORES_GERENCIAR,
            P.COTACOES_GERENCIAR,
            P.PLANEJAMENTO_EDITAR,
            P.PLANEJAMENTO_APROVAR,
            P.PROCESSOS_AVANCAR,
            P.PROCESSOS_DEVOLVER,
            P.DOCUMENTOS_ENVIAR,
            P.COMENTARIOS_CRIAR,
            P.RELATORIOS_EXPORTAR,
        }
    ),
    Perfil.LICITACAO.value: _LEITURA_BASICA
    | frozenset(
        {
            P.LICITACAO_GERENCIAR,
            P.EDITAL_PUBLICAR,
            P.HOMOLOGACAO_DECIDIR,
            P.PROCESSOS_AVANCAR,
            P.PROCESSOS_DEVOLVER,
            P.CONTRATOS_GERENCIAR,
            P.DOCUMENTOS_ENVIAR,
            P.COMENTARIOS_CRIAR,
            P.RELATORIOS_EXPORTAR,
        }
    ),
    Perfil.CONTABILIDADE.value: _LEITURA_BASICA
    | frozenset(
        {
            P.DOTACAO_CONFIRMAR,
            P.PROCESSOS_AVANCAR,
            P.PROCESSOS_DEVOLVER,
            P.DOCUMENTOS_ENVIAR,
            P.COMENTARIOS_CRIAR,
        }
    ),
    Perfil.JURIDICO.value: _LEITURA_BASICA
    | frozenset(
        {
            P.PLANEJAMENTO_APROVAR,
            P.PROCESSOS_AVANCAR,
            P.PROCESSOS_DEVOLVER,
            P.DOCUMENTOS_ENVIAR,
            P.COMENTARIOS_CRIAR,
        }
    ),
    Perfil.FISCAL.value: _LEITURA_BASICA
    | frozenset(
        {
            P.FISCALIZACAO_REGISTRAR,
            P.DOCUMENTOS_ENVIAR,
            P.COMENTARIOS_CRIAR,
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
    grupos: dict[str, list[dict]] = {}
    for permissao in sorted(TODAS, key=lambda p: p.value):
        partes = permissao.value.split(".")
        area = partes[1] if len(partes) > 2 else "geral"
        grupos.setdefault(area, []).append({"chave": permissao.value, "acao": partes[-1]})
    return [{"area": area, "permissoes": itens} for area, itens in sorted(grupos.items())]


def mapa_perfis() -> list[dict]:
    return [
        {
            "chave": perfil.value,
            "rotulo": ROTULOS_PERFIL[perfil.value],
            "permissoes": sorted(p.value for p in permissoes_do_perfil(perfil.value)),
        }
        for perfil in Perfil
    ]
