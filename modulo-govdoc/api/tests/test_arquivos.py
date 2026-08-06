"""Validação de arquivos: extensão, assinatura binária, antivírus e hash."""

import io
import zipfile

from app.core.security import hash_bytes
from app.services.files import (
    sanitize_filename,
    scan_bytes,
    validate_upload,
)
from tests.conftest import arquivo_pdf


def test_pdf_valido_e_aceito():
    resultado = validate_upload("relatorio.pdf", arquivo_pdf())
    assert resultado.ok
    assert resultado.extension == ".pdf"
    assert resultado.mime_type == "application/pdf"
    assert resultado.sha256 == hash_bytes(arquivo_pdf())


def test_extensao_bloqueada_e_recusada():
    resultado = validate_upload("virus.exe", b"MZ conteudo qualquer")
    assert not resultado.ok
    assert "bloqueado" in resultado.message


def test_conteudo_nao_corresponde_a_extensao():
    """PDF renomeado como PNG deve ser recusado — não confiamos na extensão."""
    resultado = validate_upload("imagem.png", arquivo_pdf())
    assert not resultado.ok
    assert "não corresponde" in resultado.message


def test_executavel_disfarcado_de_pdf():
    resultado = validate_upload("documento.pdf", b"MZ\x90\x00\x03" + b"\x00" * 500)
    assert not resultado.ok
    assert "executável" in resultado.message


def test_arquivo_vazio_recusado():
    assert not validate_upload("vazio.pdf", b"").ok


def test_tamanho_maximo_respeitado():
    resultado = validate_upload("grande.pdf", arquivo_pdf() + b"x" * 5000, max_size_bytes=100)
    assert not resultado.ok
    assert "tamanho máximo" in resultado.message


def test_nome_de_arquivo_sanitizado():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("nota:fiscal|2026.pdf") == "notafiscal2026.pdf"
    assert sanitize_filename("") == "arquivo"


def test_svg_com_script_recusado():
    svg = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    resultado = validate_upload("mapa.svg", svg)
    assert not resultado.ok
    assert "script" in resultado.message


def test_zip_com_caminho_invalido_recusado():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as arquivo:
        arquivo.writestr("../fora.txt", "conteudo")
    resultado = validate_upload("pacote.zip", buffer.getvalue())
    assert not resultado.ok
    assert "caminhos inválidos" in resultado.message


def test_bomba_de_compressao_recusada():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as arquivo:
        arquivo.writestr("grande.txt", "0" * (20 * 1024 * 1024))
    resultado = validate_upload("bomba.zip", buffer.getvalue())
    assert not resultado.ok
    assert "compressão suspeita" in resultado.message


def test_antivirus_detecta_assinatura_eicar():
    limpo, motivo = scan_bytes(b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD")
    assert not limpo
    assert "EICAR" in motivo


def test_antivirus_aprova_arquivo_limpo():
    limpo, motivo = scan_bytes(arquivo_pdf())
    assert limpo
    assert motivo in {"heuristica_local", "clamav_limpo", "verificacao_desabilitada"}


def test_pdf_com_acao_de_execucao_recusado():
    conteudo = arquivo_pdf() + b"/Launch << /F (calc.exe) >>"
    limpo, motivo = scan_bytes(conteudo)
    assert not limpo
    assert "suspeito" in motivo
