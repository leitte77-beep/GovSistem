from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.convenios import router as convenios_router
from app.api.v1.etapas import router as etapas_router
from app.api.v1.tarefas import router as tarefas_router
from app.api.v1.anexos import router as anexos_router
from app.api.v1.contestacoes import router as contestacoes_router
from app.api.v1.notificacoes import router as notificacoes_router
from app.api.v1.admin import router as admin_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.internal import router as internal_router

api_router = APIRouter()
api_router.include_router(internal_router)
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(convenios_router)
api_router.include_router(etapas_router)
api_router.include_router(tarefas_router)
api_router.include_router(anexos_router)
api_router.include_router(contestacoes_router)
api_router.include_router(notificacoes_router)
api_router.include_router(admin_router)
