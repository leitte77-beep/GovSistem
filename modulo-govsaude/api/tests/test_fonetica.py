"""BuscaBR: variações reais de nome (B.12-005)."""

from app.core.fonetica import nome_fonetico, normalizar_busca


def test_normalizacao_remove_acento_e_caixa():
    assert normalizar_busca("  José  D'Ávila ") == "jose d avila"


def test_luiz_luis():
    assert nome_fonetico("Luiz") == nome_fonetico("Luis")


def test_thais_tais():
    assert nome_fonetico("Thais") == nome_fonetico("Taís")


def test_sousa_souza():
    assert nome_fonetico("Sousa") == nome_fonetico("Souza")


def test_ellen_helen():
    assert nome_fonetico("Ellen") == nome_fonetico("Helen")


def test_nomes_compostos_preservam_tokens():
    assert nome_fonetico("Maria Luiza") == nome_fonetico("Maria Luísa")


def test_nome_vazio():
    assert nome_fonetico(None) == ""
    assert nome_fonetico("   ") == ""
