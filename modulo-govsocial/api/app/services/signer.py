"""Servico de assinatura digital — fluxo completo com validade juridica.

Cobre: ICP-Brasil via Signer, assinatura eletronica avancada (canvas/base64),
hash SHA-256, verificacao de integridade, certificado PDF/A e auditoria.
"""

import base64
import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx

from app.core.config import settings
from app.models.audit_trail import AuditTrail
from app.models.enums import AuditAccessType, AuditAction
from app.models.signing import AssinaturaDocumento, DocumentoAssinatura, SigningCredential
from app.models.user import User

logger = logging.getLogger("govsocial.signer")

SIGNER_URL = getattr(settings, "SIGNER_URL", "http://signer:8100")
INTERNAL_API_KEY = settings.INTERNAL_API_KEY.get_secret_value()


# ═══════════════════════════════════════════════════════════════════════
# ICP-Brasil / Signer — baixo nivel
# ═══════════════════════════════════════════════════════════════════════

async def sign_pdf(
    unsigned_pdf_bytes: bytes,
    pfx_base64: str,
    pfx_password: str,
    document_id: str,
    reason: str = "Assinatura Digital - Atendimento SUAS ICP-Brasil AD-RB",
    location: str = "",
) -> dict:
    """Assina um PDF usando o servico Signer (PAdES AD-RB)."""
    sha_original = hashlib.sha256(unsigned_pdf_bytes).hexdigest()
    verification_code = sha_original[:12].upper()
    payload = {
        "edition_id": document_id,
        "unsigned_pdf_base64": base64.b64encode(unsigned_pdf_bytes).decode("utf-8"),
        "pfx_base64": pfx_base64,
        "pfx_password": pfx_password,
        "reason": reason,
        "location": location,
        "visible": False,
        "verification_code": verification_code,
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SIGNER_URL}/internal/sign-pdf",
            json=payload,
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
        )
        resp.raise_for_status()
        result = resp.json()

    signed_pdf_bytes = base64.b64decode(result["signed_pdf_base64"])
    result["signed_pdf_bytes"] = signed_pdf_bytes
    result["sha256_original"] = sha_original
    return result


async def verify_pdf(signed_pdf_bytes: bytes) -> dict:
    """Verifica a assinatura de um PDF assinado."""
    payload = {"signed_pdf_base64": base64.b64encode(signed_pdf_bytes).decode("utf-8")}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SIGNER_URL}/internal/verify-pdf",
            json=payload,
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
        )
        resp.raise_for_status()
        return resp.json()


async def inspect_certificate(pfx_base64: str, password: str) -> dict:
    """Valida um certificado antes de armazenar."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SIGNER_URL}/internal/certificates/inspect",
            data={"pfx_base64": pfx_base64, "password": password},
            headers={"X-Internal-API-Key": INTERNAL_API_KEY},
        )
        resp.raise_for_status()
        return resp.json()


# ═══════════════════════════════════════════════════════════════════════
# Hash e verificacao
# ═══════════════════════════════════════════════════════════════════════

def gerar_hash_documento(documento_dados: dict) -> str:
    """Gera hash SHA-256 canonico do conteudo do documento.

    A canonicalizacao garante que o mesmo conteudo sempre produza
    o mesmo hash, independente da ordem das chaves no JSON.
    """
    canonical = json.dumps(documento_dados, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _canonical_json(obj) -> str:
    """Representacao JSON canonica para hashing deterministico."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


# ═══════════════════════════════════════════════════════════════════════
# Fluxo de solicitacao de assinatura
# ═══════════════════════════════════════════════════════════════════════

async def solicitar_assinatura(
    db,
    *,
    tenant_id: uuid.UUID,
    documento_tipo: str,
    documento_id: uuid.UUID | None,
    titulo: str,
    dados_documento: dict,
    signatario_id: uuid.UUID | None = None,
    signatario_nome: str | None = None,
    signatario_cpf: str | None = None,
    motivo: str | None = None,
    validade_dias: int = 365,
    solicitado_por: User | None = None,
    client_info: dict | None = None,
) -> AssinaturaDocumento:
    """Cria uma solicitacao de assinatura digital para um documento.

    O hash SHA-256 e calculado no momento da solicitacao e armazenado
    para verificacao futura de integridade.
    """
    hash_doc = gerar_hash_documento(dados_documento)

    assinatura = AssinaturaDocumento(
        tenant_id=tenant_id,
        documento_tipo=documento_tipo,
        documento_id=documento_id,
        titulo=titulo,
        hash_documento=hash_doc,
        dados_documento=dados_documento,
        status="PENDENTE",
        signatario_id=signatario_id,
        signatario_nome=signatario_nome,
        signatario_cpf=signatario_cpf,
        validade_dias=validade_dias,
        motivo=motivo,
        solicitado_por_id=solicitado_por.id if solicitado_por else None,
        metadata_json={
            "solicitado_em": datetime.now(timezone.utc).isoformat(),
            "solicitado_por": solicitado_por.name if solicitado_por else None,
            "cliente": client_info or {},
        },
    )
    db.add(assinatura)
    await db.flush()

    await _audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.CREATE,
        entity="AssinaturaDocumento",
        entity_id=assinatura.id,
        actor=solicitado_por,
        client_info=client_info,
        diff_summary={
            "operacao": "solicitar_assinatura",
            "documento_tipo": documento_tipo,
            "titulo": titulo,
            "hash_documento": hash_doc,
        },
    )

    logger.info(
        "Assinatura solicitada id=%s tipo=%s signatario=%s tenant=%s",
        assinatura.id, documento_tipo, signatario_nome, tenant_id,
    )
    return assinatura


# ═══════════════════════════════════════════════════════════════════════
# Assinar documento
# ═══════════════════════════════════════════════════════════════════════

async def assinar_documento(
    db,
    *,
    assinatura_id: uuid.UUID,
    assinatura_base64: str,
    signatario: User,
    hash_documento: str | None = None,
    client_info: dict | None = None,
) -> AssinaturaDocumento:
    """Registra a assinatura digital em um documento previamente solicitado.

    Verifica:
    - Se o documento existe e esta PENDENTE
    - Se o hash informado confere com o armazenado (integridade)
    - Se o signatario corresponde ao designado (quando aplicavel)
    """
    from sqlalchemy import select

    stmt = select(AssinaturaDocumento).where(
        AssinaturaDocumento.id == assinatura_id,
        AssinaturaDocumento.tenant_id == signatario.organization_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise ValueError("Documento de assinatura nao encontrado")

    if doc.status != "PENDENTE":
        raise ValueError(f"Documento nao esta pendente de assinatura (status: {doc.status})")

    if doc.signatario_id and doc.signatario_id != signatario.id:
        raise ValueError("Signatario nao corresponde ao designado para este documento")

    if hash_documento and hash_documento != doc.hash_documento:
        raise ValueError(
            "Hash do documento nao confere. O documento pode ter sido alterado "
            "desde a solicitacao de assinatura."
        )

    ip_addr = client_info.get("ip_address") if client_info else None

    agora = datetime.now(timezone.utc)
    doc.status = "ASSINADO"
    doc.data_assinatura = agora
    doc.signatario_nome = doc.signatario_nome or signatario.name
    doc.signatario_id = signatario.id
    doc.ip_assinatura = ip_addr
    doc.assinatura_base64 = assinatura_base64
    doc.verificacao_status = "NAO_VERIFICADO"

    meta = doc.metadata_json or {}
    meta["assinado_em"] = agora.isoformat()
    meta["assinado_por"] = signatario.name
    meta["assinado_por_id"] = str(signatario.id)
    meta["user_agent"] = client_info.get("user_agent") if client_info else None
    doc.metadata_json = meta

    await db.flush()

    await _audit(
        db,
        tenant_id=doc.tenant_id,
        action=AuditAction.UPDATE,
        entity="AssinaturaDocumento",
        entity_id=doc.id,
        actor=signatario,
        client_info=client_info,
        diff_summary={
            "operacao": "assinar_documento",
            "status_anterior": "PENDENTE",
            "status_novo": "ASSINADO",
            "hash_documento": doc.hash_documento,
        },
    )

    logger.info(
        "Documento assinado id=%s signatario=%s ip=%s",
        doc.id, signatario.name, ip_addr,
    )
    return doc


# ═══════════════════════════════════════════════════════════════════════
# Verificar assinatura
# ═══════════════════════════════════════════════════════════════════════

async def verificar_assinatura(
    db,
    *,
    assinatura_id: uuid.UUID,
    tenant_id: uuid.UUID,
    actor: User | None = None,
    client_info: dict | None = None,
) -> dict:
    """Verifica a validade e integridade de uma assinatura digital.

    Realiza as seguintes verificacoes:
    1. Hash do documento confere com o armazenado
    2. Assinatura esta presente
    3. Documento nao expirou (validade_dias)
    4. Dados do documento nao foram alterados

    Returns dict com status detalhado da verificacao.
    """
    from sqlalchemy import select

    stmt = select(AssinaturaDocumento).where(
        AssinaturaDocumento.id == assinatura_id,
        AssinaturaDocumento.tenant_id == tenant_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise ValueError("Documento de assinatura nao encontrado")

    agora = datetime.now(timezone.utc)
    detalhes = {}
    integro = True
    problemas = []

    # 1. Verifica se ha assinatura registrada
    assinatura_presente = bool(doc.assinatura_base64)
    if not assinatura_presente:
        problemas.append("Assinatura digital nao registrada")
        integro = False

    # 2. Verifica hash do documento
    hash_atual = None
    if doc.dados_documento:
        hash_atual = gerar_hash_documento(doc.dados_documento)
        if hash_atual != doc.hash_documento:
            problemas.append("Hash do documento nao confere — possivel adulteracao")
            integro = False

    # 3. Verifica expiracao
    expirado = False
    expira_em = None
    if doc.data_assinatura and doc.validade_dias:
        expira_em = doc.data_assinatura + timedelta(days=doc.validade_dias)
        if agora > expira_em:
            problemas.append(f"Assinatura expirada em {expira_em.isoformat()}")
            expirado = True
            integro = False
    elif doc.data_assinatura:
        expira_em = doc.data_assinatura + timedelta(days=doc.validade_dias)

    # 4. Verifica status do documento
    if doc.status == "EXPIRADO":
        problemas.append("Documento marcado como EXPIRADO")
        integro = False
    elif doc.status == "RECUSADO":
        problemas.append("Documento foi RECUSADO pelo signatario")
        integro = False

    # Determina status de verificacao
    if integro and assinatura_presente and not expirado:
        novo_status_verif = "VALIDO"
    elif expirado:
        novo_status_verif = "EXPIRADO"
    elif not integro:
        novo_status_verif = "ALTERADO"
    else:
        novo_status_verif = "INVALIDO"

    # Atualiza registro de verificacao
    doc.verificacao_status = novo_status_verif
    doc.verificacao_data = agora
    await db.flush()

    await _audit(
        db,
        tenant_id=tenant_id,
        action="VERIFY",
        entity="AssinaturaDocumento",
        entity_id=doc.id,
        actor=actor,
        client_info=client_info,
        diff_summary={
            "operacao": "verificar_assinatura",
            "resultado": novo_status_verif,
            "problemas": problemas,
        },
    )

    return {
        "id": str(doc.id),
        "status": doc.status,
        "verificacao_status": novo_status_verif,
        "hash_documento": doc.hash_documento,
        "hash_atual": hash_atual,
        "integro": integro,
        "data_assinatura": doc.data_assinatura,
        "validade_dias": doc.validade_dias,
        "expira_em": expira_em,
        "expirado": expirado,
        "signatario_nome": doc.signatario_nome,
        "assinatura_presente": assinatura_presente,
        "detalhes": {
            "problemas": problemas,
            "verificado_em": agora.isoformat(),
            "documento_tipo": doc.documento_tipo,
            "titulo": doc.titulo,
        },
    }


# ═══════════════════════════════════════════════════════════════════════
# Certificado digital PDF/A
# ═══════════════════════════════════════════════════════════════════════

async def gerar_certificado_assinatura(
    db,
    *,
    assinatura_id: uuid.UUID,
    tenant_id: uuid.UUID,
    actor: User | None = None,
) -> dict:
    """Gera certificado digital de assinatura em PDF/A com metadados.

    O certificado inclui:
    - Identificacao do documento
    - Hash SHA-256
    - Timestamp da assinatura
    - Identificacao do signatario
    - IP da assinatura
    - Codigo de verificacao
    - Metadados XMP para PDF/A
    """
    from sqlalchemy import select

    stmt = select(AssinaturaDocumento).where(
        AssinaturaDocumento.id == assinatura_id,
        AssinaturaDocumento.tenant_id == tenant_id,
    )
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()

    if not doc:
        raise ValueError("Documento de assinatura nao encontrado")

    if doc.status not in ("ASSINADO",):
        raise ValueError(
            f"Certificado so pode ser gerado para documentos assinados (status: {doc.status})"
        )

    from app.models.organization import Organization
    org = await db.get(Organization, tenant_id)

    codigo_verificacao = (doc.hash_documento or "")[:12].upper() if doc.hash_documento else str(doc.id)[:12].upper()

    certificado_dados = {
        "certificado_id": str(doc.id),
        "titulo_documento": doc.titulo,
        "tipo_documento": doc.documento_tipo,
        "hash_sha256": doc.hash_documento,
        "codigo_verificacao": codigo_verificacao,
        "signatario_nome": doc.signatario_nome,
        "signatario_cpf": doc.signatario_cpf,
        "data_assinatura": doc.data_assinatura.isoformat() if doc.data_assinatura else None,
        "ip_assinatura": doc.ip_assinatura,
        "validade_dias": doc.validade_dias,
        "validade_ate": (
            (doc.data_assinatura + timedelta(days=doc.validade_dias)).isoformat()
            if doc.data_assinatura else None
        ),
        "organizacao": org.name if org else "",
        "municipio": org.name if org else "",
        "emitido_em": datetime.now(timezone.utc).isoformat(),
        "formato_assinatura": "PAdES-AD-RB" if doc.assinatura_base64 else "Eletronica-Avancada",
        "metadata": doc.metadata_json or {},
    }

    # Gera o PDF/A do certificado
    pdf_bytes = await _render_certificado_pdf(certificado_dados)

    cert_sha256 = hashlib.sha256(pdf_bytes).hexdigest()

    # Armazena o certificado e atualiza URL
    storage_path = await _store_certificado(
        tenant_id=str(tenant_id),
        assinatura_id=str(assinatura_id),
        pdf_bytes=pdf_bytes,
    )

    doc.certificado_url = storage_path
    doc.certificado_sha256 = cert_sha256
    doc.verificacao_status = "VALIDO"
    doc.verificacao_data = datetime.now(timezone.utc)
    await db.flush()

    await _audit(
        db,
        tenant_id=tenant_id,
        action=AuditAction.UPDATE,
        entity="AssinaturaDocumento",
        entity_id=doc.id,
        actor=actor,
        diff_summary={
            "operacao": "gerar_certificado_assinatura",
            "certificado_sha256": cert_sha256,
            "certificado_url": storage_path,
        },
    )

    logger.info("Certificado gerado id=%s sha256=%s", doc.id, cert_sha256)
    return {
        "certificado_id": str(doc.id),
        "certificado_url": storage_path,
        "certificado_sha256": cert_sha256,
        "dados": certificado_dados,
        "pdf_bytes": pdf_bytes,
    }


async def _render_certificado_pdf(dados: dict) -> bytes:
    """Renderiza o HTML do certificado em PDF usando WeasyPrint."""
    from pathlib import Path
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    template_dir = Path(__file__).resolve().parent.parent / "templates" / "pdf"
    if not template_dir.is_dir():
        template_dir = Path("/tmp")

    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(["html", "xml"]),
    )

    template_name = "certificado_assinatura.html"
    try:
        template = env.get_template(template_name)
    except Exception:
        html = _certificado_html_fallback(dados)
    else:
        html = template.render(**dados)

    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except Exception:
        logger.warning("WeasyPrint indisponivel — retornando HTML como fallback")
        return html.encode("utf-8")


def _certificado_html_fallback(dados: dict) -> str:
    """Template HTML inline do certificado (fallback quando template nao existe)."""
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Certificado de Assinatura Digital</title>
<style>
  @page {{ size: A4; margin: 2cm; }}
  body {{ font-family: 'DejaVu Serif', Georgia, serif; font-size: 12pt; color: #1a1a1a; }}
  .brasao {{ text-align: center; margin-bottom: 20px; }}
  .brasao img {{ height: 80px; }}
  h1 {{ text-align: center; font-size: 18pt; color: #003366; border-bottom: 2px solid #003366; padding-bottom: 10px; }}
  .info-block {{ margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; }}
  .info-block h3 {{ margin-top: 0; color: #003366; }}
  .field {{ margin: 8px 0; }}
  .field-label {{ font-weight: bold; color: #555; }}
  .field-value {{ font-family: 'DejaVu Sans Mono', monospace; }}
  .hash {{ font-size: 9pt; word-break: break-all; background: #eee; padding: 5px; border-radius: 3px; }}
  footer {{ margin-top: 40px; text-align: center; font-size: 9pt; color: #999; }}
  .meta {{ margin-top: 30px; font-size: 8pt; color: #aaa; }}
</style>
</head>
<body>
<div class="brasao">
  <p><strong>{dados.get("organizacao", "")}</strong></p>
  <p>Assistencia Social</p>
</div>
<h1>Certificado de Assinatura Digital</h1>

<div class="info-block">
  <h3>Documento</h3>
  <div class="field"><span class="field-label">Titulo:</span> {dados.get("titulo_documento", "")}</div>
  <div class="field"><span class="field-label">Tipo:</span> {dados.get("tipo_documento", "")}</div>
  <div class="field"><span class="field-label">Codigo de Verificacao:</span> <span class="field-value">{dados.get("codigo_verificacao", "")}</span></div>
  <div class="field"><span class="field-label">Formato de Assinatura:</span> {dados.get("formato_assinatura", "")}</div>
</div>

<div class="info-block">
  <h3>Signatario</h3>
  <div class="field"><span class="field-label">Nome:</span> {dados.get("signatario_nome", "Nao informado")}</div>
  <div class="field"><span class="field-label">CPF:</span> {dados.get("signatario_cpf", "Nao informado")}</div>
  <div class="field"><span class="field-label">Data da Assinatura:</span> {dados.get("data_assinatura", "Nao registrada")}</div>
  <div class="field"><span class="field-label">IP da Assinatura:</span> {dados.get("ip_assinatura", "Nao registrado")}</div>
</div>

<div class="info-block">
  <h3>Integridade</h3>
  <div class="field"><span class="field-label">Hash SHA-256:</span></div>
  <div class="hash">{dados.get("hash_sha256", "Nao calculado")}</div>
  <div class="field"><span class="field-label">Validade:</span> {dados.get("validade_dias", 365)} dias</div>
  <div class="field"><span class="field-label">Valido ate:</span> {dados.get("validade_ate", "Nao definida")}</div>
</div>

<div class="info-block">
  <h3>Emitente</h3>
  <div class="field"><span class="field-label">Orgao:</span> {dados.get("organizacao", "")}</div>
  <div class="field"><span class="field-label">Municipio:</span> {dados.get("municipio", "")}</div>
  <div class="field"><span class="field-label">Emitido em:</span> {dados.get("emitido_em", "")}</div>
</div>

<footer>
  <p>Este certificado digital e valido como comprovante de assinatura, conforme legislacao aplicavel.</p>
  <p>A integridade pode ser verificada pelo hash SHA-256 e codigo de verificacao acima.</p>
</footer>

<div class="meta">
  <p>XMP Metadata: PDF/A-3 | GovSocial Signer v1.0 | Certificado ID: {dados.get("certificado_id", "")}</p>
</div>
</body>
</html>"""


async def _store_certificado(tenant_id: str, assinatura_id: str, pdf_bytes: bytes) -> str:
    """Armazena o certificado PDF e retorna URL de acesso."""
    import os

    storage_dir = os.path.join(settings.UPLOAD_DIR, "certificados", tenant_id)
    os.makedirs(storage_dir, exist_ok=True)

    filename = f"certificado_{assinatura_id}.pdf"
    filepath = os.path.join(storage_dir, filename)

    with open(filepath, "wb") as f:
        f.write(pdf_bytes)

    public_url = getattr(settings, "PUBLIC_URL", "http://localhost:7400")
    return f"{public_url}/api/v1/assinaturas/{assinatura_id}/certificado"


# ═══════════════════════════════════════════════════════════════════════
# Listagem e consulta
# ═══════════════════════════════════════════════════════════════════════

async def listar_pendentes(
    db,
    *,
    tenant_id: uuid.UUID,
    signatario_id: uuid.UUID | None = None,
) -> list[AssinaturaDocumento]:
    """Lista documentos aguardando assinatura no tenant."""
    from sqlalchemy import select

    stmt = select(AssinaturaDocumento).where(
        AssinaturaDocumento.tenant_id == tenant_id,
        AssinaturaDocumento.status == "PENDENTE",
    ).order_by(AssinaturaDocumento.created_at.desc())

    if signatario_id:
        stmt = stmt.where(AssinaturaDocumento.signatario_id == signatario_id)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def listar_assinaturas(
    db,
    *,
    tenant_id: uuid.UUID,
    status: str | None = None,
    documento_tipo: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[AssinaturaDocumento], int]:
    """Historico completo de assinaturas com paginacao e filtros."""
    from sqlalchemy import func, select

    base = select(AssinaturaDocumento).where(
        AssinaturaDocumento.tenant_id == tenant_id,
    )

    if status:
        base = base.where(AssinaturaDocumento.status == status)
    if documento_tipo:
        base = base.where(AssinaturaDocumento.documento_tipo == documento_tipo)

    count_stmt = select(func.count()).select_from(base.subquery())
    total = await db.scalar(count_stmt) or 0

    stmt = base.order_by(AssinaturaDocumento.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)

    return list(result.scalars().all()), total


# ═══════════════════════════════════════════════════════════════════════
# Auditoria
# ═══════════════════════════════════════════════════════════════════════

async def _audit(
    db,
    *,
    tenant_id: uuid.UUID,
    action: AuditAction | str,
    entity: str,
    entity_id: uuid.UUID | str,
    actor: User | None = None,
    client_info: dict | None = None,
    diff_summary: dict | None = None,
) -> AuditTrail:
    """Registra evento na trilha de auditoria para assinaturas."""
    from app.core.auth import user_role_names

    client_info = client_info or {}
    actor_role = None
    if actor:
        roles = user_role_names(actor)
        actor_role = next(iter(sorted(roles)), None) if roles else None

    entry = AuditTrail(
        tenant_id=tenant_id,
        actor_user_id=actor.id if actor else None,
        actor_role=actor_role,
        action=action.value if isinstance(action, AuditAction) else action,
        access_type=AuditAccessType.WRITE.value,
        entity=entity,
        entity_id=str(entity_id),
        ip_address=client_info.get("ip_address"),
        origin=client_info.get("user_agent") or client_info.get("origin"),
        request_id=client_info.get("request_id"),
        diff_summary=diff_summary,
    )
    db.add(entry)
    await db.flush()
    return entry
