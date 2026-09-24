from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class BankTransaction:
    transaction_date: datetime
    amount_cents: int
    transaction_type: str
    description: Optional[str] = None
    document: Optional[str] = None
    bank_identifier: Optional[str] = None
    balance_cents: Optional[int] = None
    fit_id: Optional[str] = None
    check_number: Optional[str] = None
    memo: Optional[str] = None
    raw_data: Optional[dict] = None


@dataclass
class BankStatementResult:
    bank_code: str
    bank_name: Optional[str] = None
    agency: Optional[str] = None
    account_number: Optional[str] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    lines: list[BankTransaction] = None
    file_hash: Optional[str] = None
    source: str = "upload"

    def __post_init__(self):
        if self.lines is None:
            self.lines = []


class BankStatementAdapter(ABC):

    @abstractmethod
    async def import_ofx(self, content: bytes, filename: str = "") -> BankStatementResult:
        ...

    @abstractmethod
    async def import_csv(self, content: bytes, filename: str = "") -> BankStatementResult:
        ...

    @abstractmethod
    async def import_provider_extract(
        self, api_key: str, account_id: str, period_start: datetime, period_end: datetime
    ) -> BankStatementResult:
        ...
