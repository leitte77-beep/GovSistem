import csv
import hashlib
import io
import re
from datetime import datetime, timezone
from decimal import Decimal, DecimalException
from typing import Optional

from app.providers.banking import BankStatementAdapter, BankStatementResult, BankTransaction


class CsvBankStatementProvider(BankStatementAdapter):

    DELIMITERS = [",", ";", "\t"]
    DATE_FORMATS = [
        "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y",
        "%Y%m%d", "%d-%m-%Y", "%m-%d-%Y",
        "%Y/%m/%d", "%d.%m.%Y",
    ]

    def __init__(self, column_mapping: Optional[dict[str, str]] = None):
        self.column_mapping = column_mapping or {
            "date": ["date", "data", "dt", "movimento", "data_mov", "data_movimento"],
            "amount": ["amount", "valor", "value", "ammount", "val", "vlr"],
            "description": ["description", "descricao", "descrição", "desc", "historico", "histórico", "nome", "name", "memo", "transacao", "transação"],
            "document": ["document", "documento", "doc", "numero", "número", "nro"],
            "type": ["type", "tipo", "tp", "natureza", "debito_credito", "dc"],
            "bank_identifier": ["id", "fit_id", "identificador", "codigo", "código", "transaction_id"],
            "balance": ["balance", "saldo"],
        }

    async def import_ofx(self, content: bytes, filename: str = "") -> BankStatementResult:
        raise NotImplementedError("Use OfxBankStatementProvider for OFX files")

    async def import_csv(self, content: bytes, filename: str = "") -> BankStatementResult:
        raw = content.decode("utf-8", errors="replace")
        file_hash = hashlib.sha256(content).hexdigest()

        delimiter = self._detect_delimiter(raw)
        reader = csv.DictReader(io.StringIO(raw), delimiter=delimiter)

        if reader.fieldnames is None:
            return BankStatementResult(source="csv_upload", file_hash=file_hash, lines=[])

        col_map = self._map_columns(reader.fieldnames)
        transactions: list[BankTransaction] = []
        bank_code = ""
        account_number = ""
        period_start: Optional[datetime] = None
        period_end: Optional[datetime] = None

        for row in reader:
            tx = self._parse_row(row, col_map)
            if tx is not None:
                transactions.append(tx)
                if period_start is None or tx.transaction_date < period_start:
                    period_start = tx.transaction_date
                if period_end is None or tx.transaction_date > period_end:
                    period_end = tx.transaction_date

        return BankStatementResult(
            bank_code=bank_code,
            account_number=account_number,
            period_start=period_start,
            period_end=period_end,
            lines=transactions,
            file_hash=file_hash,
            source="csv_upload",
        )

    async def import_provider_extract(
        self, api_key: str, account_id: str, period_start: datetime, period_end: datetime
    ) -> BankStatementResult:
        raise NotImplementedError("Use AsaasStatementProvider for provider extracts")

    def _detect_delimiter(self, raw: str) -> str:
        first_line = raw.split("\n")[0].strip()
        for d in self.DELIMITERS:
            if d in first_line:
                return d
        return ";"

    def _map_columns(self, fieldnames: list[str]) -> dict[str, str]:
        lower_names = {f: f.lower().strip() for f in fieldnames}
        mapping: dict[str, str] = {}
        for target, aliases in self.column_mapping.items():
            for field, lower in lower_names.items():
                if lower in aliases:
                    mapping[target] = field
                    break
        return mapping

    def _parse_row(self, row: dict, col_map: dict[str, str]) -> Optional[BankTransaction]:
        try:
            date_raw = row.get(col_map.get("date", ""), "")
            amount_raw = row.get(col_map.get("amount", ""), "0")
            desc_raw = row.get(col_map.get("description", ""), "")
            doc_raw = row.get(col_map.get("document", ""), "")
            type_raw = row.get(col_map.get("type", ""), "")
            bank_id_raw = row.get(col_map.get("bank_identifier", ""), "")
            balance_raw = row.get(col_map.get("balance", ""), "")

            if not date_raw or not amount_raw:
                return None

            dt = self._parse_date(str(date_raw).strip())
            amt = self._parse_amount(str(amount_raw).strip())
            amount_cents = abs(int(amt * 100))
            tx_type = "credit" if amt >= 0 else "debit"

            if type_raw:
                tx_type = self._map_type(type_raw)

            balance_cents = None
            if balance_raw:
                try:
                    balance_cents = int(Decimal(str(balance_raw).replace(",", ".")) * 100)
                except (ValueError, DecimalException):
                    pass

            return BankTransaction(
                transaction_date=dt,
                amount_cents=amount_cents,
                transaction_type=tx_type,
                description=str(desc_raw).strip() if desc_raw else None,
                document=str(doc_raw).strip() if doc_raw else None,
                bank_identifier=str(bank_id_raw).strip() if bank_id_raw else None,
                balance_cents=balance_cents,
                raw_data={"csv_row": dict(row)},
            )
        except (ValueError, TypeError, KeyError):
            return None

    def _parse_date(self, date_str: str) -> datetime:
        for fmt in self.DATE_FORMATS:
            try:
                return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return datetime.now(timezone.utc)

    def _parse_amount(self, amt_str: str) -> Decimal:
        amt_str = amt_str.strip()
        amt_str = amt_str.replace("R$", "").replace(" ", "").replace("$", "")
        negative = False
        if amt_str.startswith("(") and amt_str.endswith(")"):
            negative = True
            amt_str = amt_str[1:-1]
        if amt_str.startswith("-"):
            negative = True
            amt_str = amt_str[1:]

        last_dot = amt_str.rfind(".")
        last_comma = amt_str.rfind(",")

        if last_comma > last_dot:
            amt_str = amt_str.replace(".", "")
            amt_str = amt_str.replace(",", ".")
        elif last_dot > last_comma:
            amt_str = amt_str.replace(",", "")

        try:
            value = Decimal(amt_str)
            return -value if negative else value
        except Exception:
            return Decimal("0")

    def _map_type(self, type_str: str) -> str:
        lower = type_str.lower().strip()
        if lower in ("c", "credito", "crédito", "credit", "receita", "entrada", "+", "deposito", "depósito"):
            return "credit"
        if lower in ("d", "debito", "débito", "debit", "despesa", "saida", "saída", "-", "retirada"):
            return "debit"
        if lower in ("ted", "doc", "pix", "transferencia", "transferência", "transf"):
            return "transfer"
        if lower in ("pagamento", "payment", "pgto"):
            return "payment"
        if lower in ("tarifa", "fee", "taxa", "juros"):
            return "fee"
        return "other"
