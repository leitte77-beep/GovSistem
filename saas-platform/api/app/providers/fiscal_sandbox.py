import base64
import logging
import random
import string
from datetime import datetime, timezone
from typing import Optional

from app.providers.fiscal import (
    FiscalCompanyData,
    FiscalCustomerData,
    FiscalProviderAdapter,
    NfseData,
    NfseResult,
)

logger = logging.getLogger("saas.providers.fiscal_sandbox")


def _generate_nfse_number() -> str:
    year = datetime.now().year
    seq = random.randint(1, 99999)
    return f"{year}{seq:05d}"


def _generate_verification_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=8))


def _generate_access_key(nfse_number: str) -> str:
    return f"352006{nfse_number}{random.randint(10000000000, 99999999999)}"


def _build_mock_xml(
    nfse_number: str,
    verification_code: str,
    access_key: str,
    data: NfseData,
    company: FiscalCompanyData,
    customer: FiscalCustomerData,
) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<ns1:ComprovanteCancelamentoNfse xmlns:ns1="http://www.abrasf.org.br/nfse.xsd">
  <ns1:Nfse>
    <ns1:InfNfse Id="nfse{access_key}">
      <ns1:Numero>{nfse_number}</ns1:Numero>
      <ns1:CodigoVerificacao>{verification_code}</ns1:CodigoVerificacao>
      <ns1:DataEmissao>{datetime.now().isoformat()}</ns1:DataEmissao>
      <ns1:PrestadorServico>
        <ns1:IdentificacaoPrestador>
          <ns1:Cnpj>{company.cnpj}</ns1:Cnpj>
          <ns1:InscricaoMunicipal>{company.municipal_registration or ''}</ns1:InscricaoMunicipal>
        </ns1:IdentificacaoPrestador>
        <ns1:RazaoSocial>{company.legal_name}</ns1:RazaoSocial>
        <ns1:NomeFantasia>{company.trade_name or company.legal_name}</ns1:NomeFantasia>
      </ns1:PrestadorServico>
      <ns1:TomadorServico>
        <ns1:IdentificacaoTomador>
          <ns1:CpfCnpj>
            <ns1:Cnpj>{customer.doc_number if customer.doc_type == 'cnpj' else ''}</ns1:Cnpj>
            <ns1:Cpf>{customer.doc_number if customer.doc_type == 'cpf' else ''}</ns1:Cpf>
          </ns1:CpfCnpj>
        </ns1:IdentificacaoTomador>
        <ns1:RazaoSocial>{customer.name}</ns1:RazaoSocial>
        <ns1:Endereco>
          <ns1:Endereco>{customer.address_line or 'Nao informado'}</ns1:Endereco>
          <ns1:Bairro>{customer.address_neighborhood or 'Nao informado'}</ns1:Bairro>
          <ns1:Cidade>{customer.city or company.city or ''}</ns1:Cidade>
          <ns1:Estado>{customer.state or company.state or ''}</ns1:Estado>
          <ns1:Cep>{customer.zip_code or ''}</ns1:Cep>
        </ns1:Endereco>
      </ns1:TomadorServico>
      <ns1:Servico>
        <ns1:Discriminacao>{data.service_description}</ns1:Discriminacao>
        <ns1:CodigoTributacaoMunicipio>{data.service_code}</ns1:CodigoTributacaoMunicipio>
        <ns1:Valores>
          <ns1:ValorServicos>{data.amount_cents / 100:.2f}</ns1:ValorServicos>
          <ns1:ValorDeducoes>{data.deduct_amount_cents / 100:.2f}</ns1:ValorDeducoes>
          <ns1:ValorPis>0.00</ns1:ValorPis>
          <ns1:ValorCofins>0.00</ns1:ValorCofins>
          <ns1:ValorInss>0.00</ns1:ValorInss>
          <ns1:ValorIr>0.00</ns1:ValorIr>
          <ns1:ValorCsll>0.00</ns1:ValorCsll>
          <ns1:IssRetido>{'2' if data.iss_aliquot > 0 else '1'}</ns1:IssRetido>
          <ns1:ValorIss>{data.iss_amount_cents / 100:.2f}</ns1:ValorIss>
          <ns1:ValorIssRetido>0.00</ns1:ValorIssRetido>
          <ns1:BaseCalculo>{data.amount_cents / 100:.2f}</ns1:BaseCalculo>
          <ns1:Aliquota>{data.iss_aliquot:.2f}</ns1:Aliquota>
          <ns1:ValorLiquidoNfse>{(data.amount_cents - data.iss_amount_cents) / 100:.2f}</ns1:ValorLiquidoNfse>
          <ns1:ValorCbs>{data.cbs_amount_cents / 100:.2f}</ns1:ValorCbs>
          <ns1:ValorIbs>{data.ibs_amount_cents / 100:.2f}</ns1:ValorIbs>
        </ns1:Valores>
      </ns1:Servico>
    </ns1:InfNfse>
  </ns1:Nfse>
</ns1:ComprovanteCancelamentoNfse>"""


class SandboxFiscalProvider(FiscalProviderAdapter):
    """Sandbox NFS-e provider that simulates the real NFSe flow.
    Returns mock XML/PDF, simulates authorization, rejection, and cancellation.
    """

    _rejected_docs: set = set()

    async def issue_nfse(
        self,
        company: FiscalCompanyData,
        customer: FiscalCustomerData,
        nfse_data: NfseData,
        external_reference: str = "",
    ) -> NfseResult:
        nfse_number = _generate_nfse_number()
        verification_code = _generate_verification_code()
        access_key = _generate_access_key(nfse_number)

        if external_reference in self._rejected_docs:
            return NfseResult(
                success=False,
                status="rejected",
                rejection_reason="Simulacao: rejeicao por dados fiscais inconsistentes",
                provider_response={"error": "rejection_simulated"},
            )

        xml = _build_mock_xml(
            nfse_number=nfse_number,
            verification_code=verification_code,
            access_key=access_key,
            data=nfse_data,
            company=company,
            customer=customer,
        )
        pdf_b64 = base64.b64encode(
            f"SIMULATED DANFSE FOR {nfse_number}".encode()
        ).decode()

        return NfseResult(
            success=True,
            status="authorized",
            nfse_number=nfse_number,
            verification_code=verification_code,
            access_key=access_key,
            issue_date=datetime.now(timezone.utc).isoformat(),
            xml_content=xml,
            pdf_content_base64=pdf_b64,
            protocol=f"PROTOCOLO-{nfse_number}",
            provider_response={"nfseNumber": nfse_number, "status": "authorized"},
        )

    async def get_nfse(self, nfse_number: str) -> NfseResult:
        return NfseResult(
            success=True,
            status="authorized",
            nfse_number=nfse_number,
            verification_code="CONSULTADO",
            provider_response={"status": "authorized", "query": "success"},
        )

    async def cancel_nfse(
        self,
        nfse_number: str,
        reason: str,
        company: FiscalCompanyData,
    ) -> NfseResult:
        return NfseResult(
            success=True,
            status="canceled",
            nfse_number=nfse_number,
            protocol=f"CANCEL-{nfse_number}",
            provider_response={"status": "canceled", "reason": reason},
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
        return NfseResult(
            success=True,
            status="authorized",
            nfse_number=f"REPLACE-{original_nfse_number}",
            verification_code="SANDBOX-REPLACE",
            protocol="SANDBOX-PROTOCOL",
            issue_date=datetime.now(timezone.utc).isoformat(),
            xml_content=f"<sandbox><replace>{original_nfse_number}</replace></sandbox>",
            provider_response={"status": "authorized", "sandbox": True},
        )

    async def download_xml(self, nfse_number: str, access_key: str) -> Optional[str]:
        return f"""<?xml version="1.0" encoding="UTF-8"?>
<NfseConsulta>
  <numero>{nfse_number}</numero>
  <chaveAcesso>{access_key}</chaveAcesso>
  <status>Autorizado</status>
</NfseConsulta>"""

    async def download_pdf(self, nfse_number: str, access_key: str) -> Optional[str]:
        return base64.b64encode(f"DANFSE_SIMULATED_{nfse_number}".encode()).decode()

    def parse_fiscal_error(self, provider_response: dict) -> str:
        return provider_response.get("error", "Erro fiscal desconhecido")

    def map_status(self, provider_status: str) -> str:
        mapping = {
            "authorized": "authorized",
            "cancelled": "canceled",
            "canceled": "canceled",
            "rejected": "rejected",
            "processing": "pending",
            "pending": "pending",
            "error": "error",
        }
        return mapping.get(provider_status.lower(), "pending")
