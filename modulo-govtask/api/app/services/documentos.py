"""Central de documentos da demanda (§29–§32, §103).

Três garantias sustentam este módulo:

1. **Nada é substituído.** Enviar de novo um documento cria a versão seguinte
   do mesmo grupo; a anterior continua consultável, com autor, data e hash.
2. **O arquivo é conferido pelos bytes**, não pela extensão nem pelo header do
   navegador, e vai para o disco com nome gerado por nós.
3. **Não há URL pública previsível.** O conteúdo só sai pela rota de download,
   que revalida tenant, sigilo da demanda e classificação do documento.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.file_validation import hash_do_conteudo, validar
from app.core.permissions import Perm
from app.core.storage import storage
from app.models.anexo import Anexo
from app.models.demanda import Demanda
from app.models.enums import (
    CategoriaDocumento,
    ClassificacaoDocumento,
    TipoDocumento,
    TipoEvento,
)
from app.models.user import User
from app.services.timeline import registrar_evento

# Árvore documental padrão (§30). É só a sugestão inicial mostrada na
# interface: o usuário pode gravar em qualquer pasta que nomear.
PASTAS_PADRAO: list[str] = [
    "01 Formalização",
    "02 Ofícios",
    "03 Certidões",
    "04 Protocolo",
    "05 Convênio",
    "06 Licitação",
    "07 Contrato",
    "08 Notas fiscais",
    "09 Pagamentos",
    "10 Prestação de contas",
]

# Quem pode ver documento de cada classificação, além dos envolvidos na demanda.
SIGILOSOS = (
    ClassificacaoDocumento.RESTRITO.value,
    ClassificacaoDocumento.SIGILOSO.value,
)


def _agora() -> datetime:
    return datetime.now(timezone.utc)


async def upload_documento(
    db: AsyncSession,
    demanda: Demanda,
    arquivo: UploadFile,
    autor: User,
    *,
    pasta: str | None = None,
    tipo_documento: TipoDocumento = TipoDocumento.OUTRO,
    categoria: CategoriaDocumento = CategoriaDocumento.OUTROS,
    classificacao: ClassificacaoDocumento = ClassificacaoDocumento.INTERNO,
    descricao: str | None = None,
    motivo_versao: str | None = None,
    tarefa_id: uuid.UUID | None = None,
    etapa_id: uuid.UUID | None = None,
    protocolo_id: uuid.UUID | None = None,
    substituir_grupo_id: uuid.UUID | None = None,
) -> Anexo:
    """Grava o arquivo como documento novo ou como próxima versão de um grupo."""
    conteudo = await arquivo.read()
    nome, nome_storage, mime = validar(arquivo.filename or "", conteudo)
    digest = hash_do_conteudo(conteudo)

    versao = 1
    grupo_id = uuid.uuid4()
    if substituir_grupo_id is not None:
        anterior = await versao_atual_do_grupo(db, demanda, substituir_grupo_id)
        if anterior is None:
            raise HTTPException(
                status_code=404, detail="Documento a versionar não encontrado"
            )
        if anterior.hash_sha256 == digest:
            raise HTTPException(
                status_code=409,
                detail="O arquivo enviado é idêntico à versão atual deste documento",
            )
        grupo_id = substituir_grupo_id
        versao = (
            await db.execute(
                select(func.max(Anexo.versao)).where(
                    Anexo.documento_grupo_id == grupo_id,
                    Anexo.demanda_id == demanda.id,
                )
            )
        ).scalar() or 0
        versao += 1
        anterior.versao_atual = False
        # Metadados seguem o documento, não o arquivo: a v2 de um ofício
        # continua sendo ofício, na mesma pasta.
        pasta = pasta or anterior.pasta
        tipo_documento = anterior.tipo_documento
        categoria = anterior.categoria
        classificacao = anterior.classificacao

    caminho = f"govtask/demandas/{demanda.organization_id}/{demanda.id}/{nome_storage}"
    await storage.store(caminho, conteudo)

    documento = Anexo(
        demanda_id=demanda.id,
        convenio_id=None,
        tarefa_id=tarefa_id,
        etapa_id=etapa_id,
        protocolo_id=protocolo_id,
        nome_arquivo=nome,
        tipo_documento=tipo_documento,
        categoria=categoria,
        classificacao=classificacao,
        descricao=descricao,
        motivo_versao=motivo_versao,
        storage_path=caminho,
        tamanho_bytes=len(conteudo),
        hash_sha256=digest,
        mime_type=mime,
        pasta=pasta,
        documento_grupo_id=grupo_id,
        versao=versao,
        versao_atual=True,
        enviado_por_id=autor.id,
    )
    db.add(documento)
    await db.flush()

    await registrar_evento(
        db,
        tipo_evento=(
            TipoEvento.DOCUMENTO_VERSIONADO if versao > 1 else TipoEvento.ANEXO_ADICIONADO
        ),
        ator_id=autor.id,
        descricao=(
            f"Documento '{nome}' v{versao} anexado"
            + (f": {motivo_versao}" if motivo_versao else "")
        ),
        demanda_id=demanda.id,
        tarefa_id=tarefa_id,
        metadados={
            "documento_grupo": str(grupo_id),
            "versao": versao,
            "hash_sha256": digest,
            "pasta": pasta,
        },
    )
    return documento


async def versao_atual_do_grupo(
    db: AsyncSession, demanda: Demanda, grupo_id: uuid.UUID
) -> Anexo | None:
    return (
        await db.execute(
            select(Anexo)
            .where(
                Anexo.demanda_id == demanda.id,
                Anexo.documento_grupo_id == grupo_id,
                Anexo.deleted_at.is_(None),
            )
            .order_by(Anexo.versao.desc())
        )
    ).scalars().first()


async def get_documento(
    db: AsyncSession, demanda: Demanda, documento_id: uuid.UUID
) -> Anexo:
    """Carrega o documento garantindo que ele pertence à demanda já autorizada."""
    documento = (
        await db.execute(
            select(Anexo).where(
                Anexo.id == documento_id,
                Anexo.demanda_id == demanda.id,
                Anexo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if documento is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return documento


def pode_ver_documento(
    documento: Anexo, demanda: Demanda, user: User, permissoes: set[str]
) -> bool:
    """Classificação do documento restringe além do sigilo da demanda (§96).

    Um documento sigiloso dentro de uma demanda normal só é visível a quem
    responde pela demanda ou administra o módulo.
    """
    if documento.classificacao not in SIGILOSOS:
        return True
    if Perm.ADMIN_CONFIG in permissoes or Perm.AUDIT_VIEW in permissoes:
        return True
    return user.id in {
        documento.enviado_por_id,
        demanda.responsavel_geral_id,
        demanda.responsavel_atual_id,
        demanda.gestor_id,
        demanda.criado_por_id,
    }


async def ler_conteudo(documento: Anexo) -> bytes:
    try:
        return await storage.retrieve(documento.storage_path)
    except FileNotFoundError as erro:
        raise HTTPException(
            status_code=410,
            detail="O arquivo não está mais disponível no armazenamento",
        ) from erro


async def arvore_documental(
    db: AsyncSession, demanda: Demanda, *, incluir_versoes: bool = False
) -> list[dict]:
    """Documentos agrupados por pasta (§30), com as pastas padrão sempre visíveis."""
    stmt = select(Anexo).where(
        Anexo.demanda_id == demanda.id, Anexo.deleted_at.is_(None)
    )
    if not incluir_versoes:
        stmt = stmt.where(Anexo.versao_atual.is_(True))
    documentos = (
        await db.execute(stmt.order_by(Anexo.pasta, Anexo.created_at))
    ).scalars().all()

    pastas: dict[str, list[Anexo]] = {nome: [] for nome in PASTAS_PADRAO}
    for documento in documentos:
        pastas.setdefault(documento.pasta or "Sem pasta", []).append(documento)

    return [
        {"pasta": nome, "documentos": itens, "quantidade": len(itens)}
        for nome, itens in pastas.items()
    ]


async def remover_documento(
    db: AsyncSession, demanda: Demanda, documento: Anexo, user: User, motivo: str
) -> None:
    """Exclusão lógica (§105): o arquivo sai da lista, o histórico permanece.

    A versão anterior do grupo volta a ser a atual — remover a v3 não pode
    deixar o documento sem versão vigente.
    """
    documento.deleted_at = _agora()
    documento.versao_atual = False

    if documento.documento_grupo_id:
        anterior = (
            await db.execute(
                select(Anexo)
                .where(
                    Anexo.documento_grupo_id == documento.documento_grupo_id,
                    Anexo.demanda_id == demanda.id,
                    Anexo.deleted_at.is_(None),
                    Anexo.id != documento.id,
                )
                .order_by(Anexo.versao.desc())
            )
        ).scalars().first()
        if anterior is not None:
            anterior.versao_atual = True

    await registrar_evento(
        db,
        tipo_evento=TipoEvento.OBSERVACAO_REGISTRADA,
        ator_id=user.id,
        descricao=f"Documento '{documento.nome_arquivo}' v{documento.versao} removido: {motivo}",
        demanda_id=demanda.id,
        metadados={"documento_id": str(documento.id), "motivo": motivo},
    )
