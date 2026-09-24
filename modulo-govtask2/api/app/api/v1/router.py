from fastapi import APIRouter

from app.api.v1 import (
    anexos,
    config,
    eventos,
    internal,
    notificacoes,
    painel,
    pedidos,
    usuarios,
)

api_router = APIRouter()

api_router.include_router(internal.router)
api_router.include_router(config.router)
api_router.include_router(usuarios.router)
api_router.include_router(notificacoes.router)
api_router.include_router(painel.router)
api_router.include_router(pedidos.router)
api_router.include_router(anexos.router)
api_router.include_router(anexos.zip_router)
api_router.include_router(eventos.router)
