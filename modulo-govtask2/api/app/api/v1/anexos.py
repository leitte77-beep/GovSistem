"""Anexos por encaminhamento e fotos de medição."""

import uuid
from datetime import datetime, timezone

import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.pedidos import _buscar, _montar
from app.core import storage
from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.pedido import Anexo, CategoriaAnexo, TipoAndamento, TipoDocumento
from app.schemas.pedido import AnexoEditar, PedidoDetalhe
from app.services import pedidos as servico
from app.services import visualizacao

router = APIRouter(prefix="/pedidos/{pedido_id}/anexos", tags=["anexos"])

TRABALHAM = (Perm.PEDIDO_TRABALHAR, Perm.PEDIDO_ENCAMINHAR, Perm.ADMIN)


@router.post("", response_model=PedidoDetalhe, status_code=status.HTTP_201_CREATED)
async def enviar(
    pedido_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    encaminhamento_id: uuid.UUID | None = Form(default=None),
    medicao_id: uuid.UUID | None = Form(default=None),
    descricao: str | None = Form(default=None, max_length=255),
    categoria: str | None = Form(default=None, max_length=12),
    tipo_documento: str | None = Form(default=None, max_length=20),
    legenda: str | None = Form(default=None, max_length=255),
    user: User = Depends(require_permission(*TRABALHAM)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)

    alvo_enc = None
    if encaminhamento_id is not None:
        alvo_enc = servico.localizar(pedido, encaminhamento_id)
    elif medicao_id is None:
        # Sem destino, o documento entra no encaminhamento aberto.
        alvo_enc = servico.encaminhamento_aberto(pedido)

    alvo_med = None
    if medicao_id is not None:
        alvo_med = next((m for m in pedido.medicoes if m.id == medicao_id), None)
        if alvo_med is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Medição não encontrada neste pedido.",
            )

    cat = (categoria or "").upper()
    if cat not in {c.value for c in CategoriaAnexo}:
        cat = CategoriaAnexo.FOTO.value if alvo_med else CategoriaAnexo.DOCUMENTO.value

    caminho, tamanho = await storage.salvar(arquivo, pedido.organization_id, pedido.id)
    anexo = Anexo(
        pedido_id=pedido.id,
        encaminhamento_id=alvo_enc.id if alvo_enc else None,
        medicao_id=alvo_med.id if alvo_med else None,
        organization_id=pedido.organization_id,
        nome_original=arquivo.filename or "arquivo",
        caminho=caminho,
        tamanho_bytes=tamanho,
        content_type=arquivo.content_type,
        descricao=descricao,
        categoria=cat,
        tipo_documento=_tipo(tipo_documento, cat),
        legenda=(legenda or "").strip() or None,
        enviado_por_id=user.id,
    )
    db.add(anexo)
    await db.flush()

    onde = f" na medição {alvo_med.numero}" if alvo_med else (
        f" em “{alvo_enc.assunto}”" if alvo_enc else ""
    )
    servico.registrar(
        db,
        pedido,
        TipoAndamento.ANEXO,
        user,
        f"Anexou “{anexo.nome_original}”{onde}.",
        alvo_enc,
        dados={"anexo_id": str(anexo.id), "nome": anexo.nome_original},
    )
    await db.commit()
    return await _montar(db, await _buscar(db, pedido_id, user))


def _tipo(valor: str | None, categoria: str) -> str | None:
    v = (valor or "").strip().upper()
    if v in {t.value for t in TipoDocumento}:
        return v
    return TipoDocumento.FOTO.value if categoria == CategoriaAnexo.FOTO.value else None


async def _anexo_do_tenant(
    db: AsyncSession, pedido_id: uuid.UUID, anexo_id: uuid.UUID, user: User
) -> Anexo:
    result = await db.execute(
        select(Anexo).where(
            Anexo.id == anexo_id,
            Anexo.pedido_id == pedido_id,
            # Amarra ao tenant: id de anexo de outra prefeitura não serve.
            Anexo.organization_id == user.organization_id,
            Anexo.deleted_at.is_(None),
        )
    )
    anexo = result.scalar_one_or_none()
    if anexo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Anexo não encontrado."
        )
    return anexo


@router.get("/{anexo_id}/download")
async def baixar(
    pedido_id: uuid.UUID,
    anexo_id: uuid.UUID,
    inline: bool = False,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    anexo = await _anexo_do_tenant(db, pedido_id, anexo_id, user)
    return FileResponse(
        storage.caminho_absoluto(anexo.caminho),
        filename=anexo.nome_original,
        media_type=anexo.content_type or "application/octet-stream",
        content_disposition_type="inline" if inline else "attachment",
    )


@router.get("/{anexo_id}/visualizar")
async def visualizar(
    pedido_id: uuid.UUID,
    anexo_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    """Versão para ver no navegador: o próprio arquivo ou um PDF convertido."""
    anexo = await _anexo_do_tenant(db, pedido_id, anexo_id, user)
    original = storage.caminho_absoluto(anexo.caminho)
    if not visualizacao.suportado(anexo.nome_original):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Este tipo de arquivo não tem visualização. Baixe para abrir.",
        )
    if not visualizacao.precisa_converter(anexo.nome_original):
        return FileResponse(
            original,
            media_type=anexo.content_type or "application/octet-stream",
            content_disposition_type="inline",
            filename=anexo.nome_original,
        )
    try:
        pdf = await visualizacao.pdf_de(Path(original))
    except RuntimeError as erro:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(erro))
    return FileResponse(
        pdf,
        media_type="application/pdf",
        content_disposition_type="inline",
        filename=Path(anexo.nome_original).stem + ".pdf",
    )


@router.patch("/{anexo_id}", response_model=PedidoDetalhe)
async def classificar(
    pedido_id: uuid.UUID,
    anexo_id: uuid.UUID,
    body: AnexoEditar,
    user: User = Depends(require_permission(*TRABALHAM)),
    db: AsyncSession = Depends(get_db),
):
    """Tipo do documento e legenda (útil para fotos de obra)."""
    pedido = await _buscar(db, pedido_id, user)
    anexo = next((a for a in pedido.anexos if a.id == anexo_id and a.deleted_at is None), None)
    if anexo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo não encontrado.")
    dados = body.model_dump(exclude_unset=True)
    if "tipo_documento" in dados:
        anexo.tipo_documento = _tipo(dados["tipo_documento"], anexo.categoria)
    if "legenda" in dados:
        anexo.legenda = (dados["legenda"] or "").strip() or None
    await db.commit()
    return await _montar(db, await _buscar(db, pedido_id, user))


@router.delete("/{anexo_id}", response_model=PedidoDetalhe)
async def remover(
    pedido_id: uuid.UUID,
    anexo_id: uuid.UUID,
    motivo: str = Query(min_length=3, max_length=500),
    user: User = Depends(require_permission(Perm.PEDIDO_ENCAMINHAR, Perm.ADMIN)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    anexo = next(
        (a for a in pedido.anexos if a.id == anexo_id and a.deleted_at is None), None
    )
    if anexo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Anexo não encontrado."
        )
    # Exclusão lógica: o arquivo some da tela, o rastro fica para auditoria.
    anexo.deleted_at = datetime.now(timezone.utc)
    servico.registrar(
        db,
        pedido,
        TipoAndamento.ANEXO,
        user,
        f"Removeu “{anexo.nome_original}”: {motivo.strip()}",
        dados={"removido": anexo.nome_original},
    )
    await db.commit()
    return await _montar(db, await _buscar(db, pedido_id, user))


zip_router = APIRouter(prefix="/pedidos/{pedido_id}", tags=["anexos"])


@zip_router.get("/documentos.zip")
async def baixar_todos(
    pedido_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    """Todos os documentos do pedido num .zip, por tarefa — pronto para protocolar."""
    pedido = await _buscar(db, pedido_id, user)
    assuntos = {e.id: f"{e.ordem:02d}-{e.assunto}" for e in pedido.encaminhamentos}
    buffer = io.BytesIO()
    usados: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        for a in pedido.anexos:
            if a.deleted_at is not None:
                continue
            pasta = assuntos.get(a.encaminhamento_id, "00-geral")
            pasta = "".join(c if c.isalnum() or c in " -_" else "_" for c in pasta)[:60]
            nome = f"{pasta}/{a.nome_original}"
            n = 2
            while nome in usados:
                base = Path(a.nome_original)
                nome = f"{pasta}/{base.stem} ({n}){base.suffix}"
                n += 1
            usados.add(nome)
            try:
                z.write(storage.caminho_absoluto(a.caminho), nome)
            except (FileNotFoundError, HTTPException):
                continue
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="documentos-{pedido.numero.replace("/", "-")}.zip"'
        },
    )
