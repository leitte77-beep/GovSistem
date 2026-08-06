import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.audit_event import AuditEvent
from app.models.bank_statement import BankStatement, BankStatementLine
from app.models.receivable import Receivable
from app.models.user import User
from app.providers import get_bank_statement_provider
from app.providers.banking_cnab import CnabBankStatementProvider
from app.providers.banking_csv import CsvBankStatementProvider
from app.providers.banking_ofx import OfxBankStatementProvider
from app.services.reconciliation import ReconciliationService

router = APIRouter(prefix="/bank-statements", tags=["bank-statements"])


class BankStatementLineResponse(BaseModel):
    id: str
    date: str
    description: Optional[str] = None
    amount_cents: int
    status: str
    matched_receivable_id: Optional[str] = None
    matched_receivable_description: Optional[str] = None
    match_reason: Optional[str] = None
    suggestions: Optional[list[dict]] = None

    model_config = {"from_attributes": True}


class PaginatedBankStatementLines(BaseModel):
    data: list[BankStatementLineResponse]
    total: int
    page: int
    per_page: int


class ImportResult(BaseModel):
    id: str
    filename: str
    total_lines: int
    source: str
    bank_code: str
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None


class MatchSuggestion(BaseModel):
    id: str
    type: str
    description: str
    amount_cents: int
    date: str
    score: int
    match_reason: str


class ImportProviderRequest(BaseModel):
    period_start: str
    period_end: str
    account_id: str = "default"


@router.get("", response_model=PaginatedBankStatementLines)
async def list_bank_statement_lines(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    query = select(BankStatementLine)
    count_query = select(func.count(BankStatementLine.id))

    if status:
        query = query.where(BankStatementLine.reconciliation_status == status)
        count_query = count_query.where(
            BankStatementLine.reconciliation_status == status
        )

    total = await db.scalar(count_query) or 0
    skip = (page - 1) * per_page
    result = await db.execute(
        query.order_by(BankStatementLine.transaction_date.desc())
        .offset(skip)
        .limit(per_page)
    )
    items = result.scalars().all()

    receivable_ids = []
    for line in items:
        if line.matched_transaction_id:
            try:
                receivable_ids.append(uuid.UUID(line.matched_transaction_id))
            except ValueError:
                pass

    receivable_map = {}
    if receivable_ids:
        rec_result = await db.execute(
            select(Receivable).where(Receivable.id.in_(receivable_ids))
        )
        for rec in rec_result.scalars().all():
            receivable_map[str(rec.id)] = rec.description or f"Recebivel #{rec.id}"

    suggestions_map = {}
    for line in items:
        if line.reconciliation_status == "unreconciled":
            suggestions_map[str(line.id)] = None

    def to_response(line: BankStatementLine) -> BankStatementLineResponse:
        mid = line.matched_transaction_id
        desc = receivable_map.get(mid) if mid else None
        return BankStatementLineResponse(
            id=str(line.id),
            date=str(line.transaction_date) if line.transaction_date else "",
            description=line.description,
            amount_cents=line.amount_cents,
            status=line.reconciliation_status,
            matched_receivable_id=mid,
            matched_receivable_description=desc,
            match_reason=None,
            suggestions=[],
        )

    return PaginatedBankStatementLines(
        data=[to_response(line) for line in items],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/import", response_model=ImportResult, status_code=201)
async def import_bank_statement(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Arquivo vazio")

    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext in ("ofx", "qfx"):
        provider = OfxBankStatementProvider()
        result = await provider.import_ofx(content, filename)
    elif ext == "csv":
        provider = CsvBankStatementProvider()
        result = await provider.import_csv(content, filename)
    elif ext in ("cnab", "ret", "400", "240", "cnab400", "cnab240"):
        provider = CnabBankStatementProvider()
        result = await provider.import_cnab_return(content, filename)
    else:
        try:
            decoded = content.decode("utf-8", errors="replace")
            if "<OFX>" in decoded.upper() or "<OFX" in decoded:
                provider = OfxBankStatementProvider()
                result = await provider.import_ofx(content, filename)
            else:
                provider = CsvBankStatementProvider()
                result = await provider.import_csv(content, filename)
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Formato não reconhecido. Envie OFX ou CSV.",
            )

    if not result.lines:
        raise HTTPException(status_code=400, detail="Nenhuma transação encontrada no arquivo")

    bank_account_id = uuid.uuid4()

    statement = BankStatement(
        bank_account_id=bank_account_id,
        period_start=result.period_start or datetime.now(timezone.utc),
        period_end=result.period_end or datetime.now(timezone.utc),
        source=result.source,
        filename=filename,
        file_hash=result.file_hash,
        imported_by=user.id,
        status="imported",
        line_count=len(result.lines),
    )
    db.add(statement)
    await db.flush()

    for tx in result.lines:
        line = BankStatementLine(
            statement_id=statement.id,
            transaction_date=tx.transaction_date,
            amount_cents=tx.amount_cents,
            transaction_type=tx.transaction_type,
            description=tx.description,
            document=tx.document,
            bank_identifier=tx.bank_identifier,
            balance_cents=tx.balance_cents,
            reconciliation_status="unreconciled",
        )
        db.add(line)

    org_id = user.organization_id
    if org_id:
        reconciliation = ReconciliationService(db, org_id)

        lines_result = await db.execute(
            select(BankStatementLine)
            .where(BankStatementLine.statement_id == statement.id)
            .order_by(BankStatementLine.transaction_date)
        )
        new_lines = lines_result.scalars().all()

        for line in new_lines:
            try:
                suggestions = await reconciliation.suggest_matches(line)
                if suggestions:
                    best = suggestions[0]
                    if best["score"] >= 95:
                        line.reconciliation_status = "suggested"
                        line.matched_transaction_id = best["id"]
                        line.matched_at = datetime.now(timezone.utc)
                        line.matched_by = str(user.id)
                        line.notes = f"Auto-sugerido: {best['match_reason']}"
                    elif best["score"] >= 80:
                        line.reconciliation_status = "suggested"
                        line.matched_transaction_id = best["id"]
                        line.matched_at = datetime.now(timezone.utc)
                        line.matched_by = str(user.id)
                        line.notes = f"Sugerido: {best['match_reason']}"
            except Exception:
                pass

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="import_bank_statement",
        resource_type="bank_statement",
        resource_id=str(statement.id),
        details={
            "filename": filename,
            "lines": len(result.lines),
            "source": result.source,
            "bank_code": result.bank_code,
        },
    )
    db.add(audit)
    await db.commit()

    return ImportResult(
        id=str(statement.id),
        filename=filename,
        total_lines=len(result.lines),
        source=result.source,
        bank_code=result.bank_code,
        bank_name=result.bank_name,
        account_number=result.account_number,
        period_start=str(result.period_start) if result.period_start else None,
        period_end=str(result.period_end) if result.period_end else None,
    )


@router.post("/import-provider", response_model=ImportResult, status_code=201)
async def import_from_provider(
    body: ImportProviderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    try:
        period_start = datetime.fromisoformat(body.period_start.replace("Z", "+00:00"))
        period_end = datetime.fromisoformat(body.period_end.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Datas inválidas. Use ISO 8601.")

    provider = get_bank_statement_provider("asaas")
    result = await provider.import_provider_extract(
        api_key="",
        account_id=body.account_id,
        period_start=period_start,
        period_end=period_end,
    )

    if not result.lines:
        raise HTTPException(status_code=400, detail="Nenhuma transação encontrada no provedor")

    statement = BankStatement(
        bank_account_id=uuid.uuid4(),
        period_start=period_start,
        period_end=period_end,
        source="asaas_provider",
        filename="",
        imported_by=user.id,
        status="imported",
        line_count=len(result.lines),
    )
    db.add(statement)
    await db.flush()

    for tx in result.lines:
        line = BankStatementLine(
            statement_id=statement.id,
            transaction_date=tx.transaction_date,
            amount_cents=tx.amount_cents,
            transaction_type=tx.transaction_type,
            description=tx.description,
            document=tx.document,
            bank_identifier=tx.bank_identifier,
            balance_cents=tx.balance_cents,
            reconciliation_status="unreconciled",
        )
        db.add(line)

    org_id = user.organization_id
    if org_id:
        reconciliation = ReconciliationService(db, org_id)

        lines_result = await db.execute(
            select(BankStatementLine)
            .where(BankStatementLine.statement_id == statement.id)
        )
        new_lines = lines_result.scalars().all()

        for line in new_lines:
            try:
                suggestions = await reconciliation.suggest_matches(line)
                if suggestions:
                    best = suggestions[0]
                    if best["score"] >= 95:
                        line.reconciliation_status = "suggested"
                        line.matched_transaction_id = best["id"]
                        line.notes = f"Auto-sugerido: {best['match_reason']}"
                    elif best["score"] >= 80:
                        line.reconciliation_status = "suggested"
                        line.matched_transaction_id = best["id"]
                        line.notes = f"Sugerido: {best['match_reason']}"
            except Exception:
                pass

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="import_bank_statement_provider",
        resource_type="bank_statement",
        resource_id=str(statement.id),
        details={
            "source": "asaas_provider",
            "lines": len(result.lines),
            "period_start": body.period_start,
            "period_end": body.period_end,
        },
    )
    db.add(audit)
    await db.commit()

    return ImportResult(
        id=str(statement.id),
        filename="",
        total_lines=len(result.lines),
        source="asaas_provider",
        bank_code="ASAAS",
        bank_name="Asaas",
        period_start=body.period_start,
        period_end=body.period_end,
    )


@router.get("/{line_id}/suggestions", response_model=list[MatchSuggestion])
async def get_match_suggestions(
    line_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(BankStatementLine).where(BankStatementLine.id == line_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Linha do extrato não encontrada")

    org_id = user.organization_id
    if not org_id:
        return []

    reconciliation = ReconciliationService(db, org_id)
    suggestions = await reconciliation.suggest_matches(line)

    return [
        MatchSuggestion(
            id=s["id"],
            type=s["type"],
            description=s["description"],
            amount_cents=s["amount_cents"],
            date=s["date"],
            score=s["score"],
            match_reason=s["match_reason"],
        )
        for s in suggestions
    ]


@router.post("/{line_id}/manual-match", status_code=200)
async def manual_match(
    line_id: uuid.UUID,
    receivable_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(BankStatementLine).where(BankStatementLine.id == line_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Linha do extrato não encontrada")

    if receivable_id:
        try:
            rec_uuid = uuid.UUID(receivable_id)
            rec_result = await db.execute(
                select(Receivable).where(Receivable.id == rec_uuid)
            )
            rec = rec_result.scalar_one_or_none()
            if not rec:
                raise HTTPException(status_code=404, detail="Recebível não encontrado")
        except ValueError:
            raise HTTPException(status_code=400, detail="ID do recebível inválido")

    line.reconciliation_status = "reconciled"
    if receivable_id:
        line.matched_transaction_id = receivable_id
    line.matched_at = datetime.now(timezone.utc)
    line.matched_by = str(user.id)

    statement_result = await db.execute(
        select(BankStatement).where(BankStatement.id == line.statement_id)
    )
    statement = statement_result.scalar_one_or_none()
    if statement:
        statement.reconciled_count = (
            await db.scalar(
                select(func.count(BankStatementLine.id)).where(
                    BankStatementLine.statement_id == statement.id,
                    BankStatementLine.reconciliation_status == "reconciled",
                )
            )
            or 0
        )

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="manual_reconciliation",
        resource_type="bank_statement_line",
        resource_id=str(line.id),
        details={
            "amount_cents": line.amount_cents,
            "matched_transaction_id": receivable_id,
            "previous_status": "unreconciled",
        },
    )
    db.add(audit)
    await db.commit()
    return {"message": "Linha conciliada manualmente"}


@router.post("/{line_id}/accept-match", status_code=200)
async def accept_match(
    line_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(BankStatementLine).where(BankStatementLine.id == line_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Linha do extrato não encontrada")
    if line.reconciliation_status != "suggested":
        raise HTTPException(
            status_code=400,
            detail="Esta linha não possui sugestão para aceitar",
        )
    if not line.matched_transaction_id:
        raise HTTPException(
            status_code=400,
            detail="Linha sugerida não tem correspondência vinculada",
        )

    line.reconciliation_status = "reconciled"
    line.matched_at = datetime.now(timezone.utc)
    line.matched_by = str(user.id)

    statement_result = await db.execute(
        select(BankStatement).where(BankStatement.id == line.statement_id)
    )
    statement = statement_result.scalar_one_or_none()
    if statement:
        statement.reconciled_count = (
            await db.scalar(
                select(func.count(BankStatementLine.id)).where(
                    BankStatementLine.statement_id == statement.id,
                    BankStatementLine.reconciliation_status == "reconciled",
                )
            )
            or 0
        )

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="accept_reconciliation_suggestion",
        resource_type="bank_statement_line",
        resource_id=str(line.id),
        details={
            "amount_cents": line.amount_cents,
            "matched_transaction_id": line.matched_transaction_id,
        },
    )
    db.add(audit)
    await db.commit()
    return {"message": "Sugestão de conciliação aceita"}


@router.post("/{line_id}/undo", status_code=200)
async def undo_reconciliation(
    line_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(BankStatementLine).where(BankStatementLine.id == line_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Linha do extrato não encontrada")
    if line.reconciliation_status != "reconciled":
        raise HTTPException(
            status_code=400,
            detail="Apenas linhas conciliadas podem ser desfeitas",
        )

    old_match = line.matched_transaction_id
    line.reconciliation_status = "unreconciled"
    line.matched_transaction_id = None
    line.matched_at = None
    line.matched_by = None

    statement_result = await db.execute(
        select(BankStatement).where(BankStatement.id == line.statement_id)
    )
    statement = statement_result.scalar_one_or_none()
    if statement:
        statement.reconciled_count = (
            await db.scalar(
                select(func.count(BankStatementLine.id)).where(
                    BankStatementLine.statement_id == statement.id,
                    BankStatementLine.reconciliation_status == "reconciled",
                )
            )
            or 0
        )

    audit = AuditEvent(
        actor_id=user.id,
        actor_email=user.email,
        organization_id=user.organization_id,
        action="undo_reconciliation",
        resource_type="bank_statement_line",
        resource_id=str(line.id),
        details={
            "previous_match": old_match,
            "reason": "Desfeito pelo usuário",
        },
    )
    db.add(audit)
    await db.commit()
    return {"message": "Conciliação desfeita com sucesso"}


@router.get("/reports/pending", status_code=200)
async def pending_reconciliation_report(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    total_result = await db.execute(
        select(func.count(BankStatementLine.id))
    )
    total = total_result.scalar() or 0

    unreconciled_result = await db.execute(
        select(func.count(BankStatementLine.id)).where(
            BankStatementLine.reconciliation_status == "unreconciled"
        )
    )
    unreconciled = unreconciled_result.scalar() or 0

    suggested_result = await db.execute(
        select(func.count(BankStatementLine.id)).where(
            BankStatementLine.reconciliation_status == "suggested"
        )
    )
    suggested = suggested_result.scalar() or 0

    reconciled_result = await db.execute(
        select(func.count(BankStatementLine.id)).where(
            BankStatementLine.reconciliation_status == "reconciled"
        )
    )
    reconciled = reconciled_result.scalar() or 0

    unreconciled_amount = await db.scalar(
        select(func.coalesce(func.sum(BankStatementLine.amount_cents), 0)).where(
            BankStatementLine.reconciliation_status == "unreconciled"
        )
    ) or 0

    oldest_unreconciled = await db.execute(
        select(BankStatementLine)
        .where(BankStatementLine.reconciliation_status == "unreconciled")
        .order_by(BankStatementLine.transaction_date.asc())
        .limit(1)
    )
    oldest_line = oldest_unreconciled.scalar_one_or_none()

    return {
        "total": total,
        "unreconciled": unreconciled,
        "suggested": suggested,
        "reconciled": reconciled,
        "completion_percent": round((reconciled / total * 100), 1) if total > 0 else 0,
        "unreconciled_amount_cents": unreconciled_amount,
        "oldest_unreconciled_date": str(oldest_line.transaction_date) if oldest_line else None,
    }


@router.get("/statements", status_code=200)
async def list_imported_statements(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    result = await db.execute(
        select(BankStatement)
        .order_by(BankStatement.imported_at.desc())
        .limit(50)
    )
    statements = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "filename": s.filename,
            "source": s.source,
            "imported_at": str(s.imported_at) if s.imported_at else None,
            "line_count": s.line_count,
            "reconciled_count": s.reconciled_count,
            "status": s.status,
        }
        for s in statements
    ]
