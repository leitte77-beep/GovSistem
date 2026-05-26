from fastapi import APIRouter

from app.api.v1.matters import router as matters_router
from app.api.v1.editions import router as editions_router
from app.api.v1.act_types import router as act_types_router
from app.api.v1.org_units import router as org_units_router
from app.api.v1.signatures import router as signatures_router
from app.api.v1.credentials import router as credentials_router
from app.api.v1.internal import router as internal_router

api_router = APIRouter()

api_router.include_router(matters_router)
api_router.include_router(editions_router)
api_router.include_router(act_types_router)
api_router.include_router(org_units_router)
api_router.include_router(signatures_router)
api_router.include_router(credentials_router)
api_router.include_router(internal_router)
