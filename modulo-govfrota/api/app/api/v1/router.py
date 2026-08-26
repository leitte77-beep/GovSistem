from fastapi import APIRouter

from app.api.v1 import (
    abastecimentos,
    app_motorista,
    auth,
    busca,
    dashboard,
    combustiveis,
    configuracoes,
    entradas,
    fornecedores,
    internal,
    manutencoes,
    motoristas,
    ocorrencias,
    relatorios,
    tanques,
    uploads,
    veiculos,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(internal.router)
api_router.include_router(veiculos.router)
api_router.include_router(motoristas.router)
api_router.include_router(combustiveis.router)
api_router.include_router(tanques.router)
api_router.include_router(fornecedores.router)
api_router.include_router(entradas.router)
api_router.include_router(abastecimentos.router)
api_router.include_router(manutencoes.router)
api_router.include_router(ocorrencias.router)
api_router.include_router(relatorios.router)
api_router.include_router(busca.router)
api_router.include_router(dashboard.router)
api_router.include_router(configuracoes.router)
api_router.include_router(app_motorista.router)
api_router.include_router(uploads.router)
