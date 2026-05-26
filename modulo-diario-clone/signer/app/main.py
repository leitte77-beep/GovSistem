from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.internal import router as internal_router
from app.api.routes import router as signer_router

app = FastAPI(
    title="DOE Signer",
    description="Diário Oficial Eletrônico - Serviço de Assinatura Digital",
    version="0.1.0",
)

app.include_router(health_router, prefix="/api/v1")
app.include_router(signer_router, prefix="/api/v1")
app.include_router(internal_router)
