import pytest
from app.services.cnpj import validate_cnpj, validate_cpf, validate_document, format_cnpj, format_cpf


class TestValidateCNPJ:
    def test_valid_cnpj(self):
        assert validate_cnpj("11222333000181") is True

    def test_invalid_cnpj(self):
        assert validate_cnpj("11222333000182") is False

    def test_all_same_digits(self):
        assert validate_cnpj("11111111111111") is False

    def test_short_cnpj(self):
        assert validate_cnpj("123456") is False

    def test_formatted_cnpj(self):
        assert validate_cnpj("11.222.333/0001-81") is True

    def test_empty_string(self):
        assert validate_cnpj("") is False


class TestValidateCPF:
    def test_valid_cpf(self):
        assert validate_cpf("52998224725") is True

    def test_invalid_cpf(self):
        assert validate_cpf("52998224726") is False

    def test_all_same_digits(self):
        assert validate_cpf("11111111111") is False

    def test_formatted_cpf(self):
        assert validate_cpf("529.982.247-25") is True


class TestValidateDocument:
    def test_cpf(self):
        valid, doc_type = validate_document("52998224725")
        assert valid is True
        assert doc_type == "CPF"

    def test_cnpj(self):
        valid, doc_type = validate_document("11222333000181")
        assert valid is True
        assert doc_type == "CNPJ"


class TestFormat:
    def test_format_cnpj(self):
        assert format_cnpj("11222333000181") == "11.222.333/0001-81"

    def test_format_cpf(self):
        assert format_cpf("52998224725") == "529.982.247-25"

    def test_format_partial(self):
        assert format_cnpj("123") == "123"
