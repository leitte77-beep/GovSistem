"""Criptografia de coluna, pseudonimização e rotação."""

from app.core.encryption import (
    criptografar,
    descriptografar,
    hash_documento,
    proteger_documento,
    rotacionar,
)
from app.core.security import hmac_hex


def test_criptografa_e_descriptografa():
    cifrado = criptografar("HIV positivo — conteúdo sigiloso")
    assert cifrado is not None
    assert cifrado.startswith("enc:v1:")
    assert "HIV" not in cifrado
    assert descriptografar(cifrado) == "HIV positivo — conteúdo sigiloso"


def test_rotacao_preserva_conteudo():
    cifrado = criptografar("anamnese")
    reencriptado = rotacionar(cifrado)
    assert reencriptado != cifrado
    assert descriptografar(reencriptado) == "anamnese"


def test_documento_protegido_nao_guarda_valor_em_claro():
    protegido = proteger_documento("529.982.247-25")
    assert protegido.normalizado == "52998224725"
    assert protegido.final == "4725" or protegido.final == "4725"[-4:]
    assert "52998224725" not in protegido.cifrado
    assert protegido.hash_busca == hmac_hex("52998224725")
    assert hash_documento("52998224725") == protegido.hash_busca


def test_criptografia_vazia():
    assert criptografar(None) is None
    assert descriptografar(None) is None
    assert criptografar("") == ""


def test_chave_de_objeto_nao_contem_documento():
    import uuid

    from app.core.storage import Storage

    chave = Storage.chave_opaca(uuid.uuid4(), "pdf")
    assert chave.startswith("tenant/")
    assert "52998224725" not in chave


def test_bcrypt_custo_12():
    from app.core.security import hash_password

    hash_ = hash_password("SenhaForte1!")
    assert hash_.startswith("$2b$12$")
