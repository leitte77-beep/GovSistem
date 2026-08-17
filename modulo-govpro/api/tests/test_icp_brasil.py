"""Testes do adaptador ICP-Brasil (assinatura qualificada PAdES/CAdES + carimbo)."""

import base64
import datetime
from datetime import timezone

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from sqlalchemy import select

from app.adapters.icp_brasil import (
    ICPBrasilCriptografiaAdapter,
    _build_timestamp_request,
    _status_do_timestamp_response,
    serializar_resultado,
)
from app.models.dominio import TipoDocumento
from app.models.enums import NivelAssinatura
from app.services import assinatura
from app.services import documento as documento_service


def _gerar_pfx_base64(senha: str = "senha-teste-123") -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Servidor Teste ICP")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(timezone.utc) - datetime.timedelta(days=1))
        .not_valid_after(datetime.datetime.now(timezone.utc) + datetime.timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=False)
        .sign(key, hashes.SHA256())
    )
    pfx = pkcs12.serialize_key_and_certificates(
        b"teste",
        key,
        cert,
        None,
        serialization.BestAvailableEncryption(senha.encode("utf-8")),
    )
    return base64.b64encode(pfx).decode("ascii")


def test_assinar_cades_gera_artefato():
    adapter = ICPBrasilCriptografiaAdapter()
    resultado = adapter.assinar(
        b"conteudo do documento",
        certificado_pfx_base64=_gerar_pfx_base64(),
        certificado_senha="senha-teste-123",
        formato="CADES",
    )
    assert resultado.formato == "CADES"
    assert resultado.certificado_serial
    assert resultado.algoritmo == "CADES-SHA256"
    assert resultado.assinatura_b64
    # Sem TSA configurada → assina degradado, sem carimbo.
    assert resultado.carimbo_aplicado is False
    assert resultado.validacao_resultado == "OK_SEM_CARIMBO"


def test_assinar_pades_e_serializar_envelope():
    adapter = ICPBrasilCriptografiaAdapter()
    resultado = adapter.assinar(
        b"%PDF-1.4 conteudo",
        certificado_pfx_base64=_gerar_pfx_base64(),
        certificado_senha="senha-teste-123",
        formato="PADES",
    )
    assert resultado.formato == "PADES"
    envelope = serializar_resultado(resultado)
    assert isinstance(envelope, str)
    decodificado = base64.b64decode(envelope).decode("utf-8")
    assert "PADES" in decodificado


def test_formato_invalido_rejeita():
    adapter = ICPBrasilCriptografiaAdapter()
    with pytest.raises(ValueError):
        adapter.assinar(
            b"x",
            certificado_pfx_base64=_gerar_pfx_base64(),
            certificado_senha="senha-teste-123",
            formato="XADES",
        )


def test_timestamp_request_der():
    req = _build_timestamp_request(bytes.fromhex("aa" * 32))
    assert req[0] == 0x30  # SEQUENCE
    assert len(req) > 32


def test_status_timestamp_response():
    # TimeStampResp { PKIStatusInfo { INTEGER 0 } } → granted
    granted = bytes.fromhex("30053003020100")
    assert _status_do_timestamp_response(granted) == 0
    # status 1 (grantedWithMods) → não-granted
    recusado = bytes.fromhex("30053003020101")
    assert _status_do_timestamp_response(recusado) == 1
    # inválido
    assert _status_do_timestamp_response(b"") is None


async def test_provider_qualificado_fluxo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    user = cenario["user"]

    tipo_processo = (
        await db.execute(
            select(TipoDocumento).where(
                TipoDocumento.tenant_id == tenant_id, TipoDocumento.codigo == "PORTARIA"
            )
        )
    ).scalar_one()
    from app.models.dominio import TipoProcesso

    req_geral = (
        await db.execute(
            select(TipoProcesso).where(
                TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == "REQ_GERAL"
            )
        )
    ).scalar_one()

    # Portaria exige assinatura QUALIFICADA (nivel_assinatura_minimo).
    from app.services import autuacao

    processo = await autuacao.autuar(
        db,
        tenant_id,
        user,
        tipo_processo_id=req_geral.id,
        especificacao="Portaria de teste",
        interessados=[],
        nivel_acesso="PUBLICO",
    )
    doc = await documento_service.criar_documento_interno(
        db,
        tenant_id,
        user,
        processo_id=processo.id,
        titulo="Portaria nº 1/2026",
        conteudo_html="<p>Conteúdo da portaria.</p>",
        tipo_documento_id=tipo_processo.id,
        nivel_acesso="PUBLICO",
        unidade_id=cenario["unidade"].id,
    )

    assinada = await assinatura.assinar_documento(
        db,
        tenant_id,
        user,
        documento_id=doc.id,
        papel_cargo="Prefeito",
        nivel=NivelAssinatura.QUALIFICADA.value,
        formato="CADES",
        certificado_pfx_base64=_gerar_pfx_base64(),
        certificado_senha="senha-teste-123",
    )
    assert assinada.nivel == NivelAssinatura.QUALIFICADA.value
    assert assinada.certificado_serial
    assert assinada.algoritmo == "CADES-SHA256"
    assert assinada.assinatura_b64
    assert assinada.validacao_resultado == "OK_SEM_CARIMBO"


async def test_qualificada_exige_certificado(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    user = cenario["user"]

    result = await db.execute(
        select(TipoDocumento).where(
            TipoDocumento.tenant_id == tenant_id, TipoDocumento.codigo == "OFICIO"
        )
    )
    tipo_doc = result.scalar_one()

    from app.models.dominio import TipoProcesso
    from app.services import autuacao

    req_geral = (
        await db.execute(
            select(TipoProcesso).where(
                TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == "REQ_GERAL"
            )
        )
    ).scalar_one()

    processo = await autuacao.autuar(
        db, tenant_id, user, tipo_processo_id=req_geral.id, especificacao="Ofício", interessados=[]
    )
    doc = await documento_service.criar_documento_interno(
        db,
        tenant_id,
        user,
        processo_id=processo.id,
        titulo="Ofício",
        conteudo_html="<p>x</p>",
        tipo_documento_id=tipo_doc.id,
        nivel_acesso="PUBLICO",
        unidade_id=cenario["unidade"].id,
    )

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await assinatura.assinar_documento(
            db,
            tenant_id,
            user,
            documento_id=doc.id,
            nivel=NivelAssinatura.QUALIFICADA.value,
        )
    assert exc.value.status_code == 422
