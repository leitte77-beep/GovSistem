import pytest
from app.services.sanitize import sanitize_value, sanitize_payload, mask_document, sanitize_log


class TestSanitizeValue:
    def test_sensitive_key_masked(self):
        assert sanitize_value("api_key", "sk_live_1234567890") == "sk_l***90"

    def test_short_value_masked(self):
        assert sanitize_value("password", "abc") == "***"

    def test_non_sensitive_preserved(self):
        assert sanitize_value("name", "João") == "João"

    def test_case_insensitive(self):
        assert sanitize_value("API_KEY", "secret123") == "secr***23"

    def test_nested_dict(self):
        payload = {"customer": {"name": "João", "api_key": "sk_test_key"}}
        result = sanitize_payload(payload)
        assert result["customer"]["name"] == "João"
        assert "***" in result["customer"]["api_key"]

    def test_list_of_dicts(self):
        payload = {"items": [{"name": "Item 1"}, {"token": "abc123"}]}
        result = sanitize_payload(payload)
        assert result["items"][0]["name"] == "Item 1"
        assert result["items"][1]["token"] == "ab***3"

    def test_empty_payload(self):
        assert sanitize_payload({}) == {}


class TestMaskDocument:
    def test_mask_cpf(self):
        assert mask_document("12345678901") == "123.***.***-01"

    def test_mask_cnpj(self):
        assert mask_document("11222333000181") == "11.***.***/****-81"

    def test_mask_formatted_cpf(self):
        assert "***" in mask_document("123.456.789-01")

    def test_empty_document(self):
        assert mask_document("") == ""
        assert mask_document(None) is None


class TestSanitizeLog:
    def test_cpf_in_message(self):
        import logging
        record = logging.LogRecord(
            name="test", level=logging.INFO,
            pathname="", lineno=0, msg="CPF do cliente: 123.456.789-01",
            args=None, exc_info=None,
        )
        result = sanitize_log(record)
        assert "***" in result
        assert "123.456.789-01" not in result

    def test_cnpj_in_message(self):
        import logging
        record = logging.LogRecord(
            name="test", level=logging.INFO,
            pathname="", lineno=0, msg="CNPJ: 11.222.333/0001-81",
            args=None, exc_info=None,
        )
        result = sanitize_log(record)
        assert "***" in result
