"""Agregação dos roteadores do GovCompras.

Todos os módulos de rotas são montados sob `/api/govcompras/v1`. A saúde do
módulo é montada separadamente, em `/api/govcompras`, para o healthcheck do
container (mesmo padrão dos demais módulos do sistema).
"""

from fastapi import APIRouter

from app.api.v1.atas import router as atas_router
from app.api.v1.auth import router as auth_router
from app.api.v1.compras import router as compras_router
from app.api.v1.contratos import router as contratos_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.dev_auth import router as dev_auth_router
from app.api.v1.dotacao import router as dotacao_router
from app.api.v1.fiscalizacao import router as fiscalizacao_router
from app.api.v1.governanca import router as governanca_router
from app.api.v1.licitacao import router as licitacao_router
from app.api.v1.organizacao import router as organizacao_router
from app.api.v1.planejamento import router as planejamento_router
from app.api.v1.processos import router as processos_router
from app.api.v1.solicitacoes import router as solicitacoes_router
from app.api.v1.workflow_admin import router as workflow_admin_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(dev_auth_router)
api_router.include_router(organizacao_router)
api_router.include_router(workflow_admin_router)
api_router.include_router(solicitacoes_router)
# dashboard_router precisa vir ANTES de processos_router: define rotas
# estáticas sob /processos/... (ex. /processos/consultar-rapido) que, em
# Starlette, seriam ofuscadas por /processos/{processo_id} se registradas
# depois — o roteamento é primeiro-que-casa-vence, não mais-específico-vence.
api_router.include_router(dashboard_router)
api_router.include_router(processos_router)
api_router.include_router(planejamento_router)
api_router.include_router(compras_router)
api_router.include_router(dotacao_router)
api_router.include_router(licitacao_router)
api_router.include_router(contratos_router)
api_router.include_router(atas_router)
api_router.include_router(fiscalizacao_router)
api_router.include_router(governanca_router)
