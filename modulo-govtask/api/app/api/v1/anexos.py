import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File as FastAPIFile, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.models.anexo import Anexo
from app.models.convenio import Convenio
from app.models.etapa import Etapa
from app.models.tarefa import Tarefa
from app.models.enums import CategoriaDocumento, ClassificacaoDocumento, TipoDocumento, TipoEvento
from app.models.user import User
from app.schemas.anexo import AnexoOut, MarcarEnviadoExterno
from app.services.attachments import upload_anexo
from app.services.auditoria import registrar_auditoria
from app.services.timeline import registrar_evento

router = APIRouter(prefix="/anexos", tags=["anexos"])


@router.post("", response_model=AnexoOut, status_code=201)
async def criar_anexo(
    request: Request,
    convenio_id: uuid.UUID = Query(...),
    file: UploadFile = UploadFile(...),
    tipo_documento: TipoDocumento = TipoDocumento.OUTRO,
    categoria: CategoriaDocumento = CategoriaDocumento.OUTROS,
    classificacao: ClassificacaoDocumento = ClassificacaoDocumento.INTERNO,
    descricao: str | None = Query(None),
    motivo_versao: str | None = Query(None),
    etapa_id: uuid.UUID | None = Query(None),
    tarefa_id: uuid.UUID | None = Query(None),
    medicao_id: uuid.UUID | None = Query(None),
    prestacao_id: uuid.UUID | None = Query(None),
    diligencia_id: uuid.UUID | None = Query(None),
    entrega_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nome do arquivo é obrigatório")

    convenio = await db.scalar(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    if convenio is None:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")
    if etapa_id is not None:
        etapa = await db.scalar(
            select(Etapa).where(
                Etapa.id == etapa_id,
                Etapa.convenio_id == convenio_id,
                Etapa.deleted_at.is_(None),
            )
        )
        if etapa is None:
            raise HTTPException(status_code=422, detail="Etapa não pertence ao processo")
    if tarefa_id is not None:
        tarefa = await db.scalar(
            select(Tarefa).where(
                Tarefa.id == tarefa_id,
                Tarefa.convenio_id == convenio_id,
                Tarefa.deleted_at.is_(None),
            )
        )
        if tarefa is None:
            raise HTTPException(status_code=422, detail="Tarefa não pertence ao processo")

    anexo = await upload_anexo(
        db=db,
        file=file,
        convenio_id=convenio_id,
        enviado_por_id=user.id,
        tipo_documento=tipo_documento,
        categoria=categoria,
        classificacao=classificacao,
        descricao=descricao,
        motivo_versao=motivo_versao,
        etapa_id=etapa_id,
        tarefa_id=tarefa_id,
        medicao_id=medicao_id,
        prestacao_id=prestacao_id,
        diligencia_id=diligencia_id,
        entrega_id=entrega_id,
    )

    await registrar_evento(
        db,
        convenio_id=convenio_id,
        tipo_evento=TipoEvento.ANEXO_ADICIONADO,
        ator_id=user.id,
        descricao=f"Anexo '{anexo.nome_arquivo}' adicionado",
        tarefa_id=tarefa_id,
        metadados={
            "tipo_documento": tipo_documento.value,
            "versao": anexo.versao,
            "tamanho_bytes": anexo.tamanho_bytes,
        },
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="anexo.upload",
        convenio_id=convenio_id,
        entidade="anexo",
        entidade_id=anexo.id,
        request=request,
    )
    await db.commit()
    await db.refresh(anexo)
    return anexo


@router.post("/{anexo_id}/enviar-externo", response_model=AnexoOut)
async def marcar_enviado_externo(
    request: Request,
    anexo_id: uuid.UUID,
    body: MarcarEnviadoExterno,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Anexo)
        .join(Convenio, Anexo.convenio_id == Convenio.id)
        .where(Anexo.id == anexo_id, Convenio.organization_id == user.organization_id, Anexo.deleted_at.is_(None))
    )
    anexo = result.scalar_one_or_none()
    if not anexo:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")

    anexo.enviado_externo = True
    anexo.enviado_externo_data = body.data or datetime.now(timezone.utc)
    anexo.enviado_externo_sistema = body.sistema
    anexo.enviado_externo_protocolo = body.protocolo
    anexo.enviado_externo_observacao = body.observacao

    await registrar_evento(
        db,
        convenio_id=anexo.convenio_id,
        tipo_evento=TipoEvento.DOCUMENTO_ENVIADO_EXTERNO,
        ator_id=user.id,
        descricao=f"Documento '{anexo.nome_arquivo}' enviado ao órgão externo",
        metadados={"protocolo": body.protocolo, "sistema": body.sistema},
    )
    await registrar_auditoria(
        db,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="anexo.enviar_externo",
        convenio_id=anexo.convenio_id,
        entidade="anexo",
        entidade_id=anexo.id,
        request=request,
    )
    await db.commit()
    await db.refresh(anexo)
    return anexo


@router.get("/{anexo_id}", response_model=AnexoOut)
async def obter_anexo(
    anexo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Anexo).join(Convenio, Anexo.convenio_id == Convenio.id).where(Anexo.id == anexo_id, Convenio.organization_id == user.organization_id, Anexo.deleted_at.is_(None))
    )
    anexo = result.scalar_one_or_none()
    if not anexo:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")
    return anexo


@router.delete("/{anexo_id}", status_code=204)
async def excluir_anexo(
    anexo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Anexo).join(Convenio, Anexo.convenio_id == Convenio.id).where(Anexo.id == anexo_id, Convenio.organization_id == user.organization_id, Anexo.deleted_at.is_(None))
    )
    anexo = result.scalar_one_or_none()
    if not anexo:
        raise HTTPException(status_code=404, detail="Anexo não encontrado")

    from datetime import datetime, timezone
    anexo.deleted_at = datetime.now(timezone.utc)
    await db.commit()
