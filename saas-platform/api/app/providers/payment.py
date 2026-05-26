from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional


@dataclass
class ProviderCustomer:
    external_id: str
    name: str
    email: str
    document: str
    document_type: str
    phone: Optional[str] = None
    address_line: Optional[str] = None
    address_neighborhood: Optional[str] = None
    address_city: Optional[str] = None
    address_state: Optional[str] = None
    address_zip: Optional[str] = None
    complement: Optional[str] = None


@dataclass
class ProviderCharge:
    external_id: str
    status: str
    billing_type: str
    amount_cents: int
    due_date: str
    invoice_url: Optional[str] = None
    bank_slip_url: Optional[str] = None
    boleto_barcode: Optional[str] = None
    boleto_identification_field: Optional[str] = None
    boleto_nosso_numero: Optional[str] = None
    pix_txid: Optional[str] = None
    pix_qr_code_base64: Optional[str] = None
    pix_copy_paste: Optional[str] = None
    pix_expiration_date: Optional[str] = None
    external_payment_id: Optional[str] = None
    paid_amount_cents: Optional[int] = None
    fee_amount_cents: Optional[int] = None
    net_amount_cents: Optional[int] = None
    payment_date: Optional[str] = None


@dataclass
class ProviderWebhookEvent:
    event_type: str
    external_id: str
    external_object_id: str
    payload: dict
    signature_valid: bool


class PaymentProviderAdapter(ABC):

    @abstractmethod
    async def create_customer(self, customer: ProviderCustomer) -> ProviderCustomer:
        ...

    @abstractmethod
    async def update_customer(self, customer: ProviderCustomer) -> ProviderCustomer:
        ...

    @abstractmethod
    async def create_charge(
        self,
        customer_external_id: str,
        billing_type: str,
        amount_cents: int,
        due_date: str,
        description: str,
        external_reference: str,
        days_before_due: int = 1,
        fine_cents: int = 0,
        interest_cents: int = 0,
        discount_cents: int = 0,
    ) -> ProviderCharge:
        ...

    @abstractmethod
    async def get_charge(self, charge_external_id: str) -> ProviderCharge:
        ...

    @abstractmethod
    async def cancel_charge(self, charge_external_id: str) -> ProviderCharge:
        ...

    @abstractmethod
    async def refund_charge(self, charge_external_id: str, amount_cents: Optional[int] = None) -> ProviderCharge:
        ...

    @abstractmethod
    async def get_pix_qr_code(self, charge_external_id: str) -> dict:
        ...

    @abstractmethod
    async def get_boleto_pdf_url(self, charge_external_id: str) -> str:
        ...

    @abstractmethod
    async def get_boleto_identification_field(self, charge_external_id: str) -> str:
        ...

    @abstractmethod
    def parse_webhook(self, payload: dict, headers: dict) -> Optional[ProviderWebhookEvent]:
        ...

    @abstractmethod
    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        ...

    @abstractmethod
    async def list_transactions(
        self,
        page: int = 1,
        limit: int = 100,
        status_filter: Optional[str] = None,
        billing_type: Optional[str] = None,
        date_start: Optional[str] = None,
        date_end: Optional[str] = None,
    ) -> list[ProviderCharge]:
        ...

    @abstractmethod
    async def get_balance(self) -> dict:
        ...

    @abstractmethod
    def map_status(self, external_status: str) -> str:
        ...
