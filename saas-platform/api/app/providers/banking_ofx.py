import hashlib
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from xml.etree import ElementTree as ET

from app.providers.banking import BankStatementAdapter, BankStatementResult, BankTransaction


class OfxBankStatementProvider(BankStatementAdapter):

    async def import_ofx(self, content: bytes, filename: str = "") -> BankStatementResult:
        raw = content.decode("utf-8", errors="replace")
        file_hash = hashlib.sha256(content).hexdigest()

        cleaned = self._clean_sgml(raw)
        root = ET.fromstring(cleaned)

        return self._parse_ofx(root, file_hash, filename)

    async def import_csv(self, content: bytes, filename: str = "") -> BankStatementResult:
        raise NotImplementedError("Use CsvBankStatementProvider for CSV files")

    async def import_provider_extract(
        self, api_key: str, account_id: str, period_start: datetime, period_end: datetime
    ) -> BankStatementResult:
        raise NotImplementedError("Use AsaasStatementProvider for provider extracts")

    def _clean_sgml(self, raw: str) -> str:
        lines = raw.split("\n")
        xml_lines = []
        in_header = True
        for line in lines:
            stripped = line.strip()
            if in_header:
                if stripped.startswith("<OFX>") or stripped.startswith("<OFX"):
                    in_header = False
                    xml_lines.append(stripped)
                continue
            xml_lines.append(stripped)
        result = "\n".join(xml_lines)

        result = re.sub(r"<(?!/?OFX|/?[A-Z])", "&lt;", result)

        result = re.sub(r"<(\w+)>([^<]+)", r"<\1>\2", result)
        return result

    def _parse_ofx(self, root: ET.Element, file_hash: str, filename: str) -> BankStatementResult:
        ns = {}

        bank_code = ""
        bank_name = ""
        agency = ""
        account_number = ""
        period_start: Optional[datetime] = None
        period_end: Optional[datetime] = None
        transactions: list[BankTransaction] = []

        stmtrs = root.find(".//STMTRS")
        if stmtrs is None:
            stmtrs = root.find(".//STMTRS")

        bank_acct = stmtrs.find("BANKACCTFROM") if stmtrs is not None else None
        if bank_acct is not None:
            bank_id_el = bank_acct.find("BANKID")
            acct_id_el = bank_acct.find("ACCTID")
            acct_type_el = bank_acct.find("ACCTTYPE")
            if bank_id_el is not None and bank_id_el.text:
                bank_code = bank_id_el.text.strip()
            if acct_id_el is not None and acct_id_el.text:
                account_number = acct_id_el.text.strip()

        tran_list = root.find(".//BANKTRANLIST") if root.find(".//BANKTRANLIST") is not None else None
        if tran_list is None:
            tran_list = stmtrs.find("BANKTRANLIST") if stmtrs is not None else None

        if tran_list is not None:
            dt_start = tran_list.find("DTSTART")
            dt_end = tran_list.find("DTEND")
            if dt_start is not None and dt_start.text:
                period_start = self._parse_ofx_date(dt_start.text.strip())
            if dt_end is not None and dt_end.text:
                period_end = self._parse_ofx_date(dt_end.text.strip())

            for stmt_trn in tran_list.findall("STMTTRN"):
                tx = self._parse_stmt_trn(stmt_trn)
                if tx is not None:
                    transactions.append(tx)

        if not transactions and stmtrs is not None:
            for stmt_trn in stmtrs.findall(".//STMTTRN"):
                tx = self._parse_stmt_trn(stmt_trn)
                if tx is not None:
                    transactions.append(tx)

        return BankStatementResult(
            bank_code=bank_code,
            bank_name=bank_name or self._infer_bank_name(bank_code),
            agency=agency,
            account_number=account_number,
            period_start=period_start,
            period_end=period_end,
            lines=transactions,
            file_hash=file_hash,
            source="ofx_upload",
        )

    def _parse_stmt_trn(self, el: ET.Element) -> Optional[BankTransaction]:
        try:
            trn_type_el = el.find("TRNTYPE")
            dt_posted_el = el.find("DTPOSTED")
            trn_amt_el = el.find("TRNAMT")
            fit_id_el = el.find("FITID")
            name_el = el.find("NAME")
            memo_el = el.find("MEMO")
            check_num_el = el.find("CHECKNUM")

            trn_type = trn_type_el.text.strip() if trn_type_el is not None and trn_type_el.text else "OTHER"
            dt_str = dt_posted_el.text.strip() if dt_posted_el is not None and dt_posted_el.text else ""
            amt_str = trn_amt_el.text.strip() if trn_amt_el is not None and trn_amt_el.text else "0"
            fit_id = fit_id_el.text.strip() if fit_id_el is not None and fit_id_el.text else None
            name = name_el.text.strip() if name_el is not None and name_el.text else None
            memo = memo_el.text.strip() if memo_el is not None and memo_el.text else None
            check_num = check_num_el.text.strip() if check_num_el is not None and check_num_el.text else None

            dt = self._parse_ofx_date(dt_str)
            amt = Decimal(str(amt_str))
            amount_cents = int(amt * 100)

            internal_type = self._map_trn_type(trn_type)

            description = name or memo or ""
            if name and memo and memo != name:
                description = f"{name} - {memo}"

            return BankTransaction(
                transaction_date=dt,
                amount_cents=abs(amount_cents),
                transaction_type=internal_type,
                description=description,
                document=check_num,
                bank_identifier=fit_id,
                fit_id=fit_id,
                check_number=check_num,
                memo=memo,
                raw_data={
                    "original_type": trn_type,
                    "original_amount": amt_str,
                },
            )
        except (ValueError, AttributeError, TypeError) as exc:
            return None

    def _parse_ofx_date(self, date_str: str) -> datetime:
        cleaned = date_str.replace("-", "").replace(":", "").replace(".", "").strip()
        if len(cleaned) >= 14:
            return datetime.strptime(cleaned[:14], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
        elif len(cleaned) >= 8:
            return datetime.strptime(cleaned[:8], "%Y%m%d").replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc)

    def _map_trn_type(self, ofx_type: str) -> str:
        mapping = {
            "CREDIT": "credit",
            "DEBIT": "debit",
            "INT": "interest",
            "DIV": "dividend",
            "FEE": "fee",
            "SRVCHG": "fee",
            "DEP": "deposit",
            "ATM": "withdrawal",
            "POS": "debit",
            "XFER": "transfer",
            "CHECK": "check",
            "PAYMENT": "payment",
            "DIRECTDEBIT": "debit",
            "DIRECTDEP": "deposit",
            "REPEATPMT": "payment",
            "OTHER": "other",
        }
        return mapping.get(ofx_type.upper(), "other")

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
            "453": "Rural",
            "633": "Sicoob",
            "748": "Sicredi",
            "756": "Sicoob",
            "077": "Inter",
            "212": "Origine",
            "260": "Nubank",
            "323": "Mercado Pago",
            "336": "C6 Bank",
            "412": "Banco Capital",
            "654": "Digio",
            "735": "Neon",
            "739": "Banco Cetelem",
        }
        return banks.get(bank_code, f"Banco {bank_code}")
