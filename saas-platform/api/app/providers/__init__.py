from typing import Optional

from app.core.config import settings
from app.providers.asaas import AsaasPaymentProvider
from app.providers.banking import BankStatementAdapter
from app.providers.banking_asaas import AsaasStatementProvider
from app.providers.banking_csv import CsvBankStatementProvider
from app.providers.banking_ofx import OfxBankStatementProvider
from app.providers.fiscal import FiscalProviderAdapter
from app.providers.fiscal_sandbox import SandboxFiscalProvider
from app.providers.focus_nfse import FocusNfseProvider
from app.providers.payment import PaymentProviderAdapter


def get_payment_provider(provider_name: str = "asaas") -> PaymentProviderAdapter:
    if provider_name == "asaas":
        return AsaasPaymentProvider()
    raise ValueError(f"Unknown payment provider: {provider_name}")


def get_fiscal_provider(provider_name: Optional[str] = None) -> FiscalProviderAdapter:
    name = provider_name or settings.FISCAL_PROVIDER
    if name in ("sandbox", "test", "development"):
        return SandboxFiscalProvider()
    if name == "focus_nfe":
        return FocusNfseProvider()
    raise ValueError(f"Unknown fiscal provider: {name}")


def get_bank_statement_provider(provider_type: str = "ofx") -> BankStatementAdapter:
    if provider_type == "ofx":
        return OfxBankStatementProvider()
    if provider_type == "csv":
        return CsvBankStatementProvider()
    if provider_type == "asaas":
        api_key = settings.ASAAS_API_KEY.get_secret_value()
        return AsaasStatementProvider(api_key=api_key, base_url=settings.ASAAS_BASE_URL)
    raise ValueError(f"Unknown bank statement provider: {provider_type}")
