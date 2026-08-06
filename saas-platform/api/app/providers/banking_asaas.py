import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import httpx

from app.providers.banking import BankStatementAdapter, BankStatementResult, BankTransaction

logger = logging.getLogger("saas.providers.banking_asaas")


class AsaasStatementProvider(BankStatementAdapter):

    def __init__(self, api_key: str, base_url: str):
        self._api_key = api_key
        self._base_url = base_url

    @property
    def _headers(self) -> dict:
        return {
            "access_token": self._api_key,
            "Content-Type": "application/json",
            "User-Agent": "GovSistem/1.0",
        }

    async def import_ofx(self, content: bytes, filename: str = "") -> BankStatementResult:
        raise NotImplementedError("Use OfxBankStatementProvider for OFX files")

    async def import_csv(self, content: bytes, filename: str = "") -> BankStatementResult:
        raise NotImplementedError("Use CsvBankStatementProvider for CSV files")

    async def import_provider_extract(
        self, api_key: str, account_id: str, period_start: datetime, period_end: datetime
    ) -> BankStatementResult:
        transactions: list[BankTransaction] = []
        page = 0
        total_pages = 1

        while page < total_pages:
            page += 1
            params = {
                "offset": (page - 1) * 100,
                "limit": 100,
            }
            if period_start:
                params["dateCreated[ge]"] = period_start.strftime("%Y-%m-%d")
            if period_end:
                params["dateCreated[le]"] = period_end.strftime("%Y-%m-%d")

            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.get(
                        f"{self._base_url}/payments",
                        headers=self._headers,
                        params=params,
                    )
                    if resp.status_code != 200:
                        logger.error("Asaas statement fetch failed: %s", resp.text)
                        break

                    data = resp.json()
                    total_pages = data.get("totalPages", 1)
                    for payment in data.get("data", []):
                        tx = self._payment_to_transaction(payment)
                        if tx is not None:
                            transactions.append(tx)

            except httpx.HTTPError as exc:
                logger.error("HTTP error fetching Asaas statement: %s", exc)
                break

        return BankStatementResult(
            bank_code="ASAAS",
            bank_name="Asaas",
            period_start=period_start,
            period_end=period_end,
            lines=transactions,
            source="asaas_provider",
        )

    def _payment_to_transaction(self, payment: dict) -> Optional[BankTransaction]:
        try:
            value = Decimal(str(payment.get("value", 0)))
            amount_cents = int(value * 100)
            net_value = Decimal(str(payment.get("netValue", payment.get("value", 0))))
            net_cents = int(net_value * 100)

            date_str = payment.get("dateCreated") or payment.get("paymentDate") or ""
            dt = datetime.now(timezone.utc)
            if date_str:
                try:
                    dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except ValueError:
                    try:
                        dt = datetime.strptime(date_str[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass

            billing_type = payment.get("billingType", "")
            status = payment.get("status", "")
            customer_name = payment.get("customer", {}).get("name", "") if isinstance(payment.get("customer"), dict) else ""

            if status in ("RECEIVED", "CONFIRMED"):
                tx_type = "credit"
            elif status in ("REFUNDED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"):
                tx_type = "debit"
            else:
                tx_type = "other"

            description = f"Asaas {billing_type} - {customer_name} - {status}"
            external_id = payment.get("id", "")
            external_ref = payment.get("externalReference", "")

            return BankTransaction(
                transaction_date=dt,
                amount_cents=amount_cents,
                transaction_type=tx_type,
                description=description,
                bank_identifier=external_id,
                document=external_ref,
                fit_id=external_id,
                raw_data={
                    "payment": {k: v for k, v in payment.items() if k != "creditCard"},
                },
            )
        except (ValueError, TypeError, AttributeError) as exc:
            logger.warning("Failed to parse Asaas payment: %s", exc)
            return None
