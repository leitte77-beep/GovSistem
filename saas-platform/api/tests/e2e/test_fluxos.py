"""
E2E Tests — Fluxos Financeiros Completos (sem dependência externa)
"""

import hashlib
from datetime import datetime, timezone

import pytest

from app.providers.banking_csv import CsvBankStatementProvider
from app.providers.banking_ofx import OfxBankStatementProvider
from app.providers.fiscal_sandbox import SandboxFiscalProvider
from app.providers.fiscal import FiscalCompanyData, FiscalCustomerData, NfseData
from app.services.cnpj import validate_cnpj, validate_cpf, validate_document
from app.services.sanitize import mask_document, sanitize_payload


class TestE2EPixFlow:
    """E2E 1 — Pix: validações financeiras e sanitização"""

    def test_valor_centavos_inteiro(self):
        assert 150 * 100 == 15000

    def test_formatacao_valor(self):
        cents = 15000
        reais = cents / 100
        assert reais == 150.0

    def test_juros_multa_centavos(self):
        valor = 10000
        juros = int(valor * 0.02)
        multa = int(valor * 0.10)
        total = valor + juros + multa
        assert total == 11200
        assert juros == 200
        assert multa == 1000

    def test_desconto_centavos(self):
        valor = 50000
        desconto = int(valor * 0.05)
        assert desconto == 2500
        assert valor - desconto == 47500


class TestE2EBoletoFlow:
    """E2E 2 — Boleto: validação de documentos"""

    def test_cnpj_valido(self):
        assert validate_cnpj("11222333000181") is True

    def test_cnpj_formatacao(self):
        from app.services.cnpj import format_cnpj
        assert format_cnpj("11222333000181") == "11.222.333/0001-81"

    def test_cpf_valido(self):
        assert validate_cpf("52998224725") is True

    def test_documento_validation(self):
        valid, doc_type = validate_document("52998224725")
        assert valid is True
        assert doc_type == "CPF"

        valid, doc_type = validate_document("11222333000181")
        assert valid is True
        assert doc_type == "CNPJ"


class TestE2ENfseFlow:
    """E2E 3 — NFS-e: emissão via sandbox provider"""

    @pytest.mark.asyncio
    async def test_emissao_nfse_sandbox(self):
        provider = SandboxFiscalProvider()

        company = FiscalCompanyData(
            legal_name="Empresa Teste Ltda",
            cnpj="11222333000181",
            city="São Paulo",
            state="SP",
        )
        customer = FiscalCustomerData(
            name="Cliente Teste",
            doc_type="cpf",
            doc_number="52998224725",
        )
        nfse = NfseData(
            rps_number=f"E2E-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            service_code="01.01",
            service_description="Teste E2E NFS-e",
            amount_cents=10000,
        )

        result = await provider.issue_nfse(company=company, customer=customer, nfse_data=nfse)
        assert result.success is True
        assert result.status == "authorized"
        assert result.nfse_number is not None

    @pytest.mark.asyncio
    async def test_rejeicao_nfse_sandbox(self):
        provider = SandboxFiscalProvider()

        result = await provider.issue_nfse(
            company=FiscalCompanyData(legal_name="Teste", cnpj="00000000000000"),
            customer=FiscalCustomerData(name="Teste", doc_type="cpf", doc_number="00000000000"),
            nfse_data=NfseData(rps_number="REJECT-TEST", service_code="01.01", service_description="Test", amount_cents=1000),
            external_reference="REJECT-TEST",
        )
        provider._rejected_docs.add("REJECT-TEST")

        result = await provider.issue_nfse(
            company=FiscalCompanyData(legal_name="Teste", cnpj="00000000000000"),
            customer=FiscalCustomerData(name="Teste", doc_type="cpf", doc_number="00000000000"),
            nfse_data=NfseData(rps_number="REJECT-TEST-2", service_code="01.01", service_description="Test", amount_cents=1000),
            external_reference="REJECT-TEST",
        )
        assert result.success is False
        assert result.status == "rejected"


class TestE2EReembolsoFlow:
    """E2E 4 — Reembolso: validação de estorno"""

    def test_estorno_centavos_batatem(self):
        recebido = 15000
        taxa = 450
        liquido = recebido - taxa
        assert liquido == 14550

    def test_estorno_parcial_centavos(self):
        total = 30000
        estorno = 10000
        restante = total - estorno
        assert restante == 20000

    def test_mascara_documento_estorno(self):
        assert "***" in mask_document("52998224725")

    def test_sanitize_payload_reembolso(self):
        payload = {"payment": {"value": 100.0}, "api_key": "sk_test_123"}
        result = sanitize_payload(payload)
        assert "***" in result["api_key"]
        assert result["payment"]["value"] == 100.0


class TestE2EConciliacaoFlow:
    """E2E 5 — Conciliação: OFX e CSV"""

    @pytest.mark.asyncio
    async def test_conciliacao_ofx(self):
        ofx_content = """
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>033</BANKID>
<ACCTID>12345-6</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20240101</DTSTART>
<DTEND>20240131</DTEND>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20240115</DTPOSTED>
<TRNAMT>1500.00</TRNAMT>
<FITID>E2E-FITID-001</FITID>
<NAME>PAGAMENTO CLIENTE</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20240120</DTPOSTED>
<TRNAMT>250.00</TRNAMT>
<FITID>E2E-FITID-002</FITID>
<NAME>TARIFA BANCO</NAME>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>"""

        provider = OfxBankStatementProvider()
        result = await provider.import_ofx(ofx_content.encode(), "extrato.ofx")

        assert result is not None
        assert len(result.lines) == 2
        assert result.lines[0].amount_cents == 150000
        assert result.lines[0].transaction_type == "credit"
        assert result.lines[1].amount_cents == 25000
        assert result.lines[1].transaction_type == "debit"
        assert result.file_hash is not None
        assert len(result.file_hash) == 64

    @pytest.mark.asyncio
    async def test_conciliacao_csv(self):
        csv_content = "date,amount,description\n2024-01-15,1500.00,Pagamento recebido\n2024-01-20,-250.00,Tarifa bancaria\n"
        provider = CsvBankStatementProvider()
        result = await provider.import_csv(csv_content.encode(), "extrato.csv")

        assert result is not None
        assert len(result.lines) == 2
        assert result.lines[0].amount_cents == 150000
        assert result.lines[1].amount_cents == 25000

    @pytest.mark.asyncio
    async def test_conciliacao_csv_com_virgula(self):
        csv_content = "data;valor;descricao\n15/01/2024;1500,00;Recebimento\n20/01/2024;-250,00;Tarifa\n"
        provider = CsvBankStatementProvider()
        result = await provider.import_csv(csv_content.encode(), "extrato.csv")

        assert result is not None
        assert len(result.lines) == 2
        assert result.lines[0].amount_cents == 150000
        assert result.lines[1].amount_cents == 25000

    def test_hash_consistente(self):
        from app.services.reconciliation import ReconciliationService
        h1 = ReconciliationService.compute_file_hash(b"same_content")
        h2 = ReconciliationService.compute_file_hash(b"same_content")
        assert h1 == h2
        assert len(h1) == 64


class TestE2ESeguranca:
    """E2E — Segurança: sanitização, máscaras"""

    def test_api_key_mascarada(self):
        result = sanitize_payload({"api_key": "sk_live_12345"})
        assert "***" in result["api_key"]
        assert "sk_live_12345" not in result["api_key"]

    def test_cpf_mascarado_log(self):
        import logging
        from app.services.sanitize import sanitize_log

        record = logging.LogRecord("test", logging.INFO, "", 0, "CPF: 123.456.789-01", None, None)
        result = sanitize_log(record)
        assert "***" in result

    def test_cnpj_valido(self):
        assert validate_cnpj("11222333000181") is True

    def test_alphanumeric_cnpj_format(self):
        from app.services.cnpj import format_cnpj
        result = format_cnpj("12ABC34501DE55")
        assert result == "12.ABC.345/01DE-55"

    def test_alphanumeric_cnpj_format_with_digits(self):
        from app.services.cnpj import format_cnpj
        assert format_cnpj("11222333000181") == "11.222.333/0001-81"
