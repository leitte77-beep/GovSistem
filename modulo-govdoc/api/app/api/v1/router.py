"""Agregador das rotas da versão 1 da API."""

from fastapi import APIRouter

from app.api.v1 import (
    auth,
    backups,
    catalog,
    dev_saas,
    documents,
    folders,
    governance,
    organization,
    permissions,
    public,
    sharing,
    trash,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(dev_saas.router)
api_router.include_router(organization.router)
api_router.include_router(users.router)
api_router.include_router(folders.router)
api_router.include_router(documents.router)
api_router.include_router(trash.router)
api_router.include_router(permissions.router)
api_router.include_router(sharing.router)
api_router.include_router(public.router)
api_router.include_router(catalog.router)
api_router.include_router(governance.router)
api_router.include_router(backups.router)
