from app.providers.base import SignatureProvider, SignedDocument
from app.providers.a1 import PfxA1SignerProvider
from app.providers.icp_brasil import IcpBrasilValidator

_icp_validator: IcpBrasilValidator | None = None


def get_icp_validator() -> IcpBrasilValidator:
    global _icp_validator
    if _icp_validator is None:
        _icp_validator = IcpBrasilValidator(strict_mode=False)
        import os
        certs_path = os.path.join(os.path.dirname(__file__), "..", "..", "certs", "icp-brasil-roots.pem")
        certs_path = os.path.normpath(certs_path)
        if os.path.exists(certs_path):
            count = _icp_validator.load_trust_roots_from_path(certs_path)
            import logging
            logging.getLogger(__name__).info("Loaded %d ICP-Brasil root certificates from %s", count, certs_path)
        else:
            import logging
            logging.getLogger(__name__).warning("ICP-Brasil roots not found at %s", certs_path)
    return _icp_validator


def create_provider(provider_type: str = "a1", **kwargs) -> SignatureProvider:
    providers = {
        "a1": PfxA1SignerProvider,
    }
    cls = providers.get(provider_type)
    if cls is None:
        raise ValueError(f"Unknown signature provider: {provider_type}")
    return cls(**kwargs)


__all__ = [
    "SignatureProvider",
    "SignedDocument",
    "PfxA1SignerProvider",
    "IcpBrasilValidator",
    "create_provider",
    "get_icp_validator",
]
