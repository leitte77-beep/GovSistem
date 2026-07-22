import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Optional

import httpx

from app.core.config import settings
from app.providers.payment import (
    PaymentProviderAdapter,
    ProviderCharge,
    ProviderCustomer,
    ProviderWebhookEvent,
)

logger = logging.getLogger("saas.providers.asaas")


ASAAS_STATUS_MAP = {
    "PENDING": "pending",
    "RECEIVED": "received",
    "CONFIRMED": "confirmed",
    "OVERDUE": "overdue",
    "REFUNDED": "refunded",
    "REFUND_REQUESTED": "refund_requested",
    "REFUND_IN_PROGRESS": "refund_in_progress",
    "CHARGEBACK_REQUESTED": "chargeback_requested",
    "CHARGEBACK_DISPUTE": "chargeback_dispute",
    "AWAITING_CHARGEBACK_REVERSAL": "awaiting_chargeback_reversal",
    "DUNNING_REQUESTED": "dunning_requested",
    "DUNNING_RECEIVED": "dunning_received",
    "AWAITING_RISK_ANALYSIS": "awaiting_risk_analysis",
}

ASAAS_EVENT_MAP = {
    "PAYMENT_CREATED": "payment.created",
    "PAYMENT_AWAITING_RISK_ANALYSIS": "payment.awaiting_risk_analysis",
    "PAYMENT_APPROVED_BY_RISK_ANALYSIS": "payment.approved_by_risk_analysis",
    "PAYMENT_REPROVED_BY_RISK_ANALYSIS": "payment.reproved_by_risk_analysis",
    "PAYMENT_PENDING": "payment.pending",
    "PAYMENT_RECEIVED": "payment.received",
    "PAYMENT_CONFIRMED": "payment.confirmed",
    "PAYMENT_OVERDUE": "payment.overdue",
    "PAYMENT_DELETED": "payment.deleted",
    "PAYMENT_RESTORED": "payment.restored",
    "PAYMENT_REFUNDED": "payment.refunded",
    "PAYMENT_PARTIALLY_REFUNDED": "payment.partially_refunded",
    "PAYMENT_CHARGEBACK_REQUESTED": "payment.chargeback_requested",
    "PAYMENT_CHARGEBACK_DISPUTE": "payment.chargeback_dispute",
    "PAYMENT_AWAITING_CHARGEBACK_REVERSAL": "payment.awaiting_chargeback_reversal",
    "PAYMENT_DUNNING_REQUESTED": "payment.dunning_requested",
    "PAYMENT_DUNNING_RECEIVED": "payment.dunning_received",
    "PAYMENT_BANK_SLIP_VIEWED": "payment.bank_slip_viewed",
    "PAYMENT_CHECKOUT_VIEWED": "payment.checkout_viewed",
    "CUSTOMER_CREATED": "customer.created",
    "SUBSCRIPTION_CREATED": "subscription.created",
    "SUBSCRIPTION_UPDATED": "subscription.updated",
    "SUBSCRIPTION_DELETED": "subscription.deleted",
}


class AsaasPaymentProvider(PaymentProviderAdapter):

    def __init__(self, api_key: Optional[str] = None):
        self._api_key = api_key or settings.ASAAS_API_KEY.get_secret_value()
        self._webhook_token = settings.ASAAS_WEBHOOK_TOKEN.get_secret_value()
        self._base_url = settings.ASAAS_BASE_URL

    @property
    def _headers(self) -> dict:
        return {
            "access_token": self._api_key,
            "Content-Type": "application/json",
            "User-Agent": "GovSistem/1.0",
        }

    async def _post(self, path: str, data: dict) -> dict:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=data, headers=self._headers)
            if resp.status_code >= 400:
                detail = resp.text
                try:
                    detail = resp.json().get("errors", [{}])[0].get("description", resp.text)
                except Exception:
                    pass
                logger.error("Asaas POST %s failed: %s", url, detail)
                resp.raise_for_status()
            return resp.json()

    async def _get(self, path: str) -> dict:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers)
            if resp.status_code >= 400:
                detail = resp.text
                try:
                    detail = resp.json().get("errors", [{}])[0].get("description", resp.text)
                except Exception:
                    pass
                logger.error("Asaas GET %s failed: %s", url, detail)
                resp.raise_for_status()
            return resp.json()

    async def _delete(self, path: str) -> dict:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.delete(url, headers=self._headers)
            if resp.status_code >= 400:
                detail = resp.text
                try:
                    detail = resp.json().get("errors", [{}])[0].get("description", resp.text)
                except Exception:
                    pass
                logger.error("Asaas DELETE %s failed: %s", url, detail)
                resp.raise_for_status()
            return resp.json()

    async def _post_form(self, path: str, data: dict) -> dict:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=data, headers=self._headers)
            return resp.json()

    async def create_customer(self, customer: ProviderCustomer) -> ProviderCustomer:
        body = {
            "name": customer.name,
            "email": customer.email,
            "cpfCnpj": customer.document,
            "phone": customer.phone or "",
            "notificationDisabled": False,
        }
        if customer.address_line:
            body["address"] = customer.address_line
        if customer.address_city:
            body["city"] = customer.address_city
        if customer.address_state:
            body["state"] = customer.address_state
        if customer.address_zip:
            body["zipCode"] = customer.address_zip
        if customer.complement:
            body["complement"] = customer.complement
        resp = await self._post("/customers", body)
        customer.external_id = resp.get("id", "")
        return customer

    async def update_customer(self, customer: ProviderCustomer) -> ProviderCustomer:
        body = {
            "name": customer.name,
            "email": customer.email,
            "cpfCnpj": customer.document,
            "phone": customer.phone or "",
            "notificationDisabled": False,
        }
        if customer.address_line:
            body["address"] = customer.address_line
        if customer.address_city:
            body["city"] = customer.address_city
        if customer.address_state:
            body["state"] = customer.address_state
        if customer.address_zip:
            body["zipCode"] = customer.address_zip
        resp = await self._post(f"/customers/{customer.external_id}", body)
        return customer

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
        body = {
            "customer": customer_external_id,
            "billingType": billing_type,
            "value": amount_cents / 100,
            "dueDate": due_date,
            "description": description,
            "externalReference": external_reference,
            "daysBeforeDue": days_before_due,
        }
        if fine_cents > 0:
            body["fine"] = {"value": fine_cents / 100}
        if interest_cents > 0:
            body["interest"] = {"value": interest_cents / 100}
        if discount_cents > 0:
            body["discount"] = {"value": discount_cents / 100, "dueDateLimitDays": 0}
        resp = await self._post("/payments", body)
        return self._parse_charge_response(resp)

    async def get_charge(self, charge_external_id: str) -> ProviderCharge:
        resp = await self._get(f"/payments/{charge_external_id}")
        return self._parse_charge_response(resp)

    async def cancel_charge(self, charge_external_id: str) -> ProviderCharge:
        resp = await self._delete(f"/payments/{charge_external_id}")
        return self._parse_charge_response(resp)

    async def refund_charge(self, charge_external_id: str, amount_cents: Optional[int] = None) -> ProviderCharge:
        body = {}
        if amount_cents is not None:
            body["value"] = amount_cents / 100
        resp = await self._post(f"/payments/{charge_external_id}/refund", body)
        return self._parse_charge_response(resp)

    async def get_pix_qr_code(self, charge_external_id: str) -> dict:
        resp = await self._get(f"/payments/{charge_external_id}/pixQrCode")
        return resp

    async def get_boleto_pdf_url(self, charge_external_id: str) -> str:
        return f"{self._base_url}/payments/{charge_external_id}/bankSlip"

    async def get_boleto_identification_field(self, charge_external_id: str) -> str:
        resp = await self._get(f"/payments/{charge_external_id}/identificationField")
        return resp.get("identificationField", "")

    def parse_webhook(self, payload: dict, headers: dict) -> Optional[ProviderWebhookEvent]:
        event = payload.get("event", "")
        if not event:
            return None
        payment = payload.get("payment", {})
        return ProviderWebhookEvent(
            event_type=ASAAS_EVENT_MAP.get(event, event),
            external_id=payment.get("id", ""),
            external_object_id=payment.get("id", ""),
            payload=payload,
            signature_valid=True,
        )

    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        if not self._webhook_token:
            logger.warning("Asaas webhook token not configured, skipping verification")
            return True
        expected = hmac.new(
            self._webhook_token.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    async def list_transactions(
        self,
        page: int = 1,
        limit: int = 100,
        status_filter: Optional[str] = None,
        billing_type: Optional[str] = None,
        date_start: Optional[str] = None,
        date_end: Optional[str] = None,
    ) -> list[ProviderCharge]:
        params: dict = {"offset": (page - 1) * limit, "limit": min(limit, 100)}
        if status_filter:
            params["status"] = status_filter
        if billing_type:
            params["billingType"] = billing_type
        if date_start:
            params["dateCreated[ge]"] = date_start
        if date_end:
            params["dateCreated[le]"] = date_end

        resp = await self._get("/payments?" + "&".join(f"{k}={v}" for k, v in params.items()))
        data = resp.get("data", [])
        return [self._parse_charge_response(item) for item in data]

    async def get_balance(self) -> dict:
        resp = await self._get("/finance/balance")
        return {
            "balance_cents": int(Decimal(str(resp.get("balance", 0))) * 100),
            "unsettled_cents": int(Decimal(str(resp.get("unsettledBalance", 0))) * 100),
            "available_cents": int(Decimal(str(resp.get("availableBalance", 0))) * 100),
        }

    def map_status(self, external_status: str) -> str:
        return ASAAS_STATUS_MAP.get(external_status, "pending")

    def _parse_charge_response(self, resp: dict) -> ProviderCharge:
        amount_cents = int(Decimal(str(resp.get("value", 0))) * 100)
        paid_amount = resp.get("paidValue") or resp.get("value", 0)
        paid_amount_cents = int(Decimal(str(paid_amount)) * 100)
        fee = resp.get("fee", 0)
        fee_cents = int(Decimal(str(fee)) * 100)
        net = resp.get("netValue", resp.get("value", 0))
        net_cents = int(Decimal(str(net)) * 100)

        return ProviderCharge(
            external_id=resp.get("id", ""),
            status=ASAAS_STATUS_MAP.get(resp.get("status", ""), resp.get("status", "")),
            billing_type=resp.get("billingType", ""),
            amount_cents=amount_cents,
            due_date=resp.get("dueDate", ""),
            invoice_url=resp.get("invoiceUrl"),
            bank_slip_url=resp.get("bankSlipUrl"),
            boleto_barcode=resp.get("barCode"),
            boleto_identification_field=resp.get("identificationField"),
            boleto_nosso_numero=resp.get("nossoNumero"),
            pix_txid=resp.get("pixTxid"),
            pix_qr_code_base64=None,
            pix_copy_paste=None,
            pix_expiration_date=None,
            external_payment_id=resp.get("id"),
            paid_amount_cents=paid_amount_cents,
            fee_amount_cents=fee_cents,
            net_amount_cents=net_cents,
            payment_date=resp.get("paymentDate"),
        )
