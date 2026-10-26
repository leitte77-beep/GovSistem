"""Serializadores da Fase 6: programas, inscrições, programação e busca ativa."""

from __future__ import annotations

from datetime import date

from app.core.encryption import descriptografar
from app.models.nucleo import Usuario
from app.models.programa import (
    Programa,
    ProgramaBuscaAtiva,
    ProgramaInscricao,
    ProgramaProgramacao,
)
from app.schemas.programa import (
    BuscaAtivaOut,
    InscricaoOut,
    ProgramacaoOut,
    ProgramaOut,
)
from app.services.programas import _mascarados, _pode_ver_clinico


def _decrypt(valor: str | None) -> str | None:
    if not valor:
        return None
    try:
        return descriptografar(valor)
    except ValueError:
        return None


def programa_out(programa: Programa) -> ProgramaOut:
    return ProgramaOut.model_validate(programa)


def inscricao_out(inscricao: ProgramaInscricao, usuario: Usuario) -> InscricaoOut:
    saida = InscricaoOut.model_validate(inscricao)
    clinico = _pode_ver_clinico(usuario)
    cidadao = inscricao.cidadao
    programa = inscricao.programa
    mascarados = _mascarados(cidadao) if cidadao else {}
    return saida.model_copy(
        update={
            "programa_codigo": programa.codigo if programa else None,
            "programa_nome": programa.nome if programa else None,
            "cidadao_nome_exibicao": (
                (cidadao.nome_social or cidadao.nome) if cidadao else None
            ),
            "cidadao_data_nascimento": cidadao.data_nascimento if cidadao else None,
            **mascarados,
            "dados_clinicos": inscricao.dados_clinicos if clinico else None,
            "observacoes": (
                _decrypt(inscricao.observacoes_cifradas) if clinico else None
            ),
            "justificativa_excecao": (
                inscricao.justificativa_excecao if clinico else None
            ),
        }
    )


def programacao_out(
    programacao: ProgramaProgramacao, usuario: Usuario
) -> ProgramacaoOut:
    saida = ProgramacaoOut.model_validate(programacao)
    clinico = _pode_ver_clinico(usuario)
    inscricao = programacao.inscricao
    cidadao = inscricao.cidadao if inscricao else None
    programa = inscricao.programa if inscricao else None
    item = programacao.item
    atraso = None
    if programacao.situacao in {"PREVISTO", "REMARCADO"}:
        atraso = max((date.today() - programacao.previsto_para).days, 0)
    return saida.model_copy(
        update={
            "item_descricao": item.descricao if item else None,
            "programa_id": programa.id if programa else None,
            "programa_codigo": programa.codigo if programa else None,
            "cidadao_id": cidadao.id if cidadao else None,
            "cidadao_nome_exibicao": (
                (cidadao.nome_social or cidadao.nome) if cidadao else None
            ),
            "observacoes": (
                _decrypt(programacao.observacoes_cifradas) if clinico else None
            ),
            "atraso_dias": atraso,
        }
    )


def busca_out(registro: ProgramaBuscaAtiva, usuario: Usuario) -> BuscaAtivaOut:
    saida = BuscaAtivaOut.model_validate(registro)
    clinico = _pode_ver_clinico(usuario)
    inscricao = registro.inscricao
    cidadao = inscricao.cidadao if inscricao else None
    programa = inscricao.programa if inscricao else None
    programacao = registro.programacao
    atraso = None
    if programacao and programacao.situacao in {"PREVISTO", "REMARCADO"}:
        atraso = max((date.today() - programacao.previsto_para).days, 0)
    return saida.model_copy(
        update={
            "programa_codigo": programa.codigo if programa else None,
            "programa_nome": programa.nome if programa else None,
            "cidadao_id": cidadao.id if cidadao else None,
            "cidadao_nome_exibicao": (
                (cidadao.nome_social or cidadao.nome) if cidadao else None
            ),
            "previsto_para": programacao.previsto_para if programacao else None,
            "atraso_dias": atraso,
            "observacoes": (
                _decrypt(registro.observacoes_cifradas) if clinico else None
            ),
        }
    )


def mascarados_dict(cidadao) -> dict:
    """Atalho para reutilização em rotas específicas."""
    return _mascarados(cidadao) if cidadao else {}
