import hashlib
import logging
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from app.providers.banking import BankStatementAdapter, BankStatementResult, BankTransaction

logger = logging.getLogger("saas.providers.banking_cnab")


class CnabBankStatementProvider(BankStatementAdapter):

    async def import_ofx(self, content: bytes, filename: str = "") -> BankStatementResult:
        raise NotImplementedError("Use OfxBankStatementProvider for OFX files")

    async def import_csv(self, content: bytes, filename: str = "") -> BankStatementResult:
        raise NotImplementedError("Use CsvBankStatementProvider for CSV files")

    async def import_provider_extract(
        self, api_key: str, account_id: str, period_start: datetime, period_end: datetime
    ) -> BankStatementResult:
        raise NotImplementedError("Use AsaasStatementProvider for provider extracts")

    async def import_cnab_return(self, content: bytes, filename: str = "") -> BankStatementResult:
        raw = content.decode("utf-8", errors="replace")
        file_hash = hashlib.sha256(content).hexdigest()

        lines = raw.splitlines()
        if not lines:
            return BankStatementResult(source="cnab_upload", file_hash=file_hash, lines=[])

        header = lines[0] if len(lines) > 0 else ""
        trailer = lines[-1] if len(lines) > 1 else ""

        if len(header) >= 1 and header[0] == "0":
            return self._parse_cnab_400(lines, file_hash)
        elif len(header) >= 1 and header[0] == "1":
            return self._parse_cnab_240(lines, file_hash)
        else:
            logger.warning("Unknown CNAB format, trying CNAB 400")
            return self._parse_cnab_400(lines, file_hash)

    def _parse_cnab_400(self, lines: list[str], file_hash: str) -> BankStatementResult:
        transactions: list[BankTransaction] = []
        bank_code = ""
        account_number = ""
        period_start: Optional[datetime] = None
        period_end: Optional[datetime] = None

        for raw_line in lines:
            if len(raw_line) < 400:
                continue
            record_type = raw_line[0] if len(raw_line) > 0 else ""

            if record_type == "0":
                bank_code = raw_line[76:79].strip()
                account_number = raw_line[120:137].strip()

            elif record_type == "1":
                try:
                    tx = self._parse_cnab_400_line(raw_line)
                    if tx is not None:
                        transactions.append(tx)
                        if period_start is None or tx.transaction_date < period_start:
                            period_start = tx.transaction_date
                        if period_end is None or tx.transaction_date > period_end:
                            period_end = tx.transaction_date
                except Exception as exc:
                    logger.warning("Failed to parse CNAB 400 line: %s", exc)

        return BankStatementResult(
            bank_code=bank_code,
            bank_name=self._infer_bank_name(bank_code),
            account_number=account_number,
            period_start=period_start,
            period_end=period_end,
            lines=transactions,
            file_hash=file_hash,
            source="cnab_400_upload",
        )

    def _parse_cnab_400_line(self, line: str) -> Optional[BankTransaction]:
        try:
            raw_date = line[110:116].strip()
            amount_str = line[120:134].strip()
            our_number = line[62:73].strip()
            document = line[76:86].strip()
            use = line[108:110].strip()

            dt = datetime.now(timezone.utc)
            if len(raw_date) == 6:
                day = int(raw_date[0:2])
                month = int(raw_date[2:4])
                year = int(raw_date[4:6]) + 2000
                try:
                    dt = datetime(year, month, day, tzinfo=timezone.utc)
                except ValueError:
                    pass

            amount = Decimal(amount_str) / Decimal("100")
            amount_cents = int(amount * 100)

            tx_type = self._map_cnab_use(use)

            description = f"CNAB {use} - Nosso numero: {our_number}"
            if document:
                description += f" - Doc: {document}"

            return BankTransaction(
                transaction_date=dt,
                amount_cents=amount_cents,
                transaction_type=tx_type,
                description=description,
                document=document,
                bank_identifier=our_number,
                raw_data={
                    "original_line": line,
                    "our_number": our_number,
                    "use": use,
                    "cnab_format": "400",
                },
            )
        except (ValueError, IndexError) as exc:
            logger.warning("CNAB 400 parse error: %s", exc)
            return None

    def _parse_cnab_240(self, lines: list[str], file_hash: str) -> BankStatementResult:
        transactions: list[BankTransaction] = []
        bank_code = ""
        account_number = ""
        period_start: Optional[datetime] = None
        period_end: Optional[datetime] = None

        i = 0
        while i < len(lines):
            raw_line = lines[i]
            if len(raw_line) < 240:
                i += 1
                continue

            record_type = raw_line[0] if len(raw_line) > 0 else ""

            if record_type == "0":
                bank_code = raw_line[76:79].strip()

            elif record_type == "1":
                account_number = raw_line[30:42].strip()

            elif record_type == "3":
                try:
                    tx = self._parse_cnab_240_line(lines, i)
                    if tx is not None:
                        transactions.append(tx)
                        if period_start is None or tx.transaction_date < period_start:
                            period_start = tx.transaction_date
                        if period_end is None or tx.transaction_date > period_end:
                            period_end = tx.transaction_date
                except Exception as exc:
                    logger.warning("Failed to parse CNAB 240 line at %d: %s", i, exc)

            i += 1

        return BankStatementResult(
            bank_code=bank_code,
            bank_name=self._infer_bank_name(bank_code),
            account_number=account_number,
            period_start=period_start,
            period_end=period_end,
            lines=transactions,
            file_hash=file_hash,
            source="cnab_240_upload",
        )

    def _parse_cnab_240_line(self, lines: list[str], idx: int) -> Optional[BankTransaction]:
        try:
            seg_line = lines[idx]
            dt = datetime.now(timezone.utc)
            amount_cents = 0
            tx_type = "other"
            our_number = ""
            document = ""

            next_idx = idx + 1
            if next_idx < len(lines) and len(lines[next_idx]) >= 240:
                seg_type = lines[next_idx][13] if len(lines[next_idx]) > 13 else ""
                if seg_type == "J":
                    seg_j = lines[next_idx]
                    date_str = seg_j[48:56].strip()
                    if len(date_str) == 8:
                        try:
                            year = int(date_str[0:4])
                            month = int(date_str[4:6])
                            day = int(date_str[6:8])
                            dt = datetime(year, month, day, tzinfo=timezone.utc)
                        except ValueError:
                            pass

                    amount_str = seg_j[64:82].strip()
                    if amount_str:
                        amount = Decimal(amount_str) / Decimal("100")
                        amount_cents = int(amount * 100)

                elif seg_type == "A":
                    seg_a = lines[next_idx]
                    date_str = seg_a[18:26].strip()
                    if len(date_str) == 8:
                        try:
                            year = int(date_str[0:4])
                            month = int(date_str[4:6])
                            day = int(date_str[6:8])
                            dt = datetime(year, month, day, tzinfo=timezone.utc)
                        except ValueError:
                            pass

                    amount_str = seg_a[60:76].strip()
                    if amount_str:
                        amount = Decimal(amount_str) / Decimal("100")
                        amount_cents = int(amount * 100)

            our_number = seg_line[42:57].strip()
            document = seg_line[57:72].strip()

            return BankTransaction(
                transaction_date=dt,
                amount_cents=amount_cents,
                transaction_type=tx_type,
                description=f"CNAB - Nosso numero: {our_number}",
                document=document,
                bank_identifier=our_number,
                raw_data={
                    "our_number": our_number,
                    "cnab_format": "240",
                },
            )
        except (ValueError, IndexError) as exc:
            logger.warning("CNAB 240 parse error at line %d: %s", idx, exc)
            return None

    def _map_cnab_use(self, use: str) -> str:
        mapping = {
            "01": "credit",
            "02": "debit",
            "03": "debit",
            "04": "credit",
            "05": "credit",
            "06": "credit",
            "07": "debit",
            "08": "debit",
            "09": "credit",
            "10": "credit",
            "11": "credit",
            "12": "debit",
            "13": "debit",
            "14": "credit",
        }
        return mapping.get(use, "other")

    def _infer_bank_name(self, bank_code: str) -> str:
        banks = {
            "001": "Banco do Brasil",
            "033": "Santander",
            "104": "Caixa Econômica Federal",
            "237": "Bradesco",
            "341": "Itaú",
            "389": "Mercantil do Brasil",
            "399": "HSBC",
            "422": "Safra",
            "748": "Sicredi",
            "756": "Sicoob",
            "077": "Inter",
            "260": "Nubank",
            "323": "Mercado Pago",
            "336": "C6 Bank",
        }
        return banks.get(bank_code, f"Banco {bank_code}")
