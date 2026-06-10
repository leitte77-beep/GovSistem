from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.internal import router as internal_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.secretarias import router as secretarias_router
from app.api.v1.public import router as public_router

api_router = APIRouter()
api_router.include_router(internal_router)
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(secretarias_router)
api_router.include_router(public_router)
