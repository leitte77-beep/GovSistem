"""Magic number, lista branca e tamanho de anexos (B.12-054)."""

import pytest

from app.core.antivirus import validar_anexo
from app.core.errors import Unprocessable


def test_pdf_valido():
    resultado = validar_anexo("laudo.pdf", b"%PDF-1.4 conteudo")
    assert resultado.mime == "application/pdf"
    assert resultado.status_antivirus == "NAO_APLICAVEL"


def test_extensao_mentirosa_rejeitada():
    with pytest.raises(Unprocessable):
        validar_anexo("foto.pdf", b"\xff\xd8\xff\xe0 imagem")


def test_extensao_fora_da_lista_branca():
    with pytest.raises(Unprocessable):
        validar_anexo("script.exe", b"MZ\x90\x00")


def test_arquivo_vazio():
    with pytest.raises(Unprocessable):
        validar_anexo("vazio.pdf", b"")
