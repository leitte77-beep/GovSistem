from fastapi import APIRouter

from app.api.v1.act_types import router as act_types_router
from app.api.v1.auth import router as auth_router
from app.api.v1.backup import router as backup_router
from app.api.v1.editions import router as editions_router
from app.api.v1.health import router as health_router
from app.api.v1.imports import router as imports_router
from app.api.v1.internal import router as internal_router
from app.api.v1.legacy_import import router as legacy_router
from app.api.v1.matters import router as matters_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.mfa import router as mfa_router
from app.api.v1.org_units import router as org_units_router
from app.api.v1.public import router as public_router
from app.api.v1.roles import router as roles_router
from app.api.v1.security import router as security_router
from app.api.v1.settings import router as settings_router
from app.api.v1.signing_credentials import router as signing_credentials_router
from app.api.v1.users import router as users_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(internal_router, tags=["internal"])
api_router.include_router(auth_router)
api_router.include_router(backup_router)
api_router.include_router(act_types_router)
api_router.include_router(org_units_router)
api_router.include_router(editions_router)
api_router.include_router(imports_router)
api_router.include_router(legacy_router)
api_router.include_router(matters_router)
api_router.include_router(roles_router)
api_router.include_router(mfa_router)
api_router.include_router(security_router)
api_router.include_router(settings_router)
api_router.include_router(signing_credentials_router)
api_router.include_router(users_router)
api_router.include_router(metrics_router)
api_router.include_router(public_router)
