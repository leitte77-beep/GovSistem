"""Nota fiscal por abastecimento: recebimento (portal do posto) e leitura (Prefeitura)."""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.storage import build_key, storage
from app.models.abastecimento import Abastecimento
from app.models.anexo import Anexo
from app.models.auditoria import Notificacao
from app.models.auth_models import Organization
from app.models.combustivel import ContratoPosto, Fornecedor
from app.models.veiculo import Veiculo
from app.models.nota_abastecimento import NotaAbastecimento
from app.services.auditoria import registrar_auditoria
from app.services.danfe import ler_danfe
from app.services.nfe import NFeInvalida, ler_nfe, so_digitos

TIPOS = {"NFE_XML": "XML da nota", "DANFE": "PDF da nota (DANFE)"}
MAX_XML_BYTES = 5 * 1024 * 1024
MOTIVOS_SUBSTITUICAO = {
    "NOTA_CANCELADA": "Nota cancelada na SEFAZ",
    "VALOR_ERRADO": "Valor ou quantidade errados",
    "PLACA_ERRADA": "Placa ou veículo errados",
    "ARQUIVO_ERRADO": "Arquivo errado ou ilegível",
    "OUTRO": "Outro motivo",
}


def validar_motivo(motivo: str | None, detalhe: str | None) -> tuple[str, str | None]:
    """Motivo obrigatório para substituir nota; "OUTRO" exige descrição."""
    motivo = (motivo or "").strip().upper()
    detalhe = (detalhe or "").strip()[:1000] or None
    if motivo not in MOTIVOS_SUBSTITUICAO:
        raise HTTPException(status_code=422, detail="Já existe nota enviada para este abastecimento. Informe o motivo da substituição.")
    if motivo == "OUTRO" and (not detalhe or len(detalhe) < 10):
        raise HTTPException(status_code=422, detail="Descreva o motivo da substituição (mínimo 10 caracteres).")
    return motivo, detalhe
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
    # Dados lidos: do XML quando houver, senão do texto do PDF.
    lida = xml if xml and xml.nfe_numero else (pdf if pdf and (pdf.nfe_chave or pdf.nfe_valor_total is not None) else xml)
    avisos = [a for n in (xml, pdf) if n and n.avisos for a in json.loads(n.avisos)]
    trocada = max((n for n in (xml, pdf) if n and n.versao > 1), key=lambda n: n.created_at, default=None)
    return {
        "substituida": trocada is not None,
        "motivo_substituicao": MOTIVOS_SUBSTITUICAO.get(trocada.motivo_substituicao or "", "Motivo não informado") if trocada else None,
        "numero": lida.nfe_numero if lida else None,
        "serie": lida.nfe_serie if lida else None,
        "chave": lida.nfe_chave if lida else None,
        "valor": float(lida.nfe_valor_total) if lida and lida.nfe_valor_total is not None else None,
        "emissao": lida.nfe_emissao.isoformat() if lida and lida.nfe_emissao else None,
        "conferida": bool(lida and lida.nfe_valor_total is not None),
        "enviada_em": base.created_at.isoformat() if base and base.created_at else None,
        "xml_id": str(xml.id) if xml else None,
        "pdf_id": str(pdf.id) if pdf else None,
        "avisos": avisos,
    }


UNIDADES_LITRO = {"L", "LT", "LTS", "LITRO", "LITROS"}


def _br(v: Decimal, casas: int = 2) -> str:
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


@dataclass
class Conferencia:
    avisos: list[str]
    # Preço/L da nota acima do contrato: (preço nota, preço contrato, diferença total em R$)
    acima_contrato: tuple[Decimal, Decimal, Decimal] | None = None


async def preco_contratado(db: AsyncSession, abast: Abastecimento) -> Decimal | None:
    """Preço/L do contrato aplicado ao abastecimento (gravado no registro; senão, o do contrato)."""
    if abast.contrato_posto_id:
        contrato = await db.get(ContratoPosto, abast.contrato_posto_id)
        if contrato is not None:
            return Decimal(contrato.preco_litro)
    return Decimal(abast.preco_litro) if abast.preco_litro is not None else None


async def conferir(
    db: AsyncSession, abast: Abastecimento, *, emitente_cnpj: str | None, destinatario_cnpjs: list[str],
    valor: Decimal | None, litros: Decimal | None, preco: Decimal | None, km: int | None, placas: list[str] | None,
    autorizada: bool = True,
) -> Conferencia:
    """Compara o que foi lido na nota (XML ou PDF) com o abastecimento registrado."""
    avisos: list[str] = []
    posto = await db.get(Fornecedor, abast.fornecedor_id)
    cnpj_posto = so_digitos(posto.cpf_cnpj) if posto else ""
    if cnpj_posto and emitente_cnpj and emitente_cnpj != cnpj_posto:
        avisos.append("O CNPJ do emitente da nota é diferente do CNPJ do posto.")
    org = await db.get(Organization, abast.organization_id)
    cnpj_org = so_digitos(org.cnpj) if org and org.cnpj else ""
    if cnpj_org and destinatario_cnpjs and cnpj_org not in destinatario_cnpjs:
        avisos.append("O destinatário da nota não é o CNPJ da Prefeitura.")

    litros_reg = Decimal(abast.quantidade_litros)
    litros_ok = litros is None or abs(litros - litros_reg) <= Decimal("0.01")
    if not litros_ok:
        avisos.append(f"Litros da nota ({_br(litros, 3)} L) diferentes do abastecimento ({_br(litros_reg, 3)} L).")

    if preco is None and valor is not None and litros:
        preco = (valor / litros).quantize(Decimal("0.0001"))
    contratado = await preco_contratado(db, abast)
    acima = None
    if preco is not None and contratado is not None and preco - contratado > Decimal("0.005"):
        base = litros if litros is not None else litros_reg
        diferenca = ((preco - contratado) * base).quantize(Decimal("0.01"))
        acima = (preco, contratado, diferenca)
        avisos.append(
            f"Preço da nota (R$ {_br(preco)}/L) acima do contrato (R$ {_br(contratado)}/L): R$ {_br(diferenca)} a mais."
        )
    elif valor is not None and abast.custo_total is not None and abs(valor - Decimal(abast.custo_total)) > TOLERANCIA_VALOR:
        avisos.append(f"Valor da nota (R$ {_br(valor)}) diferente do abastecimento (R$ {_br(Decimal(abast.custo_total))}).")

    if km is not None and abast.quilometragem and km != abast.quilometragem:
        avisos.append(f"Km da nota ({km}) diferente do registrado ({abast.quilometragem}).")
    if placas:
        veiculo = await db.get(Veiculo, abast.veiculo_id)
        placa = (veiculo.placa if veiculo else "").replace("-", "").upper()
        if placa and placa not in placas:
            avisos.append(f"A placa na nota ({', '.join(placas)}) não é a do veículo ({placa}).")
    if not autorizada:
        avisos.append("XML sem protocolo de autorização da SEFAZ.")
    return Conferencia(avisos, acima)


def _litros_xml(nfe) -> tuple[Decimal | None, Decimal | None]:
    itens = [it for it in nfe.itens if (it.unidade or "").strip().upper() in UNIDADES_LITRO]
    if not itens:
        return None, None
    litros = sum((it.quantidade for it in itens), Decimal("0"))
    total = sum((it.valor_total for it in itens), Decimal("0"))
    preco = itens[0].valor_unitario if len(itens) == 1 else (total / litros).quantize(Decimal("0.0001"))
    return litros, preco


async def receber_nota(
    db: AsyncSession, abast: Abastecimento, tipo: str, nome: str, conteudo: bytes, *, acesso=None, user=None,
    motivo: tuple[str, str | None] | None = None,
) -> NotaAbastecimento:
    """Valida, guarda e registra. Não faz commit."""
    tipo = tipo.upper()
    if tipo not in TIPOS:
        raise HTTPException(status_code=422, detail="Tipo de arquivo inválido.")
    nfe = None
    danfe = None
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
            raise HTTPException(status_code=422, detail="Envie a nota em PDF.")
        mime, ext = "application/pdf", ".pdf"
        danfe = await run_in_threadpool(ler_danfe, conteudo)
        if danfe.chave:
            repetida = await db.scalar(
                select(NotaAbastecimento.abastecimento_id).where(
                    NotaAbastecimento.organization_id == abast.organization_id, NotaAbastecimento.nfe_chave == danfe.chave,
                    NotaAbastecimento.ativo.is_(True), NotaAbastecimento.abastecimento_id != abast.id,
                ).limit(1)
            )
            if repetida:
                raise HTTPException(status_code=409, detail="Esta nota já foi enviada para outro abastecimento.")

    anteriores = list(
        (await db.execute(select(NotaAbastecimento).where(NotaAbastecimento.abastecimento_id == abast.id, NotaAbastecimento.tipo == tipo))).scalars()
    )
    substitui = any(n.ativo for n in anteriores)
    if substitui:
        motivo = validar_motivo(*(motivo or (None, None)))
    if nfe is not None:
        litros_nf, preco_nf = _litros_xml(nfe)
        conf = await conferir(
            db, abast, emitente_cnpj=nfe.emitente_cnpj, destinatario_cnpjs=[nfe.destinatario_cnpj] if nfe.destinatario_cnpj else [],
            valor=nfe.valor_total, litros=litros_nf, preco=preco_nf, km=None, placas=None, autorizada=nfe.autorizada,
        )
    elif danfe is not None and danfe.texto:
        litros_nf, preco_nf = danfe.litros, danfe.preco_unitario
        conf = await conferir(
            db, abast, emitente_cnpj=danfe.emitente_cnpj,
            destinatario_cnpjs=[c for c in danfe.cnpjs if c != danfe.emitente_cnpj],
            valor=danfe.valor_total, litros=danfe.litros, preco=danfe.preco_unitario, km=danfe.km, placas=danfe.placas,
        )
    else:
        litros_nf = preco_nf = None
        conf = Conferencia([])
    avisos = conf.avisos
    if conf.acima_contrato is not None:
        from app.services.abastecimento import get_configuracoes

        config = await get_configuracoes(db, abast.organization_id)
        preco_n, preco_c, dif = conf.acima_contrato
        if config.bloquear_nota_preco_acima_contrato:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Nota recusada: preço de R$ {_br(preco_n)}/L acima do contrato (R$ {_br(preco_c)}/L), "
                    f"R$ {_br(dif)} a mais. A Prefeitura exige a nota pelo preço do contrato — emita uma nota corrigida."
                ),
            )
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
        motivo_substituicao=motivo[0] if substitui else None, motivo_detalhe=motivo[1] if substitui else None,
    )
    if nfe is not None:
        nota.nfe_chave = nfe.chave
        nota.nfe_numero = nfe.numero[:20]
        nota.nfe_serie = (nfe.serie or "")[:5] or None
        nota.nfe_emissao = nfe.emissao
        nota.nfe_emitente_cnpj = nfe.emitente_cnpj
        nota.nfe_valor_total = nfe.valor_total
        abast.numero_nf = nfe.numero[:50]
    elif danfe is not None:
        nota.nfe_chave = danfe.chave
        nota.nfe_numero = danfe.numero
        nota.nfe_serie = danfe.serie
        nota.nfe_emitente_cnpj = danfe.emitente_cnpj
        nota.nfe_valor_total = danfe.valor_total
        if danfe.emissao:
            from app.core.timezone import get_tz

            nota.nfe_emissao = danfe.emissao.replace(tzinfo=get_tz())
        if danfe.numero:
            abast.numero_nf = danfe.numero
    nota.nfe_litros = litros_nf
    nota.nfe_preco_unitario = preco_nf
    nota.nfe_km = danfe.km if danfe is not None else None
    db.add(nota)
    await db.flush()
    if conf.acima_contrato is not None:
        veiculo = await db.get(Veiculo, abast.veiculo_id)
        db.add(Notificacao(
            organization_id=abast.organization_id,
            tipo="NOTA_PRECO_ACIMA_CONTRATO",
            titulo=f"Nota acima do preço do contrato — {veiculo.placa if veiculo else abast.numero}",
            descricao=next(a for a in avisos if a.startswith("Preço da nota")),
            severidade="ALERTA",
            link=f"/abastecimentos/{abast.id}",
        ))
    await registrar_auditoria(
        db, organization_id=abast.organization_id, acao="abastecimento.nota_substituir" if substitui else "abastecimento.nota_enviar", entidade="abastecimento",
        entidade_id=abast.id, usuario_id=user.id if user else None,
        dados_novos={"tipo": tipo, "arquivo": nome, "hash": hash_arquivo, "versao": nota.versao,
                     "chave": nfe.chave if nfe else (danfe.chave if danfe else None), "acesso_fornecedor": str(acesso.id) if acesso else None,
                     **({"motivo": motivo[0], "motivo_detalhe": motivo[1]} if substitui else {})},
    )
    return nota


async def ler_arquivo(db: AsyncSession, nota: NotaAbastecimento) -> tuple[bytes, str]:
    anexo = await db.get(Anexo, nota.anexo_id)
    if anexo is None or anexo.organization_id != nota.organization_id or not storage.exists(anexo.caminho):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    return await run_in_threadpool(storage.read, anexo.caminho), anexo.mime_type or "application/octet-stream"
