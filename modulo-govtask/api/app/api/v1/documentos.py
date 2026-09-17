"""Central de documentos de uma demanda (§29–§32, §103, §104).

O conteúdo dos arquivos nunca é servido por URL pública: sai apenas pela rota
de download, que revalida o tenant, o sigilo da demanda e a classificação do
documento, e registra quem baixou o quê.
"""

import uuid
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.enums import (
    CategoriaDocumento,
    ClassificacaoDocumento,
    TipoDocumento,
)
from app.models.tarefa import Tarefa
from app.models.user import User
from app.schemas.documento import (
    ArvoreOut,
    DocumentoAtualizar,
    DocumentoOut,
    PastaOut,
    RemoverDocumentoRequest,
)
from app.services import documentos as svc
from app.services.auditoria import registrar_auditoria
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao

router = APIRouter(tags=["Documentos da demanda"])


async def _demanda(db: AsyncSession, demanda_id: uuid.UUID, user: User):
    return await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))


def _visiveis(
    documentos: list[Anexo], demanda, user: User, permissoes: set[str]
) -> list[Anexo]:
    return [
        d for d in documentos if svc.pode_ver_documento(d, demanda, user, permissoes)
    ]


@router.get("/demandas/{demanda_id}/documentos", response_model=ArvoreOut)
async def arvore_documental(
    demanda_id: uuid.UUID,
    incluir_versoes: bool = Query(False, description="Inclui as versões antigas"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _demanda(db, demanda_id, user)
    permissoes = get_user_permissions(user)
    arvore = await svc.arvore_documental(db, demanda, incluir_versoes=incluir_versoes)

    pastas: list[PastaOut] = []
    total = 0
    for no in arvore:
        itens = _visiveis(no["documentos"], demanda, user, permissoes)
        total += len(itens)
        pastas.append(
            PastaOut(
                pasta=no["pasta"],
                quantidade=len(itens),
                documentos=[DocumentoOut.model_validate(d) for d in itens],
            )
        )
    return ArvoreOut(pastas=pastas, total=total, pastas_sugeridas=svc.PASTAS_PADRAO)


@router.post(
    "/demandas/{demanda_id}/documentos",
    response_model=DocumentoOut,
    status_code=status.HTTP_201_CREATED,
)
async def enviar_documento(
    demanda_id: uuid.UUID,
    arquivo: UploadFile = File(..., description="Arquivo; o tipo é conferido pelos bytes"),
    pasta: str | None = Form(None),
    descricao: str | None = Form(None),
    tipo_documento: TipoDocumento = Form(TipoDocumento.OUTRO),
    categoria: CategoriaDocumento = Form(CategoriaDocumento.OUTROS),
    classificacao: ClassificacaoDocumento = Form(ClassificacaoDocumento.INTERNO),
    motivo_versao: str | None = Form(None),
    tarefa_id: uuid.UUID | None = Form(None),
    etapa_id: uuid.UUID | None = Form(None),
    protocolo_id: uuid.UUID | None = Form(None),
    substituir_grupo_id: uuid.UUID | None = Form(
        None, description="Envia como nova versão deste grupo, em vez de documento novo"
    ),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Envia documento ou nova versão.

    A autorização é escalonada: quem tem `resource.edit`/`resource.create` anexa
    onde quiser na demanda; o servidor de departamento, que só tem
    `resource.view`, anexa **na tarefa que é dele** (§158) — é o que ele precisa
    para entregar o trabalho sem receber poder de editar a demanda inteira.
    """
    demanda = await _demanda(db, demanda_id, user)
    permissoes = get_user_permissions(user)
    pode_anexar_livremente = bool(
        permissoes & {Perm.RESOURCE_EDIT, Perm.RESOURCE_CREATE, Perm.ADMIN_CONFIG}
    )
    if demanda.concluida_em is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Demanda encerrada: reabra antes de anexar documentos",
        )

    if tarefa_id is not None:
        pertence = (
            await db.execute(
                select(Tarefa).where(
                    Tarefa.id == tarefa_id,
                    Tarefa.demanda_id == demanda.id,
                    Tarefa.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if pertence is None:
            raise HTTPException(status_code=422, detail="Tarefa não pertence à demanda")
        if not pode_anexar_livremente and user.id not in {
            pertence.atribuida_a_id,
            pertence.solicitante_id,
            pertence.criada_por_id,
        }:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Você só pode anexar documentos nas tarefas em que atua",
            )
    elif not pode_anexar_livremente:
        # Fora de uma tarefa própria, anexar é editar a demanda.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sem permissão para anexar documentos nesta demanda",
        )

    documento = await svc.upload_documento(
        db,
        demanda,
        arquivo,
        user,
        pasta=pasta,
        tipo_documento=tipo_documento,
        categoria=categoria,
        classificacao=classificacao,
        descricao=descricao,
        motivo_versao=motivo_versao,
        tarefa_id=tarefa_id,
        etapa_id=etapa_id,
        protocolo_id=protocolo_id,
        substituir_grupo_id=substituir_grupo_id,
    )
    await marcar_movimentacao(demanda)
    await db.commit()

    completo = (
        await db.execute(
            select(Anexo)
            .where(Anexo.id == documento.id)
            .options(selectinload(Anexo.enviado_por))
        )
    ).scalar_one()
    return DocumentoOut.model_validate(completo)


@router.get(
    "/demandas/{demanda_id}/documentos/{grupo_id}/versoes",
    response_model=list[DocumentoOut],
)
async def versoes_do_documento(
    demanda_id: uuid.UUID,
    grupo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Histórico completo de um documento — v1, v2, v3… (§31)."""
    demanda = await _demanda(db, demanda_id, user)
    permissoes = get_user_permissions(user)
    versoes = (
        await db.execute(
            select(Anexo)
            .where(
                Anexo.demanda_id == demanda.id,
                Anexo.documento_grupo_id == grupo_id,
                Anexo.deleted_at.is_(None),
            )
            .options(selectinload(Anexo.enviado_por))
            .order_by(Anexo.versao)
        )
    ).scalars().all()
    if not versoes:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return [
        DocumentoOut.model_validate(v)
        for v in _visiveis(list(versoes), demanda, user, permissoes)
    ]


@router.patch(
    "/demandas/{demanda_id}/documentos/{documento_id}", response_model=DocumentoOut
)
async def atualizar_documento(
    demanda_id: uuid.UUID,
    documento_id: uuid.UUID,
    payload: DocumentoAtualizar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Ajusta metadados. O arquivo em si nunca muda: para isso, nova versão."""
    demanda = await _demanda(db, demanda_id, user)
    documento = await svc.get_documento(db, demanda, documento_id)
    permissoes = get_user_permissions(user)
    if not svc.pode_ver_documento(documento, demanda, user, permissoes):
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(documento, campo, valor)
    await db.commit()

    completo = (
        await db.execute(
            select(Anexo)
            .where(Anexo.id == documento_id)
            .options(selectinload(Anexo.enviado_por))
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return DocumentoOut.model_validate(completo)


@router.get("/demandas/{demanda_id}/documentos/{documento_id}/download")
async def baixar_documento(
    demanda_id: uuid.UUID,
    documento_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Entrega o arquivo. Cada download vira registro de auditoria (§104)."""
    demanda = await _demanda(db, demanda_id, user)
    documento = await svc.get_documento(db, demanda, documento_id)
    if not svc.pode_ver_documento(documento, demanda, user, get_user_permissions(user)):
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    conteudo = await svc.ler_conteudo(documento)
    await registrar_auditoria(
        db,
        request=request,
        user_id=user.id,
        organization_id=user.organization_id,
        acao="DOWNLOAD",
        entidade="anexo",
        entidade_id=documento.id,
        dados_posteriores={
            "demanda": str(demanda.id),
            "documento": documento.nome_arquivo,
            "versao": documento.versao,
            "classificacao": str(documento.classificacao),
        },
    )
    await db.commit()

    nome = quote(documento.nome_arquivo)
    return Response(
        content=conteudo,
        media_type=documento.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{nome}",
            # Documento administrativo não deve ficar em cache compartilhado.
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete(
    "/demandas/{demanda_id}/documentos/{documento_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remover_documento(
    demanda_id: uuid.UUID,
    documento_id: uuid.UUID,
    payload: RemoverDocumentoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_DELETE)),
):
    demanda = await _demanda(db, demanda_id, user)
    documento = await svc.get_documento(db, demanda, documento_id)
    await svc.remover_documento(db, demanda, documento, user, payload.motivo)
    await marcar_movimentacao(demanda)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
