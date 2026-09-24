from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SignedDocument:
    content: bytes
    certificate_info: dict
    signature_time: str
    signature_format: str = "PAdES"
    verification_code: str = ""
    # RFC 3161 timestamp (ACT) metadata, when a TSA is configured.
    timestamped: bool = False
    timestamp_serial: str = ""
    timestamp_token_base64: str = ""
    timestamp_gen_time: str = ""
    timestamp_policy_oid: str = ""
    timestamp_tsa_url: str = ""


class SignatureProvider(ABC):
    @abstractmethod
    def sign(self, pdf_bytes: bytes) -> SignedDocument:
        ...

    @abstractmethod
    def verify(self, pdf_bytes: bytes) -> bool:
        ...

    @abstractmethod
    def get_certificate_info(self) -> dict:
        ...
