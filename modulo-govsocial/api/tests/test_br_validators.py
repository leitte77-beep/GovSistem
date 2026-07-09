
from app.core.br_validators import (
    format_cpf,
    mask_cpf,
    validate_cep,
    validate_cpf,
    validate_nis,
)


class TestCPF:
    def test_valid_cpf(self):
        assert validate_cpf("529.982.247-25") is True
        assert validate_cpf("52998224725") is True

    def test_invalid_dv(self):
        assert validate_cpf("529.982.247-24") is False

    def test_all_same_digits(self):
        assert validate_cpf("111.111.111-11") is False

    def test_wrong_length(self):
        assert validate_cpf("123") is False
        assert validate_cpf(None) is False

    def test_mask(self):
        assert mask_cpf("52998224725") == "***.***.***-25"
        assert mask_cpf("123") is None

    def test_format(self):
        assert format_cpf("52998224725") == "529.982.247-25"


class TestNIS:
    def test_valid_nis(self):
        # NIS válido pelo DV peso 3..2 mod 11
        assert validate_nis("12073216945") is True

    def test_invalid_nis(self):
        assert validate_nis("12073216949") is False

    def test_all_same(self):
        assert validate_nis("00000000000") is False

    def test_wrong_length(self):
        assert validate_nis("123") is False


class TestCEP:
    def test_valid(self):
        assert validate_cep("87600-000") is True
        assert validate_cep("87600000") is True

    def test_invalid(self):
        assert validate_cep("123") is False
        assert validate_cep(None) is False
