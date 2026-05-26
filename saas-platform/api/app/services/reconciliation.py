import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_statement import BankStatementLine
from app.models.payment_transaction import PaymentTransaction
from app.models.receivable import Receivable


class ReconciliationService:

    def __init__(self, db: AsyncSession, organization_id: uuid.UUID):
        self.db = db
        self.organization_id = organization_id

    async def suggest_matches(self, line: BankStatementLine) -> list[dict]:
        candidates: list[dict] = []

        candidates.extend(await self._match_by_exact_value_and_date(line))
        candidates.extend(await self._match_by_txid(line))
        candidates.extend(await self._match_by_end_to_end(line))
        candidates.extend(await self._match_by_external_charge_id(line))
        candidates.extend(await self._match_by_close_value(line))

        seen = set()
        unique = []
        for c in candidates:
            key = str(c.get("id", ""))
            if key and key not in seen:
                seen.add(key)
                unique.append(c)

        unique.sort(key=lambda x: x.get("score", 0), reverse=True)
        return unique[:10]

    async def _match_by_exact_value_and_date(self, line: BankStatementLine) -> list[dict]:
        results = []
        line_date = line.transaction_date.replace(tzinfo=timezone.utc) if line.transaction_date and line.transaction_date.tzinfo is None else line.transaction_date
        date_start = line_date - timedelta(days=5) if line_date else datetime.now(timezone.utc) - timedelta(days=5)
        date_end = line_date + timedelta(days=5) if line_date else datetime.now(timezone.utc) + timedelta(days=5)

        receivables = await self.db.execute(
            select(Receivable).where(
                Receivable.organization_id == self.organization_id,
                Receivable.status.in_(["open", "overdue", "partially_paid"]),
                Receivable.open_amount_cents == line.amount_cents,
                Receivable.due_date >= date_start,
                Receivable.due_date <= date_end,
            )
        )
        for rec in receivables.scalars().all():
            results.append({
                "id": str(rec.id),
                "type": "receivable",
                "description": rec.description or f"Recebivel #{rec.id}",
                "amount_cents": rec.open_amount_cents,
                "date": str(rec.due_date),
                "score": 100,
                "match_reason": "Valor exato + data próxima (5 dias)",
            })

        payments = await self.db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.organization_id == self.organization_id,
                PaymentTransaction.amount_cents == line.amount_cents,
                PaymentTransaction.paid_at.isnot(None),
            )
        )
        for pmt in payments.scalars().all():
            pmt_date = pmt.paid_at.replace(tzinfo=timezone.utc) if pmt.paid_at and pmt.paid_at.tzinfo is None else pmt.paid_at
            if pmt_date and abs((pmt_date - line_date).days) <= 5:
                results.append({
                    "id": str(pmt.id),
                    "type": "payment",
                    "description": f"Pagamento {pmt.payment_method} - {pmt.external_id or ''}",
                    "amount_cents": pmt.amount_cents,
                    "date": str(pmt.paid_at),
                    "score": 95,
                    "match_reason": "Valor exato + pagamento próximo",
                })

        return results

    async def _match_by_txid(self, line: BankStatementLine) -> list[dict]:
        if not line.bank_identifier:
            return []
        txid = line.bank_identifier.strip()
        if len(txid) < 4:
            return []

        results = []

        payments = await self.db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.organization_id == self.organization_id,
                PaymentTransaction.extra_data["pix_txid"].astext == txid,
            )
        )
        for pmt in payments.scalars().all():
            results.append({
                "id": str(pmt.id),
                "type": "payment",
                "description": f"Pagamento Pix txid={txid}",
                "amount_cents": pmt.amount_cents,
                "date": str(pmt.paid_at) if pmt.paid_at else "",
                "score": 99,
                "match_reason": "TXID do Pix corresponde",
            })

        receivables = await self.db.execute(
            select(Receivable).where(
                Receivable.organization_id == self.organization_id,
                Receivable.document_number == txid,
            )
        )
        for rec in receivables.scalars().all():
            results.append({
                "id": str(rec.id),
                "type": "receivable",
                "description": rec.description or f"Recebivel #{rec.id}",
                "amount_cents": rec.open_amount_cents,
                "date": str(rec.due_date),
                "score": 90,
                "match_reason": "Documento corresponde ao TXID",
            })

        return results

    async def _match_by_end_to_end(self, line: BankStatementLine) -> list[dict]:
        if not line.description:
            return []
        end_to_end = self._extract_end_to_end(line.description)
        if not end_to_end:
            return []

        results = []
        payments = await self.db.execute(
            select(PaymentTransaction).where(
                PaymentTransaction.organization_id == self.organization_id,
                PaymentTransaction.extra_data["end_to_end_id"].astext == end_to_end,
            )
        )
        for pmt in payments.scalars().all():
            results.append({
                "id": str(pmt.id),
                "type": "payment",
                "description": f"Pagamento EndToEnd={end_to_end}",
                "amount_cents": pmt.amount_cents,
                "date": str(pmt.paid_at) if pmt.paid_at else "",
                "score": 99,
                "match_reason": "EndToEndId corresponde",
            })

        return results

    async def _match_by_external_charge_id(self, line: BankStatementLine) -> list[dict]:
        if not line.bank_identifier and not line.document:
            return []

        identifiers = [x for x in [line.bank_identifier, line.document] if x]

        results = []
        for identifier in identifiers:
            payments = await self.db.execute(
                select(PaymentTransaction).where(
                    PaymentTransaction.organization_id == self.organization_id,
                    PaymentTransaction.external_id == identifier,
                )
            )
            for pmt in payments.scalars().all():
                results.append({
                    "id": str(pmt.id),
                    "type": "payment",
                    "description": f"Pagamento Asaas ID={identifier}",
                    "amount_cents": pmt.amount_cents,
                    "date": str(pmt.paid_at) if pmt.paid_at else "",
                    "score": 98,
                    "match_reason": "External charge ID corresponde",
                })

        return results

    async def _match_by_close_value(self, line: BankStatementLine) -> list[dict]:
        results = []
        tolerance = int(Decimal(str(line.amount_cents)) * Decimal("0.02"))
        tolerance = max(tolerance, 50)

        line_date = line.transaction_date.replace(tzinfo=timezone.utc) if line.transaction_date and line.transaction_date.tzinfo is None else line.transaction_date
        date_start = line_date - timedelta(days=10) if line_date else datetime.now(timezone.utc) - timedelta(days=10)
        date_end = line_date + timedelta(days=10) if line_date else datetime.now(timezone.utc) + timedelta(days=10)

        receivables = await self.db.execute(
            select(Receivable).where(
                Receivable.organization_id == self.organization_id,
                Receivable.status.in_(["open", "overdue", "partially_paid"]),
                Receivable.open_amount_cents.between(
                    line.amount_cents - tolerance,
                    line.amount_cents + tolerance,
                ),
                Receivable.due_date >= date_start,
                Receivable.due_date <= date_end,
            )
        )
        for rec in receivables.scalars().all():
            diff = abs(rec.open_amount_cents - line.amount_cents)
            score = max(50, 90 - int(diff / max(tolerance, 1) * 40))
            results.append({
                "id": str(rec.id),
                "type": "receivable",
                "description": rec.description or f"Recebivel #{rec.id}",
                "amount_cents": rec.open_amount_cents,
                "date": str(rec.due_date),
                "score": score,
                "match_reason": f"Valor próximo (dif={diff} centavos) + data próxima",
            })

        return results

    def _extract_end_to_end(self, text: str) -> Optional[str]:
        import re
        match = re.search(r"E2E[:\s]*([A-Za-z0-9]{20,40})", text, re.IGNORECASE)
        if match:
            return match.group(1)
        match = re.search(r"endToEnd[:\s]*([A-Za-z0-9]{20,40})", text, re.IGNORECASE)
        if match:
            return match.group(1)
        return None

    @staticmethod
    def compute_line_hash(line: BankStatementLine) -> str:
        raw = f"{line.transaction_date}|{line.amount_cents}|{line.description}|{line.bank_identifier}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def compute_file_hash(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()
