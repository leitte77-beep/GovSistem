from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["signature"])


class SignRequest(BaseModel):
    document_id: str
    content_base64: str


class SignResponse(BaseModel):
    document_id: str
    status: str
    message: str


@router.post("/sign", response_model=SignResponse)
async def sign_document(request: SignRequest):
    return SignResponse(
        document_id=request.document_id,
        status="pending",
        message="Signing not yet implemented",
    )


@router.post("/verify", response_model=SignResponse)
async def verify_document(request: SignRequest):
    return SignResponse(
        document_id=request.document_id,
        status="pending",
        message="Verification not yet implemented",
    )
