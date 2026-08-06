from pydantic import BaseModel


class InternalSignRequest(BaseModel):
    edition_id: str
    unsigned_pdf_base64: str
    pfx_base64: str
    pfx_password: str
    reason: str = ""
    location: str = ""
    visible: bool = False


class SignResponse(BaseModel):
    signed_pdf_base64: str
    sha256_signed: str
    certificate_subject: str
    certificate_serial: str
    certificate_thumbprint: str
    signed_at: str
    validation_status: str = "pending"
