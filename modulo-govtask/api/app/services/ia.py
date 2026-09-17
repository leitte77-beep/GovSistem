"""Camada de IA do GovTask (§92).

Desligada por padrão. Quando ligada, cada função monta um prompt **factual** a
partir do que está registrado na demanda e devolve uma sugestão em texto. A IA
nunca grava nada: quem aplica é a rota normal de edição, com o usuário no meio.
É o que mantém a regra do §92 — "IA nunca poderá alterar oficialmente
informações sem confirmação humana".

O provedor é trocável. Hoje só o Gemini está implementado; acrescentar outro é
um ramo novo em `_chamar_provedor`, sem tocar nas funções de prompt.
"""

import json
import logging
import re

import httpx

from app.core.config import settings

logger = logging.getLogger("govtask.ia")

_PREFIXO_LISTA = re.compile(r"^\s*(?:[-•*]|\d+[.)])\s*")
_CERCA_JSON = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


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


async def _chamar_provedor(prompt: str, *, max_tokens: int | None = None) -> str:
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
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_tokens or settings.AI_MAX_TOKENS,
        },
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


async def gerar_oficio(demanda) -> str:
    """Redige o corpo de um ofício a partir do que está registrado (§79, §92).

    Devolve texto para revisão — não protocola, não assina e não grava.
    """
    prompt = (
        _contexto_demanda(demanda)
        + "\nRedija o corpo de um ofício oficial do Município, em português do "
        "Brasil, formal e objetivo, com destinatário genérico quando não "
        "informado. Use somente os dados acima; não invente números de "
        "protocolo nem datas que não estejam registradas. Devolva apenas o "
        "texto do ofício, sem título nem comentários."
    )
    return await _chamar_provedor(prompt, max_tokens=1500)


async def extrair_dados_documento(nome_arquivo: str, texto: str) -> dict:
    """Extrai campos estruturados do texto de um documento (§92).

    A saída é uma sugestão de preenchimento; quem confirma é o usuário.
    """
    recorte = texto[:8000]
    prompt = (
        f"Documento '{nome_arquivo}'. Conteúdo textual extraído:\n"
        "---\n"
        f"{recorte}\n"
        "---\n"
        "Extraia, SOMENTE do conteúdo acima, os campos que conseguir identificar. "
        "Responda exclusivamente com um objeto JSON, sem comentários, usando as "
        "chaves: objeto, valor, orgao, numero_documento, data_documento, "
        "parlamentar, programa, observacoes. Use null para o que não encontrar. "
        "Não invente valores."
    )
    bruto = await _chamar_provedor(prompt, max_tokens=1200)
    return _json_do_texto(bruto)


async def ranquear_demandas_semelhantes(demanda, candidatas: list[dict]) -> list[dict]:
    """Reordena demandas candidatas por semelhança com a demanda dada (§92).

    `candidatas` já vem de uma recuperação textual; a IA só reordena e explica.
    """
    if not candidatas:
        return []
    listagem = "\n".join(
        f"- id={c['id']} | {c['numero']} | {c['titulo']} | {c.get('objeto') or ''}"
        for c in candidatas
    )
    prompt = (
        _contexto_demanda(demanda)
        + "\nOutras demandas candidatas:\n"
        + listagem
        + "\nOrdene as candidatas da mais para a menos semelhante à demanda acima. "
        "Responda exclusivamente com um array JSON de objetos com as chaves "
        "id (string), score (0 a 100) e motivo (uma frase curta). Inclua apenas "
        "as que tenham semelhança real."
    )
    bruto = await _chamar_provedor(prompt, max_tokens=1200)
    dados = _json_do_texto(bruto)
    if isinstance(dados, dict):
        dados = dados.get("resultados") or dados.get("items") or []
    if not isinstance(dados, list):
        raise IAFalhou("Resposta de semelhança em formato inesperado")
    return [d for d in dados if isinstance(d, dict) and d.get("id")]


def _json_do_texto(bruto: str):
    """Interpreta JSON mesmo quando o modelo o cerca com ```json … ```."""
    texto = bruto.strip()
    cerca = _CERCA_JSON.search(texto)
    if cerca:
        texto = cerca.group(1).strip()
    try:
        return json.loads(texto)
    except (ValueError, TypeError) as exc:
        raise IAFalhou("A IA respondeu em formato não interpretável") from exc


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
