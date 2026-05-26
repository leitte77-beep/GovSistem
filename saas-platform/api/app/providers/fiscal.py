from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class FiscalCompanyData:
    legal_name: str
    trade_name: Optional[str] = None
    cnpj: str = ""
    state_registration: Optional[str] = None
    municipal_registration: Optional[str] = None
    cnae: Optional[str] = None
    tax_regime: Optional[str] = None
    address_line: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_neighborhood: Optional[str] = None
    city: Optional[str] = None
    city_code: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


@dataclass
class FiscalCustomerData:
    name: str
    doc_type: str = "cpf"
    doc_number: str = ""
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line: Optional[str] = None
    address_number: Optional[str] = None
    address_complement: Optional[str] = None
    address_neighborhood: Optional[str] = None
    city: Optional[str] = None
    city_code: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None


@dataclass
class NfseData:
    rps_number: str
    service_code: str
    service_description: str
    amount_cents: int
    iss_aliquot: float = 0.0
    iss_amount_cents: int = 0
    ibs_amount_cents: int = 0
    cbs_amount_cents: int = 0
    deduct_amount_cents: int = 0
    discount_amount_cents: int = 0
    net_amount_cents: int = 0
    competence_date: Optional[str] = None
    city_code: Optional[str] = None
    cnae: Optional[str] = None
    tax_regime: Optional[str] = None


@dataclass
class NfseResult:
    success: bool
    status: str
    nfse_number: Optional[str] = None
    verification_code: Optional[str] = None
    access_key: Optional[str] = None
    issue_date: Optional[str] = None
    xml_content: Optional[str] = None
    pdf_content_base64: Optional[str] = None
    protocol: Optional[str] = None
    rejection_reason: Optional[str] = None
    provider_response: Optional[dict] = None


class FiscalProviderAdapter(ABC):

    @abstractmethod
    async def issue_nfse(
        self,
        company: FiscalCompanyData,
        customer: FiscalCustomerData,
        nfse: NfseData,
        external_reference: str = "",
    ) -> NfseResult:
        ...

    @abstractmethod
    async def get_nfse(self, nfse_number: str) -> NfseResult:
        ...

    @abstractmethod
    async def cancel_nfse(
        self,
        nfse_number: str,
        reason: str,
        company: FiscalCompanyData,
    ) -> NfseResult:
        ...

    @abstractmethod
    async def replace_nfse(
        self,
        original_nfse_number: str,
        company: FiscalCompanyData,
        customer: FiscalCustomerData,
        nfse: NfseData,
        external_reference: Optional[str] = None,
        replacement_reason: str = "Erro na emissão anterior",
    ) -> NfseResult:
        ...

    @abstractmethod
    async def download_xml(self, nfse_number: str, access_key: str) -> Optional[str]:
        ...

    @abstractmethod
    async def download_pdf(self, nfse_number: str, access_key: str) -> Optional[str]:
        ...

    @abstractmethod
    def parse_fiscal_error(self, provider_response: dict) -> str:
        ...

    @abstractmethod
    def map_status(self, provider_status: str) -> str:
        ...
