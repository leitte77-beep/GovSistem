"""Extração de texto de documentos para a camada de IA (§29, §92).

Lê PDF, DOCX e formatos textuais. Não usa OCR: um PDF digitalizado (imagem) não
tem texto embutido e a extração devolve vazio — a rota informa isso em vez de
enviar lixo ao provedor de IA.
"""

import io
import logging

logger = logging.getLogger("govtask.extracao")

LIMITE_CARACTERES = 60_000


class ExtracaoNaoSuportada(RuntimeError):
    """Formato sem extrator de texto implementado."""


class ExtracaoFalhou(RuntimeError):
    """O arquivo não pôde ser lido."""


def _pdf(conteudo: bytes) -> str:
    from pypdf import PdfReader

    leitor = PdfReader(io.BytesIO(conteudo))
    return "\n".join((pagina.extract_text() or "") for pagina in leitor.pages)


def _docx(conteudo: bytes) -> str:
    import docx

    documento = docx.Document(io.BytesIO(conteudo))
    return "\n".join(paragrafo.text for paragrafo in documento.paragraphs)


def _texto(conteudo: bytes) -> str:
    return conteudo.decode("utf-8", errors="replace")


_EXTRATORES = {
    ".pdf": _pdf,
    ".docx": _docx,
    ".txt": _texto,
    ".csv": _texto,
    ".xml": _texto,
    ".dxf": _texto,
}


def texto_de(nome: str, mime: str | None, conteudo: bytes) -> str:
    """Devolve o texto extraído, truncado. Levanta erro claro quando não há."""
    extensao = ("." + nome.rsplit(".", 1)[-1].lower()) if "." in nome else ""
    extrator = _EXTRATORES.get(extensao)
    if extrator is None:
        raise ExtracaoNaoSuportada(
            "Extração de texto disponível para PDF, DOCX, TXT, CSV e XML"
        )
    try:
        texto = extrator(conteudo)
    except Exception as exc:  # biblioteca ausente, arquivo corrompido
        logger.warning("falha ao extrair texto de %s", nome, exc_info=True)
        raise ExtracaoFalhou("Não foi possível ler o texto deste documento") from exc
    return texto.strip()[:LIMITE_CARACTERES]
