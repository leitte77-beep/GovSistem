"""Rotas da camada de IA (§92).

Todas exigem apenas `resource.view` e **não gravam nada**: devolvem uma
sugestão. Aplicá-la é editar a demanda pela rota normal, com confirmação
humana — é o que impede a IA de alterar informação oficial sozinha.
"""

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.config import settings
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.demanda import Demanda
from app.models.user import User
from app.schemas.ia import (
    IADadosExtraidos,
    IADocumentosSugeridos,
    IAExtracaoRequest,
    IASemelhancaItem,
    IASemelhancas,
    IASugestao,
    IAStatus,
)
from app.services import demandas as svc_demandas
from app.services import documentos as svc_doc
from app.services import extracao, ia
from app.services.demandas import get_demanda_ou_404

router = APIRouter(prefix="/demandas/{demanda_id}/ia", tags=["IA da demanda"])

# Palavras de ligação que não ajudam a recuperar demandas parecidas.
_STOPWORDS = {
    "para", "com", "dos", "das", "pela", "pelo", "sobre", "entre", "apos",
    "aos", "uma", "por", "que", "como",
}


def _tokens_relevantes(texto: str, limite: int = 8) -> list[str]:
    """Palavras significativas do texto, para a recuperação de semelhantes."""
    palavras = re.findall(r"[0-9a-zà-ÿ]{4,}", (texto or "").lower())
    escolhidas: list[str] = []
    for palavra in palavras:
        if palavra in _STOPWORDS or palavra in escolhidas:
            continue
        escolhidas.append(palavra)
        if len(escolhidas) >= limite:
            break
    return escolhidas


async def _contexto(db: AsyncSession, demanda_id: uuid.UUID, user: User) -> Demanda:
    """Autoriza e recarrega com as relações que o prompt lê.

    Sem o eager load, tocar em `demanda.tipo` dispararia lazy load fora do
    contexto async (MissingGreenlet).
    """
    await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return (
        await db.execute(
            select(Demanda)
            .where(Demanda.id == demanda_id)
            .options(
                selectinload(Demanda.tipo),
                selectinload(Demanda.status),
                selectinload(Demanda.setor_atual),
                selectinload(Demanda.responsavel_geral),
            )
        )
    ).scalar_one()


@router.get("/status", response_model=IAStatus)
async def status_ia(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    await _contexto(db, demanda_id, user)
    return IAStatus(
        disponivel=ia.configurada(),
        provedor=settings.AI_PROVIDER,
        modelo=settings.AI_MODEL,
    )


async def _chamar(funcao, *args):
    try:
        return await funcao(*args)
    except ia.IADesabilitada as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ia.IAFalhou as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/resumo", response_model=IASugestao)
async def sugerir_resumo(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _contexto(db, demanda_id, user)
    return IASugestao(sugestao=await _chamar(ia.sugerir_resumo, demanda))


@router.post("/proxima-acao", response_model=IASugestao)
async def sugerir_proxima_acao(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _contexto(db, demanda_id, user)
    return IASugestao(sugestao=await _chamar(ia.sugerir_proxima_acao, demanda))


@router.post("/documentos-faltantes", response_model=IADocumentosSugeridos)
async def sugerir_documentos_faltantes(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    demanda = await _contexto(db, demanda_id, user)
    nomes = (
        (
            await db.execute(
                select(Anexo.nome_arquivo).where(
                    Anexo.demanda_id == demanda.id, Anexo.deleted_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    sugestoes = await _chamar(ia.sugerir_documentos_faltantes, demanda, list(nomes))
    return IADocumentosSugeridos(sugestoes=sugestoes)


@router.post("/gerar-oficio", response_model=IASugestao)
async def gerar_oficio(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Redige um ofício a partir dos dados registrados; nada é protocolado."""
    demanda = await _contexto(db, demanda_id, user)
    return IASugestao(sugestao=await _chamar(ia.gerar_oficio, demanda))


@router.post("/extrair-documento", response_model=IADadosExtraidos)
async def extrair_documento(
    demanda_id: uuid.UUID,
    payload: IAExtracaoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Lê o texto de um documento e sugere campos. Não grava nem altera nada."""
    demanda = await _contexto(db, demanda_id, user)
    documento = await svc_doc.get_documento(db, demanda, payload.documento_id)
    if not svc_doc.pode_ver_documento(
        documento, demanda, user, get_user_permissions(user)
    ):
        raise HTTPException(status_code=404, detail="Documento não encontrado")

    conteudo = await svc_doc.ler_conteudo(documento)
    try:
        texto = extracao.texto_de(documento.nome_arquivo, documento.mime_type, conteudo)
    except (extracao.ExtracaoNaoSuportada, extracao.ExtracaoFalhou) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not texto:
        raise HTTPException(
            status_code=422,
            detail=(
                "O documento não tem texto extraível (pode ser digitalizado). "
                "Aplique OCR antes de pedir a extração."
            ),
        )

    campos = await _chamar(ia.extrair_dados_documento, documento.nome_arquivo, texto)
    return IADadosExtraidos(
        nome_arquivo=documento.nome_arquivo, campos=campos, trecho=texto[:1500]
    )


@router.get("/semelhantes", response_model=IASemelhancas)
async def demandas_semelhantes(
    demanda_id: uuid.UUID,
    limite: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Demandas parecidas, recuperadas por texto e reordenadas pela IA.

    A recuperação sempre acontece; sem IA ligada, devolve a ordem textual com a
    marca `ranqueada_por_ia=false` — nunca inventa semelhança.
    """
    demanda = await _contexto(db, demanda_id, user)
    stmt = svc_demandas.aplicar_escopo(
        select(Demanda), user, get_user_permissions(user)
    ).where(Demanda.id != demanda.id)
    # Recuperação por tokens com OR, para não exigir o título inteiro em comum:
    # duas obras do mesmo bairro podem compartilhar só o nome da rua. A IA, se
    # ligada, reordena depois.
    tokens = _tokens_relevantes(
        " ".join(filter(None, [demanda.titulo, demanda.objeto, demanda.assunto, demanda.descricao]))
    )
    if tokens:
        condicoes = []
        for token in tokens:
            alvo = f"%{token}%"
            condicoes.append(
                or_(
                    Demanda.titulo.ilike(alvo),
                    Demanda.objeto.ilike(alvo),
                    Demanda.assunto.ilike(alvo),
                    Demanda.descricao.ilike(alvo),
                )
            )
        stmt = stmt.where(or_(*condicoes))
    candidatas = (
        await db.execute(
            stmt.order_by(Demanda.ultima_movimentacao_em.desc()).limit(20)
        )
    ).scalars().unique().all()

    base = [
        {"id": str(c.id), "numero": c.numero, "titulo": c.titulo, "objeto": c.objeto}
        for c in candidatas
    ]
    ordenadas: list[dict] = []
    ranqueada = False
    if base and ia.configurada():
        try:
            ordenadas = await ia.ranquear_demandas_semelhantes(demanda, base)
            ranqueada = True
        except (ia.IAFalhou, ia.IADesabilitada):
            ordenadas = []
    if not ordenadas:
        ordenadas = [{"id": c["id"], "motivo": "correspondência textual"} for c in base]

    por_id = {c["id"]: c for c in base}
    itens: list[IASemelhancaItem] = []
    for ordem in ordenadas:
        candidata = por_id.get(str(ordem.get("id")))
        if candidata is None:
            continue
        itens.append(
            IASemelhancaItem(
                id=candidata["id"],
                numero=candidata["numero"],
                titulo=candidata["titulo"],
                motivo=str(ordem.get("motivo") or ""),
                score=int(ordem.get("score") or 0),
            )
        )
    return IASemelhancas(items=itens[:limite], ranqueada_por_ia=ranqueada)
