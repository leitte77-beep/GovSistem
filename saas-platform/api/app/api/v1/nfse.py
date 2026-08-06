import random
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_platform_admin
from app.core.config import settings
from app.core.database import get_db
from app.models.invoice import Invoice
from app.models.nfse_document import NfseDocument
from app.models.subscription import Subscription
from app.models.user import User
from app.providers import get_fiscal_provider
from app.providers.fiscal import (
    FiscalCompanyData,
    FiscalCustomerData,
    NfseData,
)

router = APIRouter(prefix="/nfse", tags=["nfse"])


class NfseIssueRequest(BaseModel):
    invoice_id: str
    service_code: str = "01.01"
    service_description: Optional[str] = None
    iss_aliquot: float = 0.0
    competence_month: Optional[str] = None
    competence_year: Optional[str] = None


class NfseCancelRequest(BaseModel):
    reason: str = "Cancelamento a pedido do contratante"


class NfseResponse(BaseModel):
    id: str
    nfse_number: Optional[str] = None
    rps_number: Optional[str] = None
    status: str
    customer_name: str = ""
    service_description: str = ""
    gross_amount_cents: int = 0
    net_amount_cents: int = 0
    verification_code: Optional[str] = None
    access_key: Optional[str] = None
    issue_date: Optional[str] = None
    xml_url: Optional[str] = None
    pdf_url: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: str


class PaginatedNfse(BaseModel):
    data: list[NfseResponse]
    total: int
    page: int
    per_page: int


async def _doc_to_response(doc: NfseDocument) -> NfseResponse:
    return NfseResponse(
        id=str(doc.id),
        nfse_number=doc.nfse_number,
        rps_number=doc.rps_number,
        status=doc.status,
        service_description=doc.service_description or "",
        gross_amount_cents=doc.gross_amount_cents,
        net_amount_cents=doc.net_amount_cents,
        verification_code=doc.verification_code,
        access_key=doc.access_key,
        issue_date=doc.issue_date.isoformat() if doc.issue_date else None,
        rejection_reason=doc.rejection_reason,
        created_at=str(doc.created_at),
    )


@router.get("", response_model=PaginatedNfse)
async def list_nfse(
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=200),
    status: Optional[str] = Query(None, alias="status"),
    invoice_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(NfseDocument)
    count_query = select(func.count(NfseDocument.id))

    if status:
        query = query.where(NfseDocument.status == status)
        count_query = count_query.where(NfseDocument.status == status)
    if invoice_id:
        query = query.where(NfseDocument.invoice_id == invoice_id)
        count_query = count_query.where(NfseDocument.invoice_id == invoice_id)

    total = await db.scalar(count_query) or 0
    result = await db.execute(
        query.order_by(NfseDocument.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    docs = result.scalars().all()

    return PaginatedNfse(
        data=[await _doc_to_response(d) for d in docs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{nfse_id}", response_model=NfseResponse)
async def get_nfse(
    nfse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(NfseDocument).where(NfseDocument.id == nfse_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="NFS-e nao encontrada")
    return await _doc_to_response(doc)


@router.post("/issue", response_model=NfseResponse, status_code=201)
@router.post("/from-invoice/{invoice_id}", status_code=201)
async def issue_nfse_from_invoice(
    invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    return await _issue_nfse_for_invoice(
        invoice_id=invoice_id,
        competence_year=None,
        competence_month=None,
        service_description=None,
        db=db,
        user=user,
    )


async def _issue_nfse_for_invoice(
    invoice_id: uuid.UUID,
    competence_year: Optional[int],
    competence_month: Optional[int],
    service_description: Optional[str],
    db: AsyncSession,
    user: User,
):
    inv_result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.subscription).selectinload(Subscription.organization))
        .where(Invoice.id == invoice_id)
    )
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura nao encontrada")

    organization = invoice.subscription.organization if invoice.subscription else None

    existing = await db.execute(
        select(NfseDocument).where(
            NfseDocument.invoice_id == invoice_id,
            NfseDocument.status.in_(["authorized", "authorized_with_restrictions", "pending"]),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ja existe NFS-e ativa para esta fatura")

    provider = get_fiscal_provider()

    company = FiscalCompanyData(
        legal_name=organization.name if organization else "Empresa Padrao",
        cnpj=re.sub(r"\D", "", organization.cnpj or "00000000000000"),
        municipal_registration=getattr(organization, "municipal_registration", None),
        city=getattr(organization, "city", None),
        state=getattr(organization, "state", None),
    )

    customer = FiscalCustomerData(
        name=organization.name if organization else "Cliente Padrao",
        doc_type="cnpj",
        doc_number=re.sub(r"\D", "", organization.cnpj or "00000000000000"),
    )

    competence_date = None
    if competence_year and competence_month:
        try:
            competence_date = datetime(
                int(competence_year), int(competence_month), 1,
                tzinfo=timezone.utc,
            )
        except Exception:
            pass

    tax_snapshot = None
    from app.models.tax_rule import TaxRuleVersion
    from sqlalchemy import select as sel
    now = datetime.now(timezone.utc)
    fiscal_profile_result = await db.execute(
        sel(TaxRuleVersion).where(
            TaxRuleVersion.is_active == True,
            TaxRuleVersion.valid_from <= now,
            (TaxRuleVersion.valid_to >= now) | (TaxRuleVersion.valid_to.is_(None)),
        ).order_by(TaxRuleVersion.version.desc()).limit(1)
    )
    latest_rule = fiscal_profile_result.scalar_one_or_none()
    if latest_rule:
        tax_snapshot = {
            "version": latest_rule.version,
            "tax_regime": latest_rule.tax_regime,
            "iss_rate": latest_rule.iss_rate,
            "ibs_rate": latest_rule.ibs_rate,
            "cbs_rate": latest_rule.cbs_rate,
            "cst": latest_rule.cst,
            "cclass_trib": latest_rule.cclass_trib,
            "valid_from": str(latest_rule.valid_from),
            "valid_to": str(latest_rule.valid_to) if latest_rule.valid_to else None,
        }

    nfse_data = NfseData(
        rps_number=f"AUTO-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}",
        service_code="01.01",
        service_description=service_description or f"Servicos - Fatura {invoice.invoice_number}",
        amount_cents=invoice.amount_cents,
    )

    doc = NfseDocument(
        organization_id=organization.id if organization else uuid.uuid4(),
        invoice_id=invoice.id,
        provider=settings.FISCAL_PROVIDER,
        environment=settings.ASAAS_ENV,
        status="pending",
        rps_number=nfse_data.rps_number,
        service_code="01.01",
        service_description=nfse_data.service_description,
        tax_rule_snapshot=tax_snapshot,
        gross_amount_cents=invoice.amount_cents,
        net_amount_cents=invoice.amount_cents,
        provider_payload={"source": "from_invoice_endpoint"},
    )
    db.add(doc)
    await db.flush()

    result = await provider.issue_nfse(
        company=company,
        customer=customer,
        nfse_data=nfse_data,
        external_reference=str(doc.id),
    )

    if result.success:
        doc.status = result.status
        doc.nfse_number = result.nfse_number
        doc.verification_code = result.verification_code
        doc.access_key = result.access_key
        doc.issue_date = datetime.fromisoformat(result.issue_date) if result.issue_date else None
        doc.xml_content = result.xml_content
        doc.pdf_content_base64 = result.pdf_content_base64
        doc.provider_response = result.provider_response
    else:
        doc.status = result.status
        doc.rejection_reason = result.rejection_reason
        doc.provider_response = result.provider_response

    await db.commit()
    await db.refresh(doc)
    return doc


async def issue_nfse(
    body: NfseIssueRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    inv_result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.subscription).selectinload(Subscription.organization))
        .where(Invoice.id == body.invoice_id)
    )
    invoice = inv_result.scalar_one_or_none()
    if not invoice:
        raise HTTPException(status_code=404, detail="Fatura nao encontrada")

    organization = invoice.subscription.organization if invoice.subscription else None

    provider = get_fiscal_provider()

    company = FiscalCompanyData(
        legal_name=organization.name if organization else "Empresa Padrao",
        cnpj=re.sub(r"\D", "", organization.cnpj or "00000000000000"),
        municipal_registration=getattr(organization, "municipal_registration", None),
        city=getattr(organization, "city", None),
        state=getattr(organization, "state", None),
    )

    customer = FiscalCustomerData(
        name=organization.name if organization else "Cliente Padrao",
        doc_type="cnpj",
        doc_number=re.sub(r"\D", "", organization.cnpj or "00000000000000"),
    )

    competence_date = None
    if body.competence_year and body.competence_month:
        try:
            competence_date = datetime(
                int(body.competence_year), int(body.competence_month), 1,
                tzinfo=timezone.utc,
            )
        except Exception:
            competence_date = datetime.now(timezone.utc)

    nfse_data = NfseData(
        rps_number=f"RPS-{datetime.now().strftime('%Y%m%d%H%M%S')}-{random.randint(100,999)}",
        service_code=body.service_code,
        service_description=body.service_description or "Servicos de assinatura",
        amount_cents=invoice.amount_cents,
        iss_aliquot=body.iss_aliquot,
        iss_amount_cents=int(invoice.amount_cents * body.iss_aliquot / 100),
        competence_date=competence_date.isoformat() if competence_date else None,
    )

    doc = NfseDocument(
        organization_id=user.organization_id,
        invoice_id=invoice.id,
        provider=settings.FISCAL_PROVIDER,
        environment=settings.ASAAS_ENV,
        status="pending",
        rps_number=nfse_data.rps_number,
        service_code=body.service_code,
        service_description=nfse_data.service_description,
        gross_amount_cents=invoice.amount_cents,
        iss_amount_cents=nfse_data.iss_amount_cents,
        net_amount_cents=invoice.amount_cents - nfse_data.iss_amount_cents,
        competence_date=competence_date,
        provider_payload={
            "company_cnpj": company.cnpj,
            "customer_name": customer.name,
            "customer_doc": customer.doc_number,
        },
    )
    db.add(doc)
    await db.flush()

    result = await provider.issue_nfse(
        company=company,
        customer=customer,
        nfse=nfse_data,
        external_reference=str(doc.id),
    )

    if result.success:
        doc.status = result.status
        doc.nfse_number = result.nfse_number
        doc.verification_code = result.verification_code
        doc.access_key = result.access_key
        doc.issue_date = datetime.fromisoformat(result.issue_date) if result.issue_date else None
        doc.xml_content = result.xml_content
        doc.pdf_content_base64 = result.pdf_content_base64
        doc.protocol = result.protocol
        doc.provider_response = result.provider_response
    else:
        doc.status = result.status
        doc.rejection_reason = result.rejection_reason
        doc.provider_response = result.provider_response

    await db.commit()
    await db.refresh(doc)
    return await _doc_to_response(doc)


@router.post("/{nfse_id}/cancel", response_model=NfseResponse)
async def cancel_nfse(
    nfse_id: uuid.UUID,
    body: NfseCancelRequest = NfseCancelRequest(),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(NfseDocument).where(NfseDocument.id == nfse_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="NFS-e nao encontrada")
    if doc.status not in ("authorized", "issued"):
        raise HTTPException(status_code=400, detail="Apenas NFS-e autorizadas podem ser canceladas")

    provider = get_fiscal_provider(doc.provider)

    company = FiscalCompanyData(legal_name="", cnpj="")
    cancel_result = await provider.cancel_nfse(
        nfse_number=doc.nfse_number or "",
        reason=body.reason,
        company=company,
    )

    doc.status = cancel_result.status
    doc.provider_response = cancel_result.provider_response

    await db.commit()
    await db.refresh(doc)
    return await _doc_to_response(doc)


@router.get("/{nfse_id}/xml")
async def download_nfse_xml(
    nfse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(NfseDocument).where(NfseDocument.id == nfse_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="NFS-e nao encontrada")

    if doc.xml_content:
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(
            content=doc.xml_content,
            media_type="application/xml",
            headers={
                "Content-Disposition": f'attachment; filename="nfse-{doc.nfse_number or doc.id}.xml"',
            },
        )

    if doc.access_key and doc.nfse_number:
        provider = get_fiscal_provider(doc.provider)
        xml = await provider.download_xml(doc.nfse_number, doc.access_key)
        if xml:
            from fastapi.responses import PlainTextResponse
            return PlainTextResponse(
                content=xml,
                media_type="application/xml",
                headers={
                    "Content-Disposition": f'attachment; filename="nfse-{doc.nfse_number}.xml"',
                },
            )

    raise HTTPException(status_code=404, detail="XML nao disponivel")


@router.get("/{nfse_id}/pdf")
async def download_nfse_pdf(
    nfse_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(NfseDocument).where(NfseDocument.id == nfse_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="NFS-e nao encontrada")

    if doc.pdf_content_base64:
        import base64
        from fastapi.responses import Response
        pdf_bytes = base64.b64decode(doc.pdf_content_base64)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="danfse-{doc.nfse_number or doc.id}.pdf"',
            },
        )

    if doc.access_key and doc.nfse_number:
        provider = get_fiscal_provider(doc.provider)
        pdf_b64 = await provider.download_pdf(doc.nfse_number, doc.access_key)
        if pdf_b64:
            import base64
            from fastapi.responses import Response
            pdf_bytes = base64.b64decode(pdf_b64)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'attachment; filename="danfse-{doc.nfse_number}.pdf"',
                },
            )

    raise HTTPException(status_code=404, detail="PDF nao disponivel")

