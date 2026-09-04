from app.providers.a1 import PfxA1SignerProvider
from app.providers.base import SignatureProvider, SignedDocument
from app.providers.icp_brasil import IcpBrasilValidator

_icp_validator: IcpBrasilValidator | None = None

# Providers that are explicitly disallowed in production.
_FORBIDDEN_IN_PRODUCTION = frozenset({"mock"})


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


def is_production() -> bool:
    """The signer refuses mock in production (guard lives in startup too)."""
    import os
    return os.environ.get("ENVIRONMENT", "development").strip().lower() == "production"


def create_provider(provider_type: str = "a1", **kwargs) -> SignatureProvider:
    if provider_type.lower() in _FORBIDDEN_IN_PRODUCTION and is_production():
        raise ValueError(
            f"Signature provider '{provider_type}' is forbidden in production. "
            "Refusing to start with a non-ICP-Brasil provider."
        )
    providers = {
        "a1": PfxA1SignerProvider,
        "mock": MockSignatureProvider,
    }
    cls = providers.get(provider_type)
    if cls is None:
        raise ValueError(f"Unknown signature provider: {provider_type}")
    return cls(**kwargs)


# Lazy import kept at bottom to avoid a top-level cycle with a1 provider.
from app.providers.mock import MockSignatureProvider

__all__ = [
    "IcpBrasilValidator",
    "MockSignatureProvider",
    "PfxA1SignerProvider",
    "SignatureProvider",
    "SignedDocument",
    "create_provider",
    "get_icp_validator",
]
