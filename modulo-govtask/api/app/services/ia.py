"""Camada de IA do GovTask (§92).

Desligada por padrão. Quando ligada, cada função monta um prompt **factual** a
partir do que está registrado na demanda e devolve uma sugestão em texto. A IA
nunca grava nada: quem aplica é a rota normal de edição, com o usuário no meio.
É o que mantém a regra do §92 — "IA nunca poderá alterar oficialmente
informações sem confirmação humana".

O provedor é trocável. Hoje só o Gemini está implementado; acrescentar outro é
um ramo novo em `_chamar_provedor`, sem tocar nas funções de prompt.
"""

import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger("govtask.ia")

_PREFIXO_LISTA = re.compile(r"^\s*(?:[-•*]|\d+[.)])\s*")


class IADesabilitada(RuntimeError):
    """O recurso foi chamado com a camada desligada ou sem chave."""


class IAFalhou(RuntimeError):
    """O provedor respondeu com erro ou em formato inesperado."""


def configurada() -> bool:
    return settings.AI_ENABLED and bool(settings.AI_API_KEY.get_secret_value())


def _cabecalho(rotulo: str, valor) -> str:
    if valor in (None, "", []):
        return ""
    return f"{rotulo}: {valor}\n"


async def _chamar_provedor(prompt: str) -> str:
    if not configurada():
        raise IADesabilitada("Camada de IA desligada neste ambiente")
    if settings.AI_PROVIDER != "gemini":
        raise IAFalhou(f"Provedor de IA não suportado: {settings.AI_PROVIDER}")

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.AI_MODEL}:generateContent"
    )
    corpo = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1024},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SEGUNDOS) as cliente:
            resposta = await cliente.post(
                url,
                params={"key": settings.AI_API_KEY.get_secret_value()},
                json=corpo,
            )
            resposta.raise_for_status()
            dados = resposta.json()
    except Exception as exc:  # rede, 4xx/5xx, timeout
        logger.warning("falha ao consultar o provedor de IA", exc_info=True)
        raise IAFalhou("O provedor de IA não respondeu como esperado") from exc

    try:
        return dados["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise IAFalhou("Resposta do provedor de IA em formato inesperado") from exc


def _contexto_demanda(demanda) -> str:
    """Monta o recorte factual enviado ao provedor. Nada além do que está lá."""
    tipo = getattr(getattr(demanda, "tipo", None), "rotulo", None)
    status = getattr(getattr(demanda, "status", None), "rotulo", None)
    setor = getattr(getattr(demanda, "setor_atual", None), "nome", None)
    responsavel = getattr(getattr(demanda, "responsavel_geral", None), "name", None)
    return (
        "Dados registrados da demanda (use somente isto; não invente fatos):\n"
        + _cabecalho("Número", demanda.numero)
        + _cabecalho("Título", demanda.titulo)
        + _cabecalho("Objeto", demanda.objeto)
        + _cabecalho("Descrição", demanda.descricao)
        + _cabecalho("Tipo", tipo)
        + _cabecalho("Situação", status)
        + _cabecalho("Prioridade", demanda.prioridade)
        + _cabecalho("Setor atual", setor)
        + _cabecalho("Responsável geral", responsavel)
        + _cabecalho("Prazo final", demanda.prazo_final)
        + _cabecalho("Aguardando terceiro", demanda.aguardando_terceiro)
        + _cabecalho("Bloqueio", demanda.bloqueio_motivo)
        + _cabecalho("Próxima ação registrada", demanda.proxima_acao)
        + _cabecalho("Resumo atual", demanda.resumo_executivo)
    )


async def sugerir_resumo(demanda) -> str:
    prompt = (
        _contexto_demanda(demanda)
        + "\nEscreva um resumo executivo objetivo da demanda em um parágrafo, "
        "em português do Brasil, no máximo 80 palavras. Não use marcadores."
    )
    return await _chamar_provedor(prompt)


async def sugerir_proxima_acao(demanda) -> str:
    prompt = (
        _contexto_demanda(demanda)
        + "\nSugira, em uma única frase no imperativo, a próxima ação necessária "
        "para a demanda avançar. Não explique nem liste alternativas."
    )
    return await _chamar_provedor(prompt)


async def sugerir_documentos_faltantes(demanda, documentos: list[str]) -> list[str]:
    existentes = ", ".join(documentos) if documentos else "nenhum"
    prompt = (
        _contexto_demanda(demanda)
        + f"\nDocumentos já anexados: {existentes}.\n"
        + "Liste apenas os documentos que provavelmente faltam para este tipo de "
        "demanda, um por linha, sem numeração e sem comentários. Se nada faltar, "
        "responda com a palavra NENHUM."
    )
    texto = await _chamar_provedor(prompt)
    if texto.strip().upper().startswith("NENHUM"):
        return []
    # O modelo costuma devolver a lista numerada mesmo quando se pede sem
    # numeração; o prefixo é descartado aqui em vez de virar nome de documento.
    linhas = [_PREFIXO_LISTA.sub("", linha).strip() for linha in texto.splitlines()]
    return [linha for linha in linhas if linha]
