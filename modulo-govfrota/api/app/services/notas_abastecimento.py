"""Nota fiscal por abastecimento: recebimento (portal do posto) e leitura (Prefeitura)."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.storage import build_key, storage
from app.models.abastecimento import Abastecimento
from app.models.anexo import Anexo
from app.models.combustivel import Fornecedor
from app.models.nota_abastecimento import NotaAbastecimento
from app.services.auditoria import registrar_auditoria
from app.services.nfe import NFeInvalida, ler_nfe, so_digitos

TIPOS = {"NFE_XML": "XML da nota", "DANFE": "PDF da nota (DANFE)"}
MAX_XML_BYTES = 5 * 1024 * 1024
TOLERANCIA_VALOR = Decimal("0.05")


async def notas_ativas(db: AsyncSession, ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, NotaAbastecimento]]:
    """{abastecimento_id: {tipo: nota vigente}}"""
    out: dict[uuid.UUID, dict[str, NotaAbastecimento]] = {}
    if not ids:
        return out
    for n in (
        await db.execute(select(NotaAbastecimento).where(NotaAbastecimento.abastecimento_id.in_(ids), NotaAbastecimento.ativo.is_(True)))
    ).scalars():
        out.setdefault(n.abastecimento_id, {})[n.tipo] = n
    return out


def resumo_nota(notas: dict[str, NotaAbastecimento] | None) -> dict | None:
    if not notas:
        return None
    xml, pdf = notas.get("NFE_XML"), notas.get("DANFE")
    base = xml or pdf
    avisos = json.loads(xml.avisos) if xml and xml.avisos else []
    return {
        "numero": xml.nfe_numero if xml else None,
        "serie": xml.nfe_serie if xml else None,
        "chave": xml.nfe_chave if xml else None,
        "valor": float(xml.nfe_valor_total) if xml and xml.nfe_valor_total is not None else None,
        "emissao": xml.nfe_emissao.isoformat() if xml and xml.nfe_emissao else None,
        "enviada_em": base.created_at.isoformat() if base and base.created_at else None,
        "xml_id": str(xml.id) if xml else None,
        "pdf_id": str(pdf.id) if pdf else None,
        "avisos": avisos,
    }


async def _avisos(db: AsyncSession, abast: Abastecimento, nfe) -> list[str]:
    avisos: list[str] = []
    posto = await db.get(Fornecedor, abast.fornecedor_id)
    cnpj_posto = so_digitos(posto.cpf_cnpj) if posto else ""
    if cnpj_posto and nfe.emitente_cnpj and nfe.emitente_cnpj != cnpj_posto:
        avisos.append("O CNPJ do emitente da nota é diferente do CNPJ do posto.")
    if abast.custo_total is not None and abs(nfe.valor_total - Decimal(abast.custo_total)) > TOLERANCIA_VALOR:
        avisos.append(f"Valor da nota ({nfe.valor_total}) diferente do abastecimento ({Decimal(abast.custo_total):.2f}).")
    if not nfe.autorizada:
        avisos.append("XML sem protocolo de autorização da SEFAZ.")
    return avisos


async def receber_nota(
    db: AsyncSession, abast: Abastecimento, tipo: str, nome: str, conteudo: bytes, *, acesso=None, user=None,
) -> NotaAbastecimento:
    """Valida, guarda e registra. Não faz commit."""
    tipo = tipo.upper()
    if tipo not in TIPOS:
        raise HTTPException(status_code=422, detail="Tipo de arquivo inválido.")
    nfe = None
    if tipo == "NFE_XML":
        if len(conteudo) > MAX_XML_BYTES:
            raise HTTPException(status_code=422, detail="XML maior que 5 MB.")
        try:
            nfe = await run_in_threadpool(ler_nfe, conteudo, True)
        except NFeInvalida as e:
            raise HTTPException(status_code=422, detail=str(e))
        repetida = await db.scalar(
            select(NotaAbastecimento.abastecimento_id).where(
                NotaAbastecimento.organization_id == abast.organization_id, NotaAbastecimento.nfe_chave == nfe.chave,
                NotaAbastecimento.ativo.is_(True), NotaAbastecimento.abastecimento_id != abast.id,
            ).limit(1)
        )
        if repetida:
            raise HTTPException(status_code=409, detail="Esta nota já foi enviada para outro abastecimento.")
        mime, ext = "application/xml", ".xml"
    else:
        if len(conteudo) > settings.MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(status_code=422, detail="Arquivo excede o tamanho máximo.")
        if not conteudo.startswith(b"%PDF"):
            raise HTTPException(status_code=422, detail="Envie o DANFE em PDF.")
        mime, ext = "application/pdf", ".pdf"

    avisos = await _avisos(db, abast, nfe) if nfe else []
    hash_arquivo = hashlib.sha256(conteudo).hexdigest()
    anexo = Anexo(
        organization_id=abast.organization_id, nome_arquivo=nome, caminho="", mime_type=mime, tamanho_bytes=len(conteudo),
        tipo="XML" if nfe else "DOCUMENTO", enviado_por_usuario_id=user.id if user else None,
    )
    db.add(anexo)
    await db.flush()
    chave_storage = build_key(abast.organization_id, "NOTA_ABASTECIMENTO", nome, ext)
    await run_in_threadpool(storage.store, chave_storage, conteudo, mime)
    anexo.caminho = chave_storage

    anteriores = list(
        (await db.execute(select(NotaAbastecimento).where(NotaAbastecimento.abastecimento_id == abast.id, NotaAbastecimento.tipo == tipo))).scalars()
    )
    agora = datetime.now(timezone.utc)
    for n in anteriores:
        if n.ativo:
            n.ativo = False
            n.desativado_em = agora
    nota = NotaAbastecimento(
        organization_id=abast.organization_id, abastecimento_id=abast.id, fornecedor_id=abast.fornecedor_id, tipo=tipo,
        anexo_id=anexo.id, nome_arquivo=nome, hash_sha256=hash_arquivo, versao=len(anteriores) + 1, ativo=True,
        enviado_por_acesso_fornecedor_id=acesso.id if acesso else None, enviado_por_usuario_id=user.id if user else None,
        avisos=json.dumps(avisos, ensure_ascii=False) if avisos else None,
    )
    if nfe is not None:
        nota.nfe_chave = nfe.chave
        nota.nfe_numero = nfe.numero[:20]
        nota.nfe_serie = (nfe.serie or "")[:5] or None
        nota.nfe_emissao = nfe.emissao
        nota.nfe_emitente_cnpj = nfe.emitente_cnpj
        nota.nfe_valor_total = nfe.valor_total
        abast.numero_nf = nfe.numero[:50]
    db.add(nota)
    await db.flush()
    await registrar_auditoria(
        db, organization_id=abast.organization_id, acao="abastecimento.nota_enviar", entidade="abastecimento",
        entidade_id=abast.id, usuario_id=user.id if user else None,
        dados_novos={"tipo": tipo, "arquivo": nome, "hash": hash_arquivo, "versao": nota.versao,
                     "chave": nfe.chave if nfe else None, "acesso_fornecedor": str(acesso.id) if acesso else None},
    )
    return nota


async def ler_arquivo(db: AsyncSession, nota: NotaAbastecimento) -> tuple[bytes, str]:
    anexo = await db.get(Anexo, nota.anexo_id)
    if anexo is None or anexo.organization_id != nota.organization_id or not storage.exists(anexo.caminho):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return await run_in_threadpool(storage.read, anexo.caminho), anexo.mime_type or "application/octet-stream"
