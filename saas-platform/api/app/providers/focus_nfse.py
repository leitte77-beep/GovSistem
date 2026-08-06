import base64
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.config import settings
from app.providers.fiscal import (
    FiscalCompanyData,
    FiscalCustomerData,
    FiscalProviderAdapter,
    NfseData,
    NfseResult,
)

logger = logging.getLogger("saas.providers.focus_nfse")


def _city_code_from_city(city: Optional[str], state: Optional[str]) -> str:
    mapping = {
        ("Brasilia", "DF"): "5300108",
        ("Sao Paulo", "SP"): "3550308",
        ("Rio de Janeiro", "RJ"): "3304557",
        ("Belo Horizonte", "MG"): "3106200",
        ("Goiania", "GO"): "5208707",
        ("Curitiba", "PR"): "4106902",
        ("Porto Alegre", "RS"): "4314902",
        ("Salvador", "BA"): "2927408",
        ("Fortaleza", "CE"): "2304400",
        ("Recife", "PE"): "2611606",
    }
    if city and state:
        return mapping.get((city, state), "5208707")
    return "5208707"


def _uf_code(state: Optional[str]) -> str:
    mapping = {
        "AC": "12", "AL": "27", "AP": "16", "AM": "13", "BA": "29",
        "CE": "23", "DF": "53", "ES": "32", "GO": "52", "MA": "21",
        "MT": "51", "MS": "50", "MG": "31", "PA": "15", "PB": "25",
        "PR": "41", "PE": "26", "PI": "22", "RN": "24", "RS": "43",
        "RJ": "33", "RO": "11", "RR": "14", "SC": "42", "SP": "35",
        "SE": "28", "TO": "17",
    }
    return mapping.get(state or "", "52")


class FocusNfseProvider(FiscalProviderAdapter):
    """Focus NFe / NFS-e provider implementation.

    API docs: https://focusnfe.com.br/documentacao/
    Sandbox: https://homologacao.focusnfe.com.br
    """

    def __init__(self, login: Optional[str] = None, token: Optional[str] = None):
        self._login = login or settings.FOCUS_NFE_LOGIN
        self._token = token or settings.FOCUS_NFE_TOKEN.get_secret_value()
        self._base_url = settings.FOCUS_BASE_URL

    @property
    def _auth(self) -> httpx.BasicAuth:
        return httpx.BasicAuth(self._login, self._token)

    async def _post(self, path: str, data: dict) -> dict:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=data, auth=self._auth)
            if resp.status_code >= 400:
                detail = resp.text
                try:
                    errs = resp.json().get("erros", [])
                    detail = "; ".join(e.get("mensagem", "") for e in errs) or resp.text
                except Exception:
                    pass
                logger.error("Focus NFe POST %s failed: %s", url, detail)
                resp.raise_for_status()
            return resp.json()

    async def _get(self, path: str) -> dict:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url, auth=self._auth)
            if resp.status_code >= 400:
                detail = resp.text
                try:
                    detail = resp.json().get("erros", [{}])[0].get("mensagem", resp.text)
                except Exception:
                    pass
                logger.error("Focus NFe GET %s failed: %s", url, detail)
                resp.raise_for_status()
            return resp.json()

    async def _delete(self, path: str) -> dict:
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.delete(url, auth=self._auth)
            if resp.status_code >= 400:
                detail = resp.text
                try:
                    detail = resp.json().get("erros", [{}])[0].get("mensagem", resp.text)
                except Exception:
                    pass
                logger.error("Focus NFe DELETE %s failed: %s", url, detail)
                resp.raise_for_status()
            return resp.json()

    async def issue_nfse(
        self,
        company: FiscalCompanyData,
        customer: FiscalCustomerData,
        nfse: NfseData,
        external_reference: str = "",
    ) -> NfseResult:
        city_code = _city_code_from_city(company.city, company.state)
        iss_aliquot_decimal = nfse.iss_aliquot / 100 if nfse.iss_aliquot >= 1 else nfse.iss_aliquot

        body = {
            "data": {
                "identificacao_rps": {
                    "numero": nfse.rps_number.split("-")[-1] if "-" in nfse.rps_number else nfse.rps_number,
                    "serie": "NFSe",
                    "tipo": "1",
                },
                "data_emissao": datetime.now(timezone.utc).isoformat(),
                "natureza_operacao": "1",
                "regime_especial_tributacao": "1",
                "optante_simples_nacional": True,
                "incentivador_cultural": False,
                "status": "1",
                "servico": {
                    "valores": {
                        "valor_servicos": nfse.amount_cents / 100,
                        "valor_deducoes": nfse.deduct_amount_cents / 100,
                        "valor_pis": 0,
                        "valor_cofins": 0,
                        "valor_inss": 0,
                        "valor_ir": 0,
                        "valor_csll": 0,
                        "iss_retido": False,
                        "valor_iss": nfse.iss_amount_cents / 100,
                        "valor_iss_retido": 0,
                        "base_calculo": nfse.amount_cents / 100,
                        "aliquota": iss_aliquot_decimal,
                        "valor_liquido_nfse": nfse.net_amount_cents / 100 if nfse.net_amount_cents else (nfse.amount_cents - nfse.iss_amount_cents) / 100,
                        "desconto_incondicionado": nfse.discount_amount_cents / 100,
                        "desconto_condicionado": 0,
                    },
                    "item_lista_servico": nfse.service_code or "01.01",
                    "codigo_tributacao_municipio": "01001000",
                    "discriminacao": nfse.service_description or "Servicos prestados",
                    "codigo_municipio": city_code,
                    "codigo_pais": "1058",
                },
                "prestador": {
                    "cnpj": company.cnpj,
                    "inscricao_municipal": company.municipal_registration or "",
                },
                "tomador": {
                    "cpf_cnpj": customer.doc_number,
                    "razao_social": customer.name,
                    "endereco": {
                        "logradouro": customer.address_line or company.address_line or "",
                        "numero": customer.address_number or "",
                        "complemento": customer.address_complement or "",
                        "bairro": customer.address_neighborhood or "",
                        "codigo_municipio": _city_code_from_city(customer.city, customer.state) or city_code,
                        "uf": customer.state or company.state or "",
                        "cep": (customer.zip_code or "").replace("-", ""),
                    },
                },
            }
        }

        try:
            resp = await self._post(f"/v2/nfse?ref={external_reference or nfse.rps_number}", body)

            if resp.get("sucesso"):
                return NfseResult(
                    success=True,
                    status="authorized",
                    nfse_number=str(resp.get("numero", "")),
                    verification_code=resp.get("codigo_verificacao"),
                    access_key=resp.get("chave_acesso"),
                    issue_date=resp.get("data_emissao"),
                    xml_content=resp.get("xml"),
                    pdf_content_base64=resp.get("pdf"),
                    protocol=resp.get("protocolo"),
                    provider_response=resp,
                )
            else:
                errors = resp.get("erros", [])
                reason = "; ".join(e.get("mensagem", str(e)) for e in errors)
                return NfseResult(
                    success=False,
                    status="rejected",
                    rejection_reason=reason or "Erro desconhecido na emissao",
                    provider_response=resp,
                )
        except Exception as exc:
            logger.exception("Focus NFe issue_nfse failed")
            return NfseResult(
                success=False,
                status="error",
                rejection_reason=str(exc),
                provider_response={"error": str(exc)},
            )

    async def get_nfse(self, nfse_number: str) -> NfseResult:
        try:
            resp = await self._get(f"/v2/nfse/{nfse_number}")
            if resp.get("sucesso"):
                return NfseResult(
                    success=True,
                    status="authorized",
                    nfse_number=str(resp.get("numero", "")),
                    verification_code=resp.get("codigo_verificacao"),
                    access_key=resp.get("chave_acesso"),
                    provider_response=resp,
                )
            return NfseResult(
                success=False,
                status="error",
                rejection_reason="NFS-e nao encontrada",
                provider_response=resp,
            )
        except Exception as exc:
            return NfseResult(
                success=False, status="error",
                rejection_reason=str(exc),
            )

    async def cancel_nfse(
        self,
        nfse_number: str,
        reason: str,
        company: FiscalCompanyData,
    ) -> NfseResult:
        body = {
            "codigo_cancelamento": "2",
            "motivo_cancelamento": reason,
        }
        try:
            resp = await self._delete(f"/v2/nfse/{nfse_number}")
            if resp.get("sucesso"):
                return NfseResult(
                    success=True,
                    status="canceled",
                    nfse_number=nfse_number,
                    protocol=resp.get("protocolo"),
                    provider_response=resp,
                )
            return NfseResult(
                success=False,
                status="error",
                rejection_reason="Falha ao cancelar NFS-e",
                provider_response=resp,
            )
        except Exception as exc:
            return NfseResult(
                success=False, status="error",
                rejection_reason=str(exc),
            )

    async def replace_nfse(
        self,
        original_nfse_number: str,
        company: FiscalCompanyData,
        customer: FiscalCustomerData,
        nfse: NfseData,
        external_reference: Optional[str] = None,
        replacement_reason: str = "Erro na emissão anterior",
    ) -> NfseResult:
        try:
            nfse_id = nfse.rps_number or external_reference or "replace"
            body = self._build_nfse_body(company, customer, nfse)
            body["nfseSubstituidora"] = original_nfse_number
            body["motivoSubstituicao"] = replacement_reason

            resp = await self._post(f"/v2/nfse/{nfse_id}", body)
            return self._parse_nfse_response(resp, nfse_id)
        except httpx.HTTPError as exc:
            return NfseResult(
                success=False, status="error",
                rejection_reason=f"Erro HTTP ao substituir NFS-e: {exc}",
            )
        except Exception as exc:
            return NfseResult(
                success=False, status="error",
                rejection_reason=f"Erro ao substituir NFS-e: {exc}",
            )

    async def download_xml(self, nfse_number: str, access_key: str) -> Optional[str]:
        try:
            resp = await self._get(f"/v2/nfse/{nfse_number}/xml")
            if isinstance(resp, dict):
                return resp.get("xml")
            return str(resp)
        except Exception:
            return None

    async def download_pdf(self, nfse_number: str, access_key: str) -> Optional[str]:
        try:
            resp = await self._get(f"/v2/nfse/{nfse_number}/pdf")
            if isinstance(resp, dict):
                return resp.get("pdf")
            return str(resp)
        except Exception:
            return None

    def parse_fiscal_error(self, provider_response: dict) -> str:
        errors = provider_response.get("erros", [])
        if errors:
            return "; ".join(e.get("mensagem", str(e)) for e in errors)
        return provider_response.get("mensagem", "Erro fiscal desconhecido")

    def map_status(self, provider_status: str) -> str:
        mapping = {
            "autorizado": "authorized",
            "autorizada": "authorized",
            "autorizado com ressalvas": "authorized",
            "cancelado": "canceled",
            "cancelada": "canceled",
            "rejeitado": "rejected",
            "rejeitada": "rejected",
            "processando": "pending",
            "erro": "error",
        }
        return mapping.get(provider_status.lower().strip(), "pending")
