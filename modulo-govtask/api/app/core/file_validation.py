"""Validação de arquivos enviados (§103).

Confiar na extensão ou no `Content-Type` do navegador é confiar no cliente. Um
`.pdf` pode ser um executável renomeado, e o header vem de quem envia. Aqui o
tipo é conferido pelos **bytes iniciais do arquivo**, e o nome com que ele é
gravado no storage nunca vem do usuário.
"""

import hashlib
import re
import unicodedata
import uuid

from fastapi import HTTPException

from app.core.config import settings

# Assinaturas conhecidas (magic numbers). ZIP cobre docx/xlsx/pptx, que são
# contêineres OOXML — daí a conferência posterior pela extensão declarada.
ASSINATURAS: list[tuple[bytes, str]] = [
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"PK\x03\x04", "application/zip"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/x-ole-storage"),  # doc/xls antigos
    (b"{\\rtf", "application/rtf"),
]

# O que cada extensão aceita como conteúdo real.
EXTENSAO_PARA_TIPOS: dict[str, set[str]] = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".gif": {"image/gif"},
    ".docx": {"application/zip"},
    ".xlsx": {"application/zip"},
    ".pptx": {"application/zip"},
    ".zip": {"application/zip"},
    ".doc": {"application/x-ole-storage"},
    ".xls": {"application/x-ole-storage"},
    ".rtf": {"application/rtf"},
    # Formatos textuais não têm assinatura; validam-se por conteúdo legível.
    ".csv": {"texto"},
    ".txt": {"texto"},
    ".xml": {"texto"},
    ".dwg": {"binario"},
    ".dxf": {"texto", "binario"},
}

MIME_POR_EXTENSAO: dict[str, str] = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".doc": "application/msword",
    ".xls": "application/vnd.ms-excel",
    ".zip": "application/zip",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".rtf": "application/rtf",
    ".dwg": "image/vnd.dwg",
    ".dxf": "image/vnd.dxf",
}

_NOME_SEGURO = re.compile(r"[^A-Za-z0-9._ -]")


class ArquivoInvalido(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=422, detail=detail)


def extensao_de(nome: str) -> str:
    if not nome or "." not in nome:
        return ""
    return "." + nome.rsplit(".", 1)[-1].lower()


def sanitizar_nome(nome: str) -> str:
    """Nome de exibição, inerte: sem separador de caminho e sem `..`.

    É só o rótulo que o usuário vê e baixa — o nome no disco é gerado por nós,
    então aqui basta desarmar o texto sem destruí-lo. Separadores viram hífen
    em vez de cortar o nome, porque "Ofício 015/2026.pdf" é um nome legítimo
    no serviço público e o usuário espera reconhecê-lo depois.
    """
    limpo = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode()
    limpo = limpo.replace("\\", "/").replace("/", "-")
    limpo = _NOME_SEGURO.sub("_", limpo)
    limpo = re.sub(r"\.{2,}", ".", limpo).strip(". ")
    limpo = re.sub(r"_{2,}", "_", limpo)
    return limpo[:200] or "arquivo"


def tipo_real(conteudo: bytes) -> str:
    """Tipo deduzido dos bytes iniciais; 'texto' ou 'binario' quando não há assinatura."""
    for assinatura, tipo in ASSINATURAS:
        if conteudo.startswith(assinatura):
            return tipo
    amostra = conteudo[:2048]
    try:
        amostra.decode("utf-8")
        return "texto"
    except UnicodeDecodeError:
        return "binario"


def validar(nome_original: str, conteudo: bytes) -> tuple[str, str, str]:
    """Valida o arquivo e devolve (nome_exibicao, nome_no_storage, mime).

    Levanta 422 com mensagem para o usuário em qualquer reprovação.
    """
    if not nome_original:
        raise ArquivoInvalido("Informe o nome do arquivo")
    if not conteudo:
        raise ArquivoInvalido("Arquivo vazio")
    if len(conteudo) > settings.MAX_UPLOAD_SIZE_BYTES:
        limite = settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
        raise ArquivoInvalido(f"Arquivo maior que o limite de {limite} MB")

    nome = sanitizar_nome(nome_original)
    extensao = extensao_de(nome)
    if not extensao:
        raise ArquivoInvalido("Arquivo sem extensão")
    if extensao not in EXTENSAO_PARA_TIPOS:
        permitidas = ", ".join(sorted(EXTENSAO_PARA_TIPOS))
        raise ArquivoInvalido(f"Extensão {extensao} não permitida. Aceitas: {permitidas}")

    detectado = tipo_real(conteudo)
    aceitos = EXTENSAO_PARA_TIPOS[extensao]
    if detectado not in aceitos:
        raise ArquivoInvalido(
            f"O conteúdo do arquivo não corresponde à extensão {extensao}"
        )

    # Nome interno: aleatório e sem relação com o que o usuário enviou, o que
    # elimina de uma vez path traversal e colisão entre arquivos homônimos.
    nome_storage = f"{uuid.uuid4().hex}{extensao}"
    return nome, nome_storage, MIME_POR_EXTENSAO.get(extensao, "application/octet-stream")


def hash_do_conteudo(conteudo: bytes) -> str:
    """SHA-256 do arquivo, para conferir integridade entre versões (§31)."""
    return hashlib.sha256(conteudo).hexdigest()
