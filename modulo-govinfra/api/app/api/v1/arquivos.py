"""Arquivos e documentos do GovInfra (item 40).

Upload e download passam sempre pela API autenticada — não existe URL pública
permanente. O caminho interno do servidor nunca é devolvido; o download é
registrado na auditoria quando o arquivo é sensível.
"""

import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao, cliente, com_rotulo
from app.core.auth import exigir, usuario_pode
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.permissoes import P
from app.models.arquivos import Arquivo
from app.models.enums import AcaoAuditoria, CategoriaArquivo
from app.models.organizacao import User
from app.services import arquivos as servico_arquivos
from app.services import auditoria

router = APIRouter(tags=["Arquivos"])

CATEGORIAS_ACEITAS = {c.value for c in CategoriaArquivo}

# Entidades que podem receber anexos — impedir chave arbitrária na tabela.
ENTIDADES_ACEITAS = {
    "pessoa",
    "imovel",
    "cacamba",
    "solicitacao_cacamba",
    "entrega",
    "retirada",
    "programa",
    "beneficiario",
    "solicitacao_servico",
    "vistoria",
    "ordem_servico",
    "viagem",
    "maquina",
    "veiculo",
    "manutencao",
    "bloqueio",
    "horas_adicionais",
}


@router.post("/arquivos", status_code=201, summary="Enviar arquivo")
async def enviar(
    request: Request,
    entidade: str = Form(...),
    entidade_id: uuid.UUID = Form(...),
    categoria: str = Form(CategoriaArquivo.OUTRO.value),
    observacao: str | None = Form(None),
    latitude: float | None = Form(None),
    longitude: float | None = Form(None),
    arquivo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ARQUIVOS_ENVIAR)),
):
    if entidade not in ENTIDADES_ACEITAS:
        raise AppError("Vínculo de arquivo não reconhecido.", 422, "entidade_invalida")
    if categoria not in CATEGORIAS_ACEITAS:
        raise AppError("Categoria de arquivo inválida.", 422, "categoria_invalida")

    conteudo = await arquivo.read()
    try:
        registrado = await servico_arquivos.salvar(
            db,
            organizacao_id=user.organizacao_id,
            entidade=entidade,
            entidade_id=entidade_id,
            nome_original=arquivo.filename or "arquivo",
            conteudo=conteudo,
            categoria=categoria,
            usuario_id=user.id,
            latitude=latitude,
            longitude=longitude,
            observacao=observacao,
        )
    except AppError:
        raise
    except Exception:
        raise AppError(
            "Não foi possível armazenar o arquivo. Tente novamente em instantes.",
            500,
            "falha_armazenamento",
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade=f"arquivo_{entidade}",
        entidade_id=registrado.id,
        entidade_descricao=registrado.nome_original,
        organizacao_id=user.organizacao_id,
        detalhe=f"Categoria: {categoria}",
        cliente=cliente(request),
    )
    await db.commit()
    return servico_arquivos.resumo(registrado)


@router.get("/arquivos", summary="Listar arquivos de um registro")
async def listar(
    entidade: str = Query(...),
    entidade_id: uuid.UUID = Query(...),
    categoria: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ARQUIVOS_BAIXAR)),
):
    if entidade not in ENTIDADES_ACEITAS:
        raise AppError("Vínculo de arquivo não reconhecido.", 422, "entidade_invalida")
    registros = await servico_arquivos.listar(db, entidade, entidade_id, categoria)
    return [
        {
            **servico_arquivos.resumo(a),
            "sensivel": a.sensivel,
            "categoria_rotulo": com_rotulo(a.categoria),
            "enviado_por": a.created_by_id,
        }
        for a in registros
    ]


@router.get("/arquivos/{arquivo_id}/download", summary="Baixar arquivo")
async def baixar(
    arquivo_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ARQUIVOS_BAIXAR)),
):
    arquivo: Arquivo = await buscar_da_organizacao(
        db, Arquivo, arquivo_id, user, "Arquivo não encontrado."
    )
    if arquivo.deleted_at is not None:
        raise NotFound("Arquivo não encontrado.")

    from app.core.storage import get_storage

    if arquivo.sensivel or not usuario_pode(user, P.ARQUIVOS_BAIXAR):
        await auditoria.registrar(
            db,
            acao=AcaoAuditoria.DOWNLOAD_SENSIVEL,
            usuario=user,
            entidade=f"arquivo_{arquivo.entidade}",
            entidade_id=arquivo.id,
            entidade_descricao=arquivo.nome_original,
            organizacao_id=user.organizacao_id,
            cliente=cliente(request),
        )
        await db.commit()

    armazenamento = get_storage()
    existe = await armazenamento.exists(arquivo.chave_armazenamento)
    if not existe:
        raise NotFound("O conteúdo do arquivo não está mais disponível.")

    nome = arquivo.nome_original.replace('"', "")
    def _gerar():
        yield from armazenamento.stream(arquivo.chave_armazenamento)

    return StreamingResponse(
        _gerar(),
        media_type=arquivo.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{nome}"',
            "Content-Length": str(arquivo.tamanho_bytes),
        },
    )


@router.delete("/arquivos/{arquivo_id}", summary="Remover arquivo (exclusão lógica)")
async def remover(
    arquivo_id: uuid.UUID,
    request: Request,
    motivo: str = Query("", max_length=400),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ARQUIVOS_REMOVER)),
):
    arquivo: Arquivo = await buscar_da_organizacao(
        db, Arquivo, arquivo_id, user, "Arquivo não encontrado."
    )
    if arquivo.deleted_at is not None:
        raise NotFound("Arquivo não encontrado.")
    await servico_arquivos.remover(db, arquivo, user.id, motivo or "Removido pela interface")
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.EXCLUIR,
        usuario=user,
        entidade=f"arquivo_{arquivo.entidade}",
        entidade_id=arquivo.id,
        entidade_descricao=arquivo.nome_original,
        organizacao_id=user.organizacao_id,
        justificativa=motivo or None,
        cliente=cliente(request),
    )
    await db.commit()
    return {"ok": True}
