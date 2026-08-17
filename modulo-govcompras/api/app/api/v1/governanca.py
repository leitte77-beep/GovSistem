"""Documentos, comentários, notificações e auditoria (seções 64-68, 83-85)."""

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import NotFound
from app.core.permissoes import P
from app.models.governanca import AuditoriaLog, Comentario, Documento, Notificacao
from app.models.organizacao import User
from app.schemas.comuns import Criado, Mensagem
from app.schemas.governanca import AuditoriaLogOut, ComentarioIn, ComentarioOut, DocumentoOut, NotificacaoOut

router = APIRouter(tags=["Documentos, comentários e notificações"])

_MENCAO_RE = re.compile(r"@([\wÀ-ÿ]+)")


@router.get("/documentos", response_model=list[DocumentoOut])
async def listar_documentos(
    entidade_tipo: str,
    entidade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.DOCUMENTOS_VISUALIZAR)),
):
    resultado = await db.scalars(
        select(Documento)
        .where(Documento.entidade_tipo == entidade_tipo, Documento.entidade_id == entidade_id)
        .order_by(Documento.categoria, Documento.versao.desc())
    )
    return list(resultado.all())


@router.post("/documentos", response_model=Criado, status_code=201)
async def registrar_documento(
    entidade_tipo: str,
    entidade_id: uuid.UUID,
    categoria: str,
    nome_arquivo: str,
    storage_path: str,
    descricao: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.DOCUMENTOS_ENVIAR)),
):
    """Registra os metadados de um documento já enviado (o upload físico do
    binário é tratado pela camada de storage do frontend/proxy, fora do
    escopo desta POC de fluxo)."""
    ultima_versao = await db.scalar(
        select(Documento.versao)
        .where(Documento.entidade_tipo == entidade_tipo, Documento.entidade_id == entidade_id, Documento.categoria == categoria)
        .order_by(Documento.versao.desc())
    )
    documento = Documento(
        entidade_tipo=entidade_tipo, entidade_id=entidade_id, categoria=categoria,
        nome_arquivo=nome_arquivo, storage_path=storage_path, descricao=descricao,
        versao=(ultima_versao or 0) + 1, created_by_id=user.id,
    )
    db.add(documento)
    await db.commit()
    return Criado(id=documento.id, mensagem="Documento registrado.")


@router.get("/comentarios", response_model=list[ComentarioOut])
async def listar_comentarios(
    entidade_tipo: str,
    entidade_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR)),
):
    comentarios = list(
        (
            await db.scalars(
                select(Comentario)
                .where(Comentario.entidade_tipo == entidade_tipo, Comentario.entidade_id == entidade_id)
                .order_by(Comentario.created_at)
            )
        ).all()
    )
    saida = []
    for c in comentarios:
        autor = await db.get(User, c.autor_id)
        saida.append(
            ComentarioOut(
                id=c.id, autor_id=c.autor_id, autor_nome=autor.nome if autor else None,
                conteudo=c.conteudo, mencoes_usuario_ids=c.mencoes_usuario_ids, created_at=c.created_at,
            )
        )
    return saida


@router.post("/comentarios", response_model=Criado, status_code=201)
async def criar_comentario(
    entidade_tipo: str,
    entidade_id: uuid.UUID,
    payload: ComentarioIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMENTARIOS_CRIAR)),
):
    mencoes = _MENCAO_RE.findall(payload.conteudo)
    comentario = Comentario(
        entidade_tipo=entidade_tipo, entidade_id=entidade_id, autor_id=user.id,
        conteudo=payload.conteudo, mencoes_usuario_ids=mencoes or None,
    )
    db.add(comentario)
    await db.commit()
    return Criado(id=comentario.id, mensagem="Comentário publicado.")


@router.get("/notificacoes", response_model=list[NotificacaoOut])
async def listar_notificacoes(
    apenas_nao_lidas: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.DASHBOARD_VISUALIZAR)),
):
    consulta = select(Notificacao).where(
        (Notificacao.destinatario_usuario_id == user.id)
        | (Notificacao.destinatario_setor_id == user.setor_id if user.setor_id else False)
    )
    if apenas_nao_lidas:
        consulta = consulta.where(Notificacao.situacao == "nao_lida")
    resultado = await db.scalars(consulta.order_by(Notificacao.created_at.desc()).limit(100))
    return list(resultado.all())


@router.post("/notificacoes/{notificacao_id}/marcar-lida", response_model=Mensagem)
async def marcar_lida(
    notificacao_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.DASHBOARD_VISUALIZAR))
):
    notificacao = await db.get(Notificacao, notificacao_id)
    if notificacao is None:
        raise NotFound("Notificação não encontrada.")
    notificacao.situacao = "lida"
    notificacao.lida_em = datetime.now(timezone.utc)
    await db.commit()
    return Mensagem(mensagem="Notificação marcada como lida.")


@router.get("/auditoria", response_model=list[AuditoriaLogOut])
async def listar_auditoria(
    entidade_tipo: str | None = None,
    entidade_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AUDITORIA_VISUALIZAR)),
):
    consulta = select(AuditoriaLog).where(AuditoriaLog.organizacao_id == user.organizacao_id)
    if entidade_tipo:
        consulta = consulta.where(AuditoriaLog.entidade_tipo == entidade_tipo)
    if entidade_id:
        consulta = consulta.where(AuditoriaLog.entidade_id == entidade_id)
    resultado = await db.scalars(consulta.order_by(AuditoriaLog.created_at.desc()).limit(200))
    return list(resultado.all())
