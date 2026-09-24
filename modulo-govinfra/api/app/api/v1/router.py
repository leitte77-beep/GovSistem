"""Agregação dos roteadores do GovInfra.

Todos os módulos de rotas são montados sob `/api/govinfra/v1` (item 51 da
especificação). A saúde do módulo é montada separadamente, em `/api/govinfra`,
para o healthcheck do container (mesmo padrão do GovDoc).
"""

from fastapi import APIRouter

from app.api.v1.agenda import router as agenda_router
from app.api.v1.arquivos import router as arquivos_router
from app.api.v1.auditoria import router as auditoria_router
from app.api.v1.auth import router as auth_router
from app.api.v1.bloqueios import router as bloqueios_router
from app.api.v1.busca import router as busca_router
from app.api.v1.cacambas import router as cacambas_router
from app.api.v1.combustivel import router as combustivel_router
from app.api.v1.configuracoes import router as configuracoes_router
from app.api.v1.consulta import router as consulta_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.frota import router as frota_router
from app.api.v1.manutencoes import router as manutencoes_router
from app.api.v1.mapa import router as mapa_router
from app.api.v1.notificacoes import router as notificacoes_router
from app.api.v1.ordens import router as ordens_router
from app.api.v1.pessoas import router as pessoas_router
from app.api.v1.porteira import router as porteira_router
from app.api.v1.relatorios import router as relatorios_router
from app.api.v1.solicitacoes import router as solicitacoes_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(pessoas_router)
api_router.include_router(cacambas_router)
api_router.include_router(solicitacoes_router)
api_router.include_router(agenda_router)
api_router.include_router(porteira_router)
api_router.include_router(ordens_router)
api_router.include_router(frota_router)
api_router.include_router(combustivel_router)
api_router.include_router(manutencoes_router)
api_router.include_router(bloqueios_router)
api_router.include_router(mapa_router)
api_router.include_router(relatorios_router)
api_router.include_router(arquivos_router)
api_router.include_router(notificacoes_router)
api_router.include_router(auditoria_router)
api_router.include_router(configuracoes_router)
api_router.include_router(busca_router)
api_router.include_router(consulta_router)
