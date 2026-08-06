"""Upload, validação e download de arquivos (item 40).

Defesas aplicadas a todo envio:
  • extensão em lista de permitidas e fora da lista de bloqueadas;
  • MIME conferido pela assinatura real do conteúdo, não pelo cabeçalho enviado;
  • limite de tamanho por tipo (foto/documento x vídeo);
  • nome interno aleatório — o nome enviado pelo usuário nunca vira caminho;
  • sem bit de execução e sem URL pública: o download passa pela API.
"""

import mimetypes
import os
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import hash_bytes
from app.core.storage import get_storage
from app.models.arquivos import Arquivo
from app.models.enums import CategoriaArquivo

# Assinaturas de arquivo (magic numbers) que aceitamos.
ASSINATURAS: list[tuple[bytes, str]] = [
    (b"%PDF-", "application/pdf"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"PK\x03\x04", "application/zip"),  # docx/xlsx/odt também caem aqui
]

# Conteúdos que jamais podem ser aceitos, mesmo com extensão inocente.
ASSINATURAS_PROIBIDAS: list[bytes] = [
    b"MZ",              # executável Windows
    b"\x7fELF",         # executável Linux
    b"#!",              # script com shebang
    b"<?php",           # código PHP
    b"<script",         # HTML com script
]

EXTENSOES_VIDEO = {".mp4", ".webm", ".mov"}


def _detectar_mime(conteudo: bytes, nome: str) -> str:
    for assinatura, mime in ASSINATURAS:
        if conteudo.startswith(assinatura):
            if mime == "image/jpeg":
                return mime
            if mime == "application/zip":
                # Documentos do Office/ODF são ZIP por dentro.
                adivinhado, _ = mimetypes.guess_type(nome)
                return adivinhado or mime
            return mime
    if conteudo[4:12] in (b"ftypisom", b"ftypmp42", b"ftypqt  "):
        return "video/mp4"
    adivinhado, _ = mimetypes.guess_type(nome)
    return adivinhado or "application/octet-stream"


def _nome_seguro(nome: str) -> str:
    """Remove diretórios e caracteres perigosos do nome exibido."""
    base = os.path.basename(nome or "arquivo")
    limpo = re.sub(r"[^\w\s.\-()]", "_", base, flags=re.UNICODE).strip()
    return (limpo or "arquivo")[:300]


def validar(conteudo: bytes, nome_original: str) -> tuple[str, str]:
    """Valida o arquivo e devolve (extensão, mime). Levanta AppError se recusar."""
    if not conteudo:
        raise AppError("O arquivo enviado está vazio.", 422, "arquivo_vazio")

    extensao = os.path.splitext(nome_original or "")[1].lower()
    if not extensao:
        raise AppError("O arquivo precisa ter extensão.", 422, "extensao_ausente")

    if extensao in {e.lower() for e in settings.BLOCKED_EXTENSIONS}:
        raise AppError(
            f"Arquivos com extensão {extensao} não são aceitos por questão de segurança.",
            422,
            "extensao_bloqueada",
        )
    if extensao not in {e.lower() for e in settings.ALLOWED_EXTENSIONS}:
        raise AppError(
            (
                f"A extensão {extensao} não está entre as permitidas. "
                "Envie PDF, imagem, vídeo ou planilha."
            ),
            422,
            "extensao_nao_permitida",
        )

    inicio = conteudo[:64]
    for proibida in ASSINATURAS_PROIBIDAS:
        if inicio.startswith(proibida):
            raise AppError(
                "O conteúdo do arquivo não confere com um documento ou imagem válida.",
                422,
                "conteudo_suspeito",
            )

    limite = (
        settings.MAX_VIDEO_SIZE_BYTES
        if extensao in EXTENSOES_VIDEO
        else settings.MAX_FILE_SIZE_BYTES
    )
    if len(conteudo) > limite:
        raise AppError(
            f"O arquivo tem {len(conteudo) / 1024 / 1024:.1f} MB e o limite é "
            f"{limite / 1024 / 1024:.0f} MB.",
            413,
            "arquivo_grande",
        )

    return extensao, _detectar_mime(conteudo, nome_original)


async def salvar(
    db: AsyncSession,
    *,
    organizacao_id: uuid.UUID,
    entidade: str,
    entidade_id: uuid.UUID,
    nome_original: str,
    conteudo: bytes,
    categoria: str = CategoriaArquivo.OUTRO.value,
    usuario_id: uuid.UUID | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    capturado_em: datetime | None = None,
    observacao: str | None = None,
    sensivel: bool = False,
) -> Arquivo:
    """Grava o arquivo no armazenamento e o registro no banco."""
    extensao, mime = validar(conteudo, nome_original)
    digest = hash_bytes(conteudo)

    # Duplicidade por hash dentro do mesmo registro: reaproveita em vez de
    # gravar duas cópias do mesmo conteúdo.
    existente = await db.scalar(
        select(Arquivo).where(
            Arquivo.organizacao_id == organizacao_id,
            Arquivo.entidade == entidade,
            Arquivo.entidade_id == entidade_id,
            Arquivo.hash_sha256 == digest,
            Arquivo.deleted_at.is_(None),
        )
    )
    if existente is not None:
        return existente

    # Chave aleatória: nada do nome enviado pelo usuário entra no caminho.
    chave = (
        f"{organizacao_id}/{entidade}/{entidade_id}/"
        f"{uuid.uuid4().hex}{extensao}"
    )
    await get_storage().put(chave, conteudo)

    arquivo = Arquivo(
        organizacao_id=organizacao_id,
        entidade=entidade,
        entidade_id=entidade_id,
        nome_original=_nome_seguro(nome_original),
        chave_armazenamento=chave,
        extensao=extensao,
        mime_type=mime,
        tamanho_bytes=len(conteudo),
        hash_sha256=digest,
        categoria=categoria,
        latitude=latitude,
        longitude=longitude,
        capturado_em=capturado_em or datetime.now(timezone.utc),
        observacao=observacao,
        sensivel=sensivel,
        created_by_id=usuario_id,
    )
    db.add(arquivo)
    await db.flush()
    return arquivo


async def listar(
    db: AsyncSession, entidade: str, entidade_id: uuid.UUID, categoria: str | None = None
) -> list[Arquivo]:
    consulta = select(Arquivo).where(
        Arquivo.entidade == entidade,
        Arquivo.entidade_id == entidade_id,
        Arquivo.deleted_at.is_(None),
    )
    if categoria:
        consulta = consulta.where(Arquivo.categoria == categoria)
    return list((await db.execute(consulta.order_by(Arquivo.created_at))).scalars().all())


async def remover(
    db: AsyncSession, arquivo: Arquivo, usuario_id: uuid.UUID | None, motivo: str
) -> None:
    """Exclusão lógica — o conteúdo permanece no armazenamento para auditoria."""
    arquivo.deleted_at = datetime.now(timezone.utc)
    arquivo.deleted_by_id = usuario_id
    arquivo.delete_reason = motivo
    await db.flush()


def resumo(arquivo: Arquivo) -> dict:
    """Representação devolvida pela API — sem caminho interno do servidor."""
    return {
        "id": arquivo.id,
        "nome": arquivo.nome_original,
        "categoria": arquivo.categoria,
        "mime_type": arquivo.mime_type,
        "tamanho_bytes": arquivo.tamanho_bytes,
        "enviado_em": arquivo.created_at,
        "observacao": arquivo.observacao,
        "latitude": arquivo.latitude,
        "longitude": arquivo.longitude,
        "capturado_em": arquivo.capturado_em,
        "e_imagem": arquivo.mime_type.startswith("image/"),
        "e_video": arquivo.mime_type.startswith("video/"),
    }
