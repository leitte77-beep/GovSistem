from types import SimpleNamespace

from starlette.requests import Request

from app.api.public_v1.router import (
    _build_attachment_url,
    _build_pdf_url,
    _portal_request_host,
)


def _request(host: str, origin: str | None = None) -> Request:
    headers = [(b"host", host.encode())]
    if origin:
        headers.append((b"origin", origin.encode()))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "https",
            "server": (host, 443),
            "path": "/api/public/v1/editions",
            "query_string": b"",
            "headers": headers,
        }
    )


def test_build_pdf_url_is_tenant_prefixed_relative_and_safely_quoted():
    edition = SimpleNamespace(
        pdf_path="pasta/diário #6?.pdf",
        signed_pdf_path=None,
        signatures=[],
    )

    assert _build_pdf_url(edition, "farol", "diario.govsistem.com.br") == (
        "/farol/api/download/pasta/di%C3%A1rio%20%236%3F.pdf"
    )


def test_build_pdf_url_has_no_tenant_prefix_on_a_custom_domain():
    edition = SimpleNamespace(
        pdf_path="signed edition.pdf",
        signed_pdf_path=None,
        signatures=[],
    )

    assert _build_pdf_url(
        edition, "farol", "diario.prefeitura.example"
    ) == "/api/download/signed%20edition.pdf"


def test_build_attachment_url_uses_the_same_tenant_prefixed_contract():
    attachment = SimpleNamespace(
        file=SimpleNamespace(storage_path="anexos/ata final.pdf")
    )

    assert _build_attachment_url(
        attachment, "farol", "govsistem.com.br"
    ) == (
        "/farol/api/download/anexos/ata%20final.pdf"
    )


def test_portal_host_prefers_custom_origin_over_internal_api_host():
    request = _request(
        "api.govsistem.com.br", "https://diario.prefeitura.example"
    )
    edition = SimpleNamespace(
        pdf_path="signed.pdf", signed_pdf_path=None, signatures=[]
    )

    portal_host = _portal_request_host(request)

    assert portal_host == "diario.prefeitura.example"
    assert _build_pdf_url(edition, "farol", portal_host) == (
        "/api/download/signed.pdf"
    )


def test_portal_host_uses_official_tenant_origin_for_prefixed_url():
    request = _request(
        "api.govsistem.com.br", "https://farol.govsistem.com.br"
    )
    edition = SimpleNamespace(
        pdf_path="signed.pdf", signed_pdf_path=None, signatures=[]
    )

    portal_host = _portal_request_host(request)

    assert portal_host == "farol.govsistem.com.br"
    assert _build_pdf_url(edition, "farol", portal_host) == (
        "/farol/api/download/signed.pdf"
    )


def test_portal_host_falls_back_to_request_host_without_origin():
    assert _portal_request_host(_request("api.govsistem.com.br")) == (
        "api.govsistem.com.br"
    )


def test_portal_host_keeps_custom_host_over_a_different_custom_origin():
    request = _request(
        "diario.farol.example", "https://diario.outro.example"
    )

    assert _portal_request_host(request) == "diario.farol.example"


def test_portal_host_keeps_official_tenant_host_over_custom_origin():
    request = _request(
        "farol.govsistem.com.br", "https://diario.outro.example"
    )

    assert _portal_request_host(request) == "farol.govsistem.com.br"
