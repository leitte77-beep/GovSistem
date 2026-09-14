import logging
import os

from app.core.config import settings
from app.providers.a1 import PfxA1SignerProvider
from app.providers.a3 import A3LocalSignatureProvider, A3RemoteSignatureProvider
from app.providers.base import SignatureProvider, SignedDocument
from app.providers.icp_brasil import IcpBrasilValidator

logger = logging.getLogger(__name__)

_icp_validator: IcpBrasilValidator | None = None

# Providers that are explicitly disallowed in production.
_FORBIDDEN_IN_PRODUCTION = frozenset({"mock"})


def get_icp_validator() -> IcpBrasilValidator:
    global _icp_validator
    if _icp_validator is None:
        _icp_validator = IcpBrasilValidator(strict_mode=False)
        configured = settings.ICP_BRASIL_ROOTS_PATH
        # Fall back to the in-repo path when the configured one is absent.
        candidates = [
            configured,
            os.path.normpath(
                os.path.join(
                    os.path.dirname(__file__), "..", "..", "certs", "icp-brasil-roots.pem"
                )
            ),
        ]
        path = next((p for p in candidates if p and os.path.exists(p)), None)
        if path:
            count = _icp_validator.load_trust_roots_from_path(path)
            logger.info("Loaded %d ICP-Brasil root certificates from %s", count, path)
        else:
            logger.warning(
                "ICP-Brasil roots not found (tried %s); chain will report trusted=False",
                candidates,
            )
    return _icp_validator


def is_production() -> bool:
    """The signer refuses mock in production (guard lives in startup too)."""
    return os.environ.get("ENVIRONMENT", "development").strip().lower() == "production"


def create_provider(provider_type: str = "a1", **kwargs) -> SignatureProvider:
    if provider_type.lower() in _FORBIDDEN_IN_PRODUCTION and is_production():
        raise ValueError(
            f"Signature provider '{provider_type}' is forbidden in production. "
            "Refusing to start with a non-ICP-Brasil provider."
        )
    providers = {
        "a1": PfxA1SignerProvider,
        "a3_local": A3LocalSignatureProvider,
        "a3_remote": A3RemoteSignatureProvider,
        "mock": MockSignatureProvider,
    }
    cls = providers.get(provider_type)
    if cls is None:
        raise ValueError(f"Unknown signature provider: {provider_type}")
    return cls(**kwargs)


# Lazy import kept at bottom to avoid a top-level cycle with a1 provider.
from app.providers.mock import MockSignatureProvider  # noqa: E402

__all__ = [
    "A3LocalSignatureProvider",
    "A3RemoteSignatureProvider",
    "IcpBrasilValidator",
    "MockSignatureProvider",
    "PfxA1SignerProvider",
    "SignatureProvider",
    "SignedDocument",
    "create_provider",
    "get_icp_validator",
]
